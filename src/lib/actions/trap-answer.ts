
'use server';

/**
 * @file Trap Answer — Server Actions (v5.1 — Transaction Fix)
 * @overview
 * - The primary responsibility of this file is to manage the game's state transitions.
 * - The actual distribution of awards and recording of match history is now fully
 *   delegated to an admin-level function called from the results phase on the client.
 * - This version fixes a critical Firestore transaction error where a read was performed after a write.
 */

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------
import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  getDocs,
  collection,
  query,
  where,
  limit,
  Timestamp,
  deleteField,
  arrayUnion,
  arrayRemove,
  updateDoc,
} from 'firebase/firestore';

import type { Game, Player, TrapQuestion, EmojiReactionType } from '@/types';
import { isFirebaseError, safeCompareStrings, shuffle } from './helpers';
import { calculateTrapAnswerScores } from './helpers/trap-answer-helpers';
import { getTrapAnswerCategories } from './admin/settings';
import { distributeEndOfGameAwards } from './admin/users';

// -----------------------------------------------------------------------------
// Constants & small helpers
// -----------------------------------------------------------------------------
const SIMILARITY_BLOCK = 0.70 as const;
const CATEGORY_SELECTION_TIME_S = 30 as const;
const DEFAULT_ANSWER_TIME_S = 60 as const;
const DEFAULT_RESULTS_TIME_S = 90 as const;
const FIELD_TRAP_STATE = 'trapAnswerState';
const TIMEOUT_TOKEN = '__TIMEOUT__';

const nowMs = () => Date.now();
const tsFromNowS = (s: number) => Timestamp.fromMillis(nowMs() + s * 1000);
const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const ensure: (cond: any, msg: string) => asserts cond = (cond, msg) => { if (!cond) throw new Error(msg); };

const getActivePlayers = (game: Game): Player[] =>
  Array.isArray(game.players) ? game.players.filter((p) => p.status !== 'left') : [];

// -----------------------------------------------------------------------------
// Validation & normalization
// -----------------------------------------------------------------------------
function sanitizeSettings(input: any, fallbackCats: string[]) {
  const rounds = Number.isFinite(Number(input?.rounds)) && Number(input.rounds) >= 1 ? Number(input.rounds) : 10;
  const answerTime = Number.isFinite(Number(input?.answerTime)) && Number(input.answerTime) >= 10 ? Number(input.answerTime) : DEFAULT_ANSWER_TIME_S;
  const resultsTime = Number.isFinite(Number(input?.resultsTime)) && Number(input.resultsTime) >= 10 ? Number(input.resultsTime) : DEFAULT_RESULTS_TIME_S;
  const categories = Array.isArray(input?.categories) && input.categories.length > 0 ? input.categories.filter(Boolean) : fallbackCats;
  ensure(categories.length > 0, 'لا توجد أقسام صالحة.');
  return { rounds, answerTime, resultsTime, categories };
}

// -----------------------------------------------------------------------------
// Data access
// -----------------------------------------------------------------------------
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
  return { id: questionDoc.id, ...(data as any) } as TrapQuestion;
}

// -----------------------------------------------------------------------------
// Answer options builder
// -----------------------------------------------------------------------------
function buildShuffledAnswers(
  question: TrapQuestion,
  playerAnswers: Record<string, string | null>
): string[] {
  const allOptions = new Set<string>([question.answer]);
  
  // Add player traps, filtering those too similar to the correct answer.
  for (const answer of Object.values(playerAnswers)) {
    if (answer && answer.trim()) {
      if (safeCompareStrings(answer, question.answer) < SIMILARITY_BLOCK) {
        allOptions.add(answer.trim());
      }
    }
  }

  // Add dummy answers, also filtering those too similar to the correct one.
  const dummies = shuffle(Array.isArray(question.dummyAnswers) ? [...question.dummyAnswers] : []);
  for (const dummy of dummies) {
    if (allOptions.size >= 4) break;
    if (safeCompareStrings(dummy, question.answer) < SIMILARITY_BLOCK) {
      allOptions.add(dummy.trim());
    }
  }

  if (allOptions.size < 2) allOptions.add('— لا أعرف —');
  
  return shuffle(Array.from(allOptions));
}

// -----------------------------------------------------------------------------
// Trick stats merger
// -----------------------------------------------------------------------------
function mergeTrickStats(
  prev: Game['trapAnswerState']['trickStats'],
  next: Game['trapAnswerState']['trickStats']
) {
  const merged = {
    trickedBy: { ...(prev?.trickedBy || {}) },
    trickedOthers: { ...(prev?.trickedOthers || {}) },
  };

  Object.entries(next?.trickedBy || {}).forEach(([trickedId, trickerIds]) => {
    const set = new Set([...(merged.trickedBy[trickedId] || []), ...trickerIds]);
    merged.trickedBy[trickedId] = Array.from(set);
  });
  Object.entries(next?.trickedOthers || {}).forEach(([trickerId, trickedIds]) => {
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
  const catsRes = await getTrapAnswerCategories();
  const fallbackCats = catsRes.success ? (catsRes.categories || []) : [];
  const nextSettings = sanitizeSettings(settings, fallbackCats);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
    ensure(game.gameState === 'lobby', `الحالة الحالية لا تسمح بهذا الإجراء.`);
    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.settings`]: nextSettings });
  });
}

export async function startTrapAnswerGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  const categoriesResult = await getTrapAnswerCategories();
  ensure(categoriesResult.success && Array.isArray(categoriesResult.categories) && categoriesResult.categories.length > 0, 'لا يمكن بدء اللعبة، لم يتم العثور على أقسام أسئلة صالحة.');

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
    ensure(Array.isArray(game.players) && game.players.length >= 2, 'اللعبة تحتاج على الأقل لاعبين اثنين.');

    const turnOrder = shuffle(game.players.map(p => p.id));
    const fiveRandomCategories = shuffle([...categoriesResult.categories!]).slice(0, 5);
    const hydratedSettings = sanitizeSettings((game as any)[FIELD_TRAP_STATE]?.settings || {}, categoriesResult.categories!);
    const initialScores = game.players.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.id]: 0 }), {});
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
      [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt,
      [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
      [`${FIELD_TRAP_STATE}.afkStats`]: {},
       [`${FIELD_TRAP_STATE}.history`]: [], // Initialize history
    });
  });
}

// -----------------------------------------------------------------------------
// Core Flow
// -----------------------------------------------------------------------------
export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
  const gameRef = doc(db, 'games', gameId);
  let answerTime = DEFAULT_ANSWER_TIME_S;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    if (game.gameState !== 'category-selection') return;
    const state = (game as any)[FIELD_TRAP_STATE] || {};
    const turnOrder = state.turnOrder || [];
    const currentTurnPlayerId = turnOrder[state.currentTurnIndex || 0];
    ensure(currentTurnPlayerId === playerId, 'ليس دورك لاختيار القسم.');
    ensure(state.fiveRandomCategories?.includes(category), 'القسم المختار غير متاح.');
    answerTime = state.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
  });

  const randomQuestion = await fetchRandomQuestionByCategory(category);
  const endsAt = tsFromNowS(answerTime);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;
    if (game.gameState !== 'category-selection' || game.trapAnswerState?.currentQuestion) return;

    tx.update(gameRef, {
      gameState: 'answer-submission',
      [`${FIELD_TRAP_STATE}.currentQuestion`]: randomQuestion,
      [`${FIELD_TRAP_STATE}.selectedCategory`]: category,
      [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt,
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
      const finalAnswer = answer.trim() || null;
      
      const currentAnswers = { ...(state.playerAnswers || {}), [playerId]: finalAnswer };
      const activePlayers = getActivePlayers(game);
      const everyoneAnswered = activePlayers.every(p => hasOwn(currentAnswers, p.id));
      
      const updates: any = {
        [`${FIELD_TRAP_STATE}.playerAnswers`]: currentAnswers,
      };

      if (everyoneAnswered) {
        const { updates: phaseUpdates } = _getGuessingPhaseUpdates(game, currentAnswers);
        Object.assign(updates, phaseUpdates);
      }
      
      tx.update(gameRef, updates);
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'An unexpected error occurred.' };
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

    const currentGuesses = { ...(state.playerGuesses || {}), [playerId]: finalGuess };
    const active = getActivePlayers(game);
    const everyoneGuessed = active.every(p => hasOwn(currentGuesses, p.id));
    
    const updates: any = {
      [`${FIELD_TRAP_STATE}.playerGuesses`]: currentGuesses,
    };
    
    if(everyoneGuessed) {
        const { updates: phaseUpdates } = _getResultsPhaseUpdates(game, currentGuesses);
        Object.assign(updates, phaseUpdates);
    }
    
    tx.update(gameRef, updates);
  });
}

export async function nextTrapAnswerRound(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    let isGameOver = false;

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        ensure(snap.exists(), 'اللعبة غير موجودة.');
        const game = snap.data() as Game;
        ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
        if (game.gameState !== 'round-results') return;
        const result = await _startNextRound(tx, gameRef, game);
        isGameOver = result.isGameOver;
    });

    if (isGameOver) {
        const res = await distributeEndOfGameAwards(gameId);
        if (!res.success) {
            console.error(`Failed to distribute awards for game ${gameId}:`, res.error);
            await updateDoc(gameRef, { 'gameResult.error': res.error });
        }
    }
}

// -----------------------------------------------------------------------------
// Timeout & Reactions
// -----------------------------------------------------------------------------
export async function handleTimeout(gameId: string, callerId: string) {
  const gameRef = doc(db, 'games', gameId);
  let isGameOver = false;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;

    const game = snap.data() as Game;
    const state = (game as any)[FIELD_TRAP_STATE] || {};
    const timerEndsAt = state.roundEndTime as Timestamp | undefined;

    if (!timerEndsAt || timerEndsAt.toMillis() > nowMs()) return;

    // Caller doesn't have to be host, but we only run logic if timer is actually expired.

    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.roundEndTime`]: deleteField() });

    if (game.gameState === 'category-selection') {
      const categories: string[] = state.fiveRandomCategories || [];
      const randomCategory = categories.length > 0 ? categories[Math.floor(Math.random() * categories.length)] : '';
      const turnOrder = state.turnOrder || [];
      const currentPlayerId = turnOrder[state.currentTurnIndex || 0];
      await selectCategoryAndGetQuestion(gameId, currentPlayerId, randomCategory);
    } else if (game.gameState === 'answer-submission') {
      await _advanceToGuessing(tx, gameRef, game, true);
    } else if (game.gameState === 'guessing') {
      await _advanceToResults(tx, gameRef, game, true);
    } else if (game.gameState === 'round-results') {
      const result = await _startNextRound(tx, gameRef, game);
      isGameOver = result.isGameOver;
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

export async function sendReaction(gameId: string, playerId: string, emoji: EmojiReactionType) {
  await updateDoc(doc(db, 'games', gameId), {
    [`${FIELD_TRAP_STATE}.reactions.${playerId}`]: { emoji, timestamp: Timestamp.now() },
  });
}

export async function setAwayStatus(gameId: string, playerId: string, isAway: boolean) {
  await updateDoc(doc(db, 'games', gameId), {
    [`${FIELD_TRAP_STATE}.awayPlayerIds`]: isAway ? arrayUnion(playerId) : arrayRemove(playerId),
  });
}

// -----------------------------------------------------------------------------
// Internal Phase Transitions (Refactored)
// -----------------------------------------------------------------------------
function _getGuessingPhaseUpdates(game: Game, playerAnswers: Record<string, string | null>) {
  const state = (game as any)[FIELD_TRAP_STATE] || {};
  const guessingTime = state.settings?.guessingTime ?? DEFAULT_ANSWER_TIME_S;
  const endsAt = tsFromNowS(guessingTime);
  ensure(state.currentQuestion, 'Question data missing.');

  return {
    updates: {
      gameState: 'guessing',
      [`${FIELD_TRAP_STATE}.playerAnswers`]: playerAnswers,
      [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt,
      [`${FIELD_TRAP_STATE}.shuffledAnswers`]: buildShuffledAnswers(state.currentQuestion, playerAnswers),
    },
  };
}

function _getResultsPhaseUpdates(game: Game, playerGuesses: Record<string, string | null>) {
  const state = (game as any)[FIELD_TRAP_STATE] || {};
  const { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds } = calculateTrapAnswerScores(
    getActivePlayers(game),
    state.currentQuestion,
    state.playerAnswers,
    playerGuesses,
    state.awayPlayerIdsInAnsweringPhase || [],
    state.shuffledAnswers || []
  );

  const finalScores: Record<string, number> = { ...(game.playerScores || {}) };
  Object.entries(roundScores).forEach(([pid, data]) => {
    if ((data as any)?.points) finalScores[pid] = (finalScores[pid] || 0) + (data as any).points;
  });

  const resultsTime = state.settings?.resultsTime ?? DEFAULT_RESULTS_TIME_S;
  const endsAt = tsFromNowS(resultsTime);
  
  const currentHistory = state.history || [];
  const newHistoryEntry = { 
      round: game.round || 1, 
      results: { scores: roundScores, answers: resultsByAnswer, timedOutGuesserIds },
      awayPlayerIdsDuringRound: state.awayPlayerIds || [],
  };

  return {
    updates: {
      gameState: 'round-results',
      playerScores: finalScores,
      [`${FIELD_TRAP_STATE}.lastRoundResults`]: { scores: roundScores, answers: resultsByAnswer, timedOutGuesserIds, awayPlayerIdsDuringRound: state.awayPlayerIds },
      [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt,
      [`${FIELD_TRAP_STATE}.trickStats`]: mergeTrickStats(state.trickStats, newTrickStats),
      [`${FIELD_TRAP_STATE}.history`]: [...currentHistory, newHistoryEntry],
    },
  };
}


async function _advanceToGuessing(tx: any, gameRef: any, game: Game, isTimeout = false) {
  const state = (game as any)[FIELD_TRAP_STATE] || {};
  const playerAnswers = { ...(state.playerAnswers || {}) };
  if (isTimeout) {
    getActivePlayers(game).forEach(p => { if (!hasOwn(playerAnswers, p.id)) playerAnswers[p.id] = null; });
  }
  const { updates } = _getGuessingPhaseUpdates(game, playerAnswers);
  tx.update(gameRef, updates);
}

async function _advanceToResults(tx: any, gameRef: any, game: Game, isTimeout = false) {
  const state = (game as any)[FIELD_TRAP_STATE] || {};
  const playerGuesses = { ...(state.playerGuesses || {}) };
  if (isTimeout) {
    getActivePlayers(game).forEach(p => { if (!hasOwn(playerGuesses, p.id)) playerGuesses[p.id] = TIMEOUT_TOKEN; });
  }
  const { updates } = _getResultsPhaseUpdates(game, playerGuesses);
  tx.update(gameRef, updates);
}

async function _startNextRound(tx: any, gameRef: any, game: Game): Promise<{ isGameOver: boolean }> {
  const state = (game as any)[FIELD_TRAP_STATE] || {};
  const currentRound = game.round || 0;
  const totalRounds = state.settings?.rounds || 10;

  if (currentRound >= totalRounds) {
    const winnerId = Object.keys(game.playerScores || {}).reduce((a, b) => ((game.playerScores?.[a] || 0) > (game.playerScores?.[b] || 0) ? a : b), '');
    tx.update(gameRef, {
      gameState: 'final_results',
      [`${FIELD_TRAP_STATE}.roundEndTime`]: deleteField(),
      gameResult: { winner: winnerId, message: 'انتهت اللعبة!' }
    });
    return { isGameOver: true };
  }

  const nextTurnIndex = ((state.currentTurnIndex || 0) + 1) % game.players.length;
  const availableCategories = state.settings?.categories || [];
  const fiveRandomCategories = shuffle([...availableCategories]).slice(0, 5);
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
    [`${FIELD_TRAP_STATE}.roundEndTime`]: endsAt,
    [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
    [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
  });

  return { isGameOver: false };
}
