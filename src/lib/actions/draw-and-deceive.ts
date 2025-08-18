'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type {
  Game,
  Player,
  DrawAndDeceiveState,
  DrawAndDeceiveRoundResult,
} from '@/types';
import { shuffle, safeCompareStrings } from './helpers';
import { WORD_WAR_WORDS } from '@/data/word-war-words';
import { distributeEndOfGameAwards } from './admin/users';


/* ----------------------------- Constants ----------------------------- */
const DEFAULT_SETTINGS = {
  drawingTime: 120,
  writingTime: 20, // New setting for the writing phase
  trappingTime: 45,
  guessingTime: 60,
  resultsTime: 20,
  rounds: 3,
};

const MAX_ROUNDS = 10;
const MIN_ROUNDS = 1;
const MAX_ANSWER_LEN = 20; // As per new request

/* ------------------------------ Utilities ---------------------------- */
const inSec = (s: number) => Timestamp.fromMillis(Date.now() + s * 1000);
const ensure = (condition: any, message: string): asserts condition => {
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

const nextActiveArtist = (
  turnOrder: string[],
  currentTurnIndex: number,
  players: Player[]
): { nextIndex: number; artistId: string } => {
  const activeSet = new Set(players.filter(p => p.status !== 'left').map(p => p.id));
  let idx = currentTurnIndex;
  for (let i = 0; i < turnOrder.length; i++) {
    idx = (idx + 1) % turnOrder.length;
    const candidate = turnOrder[idx]!;
    if (activeSet.has(candidate)) {
      return { nextIndex: idx, artistId: candidate };
    }
  }
  return { nextIndex: currentTurnIndex, artistId: turnOrder[currentTurnIndex]! };
};

/* ------------------------- Round Result Logic ------------------------ */
type RoundScoreBucket = {
  points: number;
  breakdown: { reason: string; points: number }[];
};

type RoundResultsState = {
  scores: Record<string, RoundScoreBucket>;
  answers: DrawAndDeceiveRoundResult[];
};

const calculateRoundResults = (
  game: Game,
  playerGuesses: Record<string, string>
): { resultsState: RoundResultsState; updatedPlayerScores: Record<string, number> } => {
  const state = game.drawAndDeceiveState!;
  const scores: Record<string, RoundScoreBucket> = {};
  const answersResult: DrawAndDeceiveRoundResult[] = [];
  const updatedPlayerScores: Record<string, number> = { ...(game.playerScores || {}) };

  const getPlayer = (id: string) => game.players.find(p => p.id === id);
  const addScore = (playerId: string, points: number, reason: string) => {
    if (!scores[playerId]) scores[playerId] = { points: 0, breakdown: [] };
    scores[playerId]!.points += points;
    scores[playerId]!.breakdown.push({ reason, points });
    updatedPlayerScores[playerId] = (updatedPlayerScores[playerId] || 0) + points;
  };

  const correctAnswer = state.correctAnswer!;
  const allAnswers = [correctAnswer, ...Object.values(state.playerTraps)].filter(
    (a): a is string => !!a
  );

  // Initialize score buckets for all players
  game.players.forEach(p => {
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
      guesserIds.forEach(guesserId => {
        if (guesserId !== state.artistId) {
          addScore(guesserId, 2, 'إجابة صحيحة');
          addScore(state.artistId!, 1, `تخمين صحيح من ${getPlayer(guesserId)?.name || 'لاعب'}`);
        }
      });
    } else {
      guesserIds.forEach(guesserId => {
        if (authorIds.includes(guesserId)) {
          addScore(guesserId, -3, 'صوّت لنفسه');
        } else {
          authorIds.forEach(authorId => {
            addScore(authorId, 2, `خدع ${getPlayer(guesserId)?.name || 'لاعب'}`);
          });
        }
      });
    }
  }

  return {
    resultsState: { scores, answers: answersResult },
    updatedPlayerScores,
  };
};

/* ------------------------------- Start ------------------------------- */
export async function startGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async tx => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;

    ensure(game.hostId === hostId, 'Only the host can start the game.');
    ensure(game.players.filter(p => p.status !== 'left').length >= 2, 'At least 2 active players required.');

    const baseSettings = { ...DEFAULT_SETTINGS, ...(game.drawAndDeceiveState?.settings || {}) };
    const rounds = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, baseSettings.rounds ?? DEFAULT_SETTINGS.rounds));
    const drawingTime = baseSettings.drawingTime ?? DEFAULT_SETTINGS.drawingTime;

    const activePlayers = game.players.filter(p => p.status !== 'left').map(p => p.id);
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
      timerEndsAt: inSec(drawingTime),
    };

    tx.update(gameRef, {
      gameState: 'drawing',
      drawAndDeceiveState: initialState,
      playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
    });
  });
}

/* ---------------------------- Drawing Phase -------------------------- */
export async function submitDrawing(gameId: string, playerId: string, drawingDataUrl: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async tx => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;

    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state not initialized for Draw and Deceive.');
    ensure(state.phase === 'drawing', 'Not in the drawing phase.');
    ensure(state.artistId === playerId, 'Only the artist can submit a drawing.');
    ensure(!!drawingDataUrl, 'Drawing data is missing.');

    const writingTime = state.settings?.writingTime ?? DEFAULT_SETTINGS.writingTime;

    tx.update(gameRef, {
      'drawAndDeceiveState.phase': 'writing',
      'drawAndDeceiveState.drawingDataUrl': drawingDataUrl,
      'drawAndDeceiveState.timerEndsAt': inSec(writingTime),
    });
  });
}

/* ---------------------------- Writing Phase -------------------------- */
export async function submitCorrectAnswer(gameId: string, playerId: string, correctAnswer: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async tx => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;

    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state not initialized.');
    ensure(state.phase === 'writing', 'Not in the writing phase.');
    ensure(state.artistId === playerId, 'Only the artist can submit the answer.');

    const normalized = normalizeAnswer(correctAnswer);
    const trappingTime = state.settings?.trappingTime ?? DEFAULT_SETTINGS.trappingTime;

    tx.update(gameRef, {
      'drawAndDeceiveState.phase': 'trapping',
      'drawAndDeceiveState.correctAnswer': normalized,
      'drawAndDeceiveState.timerEndsAt': inSec(trappingTime),
    });
  });
}

/* ---------------------------- Trapping Phase ------------------------- */
export async function submitTrap(gameId: string, playerId: string, trap: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async tx => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;

    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state not initialized.');
    ensure(state.phase === 'trapping', 'Not in the trapping phase.');
    ensure(state.artistId !== playerId, 'The artist cannot submit a trap.');
    ensure(!state.playerTraps[playerId], 'Trap already submitted.');

    const normalizedTrap = normalizeAnswer(trap);

    // Reject traps similar to the correct answer
    if(state.correctAnswer) {
        const similarity = safeCompareStrings(normalizedTrap, state.correctAnswer);
        if (similarity >= 0.70) {
            throw new Error('فخك شديد الشبه بالإجابة الصحيحة. حاول مجددًا.');
        }
    }

    const updatedTraps = { ...state.playerTraps, [playerId]: normalizedTrap };

    tx.update(gameRef, {
      'drawAndDeceiveState.playerTraps': updatedTraps,
    });

    const activePlayers = game.players.filter(p => p.status !== 'left');
    const nonArtists = activePlayers.filter(p => p.id !== state.artistId);

    if (Object.keys(updatedTraps).length === nonArtists.length) {
      const correct = state.correctAnswer;
      ensure(correct, 'Correct answer is missing.');
      const allAnswers = [correct, ...Object.values(updatedTraps)].filter((a): a is string => !!a);
      const shuffledAnswers = shuffle(allAnswers);
      const guessingTime = state.settings?.guessingTime ?? DEFAULT_SETTINGS.guessingTime;
      
      tx.update(gameRef, {
        'drawAndDeceiveState.phase': 'guessing',
        'drawAndDeceiveState.shuffledAnswers': shuffledAnswers,
        'drawAndDeceiveState.timerEndsAt': inSec(guessingTime),
      });
    }
  });
}

/* ---------------------------- Guessing Phase ------------------------- */
export async function submitGuess(gameId: string, playerId: string, guess: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async tx => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;

    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state not initialized.');
    ensure(state.phase === 'guessing', 'Not in guessing phase.');
    ensure(state.artistId !== playerId, 'Artist cannot guess.');
    ensure(!state.playerGuesses[playerId], 'Guess already submitted.');

    const normalizedGuess = normalizeAnswer(guess);
    ensure((state.shuffledAnswers || []).includes(normalizedGuess), 'Invalid answer choice.');

    const updatedGuesses = { ...state.playerGuesses, [playerId]: normalizedGuess };
    tx.update(gameRef, {
      'drawAndDeceiveState.playerGuesses': updatedGuesses,
    });

    const activePlayers = game.players.filter(p => p.status !== 'left' && p.id !== state.artistId);
    if (Object.keys(updatedGuesses).length === activePlayers.length) {
      const { resultsState, updatedPlayerScores } = calculateRoundResults(game, updatedGuesses);
      const resultsTime = state.settings?.resultsTime ?? DEFAULT_SETTINGS.resultsTime;
      tx.update(gameRef, {
        'drawAndDeceiveState.phase': 'results',
        'drawAndDeceiveState.lastRoundResults': resultsState,
        playerScores: updatedPlayerScores,
        'drawAndDeceiveState.timerEndsAt': inSec(resultsTime),
      });
    }
  });
}

/* ---------------------- Results & Next Round / Timeout --------------------- */
export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  let isGameOver = false;

  await runTransaction(db, async tx => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;

    ensure(game.hostId === hostId, 'Only host can advance the game.');
    ensure(state && state.timerEndsAt && state.timerEndsAt.toMillis() <= Date.now(), 'Timer has not expired yet.');
    
    if (state.phase === 'results') {
      const nextRound = (state.round || 0) + 1;
      if (nextRound > state.settings.rounds) {
        const entries = Object.entries(game.playerScores || {});
        const winnerId = entries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] || 'none';
        const gameResult = { winner: winnerId, message: `The winner is determined!` };

        tx.update(gameRef, {
          gameState: 'final_results',
          'drawAndDeceiveState.phase': 'final_results',
          gameResult,
        });
        isGameOver = true;
      } else {
        const { nextIndex, artistId } = nextActiveArtist(state.turnOrder, state.currentTurnIndex, game.players);
        tx.update(gameRef, {
          gameState: 'drawing',
          'drawAndDeceiveState.phase': 'drawing',
          'drawAndDeceiveState.round': nextRound,
          'drawAndDeceiveState.currentTurnIndex': nextIndex,
          'drawAndDeceiveState.artistId': artistId,
          'drawAndDeceiveState.drawingDataUrl': null,
          'drawAndDeceiveState.correctAnswer': null,
          'drawAndDeceiveState.playerTraps': {},
          'drawAndDeceiveState.playerGuesses': {},
          'drawAndDeceiveState.shuffledAnswers': [],
          'drawAndDeceiveState.lastRoundResults': null,
          'drawAndDeceiveState.timerEndsAt': inSec(state.settings.drawingTime),
        });
      }
    } else if (state.phase === 'drawing') {
      // Artist didn't submit a drawing, skip their turn essentially.
      // We need a correct answer to proceed. We'll pick a random word.
      const randomWord = WORD_WAR_WORDS[Math.floor(Math.random() * WORD_WAR_WORDS.length)];
      tx.update(gameRef, {
        'drawAndDeceiveState.phase': 'trapping',
        'drawAndDeceiveState.correctAnswer': randomWord,
        'drawAndDeceiveState.timerEndsAt': inSec(state.settings.trappingTime),
      });
    } else if (state.phase === 'writing') {
        // Artist didn't submit a description. Pick a random word.
        const randomWord = WORD_WAR_WORDS[Math.floor(Math.random() * WORD_WAR_WORDS.length)];
        tx.update(gameRef, {
          'drawAndDeceiveState.phase': 'trapping',
          'drawAndDeceiveState.correctAnswer': randomWord,
          'drawAndDeceiveState.timerEndsAt': inSec(state.settings.trappingTime),
        });
    } else if (state.phase === 'trapping') {
      const correct = state.correctAnswer;
      ensure(correct, 'Correct answer is missing for timeout.');
      const allAnswers = [correct, ...Object.values(state.playerTraps)].filter((a): a is string => !!a);
      const shuffledAnswers = shuffle(allAnswers);
      tx.update(gameRef, {
        'drawAndDeceiveState.phase': 'guessing',
        'drawAndDeceiveState.shuffledAnswers': shuffledAnswers,
        'drawAndDeceiveState.timerEndsAt': inSec(state.settings.guessingTime),
      });
    } else if (state.phase === 'guessing') {
      const { resultsState, updatedPlayerScores } = calculateRoundResults(game, state.playerGuesses);
      tx.update(gameRef, {
        'drawAndDeceiveState.phase': 'results',
        'drawAndDeceiveState.lastRoundResults': resultsState,
        playerScores: updatedPlayerScores,
        'drawAndDeceiveState.timerEndsAt': inSec(state.settings.resultsTime),
      });
    }
  });

  if (isGameOver) {
      await distributeEndOfGameAwards(gameId);
  }
}
