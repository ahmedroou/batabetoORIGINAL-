
'use server';

/**
 * Draw & Deceive — Server Actions (Refined)
 * ---------------------------------------------------------------
 * ✅ Public API preserved (same function names/args/fields):
 *    - startGame
 *    - submitCorrectAnswerAndStartDrawing
 *    - submitDrawing
 *    - submitTrap
 *    - submitGuess
 *    - voteToKickArtist
 *    - handleTimeout
 *
 * 🔧 What changed (without breaking logic):
 *    - Stronger invariants & runtime guards
 *    - Clear phase helpers to avoid duplication
 *    - Safer timeout flow + proper kick-vote resolution
 *    - Consistent field paths & timestamp helpers
 *    - Defensive scoring & tie-safe winner pick
 *    - Early exits if players < 2 (auto-finalize)
 *
 * Notes:
 *  - No schema/field name changes. All updates go to the same paths.
 *  - Errors are localized Arabic where user-visible.
 */

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, type Transaction } from 'firebase/firestore';
import type { Game, Player, DrawAndDeceiveState, DrawAndDeceiveRoundResult } from '@/types';
import { shuffle, safeCompareStrings } from './helpers';
import { distributeEndOfGameAwards } from './admin/users';

/* ----------------------------- Constants ----------------------------- */
const DEFAULT_SETTINGS = {
  drawingTime: 120, // includes writing time for the artist
  trappingTime: 45,
  guessingTime: 35,
  resultsTime: 20,
  rounds: 3,
  writingTime: 20,
  kickVoteTime: 30, // time players have to vote
} as const;

const KICK_VOTE_THRESHOLD = 2; // votes needed to kick

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
  const shuffledAnswers = shuffle(allAnswers);
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

const endGame = (tx: Transaction, gameRef: ReturnType<typeof doc>, scores: Record<string, number>, message: string): Game => {
  const winnerId = pickWinnerId(scores || {});
  const gameResult = { winner: winnerId, message };
  tx.update(gameRef, {
    [F.gameState]: 'final_results',
    [F.s_phase]: 'final_results',
    [F.result]: gameResult,
  });
  // Return the game state that should be used for final award calculation
  return { ...doc, gameResult } as Game;
};

const activeCount = (game: Game) => getActivePlayerIds(game.players).length;

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
      timerEndsAt: null,
      kickVote: null,
    };

    tx.update(gameRef, {
      [F.gameState]: 'drawing',
      [F.s]: initialState,
      [F.scores]: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {} as Record<string, number>),
    });
  });
}

/* ---------------------------- New Flow Actions ----------------------- */
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
    // Allow submitting even if a kick vote is active
    ensure(state.phase === 'drawing' || state.kickVote?.active, 'Cannot submit drawing now.');
    ensure(state.artistId === playerId, 'Only the artist can submit a drawing.');
    ensure(state.correctAnswer, 'The correct answer must be submitted before the drawing.');

    const trappingTime = state.settings?.trappingTime ?? DEFAULT_SETTINGS.trappingTime;

    tx.update(gameRef, {
      [F.s_phase]: 'trapping',
      [F.s_drawing]: drawingDataUrl || null,
      [F.s_timer]: inSec(trappingTime),
      [F.s_kickVote]: null, // Cancel any active kick vote upon successful submission
    });
  });
}

/* ---------------------------- Trapping Phase ------------------------- */
export async function submitTrap(gameId: string, playerId: string, trap: string) {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const gameSnap = await tx.get(gameRef);
      ensure(gameSnap.exists(), 'Game not found.');
      const game = gameSnap.data() as Game;

      const state = game.drawAndDeceiveState;
      ensure(state, 'Game state not initialized.');
      ensure(state.phase === 'trapping', 'Not in the trapping phase.');
      ensure(state.artistId !== playerId, 'The artist cannot submit a trap.');
      ensure(!state.playerTraps[playerId], 'Trap already submitted.');

      const normalizedTrap = normalizeAnswer(trap);

      if (state.correctAnswer) {
        const similarity = safeCompareStrings(normalizedTrap, state.correctAnswer);
        if (similarity >= SIMILARITY_BLOCK_THRESHOLD) {
          throw new Error('فخك شديد الشبه بالإجابة الصحيحة. حاول مجددًا.');
        }
      }

      const updatedTraps = { ...state.playerTraps, [playerId]: normalizedTrap };
      tx.update(gameRef, { [F.s_traps]: updatedTraps });

      const activeNonArtist = getActiveNonArtistPlayers(game, state.artistId!);
      if (Object.keys(updatedTraps).length === activeNonArtist.length) {
        // All traps are in — transition to guessing
        ensure(state.correctAnswer, 'Correct answer is missing.');
        beginGuessingPhase(tx, gameRef, { ...state, playerTraps: updatedTraps } as DrawAndDeceiveState);
      }
    });
    return { success: true } as const;
  } catch (error: any) {
    return { success: false, error: error.message } as const;
  }
}

/* ---------------------------- Guessing Phase ------------------------- */
export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;

    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state not initialized.');
    ensure(state.phase === 'guessing', 'Not in guessing phase.');
    ensure(state.artistId !== playerId, 'Artist cannot guess.');
    ensure(!state.playerGuesses[playerId], 'Guess already submitted.');

    const normalizedGuess = guess ? normalizeAnswer(guess) : null;
    ensure(!guess || (state.shuffledAnswers || []).includes(normalizedGuess!), 'Invalid answer choice.');

    const updatedGuesses = { ...state.playerGuesses, [playerId]: normalizedGuess } as Record<string, string | null>;
    tx.update(gameRef, { [F.s_guesses]: updatedGuesses });

    const activeNonArtist = getActiveNonArtistPlayers(game, state.artistId!);
    if (Object.keys(updatedGuesses).length === activeNonArtist.length) {
      // All guesses are in — compute results
      computeAndEnterResults(tx, gameRef, {
        ...game,
        drawAndDeceiveState: { ...state, playerGuesses: updatedGuesses },
      } as Game);
    }
  });
}

/* ---------------------- Kick Vote Actions ---------------------------- */
export async function voteToKickArtist(gameId: string, voterId: string, vote: 'kick' | 'spare') {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;

    ensure(state, 'Game state not initialized.');
    ensure(state.kickVote?.active, 'Kick vote is not active.');
    ensure(state.artistId !== voterId, 'The artist cannot vote on themselves.');

    const kickVote = state.kickVote || { active: true, votes: {}, voterIds: [] as string[] };
    ensure(!kickVote.voterIds.includes(voterId), 'You have already voted.');

    const updatedVotes = { ...kickVote.votes, [voterId]: vote } as Record<string, 'kick' | 'spare'>;
    const updatedVoterIds = [...kickVote.voterIds, voterId];
    const kickVotesCount = Object.values(updatedVotes).filter((v) => v === 'kick').length;

    if (kickVotesCount >= KICK_VOTE_THRESHOLD) {
      await processKickVote(gameId, tx, { ...game, drawAndDeceiveState: { ...state, kickVote: { active: true, votes: updatedVotes, voterIds: updatedVoterIds } } } as Game);
    } else {
      tx.update(gameRef, { [F.s_kickVote]: { active: true, votes: updatedVotes, voterIds: updatedVoterIds } });
    }
  });
}

async function processKickVote(gameId: string, tx: Transaction, game: Game) {
  const state = game.drawAndDeceiveState!;
  const artistId = state.artistId!;

  // Count current votes; only kick if threshold is reached
  const votesObj = state.kickVote?.votes || {};
  const kickVotesCount = Object.values(votesObj).filter((v) => v === 'kick').length;
  const shouldKick = kickVotesCount >= KICK_VOTE_THRESHOLD;

  const gameRef = doc(db, 'games', gameId);

  if (!shouldKick) {
    // Spare the artist — advance to next artist (treat as skipped/AFK)
    const newTurnOrder = state.turnOrder.slice();
    const { nextIndex, artistId: newArtistId } = nextActiveArtist(newTurnOrder, state.currentTurnIndex, game.players);

    tx.update(gameRef, {
      [F.s_phase]: 'drawing',
      [F.s_artistId]: newArtistId,
      [F.s_currentTurnIndex]: nextIndex,
      [F.s_drawing]: null,
      [F.s_correct]: null,
      [F.s_traps]: {},
      [F.s_guesses]: {},
      [F.s_answers]: [],
      [F.s_kickVote]: null,
      [F.s_timer]: null,
    });
    return;
  }

  // Kick the artist
  const newTurnOrder = state.turnOrder.filter((id) => id !== artistId);

  // If fewer than 2 players remain, end the game
  if (newTurnOrder.length < 2) {
    const finalGame = endGame(tx, gameRef, game.playerScores || {}, 'انتهت اللعبة لعدم وجود لاعبين كافيين.');
    await distributeEndOfGameAwards(game.id);
    return;
  }

  const { nextIndex, artistId: newArtistId } = nextActiveArtist(newTurnOrder, state.currentTurnIndex - 1, game.players);

  tx.update(gameRef, {
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
    [F.s_timer]: null, // wait for new artist to write
  });
}

/* ---------------------- Timeout & Round Progression ------------------ */
// Note: hostId is intentionally ignored so that *any* player/client ping can advance timeouts.
export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  let finalGameData: Game | null = null;
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state not initialized.');

    // Auto finalize if too few players remain
    if (activeCount(game) < 2) {
      finalGameData = endGame(tx, gameRef, game.playerScores || {}, 'انتهت اللعبة لعدم وجود لاعبين كافيين.');
      return;
    }

    // If timer hasn't ended yet, do nothing
    if (!state.timerEndsAt || state.timerEndsAt.toMillis() > nowMs()) return;

    // Caller doesn't have to be host, but we only run logic if timer is actually expired.

    if (state.phase === 'drawing') {
        // Artist was AFK and didn't provide a description. Open kick vote.
        const voteTime = state.settings?.kickVoteTime ?? DEFAULT_SETTINGS.kickVoteTime;
        tx.update(gameRef, {
            [F.s_kickVote]: { active: true, votes: {}, voterIds: [] as string[] },
            [F.s_timer]: inSec(voteTime),
        });
        return;
    }
    
    // if a kick vote is active and its timer runs out
    if (state.kickVote?.active) {
        await processKickVote(gameId, tx, game);
        return;
    }

    // 2) Trapping: move to guessing with current traps (even if some are missing)
    if (state.phase === 'trapping') {
      ensure(state.correctAnswer, 'Correct answer is missing.');
      beginGuessingPhase(tx, gameRef, state);
      return;
    }

    // 3) Guessing: compute results with the guesses we have so far
    if (state.phase === 'guessing') {
      computeAndEnterResults(tx, gameRef, game);
      return;
    }

    // 4) Results: advance to next round or end the game
    if (state.phase === 'results') {
      const { isGameOver, finalGame } = await _startNextRound(tx, gameRef, game);
      if (isGameOver) finalGameData = finalGame;
      return;
    }
  });

  if (finalGameData) {
    await distributeEndOfGameAwards(gameId);
  }
}

/* ------------------------- Next Round / Finish ----------------------- */
function pickWinnerId(scores: Record<string, number>): string {
  const entries = Object.entries(scores);
  if (!entries.length) return '';
  // In ties, pick the first stable by id ordering for determinism
  return entries
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    [0]![0];
}

async function _startNextRound(tx: Transaction, gameRef: ReturnType<typeof doc>, game: Game): Promise<{ isGameOver: boolean, finalGame: Game | null }> {
  const state = game.drawAndDeceiveState!;
  const settings = state.settings;
  const currentRound = state.round || 1; // state.round starts at 1

  if (currentRound >= settings.rounds) {
    const finalGame = endGame(tx, gameRef, game.playerScores || {}, 'انتهت اللعبة!');
    return { isGameOver: true, finalGame };
  }

  const { nextIndex, artistId } = nextActiveArtist(state.turnOrder, state.currentTurnIndex, game.players);

  tx.update(gameRef, {
    [F.gameState]: 'drawing',
    [F.s_phase]: 'drawing',
    [F.s_round]: currentRound + 1,
    [F.s_currentTurnIndex]: nextIndex,
    [F.s_artistId]: artistId,
    [F.s_drawing]: null,
    [F.s_correct]: null,
    [F.s_traps]: {},
    [F.s_guesses]: {},
    [F.s_answers]: [],
    [F.s_kickVote]: null,
    [F.s_timer]: null, // wait for new artist to write
  });

  return { isGameOver: false, finalGame: null };
}
