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
  setDoc,
  updateDoc,
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

const BOARD_SIZE = 28;
const STARTING_BALANCE = 1000;
const BASE_PROPERTY_PRICE = 100;
const MAX_PROPERTY_PRICE = 500;
const PRICE_INCREMENT = 50; // To make it easier to be divisible by 4
const PASS_START_BONUS = 150;
const QUESTION_TIME_SECONDS = 25;

async function getAvailableCategories(): Promise<string[]> {
  const settingsDocRef = doc(db, 'game_settings', 'educated_merchant_categories');
  const settingsSnap = await getDoc(settingsDocRef);
  if (settingsSnap.exists()) {
    const data = settingsSnap.data() as any;
    if (Array.isArray(data.list) && data.list.length > 0) return data.list;
  }
  return ["علوم", "رياضيات", "برمجة", "أحياء", "كيمياء"];
}

async function fetchQuestionsForBoard(categories: string[]): Promise<Map<string, EducatedMerchantQuestion[]>> {
    const questionsByCat = new Map<string, EducatedMerchantQuestion[]>();
    const questionsCol = collection(db, 'trap_answer_questions');

    for (const category of categories) {
        // Fetch a random batch of questions for each category to keep it efficient
        const randomKey = Math.random();
        const q = query(questionsCol, where("category", "==", category), where("randomKey", ">=", randomKey), limit(20));
        const querySnapshot = await getDocs(q);

        const questions = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const correctAnswer = data.answer as string;
            const dummyAnswers = Array.isArray(data.dummyAnswers) && data.dummyAnswers.length > 0
                ? data.dummyAnswers
                : ['بديل ١', 'بديل ٢', 'بديل ٣'];
            const chosenDummies = shuffle(dummyAnswers).slice(0, 3);
            const options = shuffle([correctAnswer, ...chosenDummies]);
            return {
                id: doc.id,
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


function generateBoard(categories: string[]): Property[] {
  const board: Property[] = [];
  if (categories.length === 0) return [];

  const shuffledPropertyNames = shuffle([...PROPERTY_NAMES]);

  const priceCount = Math.floor((MAX_PROPERTY_PRICE - BASE_PROPERTY_PRICE) / PRICE_INCREMENT) + 1;
  const propertyPrices = Array.from({ length: priceCount }, (_, i) => BASE_PROPERTY_PRICE + i * PRICE_INCREMENT);
  
  for (let i = 0; i < BOARD_SIZE; i++) {
    const propertyName = shuffledPropertyNames[i % shuffledPropertyNames.length] || `عقار ${i}`;
    if (i === 0) {
      board.push({ id: i, type: 'start', name: 'نقطة البداية', category: 'special', price: 0, rent: 0, ownerId: null });
    } else if (i === 7 || i === 21) {
       const fineAmount = i === 7 ? 50 : 100;
       board.push({ id: i, type: 'fine', name: 'غرامة', category: 'special', price: 0, rent: 0, ownerId: null, fineAmount });
    } else {
      const category = categories[i % categories.length] || 'عام';
      const price = propertyPrices[i % propertyPrices.length] || BASE_PROPERTY_PRICE;
      board.push({ id: i, type: 'property', name: propertyName, category, price, rent: Math.floor(price * 0.25), ownerId: null });
    }
  }
  return board;
}

async function getNextQuestionFromPool(category: string, questionsPool: Map<string, EducatedMerchantQuestion[]>): Promise<EducatedMerchantQuestion | null> {
    const categoryQuestions = questionsPool.get(category);
    if (!categoryQuestions || categoryQuestions.length === 0) {
        const newQuestions = await fetchQuestionsForBoard([category]);
        const newPool = newQuestions.get(category);
        if (!newPool || newPool.length === 0) return null;
        questionsPool.set(category, newPool);
        return newPool.pop() || null;
    }
    return categoryQuestions.pop() || null;
}

export async function updateEducatedMerchantSettings(gameId: string, hostId: string, settings: Game['educatedMerchantState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'educatedMerchantState.settings': settings });
    });
}

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    let gameDataForLeagueUpdate: Game | null = null;
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

        const questionsPool = await fetchQuestionsForBoard(availableCategories);
        const board = generateBoard(availableCategories);
        
        const turnOrder = shuffle(game.players.map(p => p.id));
        const initialBalances = game.players.reduce((acc: Record<string, number>, p) => {
          acc[p.id] = STARTING_BALANCE;
          return acc;
        }, {});
        
        const playerColors = ['#3B82F6', '#A855F7', '#F97316', '#10B981', '#EF4444', '#6366F1'];
        const updatedPlayers = game.players.map((p, index) => ({ ...p, position: 0, bankruptAt: null, status: 'alive', color: playerColors[index % playerColors.length] }));

        transaction.update(gameRef, {
          gameState: 'rolling',
          'educatedMerchantState.board': board,
          'educatedMerchantState.questionsByCategory': Object.fromEntries(questionsPool),
          'educatedMerchantState.turnOrder': turnOrder,
          'educatedMerchantState.currentTurnIndex': 0,
          'educatedMerchantState.activityLog': ['بدأت اللعبة!'],
          playerScores: initialBalances,
          players: updatedPlayers,
          round: 1,
        });
    });
     if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}

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

      diceResult = Math.floor(Math.random() * 5) + 1; // From 1 to 5

      const playerIndex = game.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) throw new Error('Player not found');

      const newActivityLog = [...(es.activityLog || []), `${game.players[playerIndex].name} رمى النرد وحصل على ${diceResult}.`];
      
      const gameWithDiceResult = { ...game, educatedMerchantState: { ...es, lastDiceRoll: diceResult, activityLog: newActivityLog }};

      transaction.update(gameRef, {
        gameState: 'movement',
        'educatedMerchantState.lastDiceRoll': diceResult,
        'educatedMerchantState.activityLog': newActivityLog,
      });

      // After updating, handle the move in the same transaction
      await handlePropertyAction(gameRef, gameWithDiceResult, transaction);
    });

    return { success: true, diceResult };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function handlePropertyAction(gameRef: DocumentReference, game: Game, transaction: Transaction) {
    const es = game.educatedMerchantState;
    if (!es) throw new Error('Game state is not initialized.');

    const activePlayerId = es.turnOrder[es.currentTurnIndex];
    const playerIndex = game.players.findIndex(p => p.id === activePlayerId);
    if (playerIndex === -1) throw new Error('Player not found in game.');
    
    let player = game.players[playerIndex];
    let updatedPlayers = [...game.players];
    let updatedBalances = { ...(game.playerScores || {}) };
    let newActivityLog = [...(es.activityLog || [])];

    const dice = es.lastDiceRoll || 0;
    const oldPosition = player.position || 0;
    const newPosition = (oldPosition + dice) % BOARD_SIZE;
    const passedStart = (oldPosition + dice) >= BOARD_SIZE;

    player = { ...player, position: newPosition };
    updatedPlayers[playerIndex] = player;
    
    if (passedStart) {
        updatedBalances[activePlayerId] = (updatedBalances[activePlayerId] || 0) + PASS_START_BONUS;
        newActivityLog.push(`${player.name} مر بنقطة البداية وحصل على ${PASS_START_BONUS} د.ع.`);
    }

    const newProperty = es.board.find((b: Property) => b.id === newPosition);
    if (!newProperty) throw new Error('Property not found on board.');
    
    let nextState: GameState = 'rolling'; // Default next state

    if (newProperty.type === 'fine') {
        const fine = newProperty.fineAmount || 0;
        newActivityLog.push(`${player.name} دفع غرامة بقيمة ${fine} د.ع.`);
        if ((updatedBalances[activePlayerId] || 0) < fine) {
          updatedBalances[activePlayerId] = 0;
          updatedPlayers[playerIndex].status = 'bankrupt';
          updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
          newActivityLog.push(`${player.name} أفلس!`);
        } else {
            updatedBalances[activePlayerId] -= fine;
        }
        await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, activePlayerId, transaction);
        return;
    }

    if (newProperty.type === 'property') {
      if (newProperty.ownerId && newProperty.ownerId !== activePlayerId) {
        const rent = newProperty.rent || 0;
        const owner = game.players.find(p => p.id === newProperty.ownerId);
        newActivityLog.push(`${player.name} دفع إيجارًا بقيمة ${rent} د.ع إلى ${owner?.name || 'المالك'}.`);
        if ((updatedBalances[activePlayerId] || 0) < rent) {
          updatedBalances[newProperty.ownerId] += updatedBalances[activePlayerId];
          updatedBalances[activePlayerId] = 0;
          updatedPlayers[playerIndex].status = 'bankrupt';
          updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
          newActivityLog.push(`${player.name} أفلس!`);
        } else {
          updatedBalances[activePlayerId] -= rent;
          updatedBalances[newProperty.ownerId] += rent;
        }
        await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, activePlayerId, transaction);
        return;
      } else if (!newProperty.ownerId) {
        newActivityLog.push(`${player.name} توقف على ${newProperty.name}.`);
        nextState = 'property_action';
      }
    }
    
    if (nextState === 'rolling') {
       await endTurn(gameRef, { ...game, players: updatedPlayers, playerScores: updatedBalances, educatedMerchantState: { ...es, activityLog: newActivityLog } }, activePlayerId, transaction);
    } else {
        transaction.update(gameRef, { gameState: nextState, players: updatedPlayers, playerScores: updatedBalances, 'educatedMerchantState.activityLog': newActivityLog });
    }
}


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

      const randomQuestion = await getNextQuestionFromPool(property.category, new Map(Object.entries(es.questionsByCategory || {})));
      if (!randomQuestion) throw new Error(`No questions available for category "${property.category}". The purchase cannot proceed.`);

      const activity = `${player.name} قرر شراء ${property.name} (قيد الاختبار)`;
      const pendingPurchase = { playerId, propertyId: property.id, price: property.price, questionId: randomQuestion.id };

      transaction.update(gameRef, {
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
      
      const player = game.players.find(p => p.id === playerId);
      if (!player) throw new Error('Player not found.');
      
      const propIndex = es.board.findIndex((b: Property) => b.id === pending.propertyId);
      if (propIndex === -1) throw new Error('Property not found');
      
      const isCorrect = answer === question.correctAnswer;
      const newBoard = [...es.board];
      const newActivityLog = [...(es.activityLog || [])];
      let updates: any = {};
      const playerBalanceUpdate = { ...game.playerScores };

      if (isCorrect) {
        playerBalanceUpdate[playerId] = (playerBalanceUpdate[playerId] || 0) - pending.price;
        newBoard[propIndex] = { ...newBoard[propIndex], ownerId: playerId };
        newActivityLog.push(`${player.name} أجاب بشكل صحيح وامتلك ${newBoard[propIndex].name}.`);
      } else {
        const refund = Math.floor(pending.price / 4);
        playerBalanceUpdate[playerId] = (playerBalanceUpdate[playerId] || 0) - pending.price + refund;
        newActivityLog.push(`${player.name} أجاب بشكل خاطئ! واسترد ${refund} د.ع فقط.`);
      }

      updates = {
        'educatedMerchantState.currentQuestion': deleteField(),
        'educatedMerchantState.timerEndsAt': deleteField(),
        'educatedMerchantState.pendingPurchase': deleteField(),
        'educatedMerchantState.activityLog': newActivityLog,
        'educatedMerchantState.board': newBoard,
        'playerScores': playerBalanceUpdate,
      };

      transaction.update(gameRef, updates);

      const updatedGameForNextStep: Game = {
        ...game,
        educatedMerchantState: { ...es, activityLog: newActivityLog, board: newBoard },
        playerScores: playerBalanceUpdate,
      };

      await endTurn(gameRef, updatedGameForNextStep, playerId, transaction);
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function endTurn(gameRef: DocumentReference | string, game?: Game, playerId?: string, transaction?: Transaction) {
    let finalGameRef = typeof gameRef === 'string' ? doc(db, 'games', gameRef) : gameRef;

    const executeEndTurn = async (trans: Transaction) => {
        const gameSnap = game ? null : await trans.get(finalGameRef);
        const currentGame = game || (gameSnap?.data() as Game);
        if (!currentGame) throw new Error("Game data is missing.");
        
        const es = currentGame.educatedMerchantState;
        if (!es) throw new Error('Game state not initialized.');

        const nonBankruptPlayers = currentGame.players.filter(p => p.status !== 'bankrupt');
        if (nonBankruptPlayers.length <= 1) {
            const winner = nonBankruptPlayers[0];
            trans.update(finalGameRef, {
                gameState: 'final_results',
                gameResult: { winner: winner?.id || 'game_over', message: 'انتهت اللعبة بإفلاس المنافسين!' },
                'educatedMerchantState.lastDiceRoll': deleteField(),
            });
            await updateLeagueScoresForGameEnd({ ...currentGame, gameState: 'final_results', gameResult: { winner: winner?.id || 'game_over', message: '' } });
            return;
        }

        let nextIndex = (es.currentTurnIndex + 1) % es.turnOrder.length;
        let loopGuard = 0;
        while (currentGame.players.find(p => p.id === es.turnOrder[nextIndex])?.status === 'bankrupt' && loopGuard < es.turnOrder.length * 2) {
            nextIndex = (nextIndex + 1) % es.turnOrder.length;
            loopGuard++;
        }

        let newRound = currentGame.round || 1;
        if (nextIndex < es.currentTurnIndex) {
            newRound++;
        }

        const maxRounds = es.settings?.maxRounds || 20;
        if (newRound > maxRounds) {
            const finalWinner = currentGame.players
                .filter(p => p.status !== 'bankrupt')
                .sort((a, b) => (currentGame.playerScores?.[b.id] || 0) - (currentGame.playerScores?.[a.id] || 0))[0];
            
            trans.update(finalGameRef, {
                gameState: 'final_results',
                gameResult: { winner: finalWinner?.id || 'game_over', message: 'انتهت الجولات!' },
                'educatedMerchantState.lastDiceRoll': deleteField(),
            });
            await updateLeagueScoresForGameEnd({ ...currentGame, gameState: 'final_results', gameResult: { winner: finalWinner?.id || 'game_over', message: '' } });
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
