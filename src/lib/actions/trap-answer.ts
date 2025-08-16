'use server';

/**
 * @file Trap Answer — Server Actions (v4.3 — auto-advance)
 * @overview
 * - Any player can "nudge" timeouts (no host lock-in)
 * - Timers are written inside transactions and mirrored to `roundEndTime`
 * - NEW: Auto-advance from round-results to next round after a short results timer
 * - NEW: `handleTimeout` now handles all phases including round-results (next round/finalize)
 * - UI phases stable: category | answer | guess | reveal
 * - `submitGuess` ignores duplicate value to cut extra writes (reduces flicker)
 * - Safer transitions & scoring unchanged
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
  getDoc,
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
import { getTrapAnswerCategories } from './admin/settings';
import { getRanks } from './user/queries';
import { calculateEndOfGameAwards } from './user/awards';

// -----------------------------------------------------------------------------
// Constants & small helpers
// -----------------------------------------------------------------------------
const SIMILARITY_THRESHOLD = 0.75 as const;
const SIMILARITY_BLOCK = 0.95 as const; // block traps/dummies too similar to the real answer
const CATEGORY_SELECTION_TIME_S = 30 as const;
const DEFAULT_ANSWER_TIME_S = 60 as const;
const RESULTS_TIME_S = 8 as const; // NEW: stay on results screen for N seconds then auto-advance
const FIELD_TRAP_STATE = 'trapAnswerState' as const;
const TIMEOUT_TOKEN = '__TIMEOUT__' as const;

const nowMs = () => Date.now();
const tsFromNowS = (s: number) => Timestamp.fromMillis(nowMs() + s * 1000);
const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const ensure: (cond: any, msg: string) => asserts cond = (cond, msg) => { if (!cond) throw new Error(msg); };

/** Active players = anyone not 'left' (keeps UI logic aligned) */
const getActivePlayers = (game: Game): Player[] =>
  Array.isArray(game.players) ? game.players.filter((p) => p.status !== 'left') : [];

// -----------------------------------------------------------------------------
// Validation & normalization
// -----------------------------------------------------------------------------
function sanitizeSettings(input: any, fallbackCats: string[]) {
  const roundsRaw = Number(input?.rounds);
  const answerTimeRaw = Number(input?.answerTime);
  const categories = Array.isArray(input?.categories) ? input.categories.filter(Boolean) : [];

  const rounds = Number.isFinite(roundsRaw) && roundsRaw >= 1 ? roundsRaw : 10;
  const answerTime = Number.isFinite(answerTimeRaw) && answerTimeRaw >= 10 ? answerTimeRaw : DEFAULT_ANSWER_TIME_S;
  const cats = categories.length > 0 ? categories : fallbackCats;

  ensure(cats.length > 0, 'لا توجد أقسام صالحة.');
  return { rounds, answerTime, categories: cats } as Game[typeof FIELD_TRAP_STATE]['settings'];
}

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
// Trick stats merger (de-duplicates entries)
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
    const set = new Set([...(merged.trickedBy[trickedId] || []), ...trickerIds]);
    merged.trickedBy[trickedId] = Array.from(set);
  });
  Object.entries(next.trickedOthers || {}).forEach(([trickerId, trickedIds]) => {
    const set = new Set([...(merged.trickedOthers[trickerId] || []), ...trickedIds]);
    merged.trickedOthers[trickerId] = Array.from(set);
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

  // Preload categories OUTSIDE the transaction
  const catsRes = await getTrapAnswerCategories();
  const fallbackCats = catsRes.success && Array.isArray(catsRes.categories) && catsRes.categories.length > 0
    ? catsRes.categories
    : [];

  const nextSettings = sanitizeSettings(settings || {}, fallbackCats);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
    ensure(game.gameState === 'lobby', `الحالة الحالية لا تسمح بهذا الإجراء (الحالة: ${game.gameState}).`);

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
    ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
    ensure(Array.isArray(game.players) && game.players.length >= 2, 'اللعبة تحتاج على الأقل لاعبين اثنين.');

    const turnOrder = shuffle(game.players.map((p) => p.id));
    const fiveRandomCategories = shuffle([...allCategories]).slice(0, 5);

    const existingSettings = (game as any)[FIELD_TRAP_STATE]?.settings || {};
    const hydratedSettings = sanitizeSettings(existingSettings, allCategories);

    const initialScores = game.players.reduce<Record<string, number>>((acc, p) => {
      acc[p.id] = 0; return acc;
    }, {});

    const endsAt = tsFromNowS(CATEGORY_SELECTION_TIME_S);

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
      [`${FIELD_TRAP_STATE}.timerEndsAt`]: endsAt,
      [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt,           // UI mirror
      [`${FIELD_TRAP_STATE}.phase`]: 'category',              // UI phase
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

  // Minimal reads in the transaction; fetch question OUTSIDE once guards pass.
  let shouldProceed = false;
  let answerTime = DEFAULT_ANSWER_TIME_S;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    if (game.gameState !== 'category-selection') return; // benign exit if state changed

    const turnOrder = (game as any)[FIELD_TRAP_STATE]?.turnOrder || [];
    const currentTurnIndex = (game as any)[FIELD_TRAP_STATE]?.currentTurnIndex || 0;
    const currentTurnPlayerId = turnOrder[currentTurnIndex];
    ensure(currentTurnPlayerId === playerId, 'ليس دورك لاختيار القسم.');

    const fiveRandomCategories = (game as any)[FIELD_TRAP_STATE]?.fiveRandomCategories || [];
    ensure(fiveRandomCategories.includes(category), 'القسم المختار غير متاح حالياً. اختر من الخيارات المعروضة.');

    answerTime = (game as any)[FIELD_TRAP_STATE]?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
    shouldProceed = true;
  });

  if (!shouldProceed) return;

  const randomQuestion = await fetchRandomQuestionByCategory(category);
  const endsAt = tsFromNowS(answerTime);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;

    if (game.gameState !== 'category-selection') return;
    const turnOrder = (game as any)[FIELD_TRAP_STATE]?.turnOrder || [];
    const currentTurnIndex = (game as any)[FIELD_TRAP_STATE]?.currentTurnIndex || 0;
    const currentTurnPlayerId = turnOrder[currentTurnIndex];
    if (currentTurnPlayerId !== playerId) return;

    tx.update(gameRef, {
      gameState: 'answer-submission',
      [`${FIELD_TRAP_STATE}.phase`]: 'answer',
      [`${FIELD_TRAP_STATE}.currentQuestion`]: randomQuestion,
      [`${FIELD_TRAP_STATE}.playerAnswers`]: {},
      [`${FIELD_TRAP_STATE}.playerGuesses`]: {},
      [`${FIELD_TRAP_STATE}.lastRoundResults`]: {},
      [`${FIELD_TRAP_STATE}.selectedCategory`]: category,
      [`${FIELD_TRAP_STATE}.timerEndsAt`]: endsAt,
      [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt,   // UI mirror
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
        await _advanceToGuessing(tx as any, gameRef, updatedGame);
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
    const finalGuess = guess === null ? TIMEOUT_TOKEN : String(guess);

    // Guard: if guess is a concrete option, it must be part of shuffledAnswers
    if (finalGuess !== TIMEOUT_TOKEN) {
      const options: string[] = Array.isArray(state.shuffledAnswers) ? state.shuffledAnswers : [];
      ensure(options.includes(finalGuess), 'الاختيار غير صالح.');
    }

    // ⛔️ Skip update if same (reduces unnecessary re-renders/flicker)
    const prev = (state.playerGuesses || {})[playerId];
    if (prev === finalGuess) return;

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
      await _advanceToResults(tx as any, gameRef, updatedGame);
    }
  });
}

export async function nextTrapAnswerRound(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  let finishGame = false;
  let gameSnapshotAtEnd: Game | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');

    const game = snap.data() as Game;
    ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
    if (game.gameState !== 'round-results') return;

    const currentRound = game.round || 0;
    const totalRounds = (game as any)[FIELD_TRAP_STATE]?.settings?.rounds || 10;

    if (currentRound >= totalRounds) {
      finishGame = true;
      gameSnapshotAtEnd = game;

      tx.update(gameRef, {
        gameState: 'final_results',
        [`${FIELD_TRAP_STATE}.timerEndsAt`] : deleteField(),
        [`${FIELD_TRAP_STATE}.roundEndTime`]: deleteField(),
        [`${FIELD_TRAP_STATE}.phase`]       : 'reveal',
      });
    } else {
      const nextTurnIndex = (((game as any)[FIELD_TRAP_STATE]?.currentTurnIndex || 0) + 1) % game.players.length;
      const availableCategories = (game as any)[FIELD_TRAP_STATE]?.settings?.categories || [];
      const sourceCats: string[] = Array.isArray(availableCategories) && availableCategories.length > 0
        ? availableCategories
        : (((game as any)[FIELD_TRAP_STATE]?.fiveRandomCategories as string[]) || []);

      const fiveRandomCategories = shuffle([...sourceCats]).slice(0, 5);
      const endsAt = tsFromNowS(CATEGORY_SELECTION_TIME_S);

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
        [`${FIELD_TRAP_STATE}.timerEndsAt`]: endsAt,
        [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt, // UI mirror
        [`${FIELD_TRAP_STATE}.phase`]: 'category',
        [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
        [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
        [`${FIELD_TRAP_STATE}.reactions`]: {},
      });
    }
  });

  // Heavy work & cross-doc updates OUTSIDE the transaction
  if (finishGame && gameSnapshotAtEnd) {
    try {
      const fresh = await getDoc(gameRef);
      if (!fresh.exists()) return;
      const current = fresh.data() as Game;
      const alreadyFinalized = Boolean((current as any)[FIELD_TRAP_STATE]?.finalAwards);

      if (!alreadyFinalized) {
        const allRanks = await getRanks();
        const { data: awards } = calculateEndOfGameAwards(current, allRanks);
        const finalAwards = awards.specialAwards;
        const winUpdate = awards.winUpdate;

        await updateDoc(gameRef, {
          gameResult: { winner: winUpdate?.userId || 'none', message: 'انتهت اللعبة' },
          [`${FIELD_TRAP_STATE}.finalAwards`]: {
            ...finalAwards,
            afkStats: (current as any)[FIELD_TRAP_STATE]?.afkStats || {},
          },
        });

        await updateLeagueScoresForGameEnd({ ...current, gameState: 'final_results' } as Game);
      }
    } catch (error) {
      console.error('Error finalizing game:', error);
    }
  }
}

/**
 * A "tick" function that can be safely called by any client when a timer appears
 * to have run out. The server will validate the timestamp before proceeding.
 * This prevents the game from getting stuck if the host is inactive.
 */
export async function tickGame(gameId: string) {
  const gameRef = doc(db, 'games', gameId);

  // Read the current state once
  const gameSnap = await getDoc(gameRef);
  if (!gameSnap.exists()) return;
  const game = gameSnap.data() as Game;

  // Check if a timer is active and expired
  const timerEndsAt = (game as any)[FIELD_TRAP_STATE]?.roundEndTime as Timestamp | undefined;
  if (!timerEndsAt || timerEndsAt.toMillis() > nowMs()) {
    // No expired timer, do nothing.
    return;
  }

  // If timer is expired, call the full handleTimeout logic.
  // We pass the current player's ID, though the new handleTimeout doesn't
  // strictly need it to be the host anymore.
  const selfId = (typeof window !== 'undefined' && sessionStorage.getItem(`player-id-${gameId}`)) || game.hostId;
  await handleTimeout(gameId, selfId);
}

// -----------------------------------------------------------------------------
// Timeout & Reactions
// -----------------------------------------------------------------------------
export async function handleTimeout(gameId: string, callerId: string) {
  const gameRef = doc(db, 'games', gameId);

  let shouldFinalize = false; // NEW: if results -> final

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;

    const game = snap.data() as Game;
    const state = (game as any)[FIELD_TRAP_STATE] || {};
    const timerEndsAt = state?.roundEndTime as Timestamp | undefined;
    if (!timerEndsAt || timerEndsAt.toMillis() > nowMs()) return;

    // ✅ أي لاعب مشارك يقدر ينفذ النخزة (بدلاً من المضيف فقط)
    const isPlayer = Array.isArray(game.players) && game.players.some(p => p.id === callerId);
    if (!isPlayer) return;

    // Clear timer first to avoid double-processing
    tx.update(gameRef, {
      [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField(),
      [`${FIELD_TRAP_STATE}.roundEndTime`]: deleteField(),
    });

    if (game.gameState === 'category-selection') {
      const categories: string[] = state?.fiveRandomCategories || [];
      if (!Array.isArray(categories) || categories.length === 0) return;

      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      const answerTime = state?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
      const newTimer = tsFromNowS(answerTime);

      // Move to answer-submission immediately, set timer; inject question post-tx.
      tx.update(gameRef, {
        gameState: 'answer-submission',
        [`${FIELD_TRAP_STATE}.phase`]: 'answer',
        [`${FIELD_TRAP_STATE}.selectedCategory`]: randomCategory,
        [`${FIELD_TRAP_STATE}.playerAnswers`]: {},
        [`${FIELD_TRAP_STATE}.playerGuesses`]: {},
        [`${FIELD_TRAP_STATE}.lastRoundResults`]: {},
        [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
        [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
        [`${FIELD_TRAP_STATE}.reactions`]: {},
        [`${FIELD_TRAP_STATE}.timerEndsAt`]: newTimer,
        [`${FIELD_TRAP_STATE}.roundEndTime`]: newTimer,
      });
    } else if (game.gameState === 'answer-submission') {
      await _advanceToGuessing(tx as any, gameRef, game, true);
    } else if (game.gameState === 'guessing') {
      await _advanceToResults(tx as any, gameRef, game, true);
    } else if (game.gameState === 'round-results') {
      // NEW: Auto-advance to next round or finalize
      const currentRound = game.round || 0;
      const totalRounds = state?.settings?.rounds || 10;

      if (currentRound >= totalRounds) {
        shouldFinalize = true;
        tx.update(gameRef, {
          gameState: 'final_results',
          [`${FIELD_TRAP_STATE}.phase`]: 'reveal',
          [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField(),
          [`${FIELD_TRAP_STATE}.roundEndTime`]: deleteField(),
        });
      } else {
        const nextTurnIndex = ((state?.currentTurnIndex || 0) + 1) % (game.players?.length || 1);
        const availableCategories = state?.settings?.categories || [];
        const sourceCats: string[] = Array.isArray(availableCategories) && availableCategories.length > 0
          ? availableCategories
          : ((state?.fiveRandomCategories as string[]) || []);

        const fiveRandomCategories = shuffle([...sourceCats]).slice(0, 5);
        const endsAt = tsFromNowS(CATEGORY_SELECTION_TIME_S);

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
          [`${FIELD_TRAP_STATE}.timerEndsAt`]: endsAt,
          [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt, // UI mirror
          [`${FIELD_TRAP_STATE}.phase`]: 'category',
          [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
          [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
          [`${FIELD_TRAP_STATE}.reactions`]: {},
        });
      }
    }
  });

  // If we auto-picked a category, fetch & attach the question now
  try {
    const fresh = await getDoc(gameRef);
    if (!fresh.exists()) return;
    const g = fresh.data() as Game;

    if (g.gameState === 'answer-submission' && !(g as any)[FIELD_TRAP_STATE]?.currentQuestion) {
      const chosen = (g as any)[FIELD_TRAP_STATE]?.selectedCategory as string | undefined;
      if (chosen) {
        const q = await fetchRandomQuestionByCategory(chosen);
        await updateDoc(gameRef, {
          [`${FIELD_TRAP_STATE}.currentQuestion`]: q,
          [`${FIELD_TRAP_STATE}.reactions`]: {},
        });
      }
    }
  } catch (e) {
    console.error('Timeout post-step (attach question) failed:', e);
  }

  // NEW: If we just flipped to final_results via timeout, finalize awards & league updates
  try {
    const fresh = await getDoc(gameRef);
    if (!fresh.exists()) return;
    const current = fresh.data() as Game;
    if (current.gameState === 'final_results') {
      const alreadyFinalized = Boolean((current as any)[FIELD_TRAP_STATE]?.finalAwards);
      if (!alreadyFinalized) {
        const allRanks = await getRanks();
        const { data: awards } = calculateEndOfGameAwards(current, allRanks);
        const finalAwards = awards.specialAwards;
        const winUpdate = awards.winUpdate;

        await updateDoc(gameRef, {
          gameResult: { winner: winUpdate?.userId || 'none', message: 'انتهت اللعبة' },
          [`${FIELD_TRAP_STATE}.finalAwards`]: {
            ...finalAwards,
            afkStats: (current as any)[FIELD_TRAP_STATE]?.afkStats || {},
          },
        });

        await updateLeagueScoresForGameEnd({ ...current, gameState: 'final_results' } as Game);
      }
    }
  } catch (e) {
    console.error('Timeout post-step (finalize game) failed:', e);
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
// Internal helpers (preserve core logic, harden edges)
// -----------------------------------------------------------------------------
type Tx = {
  get: (ref: any) => Promise<any>;
  update: (ref: any, data: any) => void;
};

async function _advanceToGuessing(
  tx: Tx,
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
    [`${FIELD_TRAP_STATE}.phase`]: 'guess',
    [`${FIELD_TRAP_STATE}.playerAnswers`]: playerAnswers,
    [`${FIELD_TRAP_STATE}.timerEndsAt`]: timerEndsAt,
    [`${FIELD_TRAP_STATE}.roundEndTime`]: timerEndsAt, // UI mirror
    [`${FIELD_TRAP_STATE}.shuffledAnswers`]: shuffledAnswers,
    [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
    [`${FIELD_TRAP_STATE}.awayPlayerIdsInAnsweringPhase`]: awayPlayerIdsInAnsweringPhase,
    [`${FIELD_TRAP_STATE}.reactions`]: {},
  });
}

async function _advanceToResults(
  tx: Tx,
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
  const awayPlayerIdsDuringRound = Array.from(new Set([...awayInAnswering, ...awayInGuessing]));

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

  const resultsEndsAt = tsFromNowS(RESULTS_TIME_S); // NEW: results timeout to auto-advance

  tx.update(gameRef, {
    gameState: 'round-results',
    [`${FIELD_TRAP_STATE}.phase`]: 'reveal',
    playerScores: finalScores,
    [`${FIELD_TRAP_STATE}.playerGuesses`]: playerGuesses,
    [`${FIELD_TRAP_STATE}.lastRoundResults`]: roundResults,
    [`${FIELD_TRAP_STATE}.timerEndsAt`]: resultsEndsAt, // NEW
    [`${FIELD_TRAP_STATE}.roundEndTime`]: resultsEndsAt, // UI mirror
    [`${FIELD_TRAP_STATE}.trickStats`]: mergedTrick,
    [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
    [`${FIELD_TRAP_STATE}.afkStats`]: afkStats,
    [`${FIELD_TRAP_STATE}.reactions`]: {},
  });
}
