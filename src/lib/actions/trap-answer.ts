
'use server';

/**
 * @file Trap Answer — Server Actions
 * @version 4.0
 * @overview Robust refactor with stronger typing, better transaction hygiene,
 *          stricter guards, safer fallbacks, and reliable results/finals flow.
 *          Core gameplay logic is preserved.
 */

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------
import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  deleteField,
  arrayUnion,
  arrayRemove,
  updateDoc,
  limit,
} from 'firebase/firestore';

import type { Game, Player, TrapQuestion, EmojiReactionType, SocialRank } from '@/types';
import { isFirebaseError, safeCompareStrings, shuffle } from './helpers';
import { calculateTrapAnswerScores } from './helpers/trap-answer-helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { getTrapAnswerCategories } from './admin/settings';
import { getRanks, recordMatchHistory } from './user/queries';
import { calculateEndOfGameAwards } from './user/awards';


// -----------------------------------------------------------------------------
// Constants & small helpers
// -----------------------------------------------------------------------------
const SIMILARITY_THRESHOLD = 0.75 as const;
const SIMILARITY_BLOCK = 0.95 as const; // block traps/dummies too similar to the real answer
const CATEGORY_SELECTION_TIME_S = 30 as const;
const DEFAULT_ANSWER_TIME_S = 60 as const;
const FIELD_TRAP_STATE = 'trapAnswerState' as const;
const TIMEOUT_TOKEN = '__TIMEOUT__' as const;

const nowMs = () => Date.now();
const tsFromNowS = (s: number) => Timestamp.fromMillis(nowMs() + s * 1000);
const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const ensure: (cond: any, msg: string) => asserts cond = (cond, msg) => { if (!cond) throw new Error(msg); };

const getActivePlayers = (game: Game): Player[] =>
  Array.isArray(game.players) ? game.players.filter((p) => p.status === 'alive') : [];

const requireHost = (game: Game, hostId: string) => {
  ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
};

const requireState = (game: Game, expected: Game['gameState']) => {
  ensure(game.gameState === expected, `الحالة الحالية لا تسمح بهذا الإجراء (الحالة: ${game.gameState}).`);
};

// A minimal transaction typing to avoid importing internal SDK types
export type FirebaseFirestoreLikeTransaction = {
  get: (ref: any) => Promise<any>;
  update: (ref: any, data: any) => void;
};

// -----------------------------------------------------------------------------
// Data access
// -----------------------------------------------------------------------------
async function fetchRandomQuestionByCategory(category: string): Promise<TrapQuestion> {
  const questionsCol = collection(db, 'trap_answer_questions');
  const randomKey = Math.random();

  const q1 = query(
    questionsCol,
    where('category', '==', category),
    where('randomKey', '>=', randomKey),
    limit(1)
  );
  let snap = await getDocs(q1);

  if (snap.empty) {
    const q2 = query(
      questionsCol,
      where('category', '==', category),
      where('randomKey', '<', randomKey),
      limit(1)
    );
    snap = await getDocs(q2);
  }

  ensure(!snap.empty, `لا توجد أسئلة في قسم "${category}".`);
  const questionDoc = snap.docs[0];
  const data = questionDoc.data() as Omit<TrapQuestion, 'id'>;
  // Normalize dummies to array
  const dummyAnswers = Array.isArray((data as any).dummyAnswers) ? (data as any).dummyAnswers : [];
  return { id: questionDoc.id, ...(data as any), dummyAnswers } as TrapQuestion;
}

// -----------------------------------------------------------------------------
// Answer options builder (keeps core rules, adds stricter similarity filter)
// -----------------------------------------------------------------------------
function buildShuffledAnswers(
  question: TrapQuestion,
  playerAnswers: Record<string, string | null>
): string[] {
  const traps = new Set(
    Object.values(playerAnswers)
      .filter((ans): ans is string => typeof ans === 'string' && ans.trim() !== '')
      .map((ans) => ans.trim())
  );

  const all = new Set<string>([String(question.answer)]);

  // Add unique traps if not too similar to the correct answer
  traps.forEach((t) => {
    if (safeCompareStrings(t, question.answer) < SIMILARITY_BLOCK) {
      all.add(t);
    }
  });

  // Pad with distinct dummies (<= 4 total) filtering out very-similar ones
  const dummies = Array.isArray(question.dummyAnswers) ? [...question.dummyAnswers] : [];
  const shuffledDummies = shuffle(dummies);
  for (const d of shuffledDummies) {
    if (all.size >= 4) break;
    if (safeCompareStrings(d, question.answer) < SIMILARITY_BLOCK) {
      all.add(String(d));
    }
  }

  // Ensure at least 2 options (fallback: fabricate one safe dummy if needed)
  if (all.size < 2) {
    const fallback = '— لا أعرف —';
    if (safeCompareStrings(fallback, question.answer) < SIMILARITY_BLOCK) all.add(fallback);
  }

  return shuffle(Array.from(all));
}

// -----------------------------------------------------------------------------
// Trick stats merger
// -----------------------------------------------------------------------------
function mergeTrickStats(
  prev: NonNullable<Game[typeof FIELD_TRAP_STATE]>['trickStats'] | undefined,
  next: NonNullable<Game[typeof FIELD_TRAP_STATE]>['trickStats']
) {
  const merged = {
    trickedBy: { ...(prev?.trickedBy || {}) } as Record<string, string[]>,
    trickedOthers: { ...(prev?.trickedOthers || {}) } as Record<string, string[]>,
  };

  Object.entries(next.trickedBy || {}).forEach(([trickedId, trickerIds]) => {
    merged.trickedBy[trickedId] = [ ...(merged.trickedBy[trickedId] || []), ...trickerIds ];
  });
  Object.entries(next.trickedOthers || {}).forEach(([trickerId, trickedIds]) => {
    merged.trickedOthers[trickerId] = [ ...(merged.trickedOthers[trickerId] || []), ...trickedIds ];
  });

  return merged;
}

// -----------------------------------------------------------------------------
// Settings / Setup
// -----------------------------------------------------------------------------
export async function updateGameSettings(
  gameId: string,
  hostId: string,
  settings: Game['trapAnswerState']['settings']
) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    requireHost(game, hostId);
    requireState(game, 'lobby');

    // If categories are missing/empty, hydrate from admin settings (safety)
    let nextSettings = { ...(settings || {}) } as any;
    if (!Array.isArray(nextSettings.categories) || nextSettings.categories.length === 0) {
      const cats = await getTrapAnswerCategories();
      if (cats.success && Array.isArray(cats.categories) && cats.categories.length > 0) {
        nextSettings.categories = cats.categories;
      }
    }

    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.settings`]: nextSettings });
  });
}

export async function startTrapAnswerGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  const categoriesResult = await getTrapAnswerCategories();
  ensure(
    categoriesResult.success && Array.isArray(categoriesResult.categories) && categoriesResult.categories.length > 0,
    'لا يمكن بدء اللعبة، لم يتم العثور على أقسام أسئلة صالحة.'
  );
  const allCategories = categoriesResult.categories!;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    requireHost(game, hostId);
    ensure(Array.isArray(game.players) && game.players.length >= 2, 'اللعبة تحتاج على الأقل لاعبين اثنين.');

    const turnOrder = shuffle(game.players.map((p) => p.id));
    const fiveRandomCategories = shuffle([...allCategories]).slice(0, 5);

    const existingSettings = (game as any)[FIELD_TRAP_STATE]?.settings || {};
    const hydratedSettings = {
      rounds: typeof existingSettings.rounds === 'number' ? existingSettings.rounds : 10,
      answerTime: typeof existingSettings.answerTime === 'number' ? existingSettings.answerTime : DEFAULT_ANSWER_TIME_S,
      categories: Array.isArray(existingSettings.categories) && existingSettings.categories.length > 0
        ? existingSettings.categories
        : allCategories,
    };

    const initialScores = game.players.reduce<Record<string, number>>((acc, p) => {
      acc[p.id] = 0; return acc;
    }, {});

    tx.update(gameRef, {
      gameState: 'category-selection',
      round: 1,
      playerScores: initialScores,
      [`${FIELD_TRAP_STATE}.settings`]: hydratedSettings,
      [`${FIELD_TRAP_STATE}.turnOrder`]: turnOrder,
      [`${FIELD_TRAP_STATE}.currentTurnIndex`]: 0,
      [`${FIELD_TRAP_STATE}.fiveRandomCategories`]: fiveRandomCategories,
      [`${FIELD_TRAP_STATE}.playerAnswers`]: {},
      [`${FIELD_TRAP_STATE}.playerGuesses`]: {},
      [`${FIELD_TRAP_STATE}.lastRoundResults`]: {},
      [`${FIELD_TRAP_STATE}.trickStats`]: { trickedBy: {}, trickedOthers: {} },
      [`${FIELD_TRAP_STATE}.timerEndsAt`]: tsFromNowS(CATEGORY_SELECTION_TIME_S),
      [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
      [`${FIELD_TRAP_STATE}.afkStats`]: {},
      [`${FIELD_TRAP_STATE}.reactions`]: {},
      [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
    });
  });
}

// -----------------------------------------------------------------------------
// Core Flow
// -----------------------------------------------------------------------------
export async function selectCategoryAndGetQuestion(
  gameId: string,
  playerId: string,
  category: string
) {
  const gameRef = doc(db, 'games', gameId);

  // Strategy: minimal reads in the transaction; fetch question OUTSIDE of tx once guards pass.
  let shouldProceed = false;
  let answerTime = DEFAULT_ANSWER_TIME_S;
  let fiveRandomCategories: string[] = [];

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    if (game.gameState !== 'category-selection') return; // benign exit if state changed

    const turnOrder = (game as any)[FIELD_TRAP_STATE]?.turnOrder || [];
    const currentTurnIndex = (game as any)[FIELD_TRAP_STATE]?.currentTurnIndex || 0;
    const currentTurnPlayerId = turnOrder[currentTurnIndex];

    ensure(currentTurnPlayerId === playerId, 'ليس دورك لاختيار القسم.');

    fiveRandomCategories = (game as any)[FIELD_TRAP_STATE]?.fiveRandomCategories || [];
    ensure(
      fiveRandomCategories.includes(category),
      'القسم المختار غير متاح حالياً. اختر من الخيارات المعروضة.'
    );

    answerTime = (game as any)[FIELD_TRAP_STATE]?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
    shouldProceed = true;
  });

  if (!shouldProceed) return; // state changed during tx

  // Fetch the random question (outside tx for Firestore transaction hygiene)
  const randomQuestion = await fetchRandomQuestionByCategory(category);
  const endsAt = tsFromNowS(answerTime);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;

    // Re-validate that we are still in category-selection and it's still the same player's turn
    if (game.gameState !== 'category-selection') return;
    const turnOrder = (game as any)[FIELD_TRAP_STATE]?.turnOrder || [];
    const currentTurnIndex = (game as any)[FIELD_TRAP_STATE]?.currentTurnIndex || 0;
    const currentTurnPlayerId = turnOrder[currentTurnIndex];
    if (currentTurnPlayerId !== playerId) return;

    tx.update(gameRef, {
      gameState: 'answer-submission',
      [`${FIELD_TRAP_STATE}.currentQuestion`]: randomQuestion,
      [`${FIELD_TRAP_STATE}.playerAnswers`]: {},
      [`${FIELD_TRAP_STATE}.playerGuesses`]: {},
      [`${FIELD_TRAP_STATE}.lastRoundResults`]: {},
      [`${FIELD_TRAP_STATE}.selectedCategory`]: category,
      [`${FIELD_TRAP_STATE}.timerEndsAt`]: endsAt,
      [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
      [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
      [`${FIELD_TRAP_STATE}.reactions`]: {},
    });
  });
}

export async function submitTrapAnswer(gameId: string, playerId: string, answer: string) {
  const gameRef = doc(db, 'games', gameId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef);
      ensure(snap.exists(), 'اللعبة غير موجودة.');

      const game = snap.data() as Game;
      if (game.gameState !== 'answer-submission') return;

      const state = (game as any)[FIELD_TRAP_STATE] || {};
      if (hasOwn(state.playerAnswers || {}, playerId)) return; // already answered

      const finalAnswer = typeof answer === 'string' && answer.trim() !== '' ? answer.trim() : null;
      const correctAnswer = state?.currentQuestion?.answer;

      if (correctAnswer && finalAnswer && safeCompareStrings(finalAnswer, correctAnswer) > SIMILARITY_THRESHOLD) {
        throw new Error('لا يمكنك إدخال إجابة مطابقة أو شبيهة بالإجابة الصحيحة. قدم جوابًا مفخخًا!');
      }

      const newPlayerAnswers = {
        ...(state.playerAnswers || {}),
        [playerId]: finalAnswer,
      } as Record<string, string | null>;

      tx.update(gameRef, { [`${FIELD_TRAP_STATE}.playerAnswers`]: newPlayerAnswers });

      const active = getActivePlayers(game);
      const everyoneAnswered = active.every((p) => hasOwn(newPlayerAnswers, p.id));

      if (everyoneAnswered) {
        const updatedGame: Game = {
          ...game,
          trapAnswerState: { ...(game as any).trapAnswerState, playerAnswers: newPlayerAnswers },
        } as Game;
        await _advanceToGuessing(tx, gameRef, updatedGame);
      }
    });

    return { success: true } as const;
  } catch (error: any) {
    console.error('Detailed error in submitTrapAnswer:', error);
    const message = isFirebaseError?.(error) ? (error as any).message : (error?.message || 'حدث خطأ غير متوقع');
    return { error: `فشل إرسال الجواب: ${message}` } as const;
  }
}

export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    if (game.gameState !== 'guessing') return;

    const state = (game as any)[FIELD_TRAP_STATE] || {};
    if (hasOwn(state.playerGuesses || {}, playerId)) return; // already guessed

    const finalGuess = guess === null ? TIMEOUT_TOKEN : String(guess);

    // Guard: if guess is a concrete option, it must be part of shuffledAnswers
    if (finalGuess !== TIMEOUT_TOKEN) {
      const options: string[] = Array.isArray(state.shuffledAnswers) ? state.shuffledAnswers : [];
      ensure(options.includes(finalGuess), 'الاختيار غير صالح.');
    }

    const newPlayerGuesses = {
      ...(state.playerGuesses || {}),
      [playerId]: finalGuess,
    } as Record<string, string>;

    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.playerGuesses`]: newPlayerGuesses });

    const active = getActivePlayers(game);
    const everyoneGuessed = active.every((p) => hasOwn(newPlayerGuesses, p.id));

    if (everyoneGuessed) {
      const updatedGame: Game = {
        ...game,
        trapAnswerState: { ...(game as any).trapAnswerState, playerGuesses: newPlayerGuesses },
      } as Game;
      await _advanceToResults(tx, gameRef, updatedGame);
    }
  });
}

export async function nextTrapAnswerRound(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  let gameDataForLeagueUpdate: Game | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef);
      ensure(snap.exists(), 'اللعبة غير موجودة.');

      const game = snap.data() as Game;
      requireHost(game, hostId);
      if (game.gameState !== 'round-results') return;

      const currentRound = game.round || 0;
      const totalRounds = (game as any)[FIELD_TRAP_STATE]?.settings?.rounds || 10;

      if (currentRound >= totalRounds) {
        // --- GAME OVER ---
        const allRanks = await getRanks();
        const awardsResult = calculateEndOfGameAwards(game, allRanks);
        
        const finalAwards = awardsResult.data.specialAwards;
        const winUpdate = awardsResult.data.winUpdate;

        gameDataForLeagueUpdate = {
            ...game,
            gameState: 'final_results',
            gameResult: { winner: winUpdate?.userId || 'none', message: 'انتهت اللعبة'},
            trapAnswerState: {
                ...(game as any).trapAnswerState,
                finalAwards: {
                    ...finalAwards,
                    afkStats: (game as any).trapAnswerState?.afkStats || {}
                },
            }
        } as Game;
        
        tx.update(gameRef, {
            gameState: 'final_results',
            gameResult: gameDataForLeagueUpdate.gameResult,
            [`${FIELD_TRAP_STATE}.finalAwards`]: gameDataForLeagueUpdate.trapAnswerState!.finalAwards,
            [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField(),
        });
      } else {
        // --- NEXT ROUND ---
        const nextTurnIndex = (((game as any)[FIELD_TRAP_STATE]?.currentTurnIndex || 0) + 1) % game.players.length;
        const availableCategories = (game as any)[FIELD_TRAP_STATE]?.settings?.categories || [];
        const sourceCats: string[] = Array.isArray(availableCategories) && availableCategories.length > 0
          ? availableCategories
          : (((game as any)[FIELD_TRAP_STATE]?.fiveRandomCategories as string[]) || []);

        const fiveRandomCategories = shuffle([...sourceCats]).slice(0, 5);

        tx.update(gameRef, {
          gameState: 'category-selection',
          round: currentRound + 1,
          [`${FIELD_TRAP_STATE}.currentTurnIndex`]: nextTurnIndex,
          [`${FIELD_TRAP_STATE}.fiveRandomCategories`]: fiveRandomCategories,
          [`${FIELD_TRAP_STATE}.playerAnswers`]: {},
          [`${FIELD_TRAP_STATE}.playerGuesses`]: {},
          [`${FIELD_TRAP_STATE}.lastRoundResults`]: {},
          [`${FIELD_TRAP_STATE}.selectedCategory`]: deleteField(),
          [`${FIELD_TRAP_STATE}.currentQuestion`]: deleteField(),
          [`${FIELD_TRAP_STATE}.timerEndsAt`]: tsFromNowS(CATEGORY_SELECTION_TIME_S),
          [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
          [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
          [`${FIELD_TRAP_STATE}.awayPlayerIdsInAnsweringPhase`]: [],
        });
      }
    });

    if (gameDataForLeagueUpdate) {
      await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
  } catch (error) {
    console.error('Error in nextTrapAnswerRound:', error);
  }
}

// -----------------------------------------------------------------------------
// Timeout & Reactions
// -----------------------------------------------------------------------------
export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;

    const game = snap.data() as Game;
    const timerEndsAt = (game as any)[FIELD_TRAP_STATE]?.timerEndsAt as Timestamp | undefined;
    if (!timerEndsAt || timerEndsAt.toMillis() > nowMs()) return;

    if (game.hostId !== hostId) return;

    // Clear timer first
    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField() });

    if (game.gameState === 'category-selection') {
      const categories: string[] = (game as any)[FIELD_TRAP_STATE]?.fiveRandomCategories || [];
      if (!Array.isArray(categories) || categories.length === 0) return;

      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      const answerTime = (game as any)[FIELD_TRAP_STATE]?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
      const newTimer = tsFromNowS(answerTime);

      tx.update(gameRef, {
        gameState: 'answer-submission',
        [`${FIELD_TRAP_STATE}.selectedCategory`]: randomCategory,
        [`${FIELD_TRAP_STATE}.playerAnswers`]: {},
        [`${FIELD_TRAP_STATE}.playerGuesses`]: {},
        [`${FIELD_TRAP_STATE}.lastRoundResults`]: {},
        [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
        [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
      });
    } else if (game.gameState === 'answer-submission') {
      await _advanceToGuessing(tx, gameRef, game, true);
    } else if (game.gameState === 'guessing') {
      await _advanceToResults(tx, gameRef, game, true);
    }
  });

  const snap2 = await getDocs(query(collection(db, 'games'), where('__name__', '==', gameId)));
  if (!snap2.empty) {
    const g = snap2.docs[0].data() as Game;
    if (g.gameState === 'answer-submission' && !(g as any)[FIELD_TRAP_STATE]?.currentQuestion) {
      const chosen = (g as any)[FIELD_TRAP_STATE]?.selectedCategory as string | undefined;
      const aTime = (g as any)[FIELD_TRAP_STATE]?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
      if (chosen) {
        const q = await fetchRandomQuestionByCategory(chosen);
        await updateDoc(doc(db, 'games', gameId), {
          [`${FIELD_TRAP_STATE}.currentQuestion`]: q,
          [`${FIELD_TRAP_STATE}.timerEndsAt`]: tsFromNowS(aTime),
          [`${FIELD_TRAP_STATE}.reactions`]: {},
        });
      }
    }
  }
}

export async function sendReaction(gameId: string, playerId: string, emoji: EmojiReactionType) {
  const gameRef = doc(db, 'games', gameId);
  try {
    await updateDoc(gameRef, {
      [`${FIELD_TRAP_STATE}.reactions.${playerId}`]: {
        emoji,
        timestamp: Timestamp.now(),
      },
    });
  } catch (err) {
    console.error('Failed to send reaction:', err);
  }
}

export async function setAwayStatus(gameId: string, playerId: string, isAway: boolean): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  try {
    const updateData = {
      [`${FIELD_TRAP_STATE}.awayPlayerIds`]: isAway ? arrayUnion(playerId) : arrayRemove(playerId),
    } as Record<string, any>;
    await updateDoc(gameRef, updateData);
  } catch (error) {
    console.error(`Failed to update away status for player ${playerId} in game ${gameId}:`, error);
  }
}

// -----------------------------------------------------------------------------
// Internal helpers (preserve logic, harden edges)
// -----------------------------------------------------------------------------
async function _advanceToGuessing(
  tx: FirebaseFirestoreLikeTransaction,
  gameRef: any,
  game: Game,
  isTimeout: boolean = false
) {
  const state = (game as any)[FIELD_TRAP_STATE] || {};
  const playerAnswers: Record<string, string | null> = { ...(state.playerAnswers || {}) };
  const awayPlayerIdsInAnsweringPhase: string[] = Array.isArray(state.awayPlayerIds) ? state.awayPlayerIds : [];

  if (isTimeout) {
    const active = getActivePlayers(game);
    for (const p of active) {
      if (!hasOwn(playerAnswers, p.id)) playerAnswers[p.id] = null;
    }
  }

  const answerTime = state?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
  const timerEndsAt = tsFromNowS(answerTime);
  const question = state?.currentQuestion as TrapQuestion | undefined;
  ensure(!!question, 'بيانات السؤال غير موجودة للانتقال.');

  const shuffledAnswers = buildShuffledAnswers(question!, playerAnswers);

  tx.update(gameRef, {
    gameState: 'guessing',
    [`${FIELD_TRAP_STATE}.playerAnswers`]: playerAnswers,
    [`${FIELD_TRAP_STATE}.timerEndsAt`]: timerEndsAt,
    [`${FIELD_TRAP_STATE}.shuffledAnswers`]: shuffledAnswers,
    [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
    [`${FIELD_TRAP_STATE}.awayPlayerIdsInAnsweringPhase`]: awayPlayerIdsInAnsweringPhase,
    [`${FIELD_TRAP_STATE}.reactions`]: {},
  });
}

async function _advanceToResults(
  tx: FirebaseFirestoreLikeTransaction,
  gameRef: any,
  game: Game,
  isTimeout: boolean = false
) {
  const state = (game as any)[FIELD_TRAP_STATE] || {};
  const playerGuesses: Record<string, string> = { ...(state.playerGuesses || {}) };

  if (isTimeout) {
    const active = getActivePlayers(game);
    for (const p of active) {
      if (!hasOwn(playerGuesses, p.id)) playerGuesses[p.id] = TIMEOUT_TOKEN;
    }
  }

  ensure(!!state?.currentQuestion && !!state?.playerAnswers, 'Game state is missing necessary data for scoring.');

  const activePlayers = getActivePlayers(game);

  const awayInAnswering: string[] = Array.isArray(state.awayPlayerIdsInAnsweringPhase)
    ? state.awayPlayerIdsInAnsweringPhase
    : [];
  const awayInGuessing: string[] = Array.isArray(state.awayPlayerIds) ? state.awayPlayerIds : [];
  const awayPlayerIdsDuringRound = Array.from(new Set([ ...awayInAnswering, ...awayInGuessing ]));

  const { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds } = calculateTrapAnswerScores(
    activePlayers,
    state.currentQuestion,
    state.playerAnswers,
    playerGuesses,
    awayPlayerIdsDuringRound,
    Array.isArray(state.shuffledAnswers) ? state.shuffledAnswers : []
  );

  const finalScores: Record<string, number> = { ...(game.playerScores || {}) };
  Object.entries(roundScores).forEach(([pid, data]) => {
    if (data && typeof (data as any).points === 'number') {
      finalScores[pid] = (finalScores[pid] || 0) + (data as any).points;
    }
  });

  const mergedTrick = mergeTrickStats(state?.trickStats, newTrickStats);

  const roundResults: NonNullable<Game[typeof FIELD_TRAP_STATE]>['lastRoundResults'] = {
    scores: roundScores as any,
    answers: resultsByAnswer as any,
    timedOutGuesserIds,
    awayPlayerIdsDuringRound,
  } as any;

  // AFK accumulation
  const afkStats: Record<string, number> = { ...(state?.afkStats || {}) };
  awayPlayerIdsDuringRound.forEach((pid) => {
    afkStats[pid] = (afkStats[pid] || 0) + 1;
  });

  tx.update(gameRef, {
    gameState: 'round-results',
    playerScores: finalScores,
    [`${FIELD_TRAP_STATE}.playerGuesses`]: playerGuesses,
    [`${FIELD_TRAP_STATE}.lastRoundResults`]: roundResults,
    [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField(),
    [`${FIELD_TRAP_STATE}.trickStats`]: mergedTrick,
    [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
    [`${FIELD_TRAP_STATE}.afkStats`]: afkStats,
    [`${FIELD_TRAP_STATE}.reactions`]: {},
  });
}
