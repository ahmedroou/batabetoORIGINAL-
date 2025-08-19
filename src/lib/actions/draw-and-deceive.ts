'use server';

/**
 * @fileoverview Server actions for the Draw & Deceive game — hardened & expanded.
 * - Enforces turn/phase rules, protected cards, and discard-pickup swap rule.
 * - Adds deck reshuffle, peek phase action, proper special effects, and endgame prep.
 * - Keeps types liberal to avoid breaking builds; annotate with comments where state is augmented.
 */

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, type Transaction, updateDoc, increment, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import type { Game, Player, DrawAndDeceiveState, DrawAndDeceiveRoundResult } from '@/types';
import { shuffle, safeCompareStrings } from './helpers';
import { distributeEndOfGameAwards } from '../admin/users';


/* ----------------------------- Constants ----------------------------- */
const DEFAULT_SETTINGS = {
  drawingTime: 120, // time for drawing after description
  trappingTime: 45,
  guessingTime: 35,
  resultsTime: 20,
  rounds: 3,
  writingTime: 20, // time for artist to write description
  kickVoteTime: 30, // time players have to vote
} as const;

const KICK_VOTE_THRESHOLD = 2; // votes needed to kick (kept as-is)

const MAX_ROUNDS = 10;
const MIN_ROUNDS = 1;
const MAX_ANSWER_LEN = 30;
const SIMILARITY_BLOCK_THRESHOLD = 0.7;

/* ------------------------------ Field Paths --------------------------- */
const F = {
  gameState: 'gameState',
  result: 'gameResult',
  scores: 'playerScores',
  s: 'drawAndDeceiveState',
  s_phase: 'drawAndDeceiveState.phase',
  s_settings: 'drawAndDeceiveState.settings',
  s_turnOrder: 'drawAndDeceiveState.turnOrder',
  s_currentTurnIndex: 'drawAndDeceiveState.currentTurnIndex',
  s_round: 'drawAndDeceiveState.round',
  s_artistId: 'drawAndDeceiveState.artistId',
  s_traps: 'drawAndDeceiveState.playerTraps',
  s_guesses: 'drawAndDeceiveState.playerGuesses',
  s_correct: 'drawAndDeceiveState.correctAnswer',
  s_drawing: 'drawAndDeceiveState.drawingDataUrl',
  s_answers: 'drawAndDeceiveState.shuffledAnswers',
  s_timer: 'drawAndDeceiveState.timerEndsAt',
  s_kickVote: 'drawAndDeceiveState.kickVote',
  s_lastResults: 'drawAndDeceiveState.lastRoundResults',
} as const;

/* ------------------------------ Utilities ---------------------------- */
const inSec = (s: number) => Timestamp.fromMillis(Date.now() + Math.max(0, s) * 1000);
const nowMs = () => Date.now();

const ensure: (condition: any, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const normalizeAnswer = (raw: string): string => {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('النص فارغ.');
  if (trimmed.length > MAX_ANSWER_LEN) throw new Error(`الوصف طويل جدًا (الحد الأقصى ${MAX_ANSWER_LEN} حرفًا).`);
  const words = trimmed.split(' ');
  if (words.length > 2) throw new Error('الوصف يجب أن يكون كلمة أو كلمتين فقط.');
  return trimmed;
};

const getPlayer = (game: Game, id: string) => game.players.find((p) => p.id === id);

const getActivePlayerIds = (players: Player[]): string[] => players.filter((p) => p.status !== 'left').map((p) => p.id);

const getActiveNonArtistPlayers = (game: Game, artistId: string): Player[] =>
  game.players.filter((p) => p.status !== 'left' && p.id !== artistId);

const nextActiveArtist = (
  turnOrder: string[],
  currentTurnIndex: number,
  players: Player[]
): { nextIndex: number; artistId: string } => {
  const activeSet = new Set(getActivePlayerIds(players));
  let idx = currentTurnIndex;
  for (let i = 0; i < turnOrder.length; i++) {
    idx = (idx + 1) % turnOrder.length;
    const candidate = turnOrder[idx]!;
    if (activeSet.has(candidate)) return { nextIndex: idx, artistId: candidate };
  }
  // Fallback if no one else is active
  return { nextIndex: currentTurnIndex, artistId: turnOrder[currentTurnIndex]! };
};

const activeCount = (game: Game) => getActivePlayerIds(game.players).length;

/* ------------------------- Round Result Logic ------------------------ */
export type RoundScoreBucket = { points: number; breakdown: { reason: string; points: number }[] };
export type RoundResultsState = { scores: Record<string, RoundScoreBucket>; answers: DrawAndDeceiveRoundResult[] };

const calculateRoundResults = (
  game: Game,
  playerGuesses: Record<string, string>
): { resultsState: RoundResultsState; updatedPlayerScores: Record<string, number> } => {
  const state = game.drawAndDeceiveState!;
  const scores: Record<string, RoundScoreBucket> = {};
  const answersResult: DrawAndDeceiveRoundResult[] = [];
  const updatedPlayerScores: Record<string, number> = { ...(game.playerScores || {}) };

  const addScore = (playerId: string, points: number, reason: string) => {
    if (!scores[playerId]) scores[playerId] = { points: 0, breakdown: [] };
    scores[playerId]!.points += points;
    scores[playerId]!.breakdown.push({ reason, points });
    updatedPlayerScores[playerId] = (updatedPlayerScores[playerId] || 0) + points;
  };

  const correctAnswer = state.correctAnswer!;
  const allAnswers = [correctAnswer, ...Object.values(state.playerTraps)].filter((a): a is string => !!a);

  // Ensure every player has a bucket (even if they scored 0)
  game.players.forEach((p) => {
    if (!scores[p.id]) scores[p.id] = { points: 0, breakdown: [] };
  });

  for (const answer of allAnswers) {
    const isCorrect = answer === correctAnswer;

    const authorIds = isCorrect
      ? [state.artistId!]
      : Object.entries(state.playerTraps)
          .filter(([, trap]) => trap === answer)
          .map(([id]) => id);

    const guesserIds = Object.entries(playerGuesses)
      .filter(([, guess]) => guess === answer)
      .map(([id]) => id);

    answersResult.push({ answer, isCorrect, authorIds, guesserIds });

    if (isCorrect) {
      // Correct guesses: +2 to guesser, +1 to artist (per correct guesser)
      guesserIds.forEach((guesserId) => {
        if (guesserId !== state.artistId) {
          addScore(guesserId, 2, 'إجابة صحيحة');
          addScore(state.artistId!, 1, `تخمين صحيح من ${getPlayer(game, guesserId)?.name || 'لاعب'}`);
        }
      });
    } else {
      // Traps: if you picked your own trap => -3, else trap authors gain +1 each per fooled guesser
      guesserIds.forEach((guesserId) => {
        if (authorIds.includes(guesserId)) {
          addScore(guesserId, -3, 'صوّت لفخه');
        } else {
          authorIds.forEach((authorId) => {
            addScore(authorId, 1, `خدع ${getPlayer(game, guesserId)?.name || 'لاعب'}`);
          });
        }
      });
    }
  }

  return { resultsState: { scores, answers: answersResult }, updatedPlayerScores };
};

/* ---------------------------- Helper Actions ------------------------- */
const beginGuessingPhase = (
  tx: Transaction,
  gameRef: ReturnType<typeof doc>,
  state: DrawAndDeceiveState
) => {
  const allAnswers = [state.correctAnswer!, ...Object.values(state.playerTraps)].filter((a): a is string => !!a);
  const shuffledAnswers = shuffle(Array.from(new Set(allAnswers)));
  const guessingTime = state.settings?.guessingTime ?? DEFAULT_SETTINGS.guessingTime;
  tx.update(gameRef, {
    [F.s_phase]: 'guessing',
    [F.s_answers]: shuffledAnswers,
    [F.s_timer]: inSec(guessingTime),
  });
};

const computeAndEnterResults = (
  tx: Transaction,
  gameRef: ReturnType<typeof doc>,
  game: Game
) => {
  const state = game.drawAndDeceiveState!;
  const concreteGuesses = Object.fromEntries(
    Object.entries(state.playerGuesses || {}).filter(([, v]) => !!v)
  ) as Record<string, string>;

  const { resultsState, updatedPlayerScores } = calculateRoundResults(game, concreteGuesses);
  const resultsTime = state.settings?.resultsTime ?? DEFAULT_SETTINGS.resultsTime;

  tx.update(gameRef, {
    [F.s_phase]: 'results',
    [F.s_lastResults]: resultsState,
    [F.s_timer]: inSec(resultsTime),
    [F.scores]: updatedPlayerScores,
  });
};

const endGame = (
  tx: Transaction,
  gameRef: ReturnType<typeof doc>,
  scores: Record<string, number>,
  message: string
): string => {
  const winnerId = pickWinnerId(scores || {});
  const gameResult = { winner: winnerId, message };
  tx.update(gameRef, {
    [F.gameState]: 'final_results',
    [F.s_phase]: 'final_results',
    [F.result]: gameResult,
  });
  return winnerId;
};

/* ------------------------------- Start ------------------------------- */
export async function startGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;

    ensure(game.hostId === hostId, 'Only the host can start the game.');
    ensure(getActivePlayerIds(game.players).length >= 2, 'At least 2 active players required.');

    const baseSettings = { ...DEFAULT_SETTINGS, ...(game.drawAndDeceiveState?.settings || {}) };
    const rounds = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, baseSettings.rounds ?? DEFAULT_SETTINGS.rounds));

    const activePlayers = getActivePlayerIds(game.players);
    const turnOrder = shuffle(activePlayers);

    const initialState: DrawAndDeceiveState = {
      settings: { ...baseSettings, rounds },
      turnOrder,
      currentTurnIndex: 0,
      round: 1,
      phase: 'drawing',
      artistId: turnOrder[0]!,
      playerTraps: {},
      playerGuesses: {},
      shuffledAnswers: [],
      drawingDataUrl: null,
      correctAnswer: null,
      timerEndsAt: inSec(baseSettings.writingTime),
      kickVote: null,
    };

    tx.update(gameRef, {
      [F.gameState]: 'drawing',
      [F.s]: initialState,
      [F.scores]: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {} as Record<string, number>),
    });
  });
}

/* ---------------------------- Drawing Flow --------------------------- */
export async function submitCorrectAnswerAndStartDrawing(gameId: string, playerId: string, correctAnswer: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;

    ensure(state, 'Game state not initialized for Draw and Deceive.');
    ensure(state.phase === 'drawing', 'Not in the drawing phase.');
    ensure(state.artistId === playerId, 'Only the artist can submit the correct answer.');
    ensure(!state.correctAnswer, 'The correct answer has already been submitted for this round.');

    const normalizedAnswer = normalizeAnswer(correctAnswer);
    const drawingTime = state.settings?.drawingTime ?? DEFAULT_SETTINGS.drawingTime;

    tx.update(gameRef, {
      [F.s_correct]: normalizedAnswer,
      [F.s_timer]: inSec(drawingTime),
    });
  });
}

export async function submitDrawing(gameId: string, playerId: string, drawingDataUrl?: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;

    ensure(state, 'Game state not initialized for Draw and Deceive.');
    ensure(state.phase === 'drawing', 'Cannot submit drawing now.');
    ensure(state.artistId === playerId, 'Only the artist can submit a drawing.');
    
    tx.update(gameRef, {
      [F.s_drawing]: drawingDataUrl || null,
    });
  });
}


export async function endArtistTurn(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state is missing.');

    const timerUp = state.timerEndsAt ? state.timerEndsAt.toMillis() <= nowMs() : false;
    ensure(timerUp, 'الوقت لم ينته بعد لإنهاء دور الفنان.');
    
    ensure(state.phase === 'drawing', 'This action is not available in the current phase.');

    const trappingTime = state.settings?.trappingTime ?? DEFAULT_SETTINGS.trappingTime;
    tx.update(gameRef, {
      [F.s_phase]: 'trapping',
      [F.s_timer]: inSec(trappingTime),
      [F.s_kickVote]: null,
    });
  });
}

export async function kickArtistForInactivity(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  let ended = false;
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state is missing.');

    const timerUp = state.timerEndsAt ? state.timerEndsAt.toMillis() <= nowMs() : false;
    ensure(timerUp, 'الوقت لم ينته بعد لطرد الفنان.');
    ensure(state.phase === 'drawing', 'This action is not available.');

    const artistId = state.artistId!;
    const players = [...game.players];
    
    const artistIndex = players.findIndex(p => p.id === artistId);
    if (artistIndex !== -1) {
      players[artistIndex]!.status = 'left';
    }

    const newTurnOrder = state.turnOrder.filter(id => id !== artistId);

    if (newTurnOrder.length < 2) {
      endGame(tx, gameRef, game.playerScores || {}, 'انتهت اللعبة لعدم وجود لاعبين كافيين.');
      ended = true;
      return;
    }

    const { nextIndex, artistId: newArtistId } = nextActiveArtist(newTurnOrder, state.currentTurnIndex > 0 ? state.currentTurnIndex -1 : newTurnOrder.length-1, players);
    
    tx.update(gameRef, {
      players,
      [F.s_turnOrder]: newTurnOrder,
      [F.s_phase]: 'drawing',
      [F.s_artistId]: newArtistId,
      [F.s_currentTurnIndex]: nextIndex,
      [F.s_drawing]: null,
      [F.s_correct]: null,
      [F.s_traps]: {},
      [F.s_guesses]: {},
      [F.s_answers]: [],
      [F.s_kickVote]: null,
      [F.s_timer]: inSec(state.settings?.writingTime ?? DEFAULT_SETTINGS.writingTime),
    });
  });

  if (ended) {
    await distributeEndOfGameAwards(gameId);
  }
}


/* ---------------------------- Trapping Phase ------------------------- */
export async function submitTrap(gameId: string, playerId: string, trap: string) {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef);
      ensure(snap.exists(), 'اللعبة غير موجودة.');
      const game = snap.data() as Game;
      const state = game.drawAndDeceiveState;
      ensure(state, 'Game state not initialized.');
      ensure(state.phase === 'trapping', 'Not in trapping phase.');
      ensure(state.artistId !== playerId, 'The artist cannot submit a trap.');

      const norm = normalizeAnswer(trap);
      
      const currentTraps = { ...(state.playerTraps || {}), [playerId]: norm };
      
      const activeNonArtists = getActiveNonArtistPlayers(game, state.artistId!);
      const everyoneAnswered = activeNonArtists.every(p => Object.prototype.hasOwnProperty.call(currentTraps, p.id));
      
      if (everyoneAnswered) {
        beginGuessingPhase(tx, gameRef, { ...state, playerTraps: currentTraps });
      } else {
        tx.update(gameRef, { [F.s_traps]: currentTraps });
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
  }
}

/* ---------------------------- Guessing Phase ------------------------- */
export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    const state = game.drawAndDeceiveState;

    ensure(state, 'Game state not initialized.');
    ensure(state.phase === 'guessing', 'Not in guessing phase.');
    ensure(state.artistId !== playerId, 'The artist cannot guess.');
    ensure(!Object.prototype.hasOwnProperty.call(state.playerGuesses || {}, playerId), 'You have already guessed.');

    const finalGuess = guess ? normalizeAnswer(guess) : TIMEOUT_TOKEN;
    
    // Validate guess against available options
    const isValidOption = (state.shuffledAnswers || []).includes(finalGuess);
    ensure(isValidOption || finalGuess === TIMEOUT_TOKEN, 'Invalid guess option provided.');

    const currentGuesses = { ...(state.playerGuesses || {}), [playerId]: finalGuess };

    const activeNonArtists = getActiveNonArtistPlayers(game, state.artistId!);
    const everyoneGuessed = activeNonArtists.every(p => Object.prototype.hasOwnProperty.call(currentGuesses, p.id));

    if (everyoneGuessed) {
      computeAndEnterResults(tx, gameRef, { ...game, drawAndDeceiveState: { ...state, playerGuesses: currentGuesses } });
    } else {
      tx.update(gameRef, { [F.s_guesses]: currentGuesses });
    }
  });
}

/* ---------------------- Timeout & Round Progression ------------------ */
export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  let isGameOver = false;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;

    const game = snap.data() as Game;
    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state not initialized.');

    const timerEndsAt = state.timerEndsAt as Timestamp | undefined;
    if (!timerEndsAt || timerEndsAt.toMillis() > nowMs()) return;
    ensure(game.hostId === hostId, 'Only host can advance the game.');

    tx.update(gameRef, { [`${F.s_timer}`]: deleteField() });

    switch (game.gameState) {
      case 'drawing': {
        const trappingTime = state.settings?.trappingTime ?? DEFAULT_SETTINGS.trappingTime;
        tx.update(gameRef, {
            [F.s_phase]: 'trapping',
            [F.s_timer]: inSec(trappingTime),
        });
        break;
      }
      case 'trapping': {
        const playerTraps = { ...(state.playerTraps || {}) };
        getActiveNonArtistPlayers(game, state.artistId!).forEach((p) => {
          if (!Object.prototype.hasOwnProperty.call(playerTraps, p.id)) {
            playerTraps[p.id] = null;
          }
        });
        beginGuessingPhase(tx, gameRef, { ...state, playerTraps });
        break;
      }
      case 'guessing': {
        const playerGuesses = { ...(state.playerGuesses || {}) };
        getActiveNonArtistPlayers(game, state.artistId!).forEach((p) => {
          if (!Object.prototype.hasOwnProperty.call(playerGuesses, p.id)) {
            playerGuesses[p.id] = TIMEOUT_TOKEN;
          }
        });
        computeAndEnterResults(tx, gameRef, { ...game, drawAndDeceiveState: { ...state, playerGuesses } });
        break;
      }
      case 'results': {
        const res = await _startNextRound(tx, gameRef, game);
        isGameOver = res.isGameOver;
        break;
      }
    }
  });

  if (isGameOver) {
    const res = await distributeEndOfGameAwards(gameId);
    if (!res.success) {
      console.error(`Failed to distribute awards for game ${gameId}:`, res.error);
      await updateDoc(gameRef, { 'gameResult.error': res.error });
    }
  }
}

async function _startNextRound(tx: Transaction, gameRef: ReturnType<typeof doc>, game: Game): Promise<{ isGameOver: boolean }> {
  const state = game.drawAndDeceiveState!;
  const settings = state.settings;
  const currentRound = game.round ?? 0;

  if (currentRound >= settings.rounds || activeCount(game) < 2) {
    const winnerId = pickWinnerId(game.playerScores || {});
    endGame(tx, gameRef, game.playerScores || {}, `انتهت اللعبة! الفائز هو ${getPlayer(game, winnerId)?.name || 'غير معروف'}.`);
    return { isGameOver: true };
  }

  const { nextIndex, artistId } = nextActiveArtist(state.turnOrder, state.currentTurnIndex, game.players);
  const endsAt = inSec(state.settings?.writingTime ?? DEFAULT_SETTINGS.writingTime);

  tx.update(gameRef, {
    [F.gameState]: 'drawing',
    round: (game.round || 0) + 1,
    [F.s_currentTurnIndex]: nextIndex,
    [F.s_phase]: 'drawing',
    [F.s_artistId]: artistId,
    [F.s_drawing]: null,
    [F.s_correct]: null,
    [F.s_traps]: {},
    [F.s_guesses]: {},
    [F.s_answers]: [],
    [F.s_lastResults]: {},
    [F.s_kickVote]: null,
    [F.s_timer]: endsAt,
  });

  return { isGameOver: false };
}

function pickWinnerId(scores: Record<string, number>): string {
    const entries = Object.entries(scores);
    if (!entries.length) return '';
    return entries.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0]![0];
}
const TIMEOUT_TOKEN = '__TIMEOUT__';
