

'use server';

// تمت إعادة كتابة الملف بمنهجية آمنة للمعاملات، مع توحيد بروتوكول الحركة،
// إصلاح مسارات timeout، إضافة آلية خلفية آمنة لتجاوز التوقف (safety-net)،
// إزالة النسخ العميق غير الآمن، وتقليل سباقات الحالة.

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
  limit,
} from 'firebase/firestore';
import type { Game, Player, Property, EducatedMerchantQuestion } from '@/types';
import { shuffle } from './helpers';
import { PROPERTY_NAMES } from '@/data/properties';
import { getEducatedMerchantCategories } from './admin';
import { updateLeagueScoresForGameEnd } from './user';
import { randomInt } from 'crypto';

// -----------------------------
// Tunables & constants
// -----------------------------
const BOARD_SIZE = 28;
const START_MONEY = 1000;
const PASS_GO_REWARD = 200;
const ACTION_TIME_SECONDS = 35;
const QUESTION_TIME_SECONDS = 20;
const MAX_FINES = 3;
const DEFAULT_FINE = 100;
const DEFAULT_MAX_ROUNDS = 20;
const COLORS = ['#F44336', '#2196F3', '#4CAF50', '#FFC107', '#9C27B0', '#009688', '#E91E63', '#607D8B'];
const DICE_MIN = 1;
const DICE_MAX = 6; 

// -----------------------------
// Helpers
// -----------------------------
function nowTimestamp(): Timestamp {
  return Timestamp.now();
}

function addActionTimer(seconds = ACTION_TIME_SECONDS): Timestamp {
  return Timestamp.fromMillis(Date.now() + seconds * 1000);
}

function randomDiceRoll(diceMax?: number): number {
  const max = Math.max(DICE_MIN, diceMax ?? DICE_MAX);
  // عشوائية آمنة على الخادم
  return randomInt(DICE_MIN, max + 1);
}

function getPlayerIndexById(players: Player[], playerId: string): number {
  return players.findIndex((p) => p.id === playerId);
}

function ensure<T>(val: T | undefined | null, message = 'قيمة غير متوقعة مفقودة'): T {
  if (val === undefined || val === null) throw new Error(message);
  return val;
}

function findNextAliveIndex(turnOrder: string[], players: Player[], startIndex: number): number {
  if (!turnOrder || turnOrder.length === 0) return -1;
  let idx = (startIndex + 1) % turnOrder.length;
  let attempts = 0;
  while (attempts < turnOrder.length) {
    const pid = turnOrder[idx];
    const p = players.find((x) => x.id === pid);
    if (p && p.status === 'alive') return idx;
    idx = (idx + 1) % turnOrder.length;
    attempts++;
  }
  return -1;
}

function clonePlayers(players: Player[]): Player[] {
  return players.map((p) => ({ ...p }));
}

function cloneBoard(board: Property[]): Property[] {
  return board.map((b) => ({ ...b }));
}

function newQuestionToken(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function fetchRandomQuestion(category: string): Promise<EducatedMerchantQuestion | null> {
  try {
      const questionsCol = collection(db, 'educated_merchant_questions');
      const randomKey = Math.random();
      let q = query(questionsCol, where('category', '==', category), where('randomKey', '>=', randomKey), limit(1));
      let qs = await getDocs(q);
      if (qs.empty) {
        q = query(questionsCol, where('category', '==', category), where('randomKey', '<', randomKey), limit(1));
        qs = await getDocs(q);
      }
      if (qs.empty) {
          console.warn(`No questions found for category: "${category}". Returning null.`);
          return null;
      }
      const questionDoc = qs.docs[0];
      const questionData = { id: questionDoc.id, ...questionDoc.data() } as EducatedMerchantQuestion;
      const options = shuffle([...(questionData.dummyAnswers || []), questionData.answer]);
      questionData.options = options;
      return questionData;
  } catch(e) {
      console.error(`Error fetching random question for category "${category}":`, e);
      return null;
  }
}

// -----------------------------
// Safety-net: process an expired timer inside the same transaction
// This allows ANY transaction (player action or admin call) to advance a stuck turn
// without needing an external scheduler. The function is idempotent and returns
// meta-information for post-transaction handling (e.g., fetching a question).
// -----------------------------
async function applyTimeoutIfNeeded(tx: any, gameRef: any, game: Game): Promise<{
  applied: boolean;
  needFineQuestion?: { category: string; token: string } | null;
  finalGameDataForLeagueUpdate?: Game | null;
  gameEnded?: boolean;
}> {
  const timerEndsAt = game.educatedMerchantState?.timerEndsAt;
  if (!timerEndsAt) return { applied: false };
  if (Date.now() < timerEndsAt.toMillis()) return { applied: false };

  // timer expired -> we must advance the current player's turn automatically
  const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
  const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
  const currentPlayerId = turnOrder[currentTurnIndex];

  const players = clonePlayers(game.players);
  const board = cloneBoard(ensure(game.educatedMerchantState?.board, 'اللوح مفقود.'));
  const currentPlayerIndex = getPlayerIndexById(players, currentPlayerId);
  const currentPlayer = players[currentPlayerIndex];

  let activityMessage = `انتهى وقت اللاعب ${currentPlayer?.name} وتخطى دوره.`;
  const logEvents: Array<{ message: string; timestamp: Timestamp }> = [];
  logEvents.push({ message: activityMessage, timestamp: nowTimestamp() });

  let updates: any = {};
  let needFineQuestion: { category: string; token: string } | null = null;
  let finalGameDataForLeagueUpdate: Game | null = null;
  let gameEnded = false;

  const state = game.gameState;

  if (state === 'rolling') {
    // do an automatic roll
    const diceMax = game.educatedMerchantState?.settings?.diceMax ?? DICE_MAX;
    const diceRollResult = randomDiceRoll(diceMax);

    const oldPosition = currentPlayer.position;
    const newPosition = (oldPosition + diceRollResult) % BOARD_SIZE;
    currentPlayer.position = newPosition;

    const landingProperty = ensure(board[newPosition], 'خانة غير موجودة على اللوح');
    logEvents.push({ message: `${currentPlayer?.name} (انتهى وقته) تحرك تلقائيًا ${diceRollResult} إلى "${landingProperty.name}".`, timestamp: nowTimestamp() });

    if (newPosition < oldPosition) {
      currentPlayer.money = (currentPlayer.money || 0) + PASS_GO_REWARD;
      logEvents.push({ message: `${currentPlayer?.name} مر بنقطة البداية، وحصل على ${PASS_GO_REWARD} دينار.`, timestamp: nowTimestamp() });
    }

    updates['players'] = players;
    updates['educatedMerchantState.lastDiceRoll'] = diceRollResult;
    // include animation nonce so clients can correlate the roll even if it's automatic
    updates['educatedMerchantState.displayingRollResult'] = { number: diceRollResult, nonce: Date.now() };
    updates['educatedMerchantState.rollAnimationNonce'] = Date.now();

    if (landingProperty.type === 'property' && landingProperty.ownerId && landingProperty.ownerId !== currentPlayerId) {
      const ownerIndex = getPlayerIndexById(players, landingProperty.ownerId);
      const rent = landingProperty.rent || 0;
      if ((currentPlayer.money || 0) < rent) {
        const payAll = currentPlayer.money || 0;
        players[ownerIndex].money = (players[ownerIndex].money || 0) + payAll;
        currentPlayer.money = 0;
        currentPlayer.status = 'bankrupt';
        currentPlayer.bankruptAt = nowTimestamp();
        logEvents.push({ message: `${currentPlayer.name} أفلس لأنه لم يستطع دفع الإيجار لـ ${players[ownerIndex].name}.`, timestamp: nowTimestamp() });
      } else {
        currentPlayer.money = (currentPlayer.money || 0) - rent;
        players[ownerIndex].money = (players[ownerIndex].money || 0) + rent;
        logEvents.push({ message: `${currentPlayer.name} دفع ${rent} دينار إيجار لـ ${players[ownerIndex].name}.`, timestamp: nowTimestamp() });
      }
      updates['educatedMerchantState.lastRentPayment'] = {
        payer: currentPlayer.name,
        owner: players[ownerIndex].name,
        amount: landingProperty.rent || 0,
        nonce: Date.now(),
      };

      // end turn after rent logic
      const { updates: endUpdates, isGameOver } = endTurnInternal(
        { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game,
        currentPlayerId,
        null,
        { players }
      );
      Object.assign(updates, endUpdates);
      gameEnded = isGameOver;
    } else if (landingProperty.type === 'start') {
      const { updates: endUpdates, isGameOver } = endTurnInternal(
        { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game,
        currentPlayerId,
        null,
        { players }
      );
      Object.assign(updates, endUpdates);
      gameEnded = isGameOver;
    } else if (landingProperty.type === 'property') {
      // property_action: give a short timer for purchase
      updates = {
        ...updates,
        players,
        gameState: 'property_action',
        'educatedMerchantState.timerEndsAt': addActionTimer(),
      };
    } else if (landingProperty.type === 'fine') {
      updates = {
        ...updates,
        players,
        gameState: 'question',
        'educatedMerchantState.pendingFine': { playerId: currentPlayerId, fineAmount: landingProperty.fineAmount ?? DEFAULT_FINE },
        'educatedMerchantState.timerEndsAt': addActionTimer(QUESTION_TIME_SECONDS),
        'educatedMerchantState.questionToken': newQuestionToken(),
      };
      needFineQuestion = { category: 'قسم الغرامات', token: (updates['educatedMerchantState.questionToken'] as string) };
    }
  } else if (state === 'property_action') {
    // player didn't act on purchase -> skip and end turn
    const { updates: endUpdates, isGameOver } = endTurnInternal(
      { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game,
      currentPlayerId,
      activityMessage,
      { players }
    );
    Object.assign(updates, endUpdates);
    gameEnded = isGameOver;
  } else if (state === 'question') {
    // player didn't answer -> apply default (refund or fine)
    const pendingPurchase = game.educatedMerchantState?.pendingPurchase;
    const pendingFine = game.educatedMerchantState?.pendingFine;

    if (pendingPurchase) {
      const pIdx = getPlayerIndexById(players, pendingPurchase.playerId);
      const refund = Math.round((pendingPurchase.price || 0) / 4);
      players[pIdx].money = (players[pIdx].money || 0) + refund;
      activityMessage = `${players[pIdx].name} لم يجب في الوقت واسترد ${refund} دينار.`;
    } else if (pendingFine) {
      const pIdx = getPlayerIndexById(players, pendingFine.playerId);
      const fine = pendingFine.fineAmount ?? DEFAULT_FINE;
      if ((players[pIdx].money || 0) < fine) {
        players[pIdx].money = 0;
        players[pIdx].status = 'bankrupt';
        players[pIdx].bankruptAt = nowTimestamp();
      } else {
        players[pIdx].money = (players[pIdx].money || 0) - fine;
      }
      activityMessage = `${players[pIdx].name} لم يجب في الوقت وتم تطبيق الغرامة.`;
    }

    const { updates: endUpdates, isGameOver } = endTurnInternal(
      { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game,
      currentPlayerId,
      activityMessage,
      { players }
    );
    Object.assign(updates, endUpdates);
    updates['educatedMerchantState.pendingPurchase'] = deleteField();
    updates['educatedMerchantState.pendingFine'] = deleteField();
    updates['educatedMerchantState.currentQuestion'] = deleteField();
    updates['educatedMerchantState.questionToken'] = deleteField();
    gameEnded = isGameOver;
  } else {
    // unknown state: safe fallback - advance to next turn
    const { updates: endUpdates, isGameOver } = endTurnInternal(
      { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game,
      currentPlayerId,
      activityMessage,
      { players }
    );
    Object.assign(updates, endUpdates);
    gameEnded = isGameOver;
  }

  if (logEvents.length) updates['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);

  // apply updates inside the same transaction
  if (Object.keys(updates).length > 0) {
    tx.update(gameRef, updates);
  }

  // if game ended, produce a sanitized Game object for league update (post-transaction)
  if (gameEnded) {
    finalGameDataForLeagueUpdate = {
      ...game,
      players,
      educatedMerchantState: { ...game.educatedMerchantState, board },
      gameState: 'final_results',
    } as Game;
  }

  return { applied: true, needFineQuestion, finalGameDataForLeagueUpdate, gameEnded };
}

// -----------------------------
// Board generation
// -----------------------------
export async function generateBoard(categories: string[]): Promise<Property[]> {
  const board: Property[] = new Array(BOARD_SIZE).fill(undefined as unknown as Property);

  board[0] = { id: 0, type: 'start', name: 'نقطة البداية', category: '', price: 0, rent: 0, ownerId: null } as Property;

  const finePositions = new Set<number>();
  while (finePositions.size < MAX_FINES) {
    const pos = Math.floor(Math.random() * (BOARD_SIZE - 1)) + 1; // avoid 0
    finePositions.add(pos);
  }

  let fineAmount = DEFAULT_FINE;
  for (const pos of finePositions) {
    board[pos] = {
      id: pos,
      type: 'fine',
      name: 'غرامة',
      category: 'قسم الغرامات',
      price: 0,
      rent: 0,
      ownerId: null,
      fineAmount,
    } as Property;
    fineAmount += 50;
  }

  const availablePropertyNames = shuffle([...PROPERTY_NAMES]);
  const propertyCategories = categories.filter((c) => c !== 'قسم الغرامات');

  for (let i = 1; i < BOARD_SIZE; i++) {
    if (board[i]) continue;

    const name = availablePropertyNames.pop() || `عقار ${i}`;
    const price = Math.round((Math.random() * (500 - 100) + 100) / 10) * 10;
    const category = propertyCategories.length > 0 ? propertyCategories[Math.floor(Math.random() * propertyCategories.length)] : '';

    board[i] = {
      id: i,
      type: 'property',
      name,
      category,
      price,
      rent: Math.round(price / 4),
      ownerId: null,
    } as Property;
  }

  return board;
}

// -----------------------------
// Public API (transactional wrappers)
// Each public transaction now first attempts to advance any expired timer
// to ensure the game never remains stuck. This creates a safety-net so that
// any client action will implicitly 'wake' the game and finish an expired turn.
// -----------------------------
export async function startGame(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);

  const categoriesResult = await getEducatedMerchantCategories();
  if (!categoriesResult?.success || !categoriesResult?.categories || categoriesResult.categories.length === 0) {
    throw new Error('فشل تحميل أقسام الأسئلة من الإدارة.');
  }

  const board = await generateBoard(categoriesResult.categories);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;

    if (game.hostId !== hostId) throw new Error('فقط المضيف يمكنه بدء اللعبة.');
    if (game.players.length < 2) throw new Error('اللعبة تتطلب لاعبين على الأقل.');

    const turnOrder = shuffle(game.players.map((p) => p.id));
    const colors = shuffle(COLORS);

    const updatedPlayers = game.players.map((p, idx) => ({
      ...p,
      money: START_MONEY,
      position: 0,
      status: 'alive' as const,
      color: colors[idx % colors.length],
    }));

    tx.update(gameRef, {
      players: updatedPlayers,
      gameState: 'rolling',
      round: 1,
      'educatedMerchantState.board': board,
      'educatedMerchantState.turnOrder': turnOrder,
      'educatedMerchantState.currentTurnIndex': 0,
      'educatedMerchantState.activityLog': [{ message: 'بدأت اللعبة!', timestamp: Timestamp.now() }],
      'educatedMerchantState.timerEndsAt': addActionTimer(),
      'educatedMerchantState.movesThisRound': 0,
      'educatedMerchantState.activeCountAtRoundStart': updatedPlayers.filter((p) => p.status === 'alive').length,
      'educatedMerchantState.settings': { maxRounds: DEFAULT_MAX_ROUNDS, categories: categoriesResult.categories, diceMax: DICE_MAX },
      'educatedMerchantState.displayingRollResult': deleteField(),
      'educatedMerchantState.currentQuestion': deleteField(),
      'educatedMerchantState.pendingPurchase': deleteField(),
      'educatedMerchantState.pendingFine': deleteField(),
      'educatedMerchantState.questionToken': deleteField(),
      'educatedMerchantState.lastRentPayment': deleteField(),
      'educatedMerchantState.newlyBoughtPropertyId': deleteField(),
    });
  });
}

export async function rollDice(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const qToken = newQuestionToken();
  let needFineQuestion: { category: string; token: string } | null = null;
  let finalGameDataForLeagueUpdate: Game | null = null;
  let gameEnded = false;

  await runTransaction(db, async (tx) => {
    let snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    let game = snap.data() as Game;

    // safety-net: advance expired turn if present
    const timeoutResult = await applyTimeoutIfNeeded(tx, gameRef, game);
    if (timeoutResult.applied) {
      if (timeoutResult.needFineQuestion) needFineQuestion = timeoutResult.needFineQuestion;
      if (timeoutResult.finalGameDataForLeagueUpdate) finalGameDataForLeagueUpdate = timeoutResult.finalGameDataForLeagueUpdate;
      if (timeoutResult.gameEnded) gameEnded = true;

      // reload state after applying timeout
      snap = await tx.get(gameRef);
      if (!snap.exists()) throw new Error('اللعبة غير موجودة بعد تطبيق المؤقت.');
      game = snap.data() as Game;
    }

    if (game.gameState !== 'rolling') throw new Error('ليس وقت رمي النرد.');

    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('ليس دورك الآن.');

    const diceMax = game.educatedMerchantState?.settings?.diceMax ?? DICE_MAX;
    const diceRollResult = randomDiceRoll(diceMax);

    const players = clonePlayers(game.players);
    const board = cloneBoard(ensure(game.educatedMerchantState?.board, 'اللوح مفقود.'));

    const playerIndex = getPlayerIndexById(players, playerId);
    const player = players[playerIndex];

    const oldPosition = player.position;
    const newPosition = (oldPosition + diceRollResult) % BOARD_SIZE;
    player.position = newPosition;

    const landingProperty = ensure(board[newPosition], 'خانة غير موجودة على اللوح');

    const logEvents: Array<{ message: string; timestamp: Timestamp }> = [];
    logEvents.push({ message: `${player.name} رمى ${diceRollResult} وتحرك إلى "${landingProperty.name}".`, timestamp: nowTimestamp() });

    // المرور من البداية
    if (newPosition < oldPosition) {
      player.money = (player.money || 0) + PASS_GO_REWARD;
      logEvents.push({ message: `${player.name} مر بنقطة البداية، وحصل على ${PASS_GO_REWARD} دينار.`, timestamp: nowTimestamp() });
    }

    // إيجار إن كان العقار مملوكًا لغيره
    const updates: any = {
      players,
      'educatedMerchantState.lastDiceRoll': diceRollResult,
      'educatedMerchantState.displayingRollResult': { number: diceRollResult, nonce: Date.now() },
      'educatedMerchantState.rollAnimationNonce': Date.now(),
    };

    if (landingProperty.type === 'property' && landingProperty.ownerId && landingProperty.ownerId !== playerId) {
      const ownerIndex = getPlayerIndexById(players, landingProperty.ownerId);
      const rent = landingProperty.rent || 0;
      if ((player.money || 0) < rent) {
        const payAll = player.money || 0;
        players[ownerIndex].money = (players[ownerIndex].money || 0) + payAll;
        player.money = 0;
        player.status = 'bankrupt';
        player.bankruptAt = nowTimestamp();
        logEvents.push({ message: `${player.name} أفلس لأنه لم يستطع دفع الإيجار لـ ${players[ownerIndex].name}.`, timestamp: nowTimestamp() });
      } else {
        player.money = (player.money || 0) - rent;
        players[ownerIndex].money = (players[ownerIndex].money || 0) + rent;
        logEvents.push({ message: `${player.name} دفع ${rent} دينار إيجار لـ ${players[ownerIndex].name}.`, timestamp: nowTimestamp() });
      }
      updates['educatedMerchantState.lastRentPayment'] = {
        payer: player.name,
        owner: players[ownerIndex].name,
        amount: landingProperty.rent || 0,
        nonce: Date.now(),
      };

      // أنهِ الدور بعد دفع الإيجار
      const { updates: endUpdates, isGameOver } = endTurnInternal(
        { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game,
        playerId,
        null,
        { players }
      );
      Object.assign(updates, endUpdates);
      if (isGameOver) {
        gameEnded = true;
        finalGameDataForLeagueUpdate = { ...game, ...updates };
      }
    } else if (landingProperty.type === 'start' || (landingProperty.type === 'property' && landingProperty.ownerId === playerId)) {
      // إنهاء فوري
      const { updates: endUpdates, isGameOver } = endTurnInternal(
        { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game,
        playerId,
        null,
        { players }
      );
      Object.assign(updates, endUpdates);
       if (isGameOver) {
        gameEnded = true;
        finalGameDataForLeagueUpdate = { ...game, ...updates };
      }
    } else if (landingProperty.type === 'property') {
      // قرار شراء
      updates.gameState = 'property_action';
      updates['educatedMerchantState.timerEndsAt'] = addActionTimer();
      // لا إنهاء للدور هنا
    } else if (landingProperty.type === 'fine') {
      // سؤال غرامة — لا نجلِب السؤال داخل المعاملة
      updates.gameState = 'question';
      updates['educatedMerchantState.pendingFine'] = { playerId, fineAmount: landingProperty.fineAmount ?? DEFAULT_FINE };
      updates['educatedMerchantState.timerEndsAt'] = addActionTimer(QUESTION_TIME_SECONDS);
      updates['educatedMerchantState.questionToken'] = qToken;
      // لا تمسح displayingRollResult هنا — اترك الواجهة تُتمّ الأنيميشن
      needFineQuestion = { category: 'قسم الغرامات', token: qToken };
    }

    if (logEvents.length) updates['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);

    tx.update(gameRef, updates);
  });

  // لو احتجنا سؤال غرامة: اجلبه ثم ثبّتَه بمعاملة تحقق من token
  if (needFineQuestion) {
    const question = await fetchRandomQuestion(needFineQuestion.category);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(doc(db, 'games', gameId));
      if (!snap.exists()) return;
      const game = snap.data() as Game;
      // تحقّق من أن الـ token ما زال مطابقًا وأننا ما زلنا في حالة السؤال
      if (
        game.gameState === 'question' &&
        game.educatedMerchantState?.questionToken === needFineQuestion!.token &&
        game.educatedMerchantState?.pendingFine
      ) {
        if(question) {
            tx.update(doc(db, 'games', gameId), {
              'educatedMerchantState.currentQuestion': question,
            });
        } else {
             // If no question found, auto-fail (apply fine) and end turn
            const players = clonePlayers(game.players);
            const playerIndex = getPlayerIndexById(players, game.educatedMerchantState.pendingFine.playerId);
            const player = players[playerIndex];
            const fine = game.educatedMerchantState.pendingFine.fineAmount ?? DEFAULT_FINE;

            if ((player.money || 0) < fine) {
                player.money = 0;
                player.status = 'bankrupt';
                player.bankruptAt = nowTimestamp();
            } else {
                player.money = (player.money || 0) - fine;
            }

            const { updates: endUpdates, isGameOver } = endTurnInternal(game, player.id, `${player.name} فشل في الإجابة على سؤال الغرامة لعدم توفر سؤال.`, { players });
            tx.update(gameRef, endUpdates);

            if (isGameOver) {
                finalGameDataForLeagueUpdate = { ...game, ...endUpdates };
                gameEnded = true;
            }
        }
      }
    });
  }

  if (gameEnded && finalGameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
  }
}

export async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const qToken = newQuestionToken();
  let pending: { category: string; token: string } | null = null;
  let finalGameDataForLeagueUpdate: Game | null = null;
  let gameEnded = false;


  await runTransaction(db, async (tx) => {
    let snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    let game = snap.data() as Game;

    // safety-net
    const timeoutResult = await applyTimeoutIfNeeded(tx, gameRef, game);
    if (timeoutResult.applied) {
      if (timeoutResult.finalGameDataForLeagueUpdate) {
        finalGameDataForLeagueUpdate = timeoutResult.finalGameDataForLeagueUpdate;
        gameEnded = true;
      }
      // reload
      snap = await tx.get(gameRef);
      if (!snap.exists()) throw new Error('اللعبة غير موجودة بعد تطبيق المؤقت.');
      game = snap.data() as Game;
    }

    if (game.gameState !== 'property_action') throw new Error('ليس وقت شراء العقارات.');

    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('ليس دورك للشراء.');

    const players = clonePlayers(game.players);
    const board = cloneBoard(ensure(game.educatedMerchantState?.board, 'اللوح مفقود.'));

    const playerIndex = getPlayerIndexById(players, playerId);
    const player = players[playerIndex];
    const property = ensure(board[player.position], 'العقار غير موجود.');

    if (property.type !== 'property' || property.ownerId) throw new Error('هذا العقار غير متاح للشراء.');
    if ((player.money || 0) < property.price) throw new Error('رصيدك لا يكفي لشراء هذا العقار.');

    // خصم المبلغ مؤقتًا — القرار النهائي بعد السؤال
    player.money = (player.money || 0) - property.price;

    const updates: any = {
      players,
      gameState: 'question',
      'educatedMerchantState.timerEndsAt': addActionTimer(QUESTION_TIME_SECONDS),
      'educatedMerchantState.pendingPurchase': {
        playerId,
        propertyId: property.id,
        price: property.price,
        questionId: null,
        propertyName: property.name,
      },
      'educatedMerchantState.questionToken': qToken,
      'educatedMerchantState.currentQuestion': deleteField(),
      // لا نحذف displayingRollResult هنا
    };

    // سنحتاج سؤالًا من نفس تصنيف العقار
    pending = { category: property.category, token: qToken };
    tx.update(gameRef, updates);
  });

  if (pending) {
    const question = await fetchRandomQuestion(pending.category);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(doc(db, 'games', gameId));
      if (!snap.exists()) return;
      const game = snap.data() as Game;
      const pp = game.educatedMerchantState?.pendingPurchase;
      if (game.gameState === 'question' && game.educatedMerchantState?.questionToken === pending!.token && pp && pp.playerId === playerId) {
        if(question) {
            tx.update(doc(db, 'games', gameId), {
              'educatedMerchantState.currentQuestion': question,
              'educatedMerchantState.pendingPurchase': { ...pp, questionId: question.id },
            });
        } else {
             // If no question found, auto-fail (refund) and end turn
            const players = clonePlayers(game.players);
            const playerIndex = getPlayerIndexById(players, playerId);
            const refund = Math.round((pp.price || 0) / 4);
            players[playerIndex].money = (players[playerIndex].money || 0) + refund;

            const { updates: endUpdates, isGameOver } = endTurnInternal(game, playerId, `${players[playerIndex].name} فشل في شراء العقار لعدم توفر سؤال.`, { players });
            tx.update(gameRef, endUpdates);
             if (isGameOver) {
                finalGameDataForLeagueUpdate = { ...game, ...endUpdates };
                gameEnded = true;
            }
        }
      }
    });
  }

  if (gameEnded && finalGameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
  }
}

export async function answerQuestion(gameId: string, playerId: string, answer: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let gameEnded = false;
  let finalGameDataForLeagueUpdate: Game | null = null;

  await runTransaction(db, async (tx) => {
    let snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    let game = snap.data() as Game;

    // safety-net
    const timeoutResult = await applyTimeoutIfNeeded(tx, gameRef, game);
    if (timeoutResult.applied) {
      if (timeoutResult.finalGameDataForLeagueUpdate) finalGameDataForLeagueUpdate = timeoutResult.finalGameDataForLeagueUpdate;
      // reload state after applying timeout
      snap = await tx.get(gameRef);
      if (!snap.exists()) throw new Error('اللعبة غير موجودة بعد تطبيق المؤقت.');
      game = snap.data() as Game;
    }

    const pendingPurchase = game.educatedMerchantState?.pendingPurchase;
    const pendingFine = game.educatedMerchantState?.pendingFine;

    if (
      game.gameState !== 'question' ||
      (!pendingPurchase && !pendingFine) ||
      (pendingPurchase?.playerId !== playerId && pendingFine?.playerId !== playerId)
    ) {
      return;
    }

    const question = ensure(game.educatedMerchantState?.currentQuestion, 'السؤال الحالي مفقود.');
    const isCorrect = answer === question.answer;

    const players = clonePlayers(game.players);
    const board = cloneBoard(ensure(game.educatedMerchantState?.board, 'اللوح مفقود.'));

    const playerIndex = getPlayerIndexById(players, playerId);
    let activityMessage = '';

    if (pendingPurchase) {
      const propertyName = pendingPurchase.propertyName || 'عقار مجهول';
      if (isCorrect) {
        const propertyIndex = board.findIndex((p) => p.id === pendingPurchase.propertyId);
        if (propertyIndex !== -1) {
          board[propertyIndex].ownerId = playerId;
          board[propertyIndex].color = players[playerIndex].color;
        }
        players[playerIndex].propertiesCount = (players[playerIndex].propertiesCount || 0) + 1;
        activityMessage = `${players[playerIndex].name} أجاب بشكل صحيح وامتلك "${propertyName}"!`;
      } else {
        const refund = Math.round((pendingPurchase.price || 0) / 4);
        players[playerIndex].money = (players[playerIndex].money || 0) + refund;
        activityMessage = `${players[playerIndex].name} أجاب بشكل خاطئ على سؤال "${propertyName}" واسترد ${refund} دينار.`;
      }
    } else if (pendingFine) {
      if (isCorrect) {
        activityMessage = `${players[playerIndex].name} أجاب بشكل صحيح ونجا من الغرامة!`;
      } else {
        const fine = pendingFine.fineAmount ?? DEFAULT_FINE;
        if ((players[playerIndex].money || 0) < fine) {
          players[playerIndex].money = 0;
          players[playerIndex].status = 'bankrupt';
          players[playerIndex].bankruptAt = nowTimestamp();
          activityMessage = `${players[playerIndex].name} أجاب خطأ وأفلس لأنه لم يستطع دفع الغرامة.`;
        } else {
          players[playerIndex].money = (players[playerIndex].money || 0) - fine;
          activityMessage = `${players[playerIndex].name} أجاب خطأ ودفع غرامة ${fine} دينار.`;
        }
      }
    }

    const nestedExtra = { players, educatedMerchantState: { board } };
    const { updates, isGameOver } = endTurnInternal(
      { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game,
      playerId,
      activityMessage,
      nestedExtra
    );
    gameEnded = isGameOver;

    if (isGameOver) {
      finalGameDataForLeagueUpdate = {
        ...game,
        players,
        educatedMerchantState: { ...game.educatedMerchantState, board },
        gameState: 'final_results',
        gameResult: (updates && (updates as any).gameResult) ? (updates as any).gameResult : (game as any).gameResult,
      } as Game;
    }

    updates['educatedMerchantState.pendingPurchase'] = deleteField();
    updates['educatedMerchantState.pendingFine'] = deleteField();
    updates['educatedMerchantState.currentQuestion'] = deleteField();
    updates['educatedMerchantState.questionToken'] = deleteField();
    updates['educatedMerchantState.newlyBoughtPropertyId'] = deleteField();

    tx.update(gameRef, updates);
  });

  if (gameEnded && finalGameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
  }
}

export async function handleTimeout(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let finalGameDataForLeagueUpdate: Game | null = null;
  let gameEnded = false;
  let needFineQuestion: { category: string; token: string } | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;

    // only host may call the explicit handler as an admin call; however the safety-net
    // (applyTimeoutIfNeeded) can be invoked by any transaction. Here we allow host to trigger it.
    if (game.hostId !== hostId) return;

    const res = await applyTimeoutIfNeeded(tx, gameRef, game);
    if (!res.applied) return;
    needFineQuestion = res.needFineQuestion ?? null;
    finalGameDataForLeagueUpdate = res.finalGameDataForLeagueUpdate ?? null;
    gameEnded = res.gameEnded ?? false;
  });

  if (gameEnded && finalGameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
  }

  if (needFineQuestion) {
    const question = await fetchRandomQuestion(needFineQuestion.category);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(doc(db, 'games', gameId));
      if (!snap.exists()) return;
      const game = snap.data() as Game;
      if (
        game.gameState === 'question' &&
        game.educatedMerchantState?.questionToken === needFineQuestion!.token &&
        game.educatedMerchantState?.pendingFine
      ) {
         if(question) {
            tx.update(doc(db, 'games', gameId), {
              'educatedMerchantState.currentQuestion': question,
            });
        } else {
             // If no question found, auto-fail (apply fine) and end turn
            const players = clonePlayers(game.players);
            const playerIndex = getPlayerIndexById(players, game.educatedMerchantState.pendingFine.playerId);
            const player = players[playerIndex];
            const fine = game.educatedMerchantState.pendingFine.fineAmount ?? DEFAULT_FINE;

            if ((player.money || 0) < fine) {
                player.money = 0;
                player.status = 'bankrupt';
                player.bankruptAt = nowTimestamp();
            } else {
                player.money = (player.money || 0) - fine;
            }

            const { updates: endUpdates, isGameOver } = endTurnInternal(game, player.id, `${player.name} فشل في الإجابة على سؤال الغرامة لعدم توفر سؤال.`, { players });
            tx.update(gameRef, endUpdates);

            if (isGameOver) {
                finalGameDataForLeagueUpdate = { ...game, ...endUpdates };
                gameEnded = true;
            }
        }
      }
    });
  }
}

function endTurnInternal(
  game: Game,
  playerId: string,
  extraMessage: string | null = null,
  extraUpdates?: { players?: Player[]; educatedMerchantState?: { board?: Property[] } }
): { isGameOver: boolean; updates: any } {
  const players = extraUpdates?.players ? clonePlayers(extraUpdates.players) : clonePlayers(game.players);
  const board = extraUpdates?.educatedMerchantState?.board ? cloneBoard(extraUpdates.educatedMerchantState.board!) : cloneBoard(ensure(game.educatedMerchantState?.board, 'اللوح مفقود.'));

  const logEvents: Array<{ message: string; timestamp: Timestamp }> = [];
  if (extraMessage) logEvents.push({ message: extraMessage, timestamp: nowTimestamp() });

  // تحرير العقارات المملوكة لمفلسين
  for (let i = 0; i < board.length; i++) {
    const prop = board[i];
    if (!prop) continue;
    const owner = players.find((p) => p.id === prop.ownerId);
    if (owner && owner.status === 'bankrupt') {
      logEvents.push({ message: `تم تحرير "${prop.name}" بعد إفلاس ${owner.name}.`, timestamp: nowTimestamp() });
      board[i] = { ...prop, ownerId: null, color: undefined } as Property;
    }
  }

  // فرض أن المفلس لا يحتفظ بأموال موجبة
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.status === 'bankrupt' && (p.money || 0) > 0) players[i] = { ...p, money: 0 } as Player;
  }

  const activePlayers = players.filter((p) => p.status === 'alive');

  // نهاية اللعبة إذا بقي لاعب واحد
  if (activePlayers.length <= 1) {
    const winner = activePlayers[0];
    const ranking = [...players]
      .sort((a, b) => {
        if (a.status === 'alive' && b.status !== 'alive') return -1;
        if (b.status === 'alive' && a.status === 'alive') return (b.money || 0) - (a.money || 0);
        if (a.status === 'bankrupt' && b.status === 'bankrupt') return ((b.bankruptAt as Timestamp)?.toMillis() || 0) - ((a.bankruptAt as Timestamp)?.toMillis() || 0);
        return (b.money || 0) - (a.money || 0);
      })
      .map((p, i) => ({ playerId: p.id, name: p.name, rank: i + 1, bankruptAt: p.bankruptAt || null }));

    const finalGameData: any = {
      gameState: 'final_results',
      gameResult: { winner: winner?.id || 'none', message: `اللاعب ${winner?.name || ''} هو الناجي الأخير!`, ranking },
      players,
      'educatedMerchantState.timerEndsAt': deleteField(),
      'educatedMerchantState.board': board,
      'educatedMerchantState.displayingRollResult': deleteField(),
      'educatedMerchantState.lastRentPayment': deleteField(),
      'educatedMerchantState.currentQuestion': deleteField(),
      'educatedMerchantState.pendingPurchase': deleteField(),
      'educatedMerchantState.pendingFine': deleteField(),
      'educatedMerchantState.questionToken': deleteField(),
      'educatedMerchantState.newlyBoughtPropertyId': deleteField(),
    };

    if (logEvents.length > 0) finalGameData['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);

    return { isGameOver: true, updates: finalGameData };
  }

  const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'Turn order missing');
  const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'Current turn index missing.');

  let nextTurnIndex = findNextAliveIndex(turnOrder, players, currentTurnIndex);
  if (nextTurnIndex === -1) {
      const finalActivePlayers = players.filter(p => p.status === 'alive');
      if (finalActivePlayers.length <= 1) {
          const winner = finalActivePlayers[0];
          const ranking = [...players]
              .sort((a,b) => (b.money || 0) - (a.money || 0))
              .map((p, i) => ({ playerId: p.id, name: p.name, rank: i+1 }));
          return { isGameOver: true, updates: { gameState: 'final_results', gameResult: { winner: winner?.id || 'none', message: `اللاعب ${winner?.name || ''} هو الفائز الأخير!`, ranking }}};
      }
      // This should ideally not be reached if the logic is correct.
      // But as a fallback, we reset to the first alive player.
      nextTurnIndex = players.findIndex(p => p.status === 'alive');
  }

  // إدارة الجولات بثبات عدد الأحياء عند بداية الجولة
  const movesThisRound = game.educatedMerchantState?.movesThisRound ?? 0;
  const activeAtRoundStart = game.educatedMerchantState?.activeCountAtRoundStart ?? activePlayers.length;

  let newMoves = movesThisRound + 1;
  let newRound = game.round || 1;
  let newActiveAtRoundStart = activeAtRoundStart;

  if (newMoves >= activeAtRoundStart) {
    newRound += 1;
    newMoves = 0;
    newActiveAtRoundStart = players.filter((p) => p.status === 'alive').length;
  }

  const maxRounds = game.educatedMerchantState?.settings?.maxRounds || DEFAULT_MAX_ROUNDS;

  if (newRound > maxRounds) {
    const winner = activePlayers.reduce((a, b) => ((a.money || 0) > (b.money || 0) ? a : b));
    const ranking = [...players]
      .sort((a, b) => (b.money || 0) - (a.money || 0))
      .map((p, i) => ({ playerId: p.id, name: p.name, rank: i + 1, bankruptAt: p.bankruptAt || null }));

    const finalGameData: any = {
      gameState: 'final_results',
      gameResult: { winner: winner?.id || 'none', message: `انتهت الجولات! الفائز هو ${winner?.name || ''} بأعلى رصيد.`, ranking },
      players,
      'educatedMerchantState.board': board,
      'educatedMerchantState.timerEndsAt': deleteField(), // تمت الإضافة لضمان إطفاء المؤقّت
      'educatedMerchantState.displayingRollResult': deleteField(),
      'educatedMerchantState.lastRentPayment': deleteField(),
      'educatedMerchantState.currentQuestion': deleteField(),
      'educatedMerchantState.pendingPurchase': deleteField(),
      'educatedMerchantState.pendingFine': deleteField(),
      'educatedMerchantState.questionToken': deleteField(),
      'educatedMerchantState.newlyBoughtPropertyId': deleteField(),
    };

    if (logEvents.length > 0) finalGameData['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);

    return { isGameOver: true, updates: finalGameData };
  }

  const finalUpdates: any = {
    gameState: 'rolling',
    'educatedMerchantState.board': board,
    'educatedMerchantState.currentTurnIndex': nextTurnIndex,
    'educatedMerchantState.timerEndsAt': addActionTimer(),
    round: newRound,
    players,
    'educatedMerchantState.movesThisRound': newMoves,
    'educatedMerchantState.activeCountAtRoundStart': newActiveAtRoundStart,
    'educatedMerchantState.lastRentPayment': deleteField(),
    'educatedMerchantState.displayingRollResult': deleteField(),
    'educatedMerchantState.newlyBoughtPropertyId': deleteField(),
  };

  if (logEvents.length > 0) finalUpdates['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);

  return { isGameOver: false, updates: finalUpdates };
}

export async function endTurn(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    let snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    let game = snap.data() as Game;

    // safety-net
    const timeoutResult = await applyTimeoutIfNeeded(tx, gameRef, game);
    if (timeoutResult.applied) {
      // reload
      snap = await tx.get(gameRef);
      if (!snap.exists()) throw new Error('اللعبة غير موجودة بعد تطبيق المؤقت.');
      game = snap.data() as Game;
    }

    if (game.gameState !== 'property_action') return;

    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('ليس دورك لإنهاء الجولة.');

    const { updates } = endTurnInternal(game, playerId, `${game.players.find((p) => p.id === playerId)?.name} قرر تخطي دوره.`);

    tx.update(gameRef, updates);
  });
}
