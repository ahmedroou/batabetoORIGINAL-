
'use server';

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

// -----------------------------
// Tunables & constants
// -----------------------------
const BOARD_SIZE = 28;
const START_MONEY = 1000;
const PASS_GO_REWARD = 200;
const ACTION_TIME_SECONDS = 35;
const MAX_FINES = 3;
const DEFAULT_FINE = 100;
const DEFAULT_MAX_ROUNDS = 20;
const COLORS = ['#F44336', '#2196F3', '#4CAF50', '#FFC107', '#9C27B0', '#009688', '#E91E63', '#607D8B'];
const DICE_MIN = 1;
const DICE_MAX = 5;

// -----------------------------
// Helpers
// -----------------------------
function nowTimestamp(): Timestamp {
  return Timestamp.now();
}

function addActionTimer(seconds = ACTION_TIME_SECONDS): Timestamp {
  return Timestamp.fromMillis(Date.now() + seconds * 1000);
}

function randomDiceRoll(): number {
  return Math.floor(Math.random() * (DICE_MAX - DICE_MIN + 1)) + DICE_MIN;
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

async function fetchRandomQuestion(category: string): Promise<EducatedMerchantQuestion> {
  const questionsCol = collection(db, 'educated_merchant_questions');
  const randomKey = Math.random();
  let q = query(questionsCol, where('category', '==', category), where('randomKey', '>=', randomKey), limit(1));
  let qs = await getDocs(q);
  if (qs.empty) {
    q = query(questionsCol, where('category', '==', category), where('randomKey', '<', randomKey), limit(1));
    qs = await getDocs(q);
  }
  if (qs.empty) throw new Error(`لا توجد أسئلة متاحة في قسم "${category}".`);

  const questionDoc = qs.docs[0];
  const questionData = { id: questionDoc.id, ...questionDoc.data() } as EducatedMerchantQuestion;
  const options = shuffle([...(questionData.dummyAnswers || []), questionData.answer]);
  questionData.options = options;
  return questionData;
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
  const propertyCategories = categories.filter(c => c !== 'قسم الغرامات');


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
      'educatedMerchantState.settings': { maxRounds: DEFAULT_MAX_ROUNDS, categories: categoriesResult.categories, diceMax: DICE_MAX },
      'educatedMerchantState.rollAnimationNonce': Date.now(),
    });
  });
}

export async function rollDice(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    let questionForFine: EducatedMerchantQuestion | null = null;

    // --- Pre-transaction logic ---
    const initialGameDoc = await getDoc(gameRef);
    if (!initialGameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const gameForPreCalc = initialGameDoc.data() as Game;

    if (gameForPreCalc.gameState !== 'rolling') throw new Error('ليس وقت رمي النرد.');
    const turnOrder = ensure(gameForPreCalc.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(gameForPreCalc.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('ليس دورك الآن.');
    
    const diceRollResult = randomDiceRoll();
    const playerForPreCalc = ensure(gameForPreCalc.players.find(p => p.id === playerId), 'اللاعب غير موجود.');
    const newPosition = (playerForPreCalc.position + diceRollResult) % BOARD_SIZE;
    const board = ensure(gameForPreCalc.educatedMerchantState?.board, 'اللوح غير موجود.');
    const precalculatedLandingProperty = ensure(board[newPosition], 'خانة غير موجودة على اللوح');

    let activityMessage = `${playerForPreCalc.name} رمى ${diceRollResult} وتحرك إلى "${precalculatedLandingProperty.name}".`;
    
    if (precalculatedLandingProperty.type === 'fine') {
        questionForFine = await fetchRandomQuestion('قسم الغرامات');
    }

    // --- Transaction logic ---
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
        const game = snap.data() as Game;

        const playerIndex = getPlayerIndexById(game.players, playerId);
        const player = game.players[playerIndex];
        const oldPosition = player.position;
        
        let localPlayers = [...game.players];
        localPlayers[playerIndex] = { ...player, position: newPosition };

        if (newPosition < oldPosition) {
            localPlayers[playerIndex].money = (localPlayers[playerIndex].money || 0) + PASS_GO_REWARD;
            activityMessage += ` ومر بنقطة البداية، وحصل على ${PASS_GO_REWARD} دينار.`
        }
        
        const firestoreUpdates: any = {
            players: localPlayers,
            'educatedMerchantState.rollAnimationNonce': Date.now(),
            'educatedMerchantState.lastDiceRoll': diceRollResult,
            'educatedMerchantState.timerEndsAt': addActionTimer(),
        };

        const localGameForNextStep: Game = {
            ...game,
            players: localPlayers,
            educatedMerchantState: {
                ...game.educatedMerchantState!,
                lastDiceRoll: diceRollResult,
            }
        };

        if (precalculatedLandingProperty.type === 'start') {
            const { updates } = endTurnInternal(localGameForNextStep, playerId, activityMessage, {});
            Object.assign(firestoreUpdates, updates);
        } else if (precalculatedLandingProperty.type === 'property') {
            if (!precalculatedLandingProperty.ownerId) {
                firestoreUpdates.gameState = 'property_action';
                firestoreUpdates['educatedMerchantState.activityLog'] = arrayUnion({message: activityMessage, timestamp: Timestamp.now()});
            } else if (precalculatedLandingProperty.ownerId !== playerId) {
                const ownerIndex = getPlayerIndexById(localPlayers, precalculatedLandingProperty.ownerId);
                const rent = precalculatedLandingProperty.rent || 0;
                let rentMessage = '';

                if ((localPlayers[playerIndex].money || 0) < rent) {
                    localPlayers[ownerIndex].money = (localPlayers[ownerIndex].money || 0) + (localPlayers[playerIndex].money || 0);
                    localPlayers[playerIndex].money = 0;
                    localPlayers[playerIndex].status = 'bankrupt';
                    localPlayers[playerIndex].bankruptAt = nowTimestamp();
                    rentMessage = `${activityMessage} لكنه أفلس لأنه لم يستطع دفع الإيجار لـ ${localPlayers[ownerIndex].name}.`;
                } else {
                    localPlayers[playerIndex].money = (localPlayers[playerIndex].money || 0) - rent;
                    localPlayers[ownerIndex].money = (localPlayers[ownerIndex].money || 0) + rent;
                    rentMessage = `${activityMessage} ودفع ${rent} دينار إيجار لـ ${localPlayers[ownerIndex].name}.`;
                }
                
                firestoreUpdates.players = localPlayers;
                localGameForNextStep.players = localPlayers; // Update local copy for endTurnInternal
                const { updates } = endTurnInternal(localGameForNextStep, playerId, rentMessage, {});
                Object.assign(firestoreUpdates, updates);
            } else {
                const { updates } = endTurnInternal(localGameForNextStep, playerId, `${activityMessage} فهو يملكها بالفعل.`, {});
                Object.assign(firestoreUpdates, updates);
            }
        } else if (precalculatedLandingProperty.type === 'fine') {
            firestoreUpdates.gameState = 'question';
            firestoreUpdates['educatedMerchantState.activityLog'] = arrayUnion({message: activityMessage, timestamp: Timestamp.now()});
            firestoreUpdates['educatedMerchantState.currentQuestion'] = questionForFine;
            firestoreUpdates['educatedMerchantState.pendingFine'] = { playerId, fineAmount: precalculatedLandingProperty.fineAmount ?? DEFAULT_FINE };
        } else {
            const { updates } = endTurnInternal(localGameForNextStep, playerId, activityMessage, {});
            Object.assign(firestoreUpdates, updates);
        }
        
        tx.update(gameRef, firestoreUpdates);
    });
}

export async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  
  const initialGameDoc = await getDoc(gameRef);
  if (!initialGameDoc.exists()) throw new Error('اللعبة غير موجودة.');
  const gameForPreCalc = initialGameDoc.data() as Game;

  if (gameForPreCalc.gameState !== 'property_action') throw new Error('ليس وقت شراء العقارات.');
  if (gameForPreCalc.educatedMerchantState?.turnOrder?.[gameForPreCalc.educatedMerchantState?.currentTurnIndex] !== playerId) {
    throw new Error('ليس دورك للشراء.');
  }
  const currentPlayer = ensure(gameForPreCalc.players.find((p) => p.id === playerId), 'Player disappeared');
  const propertyToBuy = ensure(gameForPreCalc.educatedMerchantState?.board?.[currentPlayer.position], 'Property disappeared');
  if (propertyToBuy.type !== 'property' || propertyToBuy.ownerId) throw new Error('هذا العقار غير متاح للشراء.');
  if ((currentPlayer.money || 0) < propertyToBuy.price) throw new Error('رصيدك لا يكفي لشراء هذا العقار.');
  
  const question = await fetchRandomQuestion(propertyToBuy.category);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;
    
    if (game.gameState !== 'property_action' || game.educatedMerchantState?.turnOrder?.[game.educatedMerchantState?.currentTurnIndex] !== playerId) {
      return;
    }

    const updatedPlayers = game.players.map((p) =>
      p.id === playerId ? { ...p, money: (p.money || 0) - propertyToBuy.price } : p
    );

    tx.update(gameRef, {
      players: updatedPlayers,
      gameState: 'question',
      'educatedMerchantState.currentQuestion': question,
      'educatedMerchantState.timerEndsAt': addActionTimer(),
      'educatedMerchantState.pendingPurchase': {
        playerId,
        propertyId: propertyToBuy.id,
        price: propertyToBuy.price,
        questionId: question.id,
        propertyName: propertyToBuy.name,
      },
    });
  });
}

export async function answerQuestion(gameId: string, playerId: string, answer: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let gameEnded = false;
  let finalGameDataForLeagueUpdate: Game | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;

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

    let localBoard = [...ensure(game.educatedMerchantState?.board, 'اللوح مفقود.')];
    let localPlayers = [...game.players];
    const playerIndex = getPlayerIndexById(localPlayers, playerId);
    let activityMessage = '';
    
    // This will hold the final state of the game for endTurnInternal
    let gameForNextStep: Game = { ...game }; 

    if (pendingPurchase) {
      const propertyName = pendingPurchase.propertyName || 'عقار مجهول';

      if (isCorrect) {
        const propertyIndex = localBoard.findIndex((p) => p.id === pendingPurchase.propertyId);
        if (propertyIndex !== -1) {
          localBoard[propertyIndex] = {
            ...localBoard[propertyIndex],
            ownerId: playerId,
            color: localPlayers[playerIndex].color,
          } as Property;
        }
        activityMessage = `${localPlayers[playerIndex].name} أجاب بشكل صحيح وامتلك "${propertyName}"!`;
        localPlayers[playerIndex].propertiesCount = (localPlayers[playerIndex].propertiesCount || 0) + 1;
      } else {
        const refund = Math.round(pendingPurchase.price / 4);
        localPlayers[playerIndex] = { ...localPlayers[playerIndex], money: (localPlayers[playerIndex].money || 0) + refund };
        activityMessage = `${localPlayers[playerIndex].name} أجاب بشكل خاطئ على سؤال "${propertyName}" واسترد ${refund} دينار.`;
      }
    } else if (pendingFine) {
      if (isCorrect) {
        activityMessage = `${localPlayers[playerIndex].name} أجاب بشكل صحيح ونجا من الغرامة!`;
      } else {
        const fine = pendingFine.fineAmount ?? DEFAULT_FINE;
        if ((localPlayers[playerIndex].money || 0) < fine) {
          localPlayers[playerIndex].money = 0;
          localPlayers[playerIndex].status = 'bankrupt';
          localPlayers[playerIndex].bankruptAt = nowTimestamp();
          activityMessage = `${localPlayers[playerIndex].name} أجاب خطأ وأفلس لأنه لم يستطع دفع الغرامة.`;
        } else {
          localPlayers[playerIndex].money = (localPlayers[playerIndex].money || 0) - fine;
          activityMessage = `${localPlayers[playerIndex].name} أجاب خطأ ودفع غرامة ${fine} دينار.`;
        }
      }
    }

    // Construct a representation of the game state AFTER this action for endTurnInternal
    gameForNextStep.players = localPlayers;
    if (gameForNextStep.educatedMerchantState) {
        gameForNextStep.educatedMerchantState.board = localBoard;
    }
    
    const { updates, isGameOver } = endTurnInternal(gameForNextStep, playerId, activityMessage);
    gameEnded = isGameOver;

    if (isGameOver) {
      finalGameDataForLeagueUpdate = { ...game, ...updates };
    }

    tx.update(gameRef, updates);
  });

  if (gameEnded && finalGameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
  }
}

export async function handleTimeout(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;

    if (game.hostId !== hostId) return;
    if (!game.educatedMerchantState?.timerEndsAt || Date.now() < game.educatedMerchantState.timerEndsAt.toMillis()) {
      return;
    }

    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
    const currentPlayerId = turnOrder[currentTurnIndex];
    const currentPlayer = game.players.find((p) => p.id === currentPlayerId);

    let activityMessage = `انتهى وقت اللاعب ${currentPlayer?.name} وتخطى دوره.`;
    let updates: any;
    let localGameCopy = {...game}; // Create a local copy to modify

    if (game.gameState === 'rolling' || game.gameState === 'property_action') {
      ({ updates } = endTurnInternal(game, currentPlayerId, activityMessage));
    } else if (game.gameState === 'question') {
        const pendingPurchase = game.educatedMerchantState?.pendingPurchase;
        const pendingFine = game.educatedMerchantState?.pendingFine;
        
        let localPlayers = [...game.players];

        if (pendingPurchase) {
            const playerIndex = getPlayerIndexById(localPlayers, pendingPurchase.playerId);
            const refund = Math.round((pendingPurchase.price || 0) / 4);
            localPlayers[playerIndex].money = (localPlayers[playerIndex].money || 0) + refund;
            activityMessage = `${currentPlayer?.name} لم يجب في الوقت واسترد ${refund} دينار.`;
        } else if (pendingFine) {
            const playerIndex = getPlayerIndexById(localPlayers, pendingFine.playerId);
            const fine = (pendingFine.fineAmount ?? DEFAULT_FINE);
            if ((localPlayers[playerIndex].money || 0) < fine) {
                localPlayers[playerIndex].money = 0;
                localPlayers[playerIndex].status = 'bankrupt';
                localPlayers[playerIndex].bankruptAt = nowTimestamp();
            } else {
                localPlayers[playerIndex].money = (localPlayers[playerIndex].money || 0) - fine;
            }
            activityMessage = `${currentPlayer?.name} لم يجب في الوقت وتم تطبيق الغرامة.`;
        } else {
            return;
        }
        
        // Update local copy of game with player changes before passing to endTurnInternal
        localGameCopy.players = localPlayers;
        
        const { updates: turnEndUpdates } = endTurnInternal(localGameCopy, currentPlayerId, activityMessage);
        updates = turnEndUpdates;
        // Clean up the pending states after processing them
        updates['educatedMerchantState.pendingPurchase'] = deleteField();
        updates['educatedMerchantState.pendingFine'] = deleteField();
        updates['educatedMerchantState.currentQuestion'] = deleteField();

    } else {
      return; // No action needed for other states on timeout
    }

    if (updates && Object.keys(updates).length > 0) {
      tx.update(gameRef, updates);
    }
  });
}

function endTurnInternal(
  game: Game,
  playerId: string,
  extraMessage: string = '',
): { isGameOver: boolean; updates: any } {
  let updatedBoard = [...(game.educatedMerchantState?.board || [])];
  let updatedPlayers = [...game.players];

  // Release properties of any newly bankrupted players
  updatedBoard = updatedBoard.map((prop) => {
    const owner = updatedPlayers.find((p) => p.id === prop.ownerId);
    if (owner && owner.status === 'bankrupt') {
      return { ...prop, ownerId: null, color: undefined } as Property;
    }
    return prop;
  });

  updatedPlayers = updatedPlayers.map((p) => {
    if (p.status === 'bankrupt' && (p.money || 0) > 0) return { ...p, money: 0 };
    return p;
  });

  const activePlayers = updatedPlayers.filter((p) => p.status === 'alive');

  if (activePlayers.length <= 1) {
    const winner = activePlayers[0];
    const ranking = [...updatedPlayers]
      .sort((a, b) => {
        if (a.status === 'alive' && b.status !== 'alive') return -1;
        if (b.status === 'alive' && a.status !== 'alive') return 1;
        if (a.status === 'bankrupt' && b.status === 'bankrupt')
          return ((b.bankruptAt as Timestamp)?.toMillis() || 0) - ((a.bankruptAt as Timestamp)?.toMillis() || 0);
        return (b.money || 0) - (a.money || 0);
      })
      .map((p, i) => ({ playerId: p.id, name: p.name, rank: i + 1, bankruptAt: p.bankruptAt || null }));

    const finalGameData: any = {
      gameState: 'final_results',
      gameResult: { winner: winner?.id || 'none', message: `اللاعب ${winner?.name || ''} هو الناجي الأخير!`, ranking },
      players: updatedPlayers,
      'educatedMerchantState.timerEndsAt': deleteField(),
    };
    return { isGameOver: true, updates: finalGameData };
  }

  const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود أثناء إنهاء الدور.');
  const currentTurnIndex = ensure(
    game.educatedMerchantState?.currentTurnIndex,
    'فهرس الدور الحالي مفقود.'
  );

  let nextTurnIndex = findNextAliveIndex(turnOrder, updatedPlayers, currentTurnIndex);

  if (nextTurnIndex === -1) {
    const contenders = updatedPlayers.filter((p) => p.status === 'alive');
    if (contenders.length === 0) {
      return {
        isGameOver: true,
        updates: { gameState: 'final_results', gameResult: { winner: 'none', message: 'انتهت اللعبة: لا يوجد فائز.' }, players: updatedPlayers },
      };
    }
    const winner = contenders.reduce((a, b) => ((a.money || 0) > (b.money || 0) ? a : b));
    const finalGameData: any = {
      gameState: 'final_results',
      gameResult: { winner: winner?.id || 'none', message: `انتهت اللعبة: الفائز هو ${winner?.name || ''} بأعلى رصيد.` },
      players: updatedPlayers,
    };
    return { isGameOver: true, updates: finalGameData };
  }

  const currentMoves = game.educatedMerchantState?.movesThisRound || 0;
  let newMoves = currentMoves + 1;
  let newRound = game.round || 1;

  if (newMoves >= activePlayers.length) {
    newRound++;
    newMoves = 0;
  }

  const maxRounds = game.educatedMerchantState?.settings?.maxRounds || DEFAULT_MAX_ROUNDS;

  if (newRound > maxRounds) {
    const contenders = updatedPlayers.filter((p) => p.status !== 'bankrupt');
    if (contenders.length === 0) {
      return {
        isGameOver: true,
        updates: { gameState: 'final_results', gameResult: { winner: 'none', message: 'انتهت اللعبة: لا يوجد فائز.' }, players: updatedPlayers },
      };
    }
    const winner = contenders.reduce((a, b) => ((a.money || 0) > (b.money || 0) ? a : b));
    const ranking = [...updatedPlayers]
      .sort((a, b) => (b.money || 0) - (a.money || 0))
      .map((p, i) => ({ playerId: p.id, name: p.name, rank: i + 1, bankruptAt: p.bankruptAt || null }));
    const finalGameData: any = {
      gameState: 'final_results',
      gameResult: { winner: winner?.id || 'none', message: `انتهت الجولات! الفائز هو ${winner?.name || ''} بأعلى رصيد.`, ranking },
      players: updatedPlayers,
    };
    return { isGameOver: true, updates: finalGameData };
  }

  const finalUpdates: any = {
    gameState: 'rolling',
    'educatedMerchantState.board': updatedBoard,
    'educatedMerchantState.currentTurnIndex': nextTurnIndex,
    'educatedMerchantState.lastDiceRoll': deleteField(),
    'educatedMerchantState.timerEndsAt': addActionTimer(),
    round: newRound,
    players: updatedPlayers,
    'educatedMerchantState.movesThisRound': newMoves,
  };

  if (extraMessage) {
    finalUpdates['educatedMerchantState.activityLog'] = arrayUnion({
      message: extraMessage,
      timestamp: Timestamp.now(),
    });
  }

  return { isGameOver: false, updates: finalUpdates };
}


export async function endTurn(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;

    if (game.gameState !== 'property_action') return;

    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('ليس دورك لإنهاء الجولة.');

    const { updates } = endTurnInternal(
      game,
      playerId,
      `${game.players.find((p) => p.id === playerId)?.name} قرر تخطي دوره.`
    );
    tx.update(gameRef, updates);
  });
}

    
    