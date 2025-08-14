

'use server';

/**
 * trap-answer-actions.gpt5-refactor.ts
 * -------------------------------------------------------------
 * 🔧 تحسينات هندسية كبرى بدون تغيير منطق اللعبة:
 * - تنظيم أعلى للملف + توثيق JSDoc شامل.
 * - أدوات مساعدة Utilities موحّدة (وقت، لاعبين نشطين، التحقق من الدور... إلخ).
 * - ثوابت/رموز واضحة (TIMEOUT_TOKEN، مسارات الحالة...).
 * - تقليل التكرار (دمج منطق التبديل بين الحالات، اختيار سؤال عشوائي...).
 * - معاملات/حماية إضافية ضد الأخطاء + رسائل عربية واضحة للمستخدم.
 * - الحفاظ التام على سلوك الدوال المصدّرة والـ Firestore schema.
 *
 * ✨ ملاحظة: لا تغيير في منطق اللعبة أو النتائج.
 * -------------------------------------------------------------
 */

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

import type { Game, Player, TrapQuestion, EmojiReactionType } from '@/types';
import { isFirebaseError, safeCompareStrings, shuffle } from './helpers';
import { calculateTrapAnswerScores } from './helpers/trap-answer-helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';
import { getTrapAnswerCategories } from './admin/settings';

/* -------------------------------------------------------------
 * Constants
 * ----------------------------------------------------------- */
const SIMILARITY_THRESHOLD = 0.75 as const;
const CATEGORY_SELECTION_TIME_S = 30 as const;
const DEFAULT_ANSWER_TIME_S = 60 as const;
const FIELD_TRAP_STATE = 'trapAnswerState' as const;
const TIMEOUT_TOKEN = '__TIMEOUT__' as const;

/* -------------------------------------------------------------
 * Small helpers (no logic change, just safety/clarity)
 * ----------------------------------------------------------- */
const nowMs = () => Date.now();
const tsFromNowS = (s: number) => Timestamp.fromMillis(nowMs() + s * 1000);

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

const getActivePlayers = (game: Game): Player[] => game.players.filter((p) => p.status === 'alive');

const ensure = (cond: any, message: string): asserts cond => {
  if (!cond) throw new Error(message);
};

const requireHost = (game: Game, hostId: string) => {
  ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
};

const requireState = (game: Game, expected: Game['gameState']) => {
  ensure(game.gameState === expected, `الحالة الحالية لا تسمح بهذا الإجراء (الحالة: ${game.gameState}).`);
};

/**
 * اختيار سؤال عشوائي من مجموعة قسم معيّن.
 * يحافظ على السلوك الأصلي (randomKey >= ثم <).
 */
async function fetchRandomQuestionByCategory(category: string): Promise<TrapQuestion> {
  const questionsCol = collection(db, 'trap_answer_questions');
  const randomKey = Math.random();

  const q1 = query(questionsCol, where('category', '==', category), where('randomKey', '>=', randomKey), limit(1));
  let snap = await getDocs(q1);

  if (snap.empty) {
    const q2 = query(questionsCol, where('category', '==', category), where('randomKey', '<', randomKey), limit(1));
    snap = await getDocs(q2);
  }

  ensure(!snap.empty, `لا توجد أسئلة في قسم "${category}".`);
  const questionDoc = snap.docs[0];
  const data = questionDoc.data() as Omit<TrapQuestion, 'id'>;
  return { id: questionDoc.id, ...data };
}

/**
 * تكوين خيارات الإجابات المعروضة في مرحلة التخمين مع الحفاظ على القواعد الحالية:
 * - إجابة صحيحة + إجابات مفخخة فريدة من اللاعبين.
 * - استكمال بدُمّيات عند الحاجة حتى 4 خيارات.
 * - ثم خلط.
 */
function buildShuffledAnswers(question: TrapQuestion, playerAnswers: Record<string, string | null>): string[] {
  const traps = new Set(
    Object.values(playerAnswers)
      .filter((ans): ans is string => typeof ans === 'string' && ans.trim() !== '')
      .map((ans) => ans.trim())
  );

  const all = new Set<string>([question.answer]);
  traps.forEach((t) => {
      // Don't add a trap if it's too similar to the correct answer
      if (safeCompareStrings(t, question.answer) < 0.95) {
          all.add(t);
      }
  });

  // Add dummy answers only if we have less than 4 unique options
  if (all.size < 4 && Array.isArray(question.dummyAnswers) && question.dummyAnswers.length > 0) {
    const shuffledDummies = shuffle([...question.dummyAnswers]);
    for (const d of shuffledDummies) {
      if (all.size >= 4) break;
       // Also check similarity for dummies to avoid confusion
      if (safeCompareStrings(d, question.answer) < 0.95) {
         all.add(d);
      }
    }
  }

  return shuffle(Array.from(all));
}

/**
 * دمج إحصاءات الخداع (trickStats) بين الجولات.
 */
function mergeTrickStats(
  prev: NonNullable<Game[typeof FIELD_TRAP_STATE]>['trickStats'] | undefined,
  next: NonNullable<Game[typeof FIELD_TRAP_STATE]>['trickStats']
) {
  const merged = {
    trickedBy: { ...(prev?.trickedBy || {}) } as Record<string, string[]>,
    trickedOthers: { ...(prev?.trickedOthers || {}) } as Record<string, string[]>,
  };

  Object.entries(next.trickedBy).forEach(([trickedId, trickerIds]) => {
    merged.trickedBy[trickedId] = [ ...(merged.trickedBy[trickedId] || []), ...trickerIds ];
  });
  Object.entries(next.trickedOthers).forEach(([trickerId, trickedIds]) => {
    merged.trickedOthers[trickerId] = [ ...(merged.trickedOthers[trickerId] || []), ...trickedIds ];
  });

  return merged;
}

/* -------------------------------------------------------------
 * Settings / Setup
 * ----------------------------------------------------------- */
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

    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.settings`]: settings });
  });
}

export async function startTrapAnswerGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  const categoriesResult = await getTrapAnswerCategories();
  ensure(categoriesResult.success && Array.isArray(categoriesResult.categories) && categoriesResult.categories.length > 0,
    'لا يمكن بدء اللعبة، لم يتم العثور على أقسام أسئلة صالحة.'
  );
  const allCategories = categoriesResult.categories!;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    requireHost(game, hostId);
    ensure(game.players.length >= 2, 'اللعبة تحتاج على الأقل لاعبين اثنين.');

    const turnOrder = shuffle(game.players.map((p) => p.id));
    const fiveRandomCategories = shuffle([...allCategories]).slice(0, 5);

    tx.update(gameRef, {
      gameState: 'category-selection',
      round: 1,
      playerScores: game.players.reduce<Record<string, number>>((acc, p) => {
        acc[p.id] = 0; return acc;
      }, {}),
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
    });
  });
}

/* -------------------------------------------------------------
 * Core Flow
 * ----------------------------------------------------------- */
export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    if (game.gameState !== 'category-selection') return;

    const turnOrder = game.trapAnswerState?.turnOrder || [];
    const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
    const currentTurnPlayerId = turnOrder[currentTurnIndex];

    ensure(currentTurnPlayerId === playerId, 'ليس دورك لاختيار القسم.');

    const randomQuestion = await fetchRandomQuestionByCategory(category);

    const answerTime = game.trapAnswerState?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
    const endsAt = tsFromNowS(answerTime);

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
    });
  });
}

export async function submitTrapAnswer(gameId: string, playerId: string, answer: string) {
  const gameRef = doc(db, 'games', gameId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;

    if (game.gameState !== 'answer-submission') return;
    if (hasOwn(game.trapAnswerState?.playerAnswers || {}, playerId)) return;

    const finalAnswer = answer.trim() === '' ? null : answer.trim();
    const correctAnswer = game.trapAnswerState?.currentQuestion?.answer;

    if (correctAnswer && finalAnswer && safeCompareStrings(finalAnswer, correctAnswer) > SIMILARITY_THRESHOLD) {
      throw new Error('لا يمكنك إدخال إجابة مطابقة أو شبيهة بالإجابة الصحيحة. قدم جوابًا مفخخًا!');
    }

    const newPlayerAnswers = {
      ...(game.trapAnswerState?.playerAnswers || {}),
      [playerId]: finalAnswer,
    } as Record<string, string | null>;

    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.playerAnswers`]: newPlayerAnswers });

    const active = getActivePlayers(game);
    const everyoneAnswered = active.every((p) => hasOwn(newPlayerAnswers, p.id));

    if (everyoneAnswered) {
      const updatedGame: Game = {
        ...game,
        trapAnswerState: { ...game.trapAnswerState, playerAnswers: newPlayerAnswers },
      } as Game;
      await _advanceToGuessing(tx, gameRef, updatedGame);
    }
  })
    .then(() => ({ success: true }))
    .catch((error: any) => {
      console.error('Detailed error in submitTrapAnswer:', error);
      return { error: `فشل إرسال الجواب: ${error.message}` } as const;
    });
}

export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;

    if (game.gameState !== 'guessing') return;
    if (hasOwn(game.trapAnswerState?.playerGuesses || {}, playerId)) return;

    const finalGuess = guess === null ? TIMEOUT_TOKEN : guess;
    const newPlayerGuesses = {
      ...(game.trapAnswerState?.playerGuesses || {}),
      [playerId]: finalGuess,
    } as Record<string, string>;

    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.playerGuesses`]: newPlayerGuesses });

    const active = getActivePlayers(game);
    const everyoneGuessed = active.every((p) => hasOwn(newPlayerGuesses, p.id));

    if (everyoneGuessed) {
      const updatedGame: Game = {
        ...game,
        trapAnswerState: { ...game.trapAnswerState, playerGuesses: newPlayerGuesses },
      } as Game;
      await _advanceToResults(tx, gameRef, updatedGame);
    }
  });
}

export async function nextTrapAnswerRound(gameId: string, hostId: string) {
  let gameDataForLeagueUpdate: Game | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const gameRef = doc(db, 'games', gameId);
      const snap = await tx.get(gameRef);
      ensure(snap.exists(), 'اللعبة غير موجودة.');

      const game = snap.data() as Game;
      requireHost(game, hostId);
      if (game.gameState !== 'round-results') return;

      const currentRound = game.round || 0;
      const totalRounds = game.trapAnswerState?.settings.rounds || 10;

      if (currentRound >= totalRounds) {
        const allRanks = await getRanks();
        const finalAwardsResult = calculateEndOfGameAwards(game, allRanks);
        const winnerId = finalAwardsResult.winUpdate?.userId || '';

        const finalGameData: Game = {
          ...game,
          gameState: 'final_results',
          gameResult: { winner: winnerId, message: 'انتهت اللعبة' },
          trapAnswerState: {
            ...(game.trapAnswerState!),
            finalAwards: {
              ...finalAwardsResult.specialAwards,
              afkStats: game.trapAnswerState?.afkStats || {},
            },
          },
        } as Game;

        gameDataForLeagueUpdate = finalGameData;

        tx.update(gameRef, {
          gameState: 'final_results',
          gameResult: finalGameData.gameResult,
          [`${FIELD_TRAP_STATE}.finalAwards`]: finalGameData.trapAnswerState!.finalAwards,
          [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField(),
        });
      } else {
        const nextTurnIndex = ((game.trapAnswerState?.currentTurnIndex || 0) + 1) % game.players.length;
        const allCategories = game.trapAnswerState?.settings?.categories || [];
        const fiveRandomCategories = shuffle([...allCategories]).slice(0, 5);

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
          [`${FIELD_TRAP_STATE}.reactions`]: {},
          [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
          [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
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

/* -------------------------------------------------------------
 * Timeout & Reactions
 * ----------------------------------------------------------- */
export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return; // سلوك أصلي
    const game = snap.data() as Game;

    const timerEndsAt = game.trapAnswerState?.timerEndsAt;
    if (!timerEndsAt || timerEndsAt.toMillis() > nowMs()) return; // غير مستحق

    if (game.hostId !== hostId) return; // الموافقة الأصلية

    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField() });

    if (game.gameState === 'category-selection') {
      const turnOrder = game.trapAnswerState?.turnOrder || [];
      const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
      const currentTurnPlayerId = turnOrder[currentTurnIndex];
      const categories = game.trapAnswerState?.fiveRandomCategories;
      if (!categories || categories.length === 0 || !currentTurnPlayerId) return;

      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      const randomQuestion = await fetchRandomQuestionByCategory(randomCategory);

      const answerTime = game.trapAnswerState?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
      const newTimer = tsFromNowS(answerTime);

      tx.update(gameRef, {
        gameState: 'answer-submission',
        [`${FIELD_TRAP_STATE}.currentQuestion`]: randomQuestion,
        [`${FIELD_TRAP_STATE}.playerAnswers`]: {},
        [`${FIELD_TRAP_STATE}.playerGuesses`]: {},
        [`${FIELD_TRAP_STATE}.lastRoundResults`]: {},
        [`${FIELD_TRAP_STATE}.selectedCategory`]: randomCategory,
        [`${FIELD_TRAP_STATE}.timerEndsAt`]: newTimer,
        [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
        [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
      });
    } else if (game.gameState === 'answer-submission') {
      await _advanceToGuessing(tx, gameRef, game, true);
    } else if (game.gameState === 'guessing') {
      await _advanceToResults(tx, gameRef, game, true);
    }
  });
}

export async function sendReaction(gameId: string, playerId: string, emoji: EmojiReactionType) {
  const gameRef = doc(db, 'games', gameId);
  await updateDoc(gameRef, {
    [`${FIELD_TRAP_STATE}.reactions.${playerId}`]: {
      emoji,
      timestamp: Timestamp.now(),
    },
  });
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

/* -------------------------------------------------------------
 * Internal helpers (keep exact game logic)
 * ----------------------------------------------------------- */
async function _advanceToGuessing(
  tx: FirebaseFirestoreLikeTransaction,
  gameRef: any,
  game: Game,
  isTimeout: boolean = false
) {
  const playerAnswers: Record<string, string | null> = { ...(game.trapAnswerState?.playerAnswers || {}) };
  const awayPlayerIdsInAnsweringPhase = game.trapAnswerState?.awayPlayerIds || [];

  if (isTimeout) {
    const active = getActivePlayers(game);
    for (const p of active) {
      if (!hasOwn(playerAnswers, p.id)) playerAnswers[p.id] = null;
    }
  }

  const answerTime = game.trapAnswerState?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
  const timerEndsAt = tsFromNowS(answerTime);
  const question = game.trapAnswerState?.currentQuestion;
  ensure(!!question, 'بيانات السؤال غير موجودة للانتقال.');

  const shuffledAnswers = buildShuffledAnswers(question!, playerAnswers);

  tx.update(gameRef, {
    gameState: 'guessing',
    [`${FIELD_TRAP_STATE}.playerAnswers`]: playerAnswers,
    [`${FIELD_TRAP_STATE}.timerEndsAt`]: timerEndsAt,
    [`${FIELD_TRAP_STATE}.shuffledAnswers`]: shuffledAnswers,
    [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
    [`${FIELD_TRAP_STATE}.awayPlayerIdsInAnsweringPhase`]: awayPlayerIdsInAnsweringPhase,
  });
}

async function _advanceToResults(
  tx: FirebaseFirestoreLikeTransaction,
  gameRef: any,
  game: Game,
  isTimeout: boolean = false
) {
  const playerGuesses: Record<string, string> = { ...(game.trapAnswerState?.playerGuesses || {}) };

  if (isTimeout) {
    const active = getActivePlayers(game);
    for (const p of active) {
      if (!hasOwn(playerGuesses, p.id)) playerGuesses[p.id] = TIMEOUT_TOKEN;
    }
  }

  ensure(!!game.trapAnswerState?.currentQuestion && !!game.trapAnswerState?.playerAnswers,
    'Game state is missing necessary data for scoring.'
  );

  const activePlayers = getActivePlayers(game);

  const awayInAnswering = game.trapAnswerState!.awayPlayerIdsInAnsweringPhase || [];
  const awayInGuessing = game.trapAnswerState!.awayPlayerIds || [];
  const awayPlayerIdsDuringRound = Array.from(new Set([ ...awayInAnswering, ...awayInGuessing ]));

  const { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds } = calculateTrapAnswerScores(
    activePlayers,
    game.trapAnswerState!.currentQuestion!,
    game.trapAnswerState!.playerAnswers!,
    playerGuesses,
    awayPlayerIdsDuringRound,
    game.trapAnswerState!.shuffledAnswers || []
  );

  const finalScores: Record<string, number> = { ...(game.playerScores || {}) };
  Object.entries(roundScores).forEach(([pid, data]) => {
    if (data && typeof data.points === 'number') {
      finalScores[pid] = (finalScores[pid] || 0) + data.points;
    }
  });

  const mergedTrick = mergeTrickStats(game.trapAnswerState?.trickStats, newTrickStats);

  const roundResults = {
    scores: roundScores,
    answers: resultsByAnswer,
    timedOutGuesserIds,
    awayPlayerIdsDuringRound,
  } as NonNullable<Game[typeof FIELD_TRAP_STATE]>['lastRoundResults'];

  // تحديث AFK
  const afkStats: Record<string, number> = { ...(game.trapAnswerState?.afkStats || {}) };
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
  });
}

/* -------------------------------------------------------------
 * Minimal Transaction type (to keep helpers typed)
 * ----------------------------------------------------------- */
// نستعمل واجهة بسيطة لتجنّب استيراد نوع داخلي غير عام.
type FirebaseFirestoreLikeTransaction = {
  get: (ref: any) => Promise<any>;
  update: (ref: any, data: any) => void;
};
