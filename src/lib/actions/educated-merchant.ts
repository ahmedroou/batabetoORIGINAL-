// .
'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  collection,
  getDocs,
  query,
  arrayUnion,
  increment,
  deleteField,
  where,
  limit,
  getDoc,
  type Transaction,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase/firestore';
import type {
  Game,
  Player,
  Property,
  EducatedMerchantQuestion,
  UserProfile,
} from '@/types';
import { shuffle } from './helpers';
import { updateLeagueScoresForGameEnd } from './user';
import { PROPERTY_NAMES } from '@/data/properties';

/**
 * تحسينات عامة:
 * - دقّة الحسابات داخل الـ transactions.
 * - رد المال ربع السعر فقط عند فشل الإجابة.
 * - خصم السعر فور بدء محاولة الشراء (مطلوب بحسب مواصفاتك).
 * - وظيفة لمعالجة انتهاء الوقت (resolveExpiredQuestion) يمكن تشغيلها من Cloud Function أو من العميل.
 */

/* ===== CONFIG ===== */
const BOARD_SIZE = 28;
const STARTING_BALANCE = 1000;
const BASE_PROPERTY_PRICE = 100;
const MAX_PROPERTY_PRICE = 500;
const PRICE_INCREMENT = 50; // divisible-friendly
const PASS_START_BONUS = 150;
const QUESTION_TIME_SECONDS = 25;

/* ===== Helpers ===== */

async function getAvailableCategories(): Promise<string[]> {
  const settingsDocRef = doc(db, 'game_settings', 'educated_merchant_categories');
  const settingsSnap = await getDoc(settingsDocRef);
  if (settingsSnap.exists()) {
    const data = settingsSnap.data() as any;
    if (Array.isArray(data.list) && data.list.length > 0) return data.list;
  }
  return ["علوم", "رياضيات", "برمجة", "أحياء", "كيمياء"];
}

/**
 * Fetch questions with an attempt to be random and limited.
 * Falls back to a simple limited query if randomKey query returns nothing.
 */
async function fetchQuestionsForBoard(categories: string[]): Promise<Map<string, EducatedMerchantQuestion[]>> {
  const questionsByCat = new Map<string, EducatedMerchantQuestion[]>();
  const questionsCol = collection(db, 'trap_answer_questions');

  for (const category of categories) {
    // try randomKey approach first (docs must have randomKey number 0..1 for best results)
    let querySnapshot = null;
    try {
      const randomKey = Math.random();
      const q = query(questionsCol, where('category', '==', category), where('randomKey', '>=', randomKey), limit(25));
      querySnapshot = await getDocs(q);
    } catch (err) {
      querySnapshot = null;
    }

    // fallback if no docs found
    if (!querySnapshot || querySnapshot.empty) {
      const q2 = query(questionsCol, where('category', '==', category), limit(25));
      const snap2 = await getDocs(q2);
      querySnapshot = snap2;
    }

    const questions = querySnapshot.docs.map(d => {
      const data: any = d.data();
      const correctAnswer = data.answer as string;
      const dummyAnswers = Array.isArray(data.dummyAnswers) && data.dummyAnswers.length > 0
        ? data.dummyAnswers
        : ['بديل ١', 'بديل ٢', 'بديل ٣'];
      const chosenDummies = shuffle(dummyAnswers).slice(0, 3);
      const options = shuffle([correctAnswer, ...chosenDummies]);
      return {
        id: d.id,
        question: data.question,
        options,
        correctAnswer,
        category: data.category,
      } as EducatedMerchantQuestion;
    });

    questionsByCat.set(category, shuffle(questions));
  }

  return questionsByCat;
}

/* Create board deterministically but shuffled names & prices */
function generateBoard(categories: string[]): Property[] {
  const board: Property[] = [];
  if (categories.length === 0) return board;

  const shuffledPropertyNames = shuffle([...PROPERTY_NAMES]);
  const priceCount = Math.floor((MAX_PROPERTY_PRICE - BASE_PROPERTY_PRICE) / PRICE_INCREMENT) + 1;
  const propertyPrices = Array.from({ length: priceCount }, (_, i) => BASE_PROPERTY_PRICE + i * PRICE_INCREMENT);
  const shuffledPrices = shuffle(propertyPrices);

  for (let i = 0; i < BOARD_SIZE; i++) {
    const name = shuffledPropertyNames[i % shuffledPropertyNames.length] || `عقار ${i}`;
    if (i === 0) {
      board.push({ id: i, type: 'start', name: 'نقطة البداية', category: 'special', price: 0, rent: 0, ownerId: null });
    } else if (i === 7 || i === 21) {
      const fineAmount = i === 7 ? 50 : 100;
      board.push({ id: i, type: 'fine', name: 'غرامة', category: 'special', price: 0, rent: 0, ownerId: null, fineAmount });
    } else {
      const category = categories[i % categories.length] || 'عام';
      const price = shuffledPrices[i % shuffledPrices.length] || BASE_PROPERTY_PRICE;
      board.push({ id: i, type: 'property', name, category, price, rent: Math.floor(price * 0.25), ownerId: null });
    }
  }
  return board;
}

/* Get a question from the questionsByCategory pool (map-of-arrays). If not available, try refetch. */
async function getNextQuestionFromPool(category: string, questionsPool: Map<string, EducatedMerchantQuestion[]>): Promise<EducatedMerchantQuestion | null> {
  const arr = questionsPool.get(category);
  if (!arr || arr.length === 0) {
    const fresh = await fetchQuestionsForBoard([category]);
    const newArr = fresh.get(category);
    if (!newArr || newArr.length === 0) return null;
    questionsPool.set(category, newArr);
    return newArr.pop() || null;
  }
  return arr.pop() || null;
}

/* Clear all properties owned by a bankrupt player (set ownerId = null) */
function clearPlayerPropertiesFromBoard(board: Property[], playerId: string) {
  return board.map(p => (p.ownerId === playerId ? { ...p, ownerId: null } : p));
}

/* ===== API / Actions ===== */

export async function updateEducatedMerchantSettings(gameId: string, hostId: string, settings: Game['educatedMerchantState']['settings']) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;

    if (game.hostId !== hostId) throw new Error('فقط المضيف يمكنه تعديل الإعدادات.');
    if (game.gameState !== 'lobby') throw new Error('يمكن تغيير الإعدادات فقط أثناء اللايبي.');

    transaction.update(gameRef, { 'educatedMerchantState.settings': settings });
  });
}

/* Start the game: build board, questions pool, turn order, balances */
export async function startGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (transaction) => {
    const gameSnap = await transaction.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const game = gameSnap.data() as Game;

    if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
    if (game.gameState !== 'lobby') throw new Error('Game is not in lobby.');
    if (!Array.isArray(game.players) || game.players.length < 2) throw new Error('يتطلب اللعبة لاعبين اثنين على الأقل.');

    const availableCategories = await getAvailableCategories();
    if (availableCategories.length === 0) throw new Error('لا توجد فئات أسئلة. أضفها من لوحة الأدمن.');

    const questionsPool = await fetchQuestionsForBoard(availableCategories);
    const board = generateBoard(availableCategories);

    const turnOrder = shuffle(game.players.map(p => p.id));
    const initialBalances = game.players.reduce((acc: Record<string, number>, p) => { acc[p.id] = STARTING_BALANCE; return acc; }, {});

    const playerColors = ['#3B82F6', '#A855F7', '#F97316', '#10B981', '#EF4444', '#6366F1'];
    const updatedPlayers = game.players.map((p, idx) => ({ ...p, position: 0, bankruptAt: null, status: 'alive', color: playerColors[idx % playerColors.length] }));

    // questionsByCategory needs to be plain object to store in Firestore
    const questionsObj: Record<string, EducatedMerchantQuestion[]> = {};
    for (const [k, v] of questionsPool.entries()) questionsObj[k] = v;

    transaction.update(gameRef, {
      gameState: 'rolling',
      round: 1,
      playerScores: initialBalances,
      players: updatedPlayers,
      'educatedMerchantState.board': board,
      'educatedMerchantState.questionsByCategory': questionsObj,
      'educatedMerchantState.turnOrder': turnOrder,
      'educatedMerchantState.currentTurnIndex': 0,
      'educatedMerchantState.activityLog': arrayUnion('بدأت اللعبة!'),
    });
  });
}

/**
 * rollDice: يُستدعى عندما يضغط اللاعب زر الرمي.
 * - يتحقق من الأذونات ويدخل نتيجة النرد في الـ transaction.
 * - يقوم بمعالجة الحركة ضمن نفس الـ transaction (handlePropertyAction).
 */
export async function rollDice(gameId: string, playerId: string): Promise<{ success: boolean; diceResult?: number; error?: string }> {
  const gameRef = doc(db, 'games', gameId);
  try {
    let diceResult = 0;
    await runTransaction(db, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists()) throw new Error('Game not found.');
      const game = gameSnap.data() as Game;
      const es = game.educatedMerchantState;
      if (!es) throw new Error('Game state invalid.');

      if (game.gameState !== 'rolling' || es.turnOrder[es.currentTurnIndex] !== playerId) {
        throw new Error('ليس دورك لرمي النرد.');
      }

      // 1..5
      diceResult = Math.floor(Math.random() * 6) + 1;

      const playerIdx = game.players.findIndex(p => p.id === playerId);
      if (playerIdx === -1) throw new Error('Player not found.');

      const newActivity = [...(es.activityLog || []), `${game.players[playerIdx].name} رمى النرد وحصل على ${diceResult}.`];

      // write dice and move to movement state, then handle movement in same transaction
      transaction.update(gameRef, {
        gameState: 'movement',
        'educatedMerchantState.lastDiceRoll': diceResult,
        'educatedMerchantState.activityLog': newActivity,
      });

      // Build an updatedGame snapshot to pass into handler (so handler uses same in-memory data)
      const updatedGame = { ...game, educatedMerchantState: { ...es, lastDiceRoll: diceResult, activityLog: newActivity } } as Game;

      // process movement / rent / fines / pending property_action within same transaction
      await handlePropertyAction(gameRef, updatedGame, transaction);
    });

    return { success: true, diceResult };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * handlePropertyAction:
 * - expects the `game` object to be the data snapshot read inside the same transaction.
 * - updates player positions, applies pass-start bonus, fines, rent, or moves to property_action if tile is unowned.
 */
export async function handlePropertyAction(gameRef: DocumentReference, game: Game, transaction: Transaction) {
  const es = game.educatedMerchantState;
  if (!es) throw new Error('Game state not initialized.');

  const activePlayerId = es.turnOrder[es.currentTurnIndex];
  const playerIndex = game.players.findIndex(p => p.id === activePlayerId);
  if (playerIndex === -1) throw new Error('Player not found in game.');

  const player = { ...game.players[playerIndex] } as Player;
  let updatedPlayers = [...game.players];
  let updatedBalances = { ...(game.playerScores || {}) };
  let newActivityLog = [...(es.activityLog || [])];

  const dice = es.lastDiceRoll || 0;
  const oldPos = Number(player.position || 0);
  const newPos = (oldPos + dice) % BOARD_SIZE;
  const passedStart = (oldPos + dice) >= BOARD_SIZE;

  updatedPlayers[playerIndex] = { ...player, position: newPos };

  if (passedStart) {
    updatedBalances[activePlayerId] = (updatedBalances[activePlayerId] || 0) + PASS_START_BONUS;
    newActivityLog.push(`${player.name} مر بنقطة البداية وحصل على ${PASS_START_BONUS} د.ع.`);
  }

  const board: Property[] = es.board || [];
  const landed = board.find(b => Number(b.id) === newPos);
  if (!landed) throw new Error('Property not found on board.');

  // default next state
  let nextState = 'rolling';

  if (landed.type === 'fine') {
    const fine = landed.fineAmount || 0;
    newActivityLog.push(`${player.name} دفع غرامة بقيمة ${fine} د.ع.`);
    if ((updatedBalances[activePlayerId] || 0) < fine) {
      // cannot pay -> bankrupt
      updatedPlayers[playerIndex].status = 'bankrupt';
      updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
      newActivityLog.push(`${player.name} أفلس!`);
      // clear his properties
      const clearedBoard = clearPlayerPropertiesFromBoard(board, activePlayerId);
      updatedBalances[activePlayerId] = 0;
      transaction.update(gameRef, {
        players: updatedPlayers,
        playerScores: updatedBalances,
        'educatedMerchantState.board': clearedBoard,
        'educatedMerchantState.activityLog': newActivityLog,
      });
      // end turn (within same transaction)
      await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog, board: clearedBoard } }, activePlayerId, transaction);
      return;
    } else {
      updatedBalances[activePlayerId] -= fine;
      transaction.update(gameRef, { players: updatedPlayers, playerScores: updatedBalances, 'educatedMerchantState.activityLog': newActivityLog });
      await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, activePlayerId, transaction);
      return;
    }
  }

  if (landed.type === 'property') {
    if (landed.ownerId && landed.ownerId !== activePlayerId) {
      const rent = landed.rent || 0;
      const owner = game.players.find(p => p.id === landed.ownerId);
      newActivityLog.push(`${player.name} دفع إيجارًا بقيمة ${rent} د.ع إلى ${owner?.name || 'المالك'}.`);
      if ((updatedBalances[activePlayerId] || 0) < rent) {
        // pay what remains to owner, mark bankrupt
        const remaining = updatedBalances[activePlayerId] || 0;
        updatedBalances[landed.ownerId] = (updatedBalances[landed.ownerId] || 0) + remaining;
        updatedBalances[activePlayerId] = 0;
        updatedPlayers[playerIndex].status = 'bankrupt';
        updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
        newActivityLog.push(`${player.name} أفلس!`);

        const clearedBoard = clearPlayerPropertiesFromBoard(board, activePlayerId);
        transaction.update(gameRef, {
          players: updatedPlayers,
          playerScores: updatedBalances,
          'educatedMerchantState.board': clearedBoard,
          'educatedMerchantState.activityLog': newActivityLog,
        });

        await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog, board: clearedBoard } }, activePlayerId, transaction);
        return;
      } else {
        updatedBalances[activePlayerId] -= rent;
        updatedBalances[landed.ownerId] = (updatedBalances[landed.ownerId] || 0) + rent;
        transaction.update(gameRef, { players: updatedPlayers, playerScores: updatedBalances, 'educatedMerchantState.activityLog': newActivityLog });
        await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, activePlayerId, transaction);
        return;
      }
    } else if (!landed.ownerId) {
      // Unowned property -> show buy/skip option
      newActivityLog.push(`${player.name} توقف على ${landed.name}.`);
      transaction.update(gameRef, { gameState: 'property_action', players: updatedPlayers, playerScores: updatedBalances, 'educatedMerchantState.activityLog': newActivityLog });
      return;
    }
  }

  // default -> nobody to pay, just continue to next turn
  transaction.update(gameRef, { players: updatedPlayers, playerScores: updatedBalances, 'educatedMerchantState.activityLog': newActivityLog });
  await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, activePlayerId, transaction);
}

/**
 * Attempt to start a purchase:
 * - immediately deducts the property.price from player's balance (atomic).
 * - picks a question and sets 'question' state + timer + pendingPurchase.
 */
export async function buyPropertyAttempt(gameId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(gameRef);
      if (!snap.exists()) throw new Error('Game not found.');
      const game = snap.data() as Game;
      const es = game.educatedMerchantState;
      if (!es) throw new Error('Game state invalid.');

      const player = game.players.find(p => p.id === playerId);
      if (!player) throw new Error('Player not found.');

      const property = (es.board || []).find((b: Property) => Number(b.id) === Number(player.position));
      if (!property || property.type !== 'property') throw new Error('This property cannot be bought.');
      if (property.ownerId) throw new Error('This property already has an owner.');

      const playerBalance = (game.playerScores?.[playerId] || 0);
      if (playerBalance < property.price) throw new Error('رصيدك غير كافٍ لشراء هذا العقار.');

      // Prepare questions pool map from saved object
      const questionsObj = es.questionsByCategory || {};
      const pool = new Map<string, EducatedMerchantQuestion[]>();
      for (const k of Object.keys(questionsObj)) pool.set(k, [...questionsObj[k]]);

      const randomQuestion = await getNextQuestionFromPool(property.category, pool);
      if (!randomQuestion) throw new Error(`لا توجد أسئلة كافية في فئة "${property.category}".`);

      // Deduct price immediately (player pays upfront)
      const updates: any = {};
      updates[`playerScores.${playerId}`] = increment(-property.price);
      updates['gameState'] = 'question';
      updates['educatedMerchantState.currentQuestion'] = randomQuestion;
      updates['educatedMerchantState.timerEndsAt'] = Timestamp.fromMillis(Date.now() + QUESTION_TIME_SECONDS * 1000);
      updates['educatedMerchantState.pendingPurchase'] = { playerId, propertyId: property.id, price: property.price, questionId: randomQuestion.id };
      updates['educatedMerchantState.activityLog'] = arrayUnion(`${player.name} قرّر شراء ${property.name} — السؤال الآن.`);

      // Also persist the reduced question pool (object)
      // convert Map -> plain object
      const newQuestionsObj: Record<string, EducatedMerchantQuestion[]> = {};
      for (const [k, v] of pool.entries()) newQuestionsObj[k] = v;
      updates['educatedMerchantState.questionsByCategory'] = newQuestionsObj;

      transaction.update(gameRef, updates);
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * answerQuestion:
 * - Assumes the price already deducted at buyPropertyAttempt.
 * - If correct -> set owner.
 * - If incorrect -> refund 25% of price.
 */
export async function answerQuestion(gameId: string, playerId: string, answer: string | null): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(gameRef);
      if (!snap.exists()) throw new Error('Game not found.');
      const game = snap.data() as Game;
      const es = game.educatedMerchantState;
      if (!es) throw new Error('Game state invalid.');

      const question = es.currentQuestion as EducatedMerchantQuestion | undefined;
      if (!question) throw new Error('لا يوجد سؤال نشط.');

      const pending = es.pendingPurchase as { playerId: string; propertyId: number; price: number } | undefined;
      if (!pending || pending.playerId !== playerId) throw new Error('لا توجد محاولة شراء معلّقة لك.');

      const propIdx = (es.board || []).findIndex((b: Property) => Number(b.id) === Number(pending.propertyId));
      if (propIdx === -1) throw new Error('العقار غير موجود.');

      const boardCopy = [...(es.board || [])];
      const activityLog = [...(es.activityLog || [])];
      let playerScoresCopy = { ...(game.playerScores || {}) };

      const isCorrect = (answer === question.correctAnswer);

      if (isCorrect) {
        // Player already paid upfront → just set owner
        boardCopy[propIdx] = { ...boardCopy[propIdx], ownerId: playerId };
        activityLog.push(`${game.players.find(p => p.id === playerId)?.name || 'لاعب'} أجاب بشكل صحيح وامتلك ${boardCopy[propIdx].name}.`);
      } else {
        // Refund 25% of the price
        const refund = Math.floor(pending.price / 4);
        playerScoresCopy[playerId] = (playerScoresCopy[playerId] || 0) + refund;
        activityLog.push(`${game.players.find(p => p.id === playerId)?.name || 'لاعب'} أجاب بشكل خاطئ، استرد ${refund} د.ع.`);
      }

      const updates: any = {
        'educatedMerchantState.currentQuestion': deleteField(),
        'educatedMerchantState.timerEndsAt': deleteField(),
        'educatedMerchantState.pendingPurchase': deleteField(),
        'educatedMerchantState.board': boardCopy,
        'educatedMerchantState.activityLog': activityLog,
        playerScores: playerScoresCopy,
      };

      transaction.update(gameRef, updates);

      // Move to next turn
      await endTurn(gameRef, { ...game, educatedMerchantState: { ...es, activityLog, board: boardCopy }, playerScores: playerScoresCopy }, playerId, transaction);
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * resolveExpiredQuestion:
 * - يجب استدعاؤها دوريًا (Cloud Function أو client-side polling) لمعالجة الانتهاء من الوقت.
 * - تعامل كأن الإجابة خاطئة وتعيد 25% من السعر.
 */
export async function resolveExpiredQuestion(gameId: string): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(gameRef);
      if (!snap.exists()) throw new Error('Game not found.');
      const game = snap.data() as Game;
      const es = game.educatedMerchantState;
      if (!es) throw new Error('Game state invalid.');

      if (game.gameState !== 'question' || !es.timerEndsAt) {
        return; // nothing to do
      }

      const endsAt = (es.timerEndsAt as Timestamp).toMillis ? (es.timerEndsAt as Timestamp).toMillis() : new Date(es.timerEndsAt as any).getTime();
      if (Date.now() < endsAt) return; // not yet expired

      const pending = es.pendingPurchase as { playerId: string; propertyId: number; price: number } | undefined;
      if (!pending) {
        // cleanup
        transaction.update(gameRef, { 'educatedMerchantState.currentQuestion': deleteField(), 'educatedMerchantState.timerEndsAt': deleteField(), 'educatedMerchantState.pendingPurchase': deleteField() });
        return;
      }

      const boardCopy = [...(es.board || [])];
      const activityLog = [...(es.activityLog || [])];
      let playerScoresCopy = { ...(game.playerScores || {}) };

      const refund = Math.floor(pending.price / 4);
      playerScoresCopy[pending.playerId] = (playerScoresCopy[pending.playerId] || 0) + refund;
      activityLog.push(`${game.players.find(p => p.id === pending.playerId)?.name || 'لاعب'} لم يجيب في الوقت، استرد ${refund} د.ع.`);

      transaction.update(gameRef, {
        'educatedMerchantState.currentQuestion': deleteField(),
        'educatedMerchantState.timerEndsAt': deleteField(),
        'educatedMerchantState.pendingPurchase': deleteField(),
        'educatedMerchantState.activityLog': activityLog,
        playerScores: playerScoresCopy,
      });

      // advance turn
      await endTurn(gameRef, { ...game, educatedMerchantState: { ...es, activityLog, board: boardCopy }, playerScores: playerScoresCopy }, pending.playerId, transaction);
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * endTurn:
 * - advances currentTurnIndex skipping bankrupt players.
 * - increments round when wrap-around occurs.
 * - decides final results when only one player non-bankrupt or maxRounds reached.
 *
 * NOTE: If transaction is passed, endTurn runs inside it; otherwise it opens its own runTransaction.
 */
export async function endTurn(gameRef: DocumentReference | string, game?: Game, playerId?: string, transaction?: Transaction) {
  let finalGameRef = typeof gameRef === 'string' ? doc(db, 'games', gameRef) : gameRef;

  const executeEndTurn = async (trans: Transaction) => {
    const gameSnap = game ? null : await trans.get(finalGameRef);
    const currentGame = game || (gameSnap?.data() as Game);
    if (!currentGame) throw new Error('Game data missing.');

    const es = currentGame.educatedMerchantState;
    if (!es) throw new Error('Game state not initialized.');

    const alivePlayers = currentGame.players.filter(p => p.status !== 'bankrupt');
    if (alivePlayers.length <= 1) {
      const winner = alivePlayers[0];
      trans.update(finalGameRef, {
        gameState: 'final_results',
        gameResult: { winner: winner?.id || 'game_over', message: 'انتهت اللعبة بإفلاس المنافسين!' },
        'educatedMerchantState.lastDiceRoll': deleteField(),
      });
      // update league (async outside transaction)
      try { await updateLeagueScoresForGameEnd({ ...currentGame, gameState: 'final_results' }); } catch (_) { /* ignore */ }
      return;
    }

    // compute next index skipping bankrupts
    const turnOrder = es.turnOrder || [];
    if (!turnOrder || turnOrder.length === 0) throw new Error('Turn order missing.');

    let nextIndex = (es.currentTurnIndex + 1) % turnOrder.length;
    let guard = 0;
    while (currentGame.players.find(p => p.id === turnOrder[nextIndex])?.status === 'bankrupt' && guard < turnOrder.length * 2) {
      nextIndex = (nextIndex + 1) % turnOrder.length;
      guard++;
    }

    let newRound = currentGame.round || 1;
    if (nextIndex <= (es.currentTurnIndex)) { // wrapped
      newRound = (currentGame.round || 1) + 1;
    }

    const maxRounds = es.settings?.maxRounds || 20;
    if (newRound > maxRounds) {
      // end by rounds -> winner is richest
      const finalWinner = currentGame.players.filter(p => p.status !== 'bankrupt').sort((a, b) => (currentGame.playerScores?.[b.id] || 0) - (currentGame.playerScores?.[a.id] || 0))[0];
      trans.update(finalGameRef, {
        gameState: 'final_results',
        gameResult: { winner: finalWinner?.id || 'game_over', message: 'انتهت الجولات!' },
        'educatedMerchantState.lastDiceRoll': deleteField(),
      });
      try { await updateLeagueScoresForGameEnd({ ...currentGame, gameState: 'final_results' }); } catch (_) { /* ignore */ }
      return;
    }

    trans.update(finalGameRef, {
      gameState: 'rolling',
      round: newRound,
      'educatedMerchantState.currentTurnIndex': nextIndex,
      'educatedMerchantState.lastDiceRoll': deleteField(),
    });
  };

  if (transaction) {
    await executeEndTurn(transaction);
  } else {
    await runTransaction(db, executeEndTurn);
  }
}
