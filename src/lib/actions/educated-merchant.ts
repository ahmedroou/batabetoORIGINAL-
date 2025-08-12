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
} from 'firebase/firestore';
import type {
  Game,
  Player,
  Property,
  EducatedMerchantQuestion,
  UserProfile,
} from '@/types';
import { shuffle } from './helpers';

const BOARD_SIZE = 28;
const STARTING_BALANCE = 1000;
const BASE_PROPERTY_PRICE = 100;
const MAX_PROPERTY_PRICE = 500;
const PRICE_INCREMENT = 25;
const PASS_START_BONUS = 200;
const QUESTION_TIME_SECONDS = 25;

/**
 * Helper: اقرأ فئات الأسئلة من المستندات (game_settings/educated_merchant_categories)
 */
async function getAvailableCategories(): Promise<string[]> {
  const settingsDocRef = doc(db, 'game_settings', 'educated_merchant_categories');
  const settingsSnap = await getDoc(settingsDocRef);
  if (settingsSnap.exists()) {
    const data = settingsSnap.data() as any;
    if (Array.isArray(data.list)) return data.list;
  }
  return [];
}

/**
 * احصل على سؤال عشوائي من فئة معينة.
 * يتوقع أن توجد الحقول: question, answer, dummyAnswers[], randomKey (رقم عشوائي 0..1), category
 */
async function fetchRandomQuestionForCategory(category: string): Promise<EducatedMerchantQuestion | null> {
  const questionsCol = collection(db, 'trap_answer_questions');
  const randomKey = Math.random();

  let q = query(questionsCol, where('category', '==', category), where('randomKey', '>=', randomKey), limit(1));
  let snap = await getDocs(q);

  if (snap.empty) {
    q = query(questionsCol, where('category', '==', category), where('randomKey', '<', randomKey), limit(1));
    snap = await getDocs(q);
  }

  if (snap.empty) {
    console.warn(`No questions found for category: ${category}`);
    return null;
  }

  const docSnap = snap.docs[0];
  const data = docSnap.data() as any;
  const correctAnswer = data.answer as string;
  const dummyAnswers = Array.isArray(data.dummyAnswers) && data.dummyAnswers.length > 0
    ? data.dummyAnswers
    : ['بديل ١', 'بديل ٢', 'بديل ٣'];

  // اختَر ثلاثة إجابات خاطئة عشوائياً (أو أقل إن لم تتوافر)
  const chosenDummies = shuffle(dummyAnswers).slice(0, Math.min(3, dummyAnswers.length));
  const options = shuffle([correctAnswer, ...chosenDummies]);

  return {
    id: docSnap.id,
    question: data.question,
    options,
    correctAnswer,
    category: data.category,
  } as EducatedMerchantQuestion;
}

/**
 * إنشـاء لوح اللعبة
 */
function generateBoard(categories: string[]): Property[] {
  const board: Property[] = [];
  if (categories.length === 0) return [];

  const priceCount = Math.floor((MAX_PROPERTY_PRICE - BASE_PROPERTY_PRICE) / PRICE_INCREMENT) + 1;
  const propertyPrices = Array.from({ length: priceCount }, (_, i) => BASE_PROPERTY_PRICE + i * PRICE_INCREMENT);
  const shuffledPrices = shuffle(propertyPrices);

  for (let i = 0; i < BOARD_SIZE; i++) {
    if (i === 0) {
      board.push({ id: i, type: 'start', name: 'نقطة البداية', category: 'special', price: 0, rent: 0, ownerId: null });
    } else if (i === 7) {
      board.push({ id: i, type: 'fine', name: 'غرامة', category: 'special', price: 0, rent: 0, ownerId: null, fineAmount: 50 });
    } else if (i === 21) {
      board.push({ id: i, type: 'fine', name: 'غرامة كبيرة', category: 'special', price: 0, rent: 0, ownerId: null, fineAmount: 100 });
    } else {
      const category = categories[i % categories.length] || 'عام';
      const price = shuffledPrices[i % shuffledPrices.length] || BASE_PROPERTY_PRICE;
      board.push({ id: i, type: 'property', name: `عقار ${i}`, category, price, rent: Math.floor(price * 0.25), ownerId: null });
    }
  }
  return board;
}

/**
 * بدء اللعبة — يهيئ اللوح، رتب الأدوار، ويضع أرصدة البدء.
 */
export async function startGame(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const gameSnap = await transaction.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const game = gameSnap.data() as Game;

    if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
    if (game.gameState !== 'lobby') return;
    if (!Array.isArray(game.players) || game.players.length < 2) throw new Error('The game requires at least 2 players.');

    const availableCategories = await getAvailableCategories();
    if (availableCategories.length === 0) {
      throw new Error('لا توجد فئات أسئلة متاحة. يرجى إضافتها من لوحة تحكم الأدمن.');
    }

    const board = generateBoard(availableCategories);
    const turnOrder = shuffle(game.players.map(p => p.id));
    const initialBalances = game.players.reduce((acc: Record<string, number>, p) => {
      acc[p.id] = STARTING_BALANCE;
      return acc;
    }, {});

    const updatedPlayers = game.players.map(p => ({ ...p, position: 0, bankruptAt: null, status: 'alive' }));

    transaction.update(gameRef, {
      gameState: 'rolling',
      'educatedMerchantState.board': board,
      'educatedMerchantState.turnOrder': turnOrder,
      'educatedMerchantState.currentTurnIndex': 0,
      'educatedMerchantState.activityLog': ['بدأت اللعبة!'],
      playerScores: initialBalances,
      players: updatedPlayers,
      round: 1,
    });
  });
}

/**
 * رمي النرد
 */
export async function rollDice(gameId: string, playerId: string): Promise<{ success: boolean; diceResult?: number; error?: string }> {
  const gameRef = doc(db, 'games', gameId);
  let diceResult = 0;
  try {
    await runTransaction(db, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists()) throw new Error('Game not found.');
      const game = gameSnap.data() as Game;

      const es = game.educatedMerchantState;
      if (game.gameState !== 'rolling' || !es || es.turnOrder[es.currentTurnIndex] !== playerId) {
        throw new Error('ليس دورك لرمي النرد.');
      }

      diceResult = Math.floor(Math.random() * 6) + 1;

      const playerIndex = game.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) throw new Error('Player not found');

      const newActivityLog = [...(es.activityLog || []), `${game.players[playerIndex].name} رمى النرد وحصل على ${diceResult}.`];

      transaction.update(gameRef, {
        gameState: 'movement',
        'educatedMerchantState.lastDiceRoll': diceResult,
        'educatedMerchantState.activityLog': newActivityLog,
      });
    });

    return { success: true, diceResult };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * التعامل عند الوصول لمربع (حركة اللاعب تمت بالفعل — نقرأ آخر رمية من educatedMerchantState.lastDiceRoll)
 */
export async function handlePropertyAction(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (transaction) => {
    const gameSnap = await transaction.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const game = gameSnap.data() as Game;
    const es = game.educatedMerchantState;
    if (!es) throw new Error('Game state is not initialized.');

    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error('Player not found in game.');
    const player = game.players[playerIndex];

    const dice = es.lastDiceRoll || 0;
    const oldPosition = player.position || 0;
    const newPosition = (oldPosition + dice) % BOARD_SIZE;
    const newProperty = es.board.find((b: Property) => b.id === newPosition);
    if (!newProperty) throw new Error('Property not found on board.');

    // اقرأ بيانات مالك العقار إن وُجد
    let ownerData: UserProfile | null = null;
    if (newProperty.type === 'property' && newProperty.ownerId && newProperty.ownerId !== playerId) {
      const ownerSnap = await transaction.get(doc(db, 'users', newProperty.ownerId));
      if (ownerSnap.exists()) ownerData = ownerSnap.data() as UserProfile;
    }

    // تحديثات محلية للاستعداد للكتابة
    const updatedPlayers = [...game.players];
    updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], position: newPosition };

    let newActivityLog = [...(es.activityLog || [])];
    const updatedBalances = { ...(game.playerScores || {}) };

    const passedStart = (oldPosition + dice) >= BOARD_SIZE;
    if (passedStart) {
      updatedBalances[playerId] = (updatedBalances[playerId] || 0) + PASS_START_BONUS;
      newActivityLog.push(`${player.name} مر بنقطة البداية وحصل على ${PASS_START_BONUS} د.ع.`);
    }

    // نوع الـمربع
    if (newProperty.type === 'start') {
      transaction.update(gameRef, {
        players: updatedPlayers,
        playerScores: updatedBalances,
        'educatedMerchantState.activityLog': newActivityLog,
        'educatedMerchantState.lastDiceRoll': deleteField(),
      });
      await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, playerId, transaction);
      return;
    }

    if (newProperty.type === 'fine') {
      const fine = newProperty.fineAmount || 0;
      newActivityLog.push(`${player.name} دفع غرامة بقيمة ${fine} د.ع.`);
      if ((updatedBalances[playerId] || 0) < fine) {
        updatedPlayers[playerIndex].status = 'bankrupt';
        updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
        newActivityLog.push(`${player.name} أفلس!`);
        // صاحب العقار لا ينفع هنا — Fine تذهب إلى «البيت» (لا مالك)
        updatedBalances[playerId] = 0;
      } else {
        updatedBalances[playerId] -= fine;
      }

      transaction.update(gameRef, {
        players: updatedPlayers,
        playerScores: updatedBalances,
        'educatedMerchantState.activityLog': newActivityLog,
        'educatedMerchantState.lastDiceRoll': deleteField(),
      });

      await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, playerId, transaction);
      return;
    }

    if (newProperty.type === 'property') {
      if (newProperty.ownerId && newProperty.ownerId !== playerId && ownerData) {
        const rent = newProperty.rent || 0;
        newActivityLog.push(`${player.name} دفع إيجارًا بقيمة ${rent} د.ع إلى ${ownerData.name}.`);

        if ((updatedBalances[playerId] || 0) < rent) {
          // اللاعب أفلس — يعطي كل ما لديه لمالك العقار
          updatedPlayers[playerIndex].status = 'bankrupt';
          updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
          newActivityLog.push(`${player.name} أفلس!`);
          const amountToTransfer = updatedBalances[playerId] || 0;
          updatedBalances[playerId] = 0;
          updatedBalances[newProperty.ownerId] = (updatedBalances[newProperty.ownerId] || 0) + amountToTransfer;
        } else {
          updatedBalances[playerId] -= rent;
          updatedBalances[newProperty.ownerId] = (updatedBalances[newProperty.ownerId] || 0) + rent;
        }

        transaction.update(gameRef, {
          players: updatedPlayers,
          playerScores: updatedBalances,
          'educatedMerchantState.activityLog': newActivityLog,
          'educatedMerchantState.lastDiceRoll': deleteField(),
        });

        await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, playerId, transaction);
        return;
      } else if (!newProperty.ownerId) {
        // مربع قابل للشراء — ننتقل إلى حالة اتخاذ القرار (شراء -> سؤال)
        newActivityLog.push(`${player.name} توقف على ${newProperty.name}، يمكنه الشراء أو التخطي.`);

        transaction.update(gameRef, {
          gameState: 'property_action',
          players: updatedPlayers,
          playerScores: updatedBalances,
          'educatedMerchantState.activityLog': newActivityLog,
          'educatedMerchantState.lastDiceRoll': deleteField(),
        });
        return;
      } else {
        // على عقاره الخاص
        newActivityLog.push(`${player.name} وقف على عقاره.`);
        transaction.update(gameRef, {
          players: updatedPlayers,
          playerScores: updatedBalances,
          'educatedMerchantState.activityLog': newActivityLog,
          'educatedMerchantState.lastDiceRoll': deleteField(),
        });
        await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, playerId, transaction);
        return;
      }
    }

    // افتراضيًا: اكتب التحديثات
    transaction.update(gameRef, {
      players: updatedPlayers,
      playerScores: updatedBalances,
      'educatedMerchantState.activityLog': newActivityLog,
      'educatedMerchantState.lastDiceRoll': deleteField(),
    });
    await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, playerId, transaction);
  });
}

/**
 * محاولة شراء عقار: تنشئ سؤالًا وتخصم السعر جزئياً/كلياً حسب المنطق وتضع pendingPurchase.
 */
export async function buyPropertyAttempt(gameId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);

  try {
    await runTransaction(db, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists()) throw new Error('Game not found.');
      const game = gameSnap.data() as Game;
      const es = game.educatedMerchantState;
      if (!es) throw new Error('Game state is not initialized.');

      const player = game.players.find(p => p.id === playerId);
      if (!player) throw new Error('Player not found.');

      const property = es.board.find((b: Property) => b.id === player.position);
      if (!property || property.type !== 'property') throw new Error('This property cannot be bought.');
      if (property.ownerId) throw new Error('This property already has an owner.');

      const playerBalance = (game.playerScores?.[playerId] || 0);
      if (playerBalance < property.price) throw new Error('You cannot afford this property.');

      // جلب سؤال عشوائي للخانة
      const randomQuestion = await fetchRandomQuestionForCategory(property.category);
      if (!randomQuestion) throw new Error(`No questions available for category "${property.category}". The purchase cannot proceed.`);

      // اسلوب متبع: نخصم سعر العقار فورًا (حتى لا يتم استغلال) ونخزن pendingPurchase لكي يتسنى استرداد جزء إذا أخطأ اللاعب
      // يمكنك تغيير المنطق لاحقًا (مثلاً خصم بعد الإجابة الصحيحة) حسب تفضيلك.
      const activity = `${player.name} قرر شراء ${property.name} وخصم ${property.price} د.ع. (قيد الاختبار)`;

      // نُنشئ pendingPurchase داخل educatedMerchantState
      const pendingPurchase = {
        playerId,
        propertyId: property.id,
        price: property.price,
        questionId: randomQuestion.id,
      };

      // التحديث في الترانزاكشن: خصم المال، إعداد السؤال، وتسجيل pendingPurchase
      transaction.update(gameRef, {
        [`playerScores.${playerId}`]: increment(-property.price),
        gameState: 'question',
        'educatedMerchantState.currentQuestion': randomQuestion,
        'educatedMerchantState.timerEndsAt': Timestamp.fromMillis(Date.now() + QUESTION_TIME_SECONDS * 1000),
        'educatedMerchantState.activityLog': arrayUnion(activity),
        'educatedMerchantState.pendingPurchase': pendingPurchase,
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * الإجابة على السؤال المتعلق بالشراء (أو أي سؤال شراء محتمل).
 * نتحقق من وجود pendingPurchase ونتصرف بناءً على صحة الإجابة.
 */
export async function answerQuestion(gameId: string, playerId: string, answer: string | null): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);

  try {
    await runTransaction(db, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists()) throw new Error('Game not found.');
      const game = gameSnap.data() as Game;
      const es = game.educatedMerchantState;
      if (!es) throw new Error('Game state is not initialized.');

      const question = es.currentQuestion as EducatedMerchantQuestion | undefined;
      if (!question) throw new Error('No active question.');

      const pending = es.pendingPurchase as { playerId: string; propertyId: number; price: number } | undefined;
      if (!pending || pending.playerId !== playerId) throw new Error('No pending purchase for this player.');

      // تأكد أن اللاعب يقف على نفس العقار
      const player = game.players.find(p => p.id === playerId);
      if (!player) throw new Error('Player not found.');
      const property = es.board.find((b: Property) => b.id === pending.propertyId);
      if (!property || property.type !== 'property') throw new Error('Pending property no longer valid.');

      const isCorrect = answer === question.correctAnswer;

      // نجهز نسخ محلية للتعديلات التي سنمررها إلى endTurn
      const newBoard = es.board.map((b: Property) => ({ ...b }));
      const newActivityLog = [...(es.activityLog || [])];

      // نقرأ الأرصدة الحالية (كما كانت عند بداية الترانزاكشن)
      const balances = { ...(game.playerScores || {}) };

      if (isCorrect) {
        // امنح الملكية للاعب
        const propIndex = newBoard.findIndex(b => b.id === property.id);
        if (propIndex !== -1) {
          newBoard[propIndex] = { ...newBoard[propIndex], ownerId: playerId };
        }
        newActivityLog.push(`${player.name} أجاب بشكل صحيح وامتلك ${property.name}.`);
      } else {
        // عند الخطأ: استرداد جزء من السعر (مثلاً 25%)
        const refundAmount = Math.floor((pending.price || property.price) * 0.25);
        balances[playerId] = (balances[playerId] || 0) + refundAmount; // نحدث النسخة المحلية
        newActivityLog.push(`${player.name} أجاب بشكل خاطئ وخسر جزءًا من ماله! استرد ${refundAmount} د.ع.`);
      }

      // نجهز كائن التحديثات إلى Firestore في نفس الترانزاكشن
      const updates: any = {
        'educatedMerchantState.currentQuestion': deleteField(),
        'educatedMerchantState.timerEndsAt': deleteField(),
        'educatedMerchantState.pendingPurchase': deleteField(),
        'educatedMerchantState.activityLog': newActivityLog,
        'educatedMerchantState.board': newBoard,
      };

      // نطبق تعديل الرصيد عن طريق increment (للاسترداد) أو لا حاجة (لأننا خصمنا سابقًا)
      if (!isCorrect) {
        // استرداد مبلغ
        updates[`playerScores.${playerId}`] = increment(Math.floor((pending.price || property.price) * 0.25));
      }

      // نكتب التحديثات
      transaction.update(gameRef, updates);

      // نُحضّر نسخة اللعبة المحلية التي نمرّر إلى endTurn لتحدد الدور التالي
      const updatedGameForNextStep: Game = {
        ...game,
        playerScores: { ...(game.playerScores || {}), ...(isCorrect ? {} : { [playerId]: balances[playerId] }) },
        educatedMerchantState: { ...es, activityLog: newActivityLog, board: newBoard },
      };

      await endTurn(gameRef, updatedGameForNextStep, playerId, transaction);
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * انتهى دور اللاعب — نحدد اللاعب التالي، ونتحقق من انتهاء اللعبة (إفلاس أو انتهاء عدد الجولات).
 * gameRef: وثيقة اللعبة، game: نسخة حالية مقروءة من اللعبة (يمكن تعديلها محلياً قبل الكتابة)، transaction: الترانزاكشن الجاري.
 */
export async function endTurn(gameRef: DocumentReference, game: Game, playerId: string, transaction: Transaction) {
  const es = game.educatedMerchantState;
  if (!es) throw new Error('Game state is not initialized.');

  const currentTurnPlayerId = es.turnOrder[es.currentTurnIndex];
  if (currentTurnPlayerId !== playerId) {
    // محاولة أي لاعب آخر لإنهاء دور ليست مؤذية لكن نتجاهلها
    console.warn(`Player ${playerId} tried to end turn, but it's ${currentTurnPlayerId}'s turn.`);
    return;
  }

  const nonBankruptPlayers = game.players.filter(p => p.status !== 'bankrupt');

  if (nonBankruptPlayers.length <= 1) {
    const winner = nonBankruptPlayers[0];
    transaction.update(gameRef, {
      gameState: 'final_results',
      gameResult: { winner: winner?.id || 'game_over', message: 'انتهت اللعبة بإفلاس المنافسين!' },
      'educatedMerchantState.lastDiceRoll': deleteField(),
    });
    return;
  }

  // العثور على nextIndex صالح (تخطي اللاعبين المفلسين)
  let nextIndex = (es.currentTurnIndex + 1) % es.turnOrder.length;
  let loopGuard = 0;
  while (game.players.find(p => p.id === es.turnOrder[nextIndex])?.status === 'bankrupt' && loopGuard < es.turnOrder.length * 2) {
    nextIndex = (nextIndex + 1) % es.turnOrder.length;
    loopGuard++;
  }

  let newRound = game.round || 1;
  if (nextIndex <= es.currentTurnIndex) {
    // إذا رجعنا إلى بداية الدور فزدنا الجولة
    newRound++;
  }

  const maxRounds = es.settings?.maxRounds || 20;
  if (newRound > maxRounds) {
    const finalWinner = game.players
      .filter(p => p.status !== 'bankrupt')
      .sort((a, b) => (game.playerScores?.[b.id] || 0) - (game.playerScores?.[a.id] || 0))[0];

    transaction.update(gameRef, {
      gameState: 'final_results',
      gameResult: { winner: finalWinner?.id || 'game_over', message: 'انتهت الجولات!' },
      'educatedMerchantState.lastDiceRoll': deleteField(),
    });
    return;
  }

  transaction.update(gameRef, {
    gameState: 'rolling',
    round: newRound,
    'educatedMerchantState.currentTurnIndex': nextIndex,
    'educatedMerchantState.lastDiceRoll': deleteField(),
  });
}
