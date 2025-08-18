

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, Transaction, updateDoc } from 'firebase/firestore';
import type {
  Game,
  Player,
  DrawAndDeceiveState,
  DrawAndDeceiveRoundResult,
  GameState,
} from '@/types';
import { shuffle, safeCompareStrings } from './helpers';
import { distributeEndOfGameAwards } from './admin/users';

/* ----------------------------- Constants ----------------------------- */
const DEFAULT_SETTINGS = {
  drawingTime: 120, // Now includes writing time
  trappingTime: 45,
  guessingTime: 35,
  resultsTime: 20,
  rounds: 3,
  writingTime: 20, // New: dedicated time for writing after drawing time is up
};

const KICK_VOTE_TIME = 30;
const KICK_VOTE_THRESHOLD = 2; // 2 votes needed to kick

const MAX_ROUNDS = 10;
const MIN_ROUNDS = 1;
const MAX_ANSWER_LEN = 30;
const SIMILARITY_BLOCK_THRESHOLD = 0.7;

/* ------------------------------ Utilities ---------------------------- */
const inSec = (s: number) => Timestamp.fromMillis(Date.now() + s * 1000);
const ensure = (condition: any, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const normalizeAnswer = (raw: string): string => {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('النص فارغ.');
  if (trimmed.length > MAX_ANSWER_LEN)
    throw new Error(
      `الوصف طويل جدًا (الحد الأقصى ${MAX_ANSWER_LEN} حرفًا).`
    );
  const words = trimmed.split(' ');
  if (words.length > 2)
    throw new Error('الوصف يجب أن يكون كلمة أو كلمتين فقط.');
  return trimmed;
};

const nextActiveArtist = (
  turnOrder: string[],
  currentTurnIndex: number,
  players: Player[]
): { nextIndex: number; artistId: string } => {
  const activeSet = new Set(
    players.filter((p) => p.status !== 'left').map((p) => p.id)
  );
  let idx = currentTurnIndex;
  for (let i = 0; i < turnOrder.length; i++) {
    idx = (idx + 1) % turnOrder.length;
    const candidate = turnOrder[idx]!;
    if (activeSet.has(candidate)) {
      return { nextIndex: idx, artistId: candidate };
    }
  }
  // Fallback if no one else is active
  return {
    nextIndex: currentTurnIndex,
    artistId: turnOrder[currentTurnIndex]!,
  };
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
): {
  resultsState: RoundResultsState;
  updatedPlayerScores: Record<string, number>;
} => {
  const state = game.drawAndDeceiveState!;
  const scores: Record<string, RoundScoreBucket> = {};
  const answersResult: DrawAndDeceiveRoundResult[] = [];
  const updatedPlayerScores: Record<string, number> = {
    ...(game.playerScores || {}),
  };

  const getPlayer = (id: string) => game.players.find((p) => p.id === id);
  const addScore = (playerId: string, points: number, reason: string) => {
    if (!scores[playerId]) scores[playerId] = { points: 0, breakdown: [] };
    scores[playerId]!.points += points;
    scores[playerId]!.breakdown.push({ reason, points });
    updatedPlayerScores[playerId] =
      (updatedPlayerScores[playerId] || 0) + points;
  };

  const correctAnswer = state.correctAnswer!;
  const allAnswers = [
    correctAnswer,
    ...Object.values(state.playerTraps),
  ].filter((a): a is string => !!a);

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
      guesserIds.forEach((guesserId) => {
        if (guesserId !== state.artistId) {
          addScore(guesserId, 2, 'إجابة صحيحة');
          addScore(
            state.artistId!,
            1,
            `تخمين صحيح من ${getPlayer(guesserId)?.name || 'لاعب'}`
          );
        }
      });
    } else {
      guesserIds.forEach((guesserId) => {
        if (authorIds.includes(guesserId)) {
          addScore(guesserId, -3, 'صوّت لفخه');
        } else {
          authorIds.forEach((authorId) => {
            addScore(
              authorId,
              2,
              `خدع ${getPlayer(guesserId)?.name || 'لاعب'}`
            );
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
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;

    ensure(game.hostId === hostId, 'Only the host can start the game.');
    ensure(
      game.players.filter((p) => p.status !== 'left').length >= 2,
      'At least 2 active players required.'
    );

    const baseSettings = {
      ...DEFAULT_SETTINGS,
      ...(game.drawAndDeceiveState?.settings || {}),
    };
    const rounds = Math.min(
      MAX_ROUNDS,
      Math.max(MIN_ROUNDS, baseSettings.rounds ?? DEFAULT_SETTINGS.rounds)
    );
    
    const activePlayers = game.players
      .filter((p) => p.status !== 'left')
      .map((p) => p.id);
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
    };

    tx.update(gameRef, {
      gameState: 'drawing',
      drawAndDeceiveState: initialState,
      playerScores: game.players.reduce(
        (acc, p) => ({ ...acc, [p.id]: 0 }),
        {}
      ),
    });
  });
}

/* ---------------------------- New Flow Actions -------------------------- */
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
            'drawAndDeceiveState.correctAnswer': normalizedAnswer,
            'drawAndDeceiveState.timerEndsAt': inSec(drawingTime),
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
        ensure(state.phase === 'drawing', 'Not in the drawing phase.');
        ensure(state.artistId === playerId, 'Only the artist can submit a drawing.');
        ensure(state.correctAnswer, 'The correct answer must be submitted before the drawing.');

        const trappingTime = state.settings?.trappingTime ?? DEFAULT_SETTINGS.trappingTime;

        tx.update(gameRef, {
            'drawAndDeceiveState.phase': 'trapping',
            'drawAndDeceiveState.drawingDataUrl': drawingDataUrl || null,
            'drawAndDeceiveState.timerEndsAt': inSec(trappingTime),
        });
    });
}


/* ---------------------------- Trapping Phase ------------------------- */
export async function submitTrap(
  gameId: string,
  playerId: string,
  trap: string
) {
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
        const similarity = safeCompareStrings(
          normalizedTrap,
          state.correctAnswer
        );
        if (similarity >= SIMILARITY_BLOCK_THRESHOLD) {
          throw new Error('فخك شديد الشبه بالإجابة الصحيحة. حاول مجددًا.');
        }
      }

      const updatedTraps = {
        ...state.playerTraps,
        [playerId]: normalizedTrap,
      };
      tx.update(gameRef, { 'drawAndDeceiveState.playerTraps': updatedTraps });

      const activePlayers = game.players.filter(
        (p) => p.status !== 'left' && p.id !== state.artistId
      );
      if (Object.keys(updatedTraps).length === activePlayers.length) {
        const correct = state.correctAnswer;
        ensure(correct, 'Correct answer is missing.');
        const allAnswers = [
          correct,
          ...Object.values(updatedTraps),
        ].filter((a): a is string => !!a);
        const shuffledAnswers = shuffle(allAnswers);
        const guessingTime =
          state.settings?.guessingTime ?? DEFAULT_SETTINGS.guessingTime;

        tx.update(gameRef, {
          'drawAndDeceiveState.phase': 'guessing',
          'drawAndDeceiveState.shuffledAnswers': shuffledAnswers,
          'drawAndDeceiveState.timerEndsAt': inSec(guessingTime),
        });
      }
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/* ---------------------------- Guessing Phase ------------------------- */
export async function submitGuess(
  gameId: string,
  playerId: string,
  guess: string | null
) {
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
    ensure(
      !guess || (state.shuffledAnswers || []).includes(normalizedGuess!),
      'Invalid answer choice.'
    );

    const updatedGuesses = {
      ...state.playerGuesses,
      [playerId]: normalizedGuess,
    };
    tx.update(gameRef, { 'drawAndDeceiveState.playerGuesses': updatedGuesses });

    const activePlayers = game.players.filter(
      (p) => p.status !== 'left' && p.id !== state.artistId
    );
    if (Object.keys(updatedGuesses).length === activePlayers.length) {
      const { resultsState, updatedPlayerScores } = calculateRoundResults(
        game,
        updatedGuesses as Record<string, string>
      );
      const resultsTime =
        state.settings?.resultsTime ?? DEFAULT_SETTINGS.resultsTime;
      tx.update(gameRef, {
        'drawAndDeceiveState.phase': 'results',
        'drawAndDeceiveState.lastRoundResults': resultsState,
        playerScores: updatedPlayerScores,
        'drawAndDeceiveState.timerEndsAt': inSec(resultsTime),
      });
    }
  });
}

/* ---------------------- Kick Vote Actions --------------------- */
export async function voteToKickArtist(gameId: string, voterId: string, vote: 'kick' | 'spare') {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;
    ensure(state?.phase === 'kick_vote', 'Not in kick vote phase.');
    ensure(state.artistId !== voterId, 'The artist cannot vote on themselves.');
    
    const kickVote = state.kickVote || { votes: {}, voterIds: [] };
    ensure(!kickVote.voterIds.includes(voterId), 'You have already voted.');

    const updatedVotes = { ...kickVote.votes, [voterId]: vote };
    const updatedVoterIds = [...kickVote.voterIds, voterId];
    tx.update(gameRef, {
      'drawAndDeceiveState.kickVote': { votes: updatedVotes, voterIds: updatedVoterIds }
    });

    const activeVoters = game.players.filter(p => p.status !== 'left' && p.id !== state.artistId);
    if (updatedVoterIds.length >= activeVoters.length) {
      // All votes are in, process the result immediately
      await processKickVote(gameId, tx);
    }
  });
}

async function processKickVote(gameId: string, tx: Transaction) {
    const gameRef = doc(db, 'games', gameId);
    const snap = await tx.get(gameRef);
    const game = snap.data() as Game;
    const state = game.drawAndDeceiveState!;
    const artistId = state.artistId!;
    
    const kickVotes = Object.values(state.kickVote?.votes ?? {}).filter(v => v === 'kick').length;
    
    if (kickVotes >= KICK_VOTE_THRESHOLD) {
        // Kick the player
        const newTurnOrder = state.turnOrder.filter(id => id !== artistId);
        if (newTurnOrder.length < 2) {
             const winnerId = Object.keys(game.playerScores || {}).reduce((a, b) => ((game.playerScores![a] || 0) > (game.playerScores![b] || 0) ? a : b), '');
             tx.update(gameRef, {
                 gameState: 'final_results',
                 'drawAndDeceiveState.phase': 'final_results',
                 gameResult: { winner: winnerId, message: 'انتهت اللعبة لعدم وجود لاعبين كافيين.'}
             });
             return;
        }
        
        const { nextIndex, artistId: newArtistId } = nextActiveArtist(newTurnOrder, state.currentTurnIndex - 1, game.players);
        
        tx.update(gameRef, {
            'drawAndDeceiveState.turnOrder': newTurnOrder,
            'drawAndDeceiveState.phase': 'drawing',
            'drawAndDeceiveState.artistId': newArtistId,
            'drawAndDeceiveState.currentTurnIndex': nextIndex,
            'drawAndDeceiveState.drawingDataUrl': null,
            'drawAndDeceiveState.correctAnswer': null,
            'drawAndDeceiveState.playerTraps': {},
            'drawAndDeceiveState.playerGuesses': {},
            'drawAndDeceiveState.shuffledAnswers': [],
            'drawAndDeceiveState.kickVote': null,
            'drawAndDeceiveState.timerEndsAt': null, // Wait for new artist to write
        });
    } else {
        // Spare the player, restart their drawing turn
         tx.update(gameRef, {
            'drawAndDeceiveState.phase': 'drawing',
            'drawAndDeceiveState.kickVote': null,
            'drawAndDeceiveState.correctAnswer': null, // Let them retry writing
            'drawAndDeceiveState.timerEndsAt': null, // Wait for new description
         });
    }
}


/* ---------------------- Results & Next Round / Timeout --------------------- */
export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    ensure(gameSnap.exists(), 'Game not found.');
    const game = gameSnap.data() as Game;
    const state = game.drawAndDeceiveState;
    ensure(state, 'Game state not initialized.');

    if (!state.timerEndsAt || state.timerEndsAt.toMillis() > Date.now()) {
      return; 
    }
    
    // Time is up for the current phase
    if (state.phase === 'drawing') {
        tx.update(gameRef, {
            'drawAndDeceiveState.phase': 'kick_vote',
            'drawAndDeceiveState.timerEndsAt': inSec(KICK_VOTE_TIME),
        });
    } else if (state.phase === 'kick_vote') {
        await processKickVote(gameId, tx);
    } else if (state.phase === 'trapping') {
      const playerAnswers = { ...(state.playerTraps || {}) };
      getActivePlayers(game).forEach(p => { if (p.id !== state.artistId && !playerAnswers[p.id]) playerAnswers[p.id] = null; });
      const { updates } = _getGuessingPhaseUpdates(game, playerAnswers);
      tx.update(gameRef, updates);
    } else if (state.phase === 'guessing') {
      const playerGuesses = { ...(state.playerGuesses || {}) };
      getActivePlayers(game).forEach(p => { if (p.id !== state.artistId && !playerGuesses[p.id]) playerGuesses[p.id] = null; });
      const { updates } = _getResultsPhaseUpdates(game, playerGuesses);
      tx.update(gameRef, updates);
    } else if (state.phase === 'results') {
      const { updates, isGameOver } = _getNextRoundUpdates(game);
      tx.update(gameRef, updates);
      if (isGameOver) {
          // Note: distributeEndOfGameAwards is now called from the client component for safety.
          // This transaction simply sets the final state.
      }
    }
  });
}

function _getGuessingPhaseUpdates(game: Game, playerAnswers: Record<string, string | null>) {
  const state = game.drawAndDeceiveState!;
  const guessingTime = state.settings?.guessingTime ?? DEFAULT_SETTINGS.guessingTime;
  const endsAt = inSec(guessingTime);
  ensure(state.correctAnswer, 'Correct answer is missing.');

  return {
    updates: {
      gameState: 'guessing' as GameState,
      'drawAndDeceiveState.playerAnswers': playerAnswers,
      'drawAndDeceiveState.timerEndsAt': endsAt,
      'drawAndDeceiveState.shuffledAnswers': buildShuffledAnswers(
        { answer: state.correctAnswer } as TrapQuestion, // This is a bit of a hack
        playerAnswers
      ),
    },
  };
}

function _getResultsPhaseUpdates(game: Game, playerGuesses: Record<string, string | null>) {
  const state = game.drawAndDeceiveState!;
  const { resultsState, updatedPlayerScores } = calculateRoundResults(
    game,
    playerGuesses as Record<string, string>
  );

  const resultsTime = state.settings?.resultsTime ?? DEFAULT_SETTINGS.resultsTime;
  const endsAt = inSec(resultsTime);

  return {
    updates: {
      gameState: 'results' as GameState,
      playerScores: updatedPlayerScores,
      'drawAndDeceiveState.lastRoundResults': resultsState,
      'drawAndDeceiveState.timerEndsAt': endsAt,
    },
  };
}

function _getNextRoundUpdates(game: Game): { updates: any; isGameOver: boolean } {
  const state = game.drawAndDeceiveState!;
  const nextRoundNumber = state.round + 1;

  if (nextRoundNumber > state.settings.rounds) {
    const winnerId = Object.keys(game.playerScores || {}).reduce((a, b) =>
      (game.playerScores![a] || 0) > (game.playerScores![b] || 0) ? a : b,
      ''
    );
    return {
      updates: {
        gameState: 'final_results',
        'drawAndDeceiveState.phase': 'final_results',
        gameResult: { winner: winnerId, message: 'انتهت اللعبة!' },
        'drawAndDeceiveState.timerEndsAt': null,
      },
      isGameOver: true,
    };
  }
  
  const { nextIndex, artistId } = nextActiveArtist(state.turnOrder, state.currentTurnIndex, game.players);

  return {
    updates: {
      gameState: 'drawing',
      'drawAndDeceiveState.phase': 'drawing',
      'drawAndDeceiveState.round': nextRoundNumber,
      'drawAndDeceiveState.currentTurnIndex': nextIndex,
      'drawAndDeceiveState.artistId': artistId,
      'drawAndDeceiveState.drawingDataUrl': null,
      'drawAndDeceiveState.correctAnswer': null,
      'drawAndDeceiveState.playerTraps': {},
      'drawAndDeceiveState.playerGuesses': {},
      'drawAndDeceiveState.shuffledAnswers': [],
      'drawAndDeceiveState.lastRoundResults': null,
      'drawAndDeceiveState.timerEndsAt': null,
    },
    isGameOver: false,
  };
}
