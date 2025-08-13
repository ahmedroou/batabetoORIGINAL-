

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
    if (game.players.length < 2) throw new Error("اللعبة تتطلب لاعبين على الأقل.");

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
    const board = ensure(gameForPreCalc.educatedMerchantState?.board, 'اللوح مفقود.');
    
    const newPosition = (playerForPreCalc.position + diceRollResult) % BOARD_SIZE;
    const landingProperty = ensure(board[newPosition], 'خانة غير موجودة على اللوح');

    let questionForFine: EducatedMerchantQuestion | null = null;
    if (landingProperty.type === 'fine') {
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
        
        // --- Prepare local and firestore updates ---
        const localGameCopy = JSON.parse(JSON.stringify(game)); // Deep copy
        const firestoreUpdates: any = {
            'educatedMerchantState.rollAnimationNonce': Date.now(),
            'educatedMerchantState.lastDiceRoll': diceRollResult,
        };

        // --- Apply player movement and GO reward ---
        localGameCopy.players[playerIndex].position = newPosition;
        let activityMessage = `${player.name} رمى ${diceRollResult} وتحرك إلى "${landingProperty.name}".`;
        if (newPosition < oldPosition) {
            localGameCopy.players[playerIndex].money = (localGameCopy.players[playerIndex].money || 0) + PASS_GO_REWARD;
            activityMessage += ` ومر بنقطة البداية، وحصل على ${PASS_GO_REWARD} دينار.`;
        }
        firestoreUpdates.players = localGameCopy.players;
        localGameCopy.educatedMerchantState.lastDiceRoll = diceRollResult;

        // --- Determine next game state based on landing tile ---
        if (landingProperty.type === 'start') {
            const { updates } = endTurnInternal(localGameCopy, playerId, activityMessage);
            Object.assign(firestoreUpdates, updates);
        } else if (landingProperty.type === 'property') {
            if (!landingProperty.ownerId) {
                firestoreUpdates.gameState = 'property_action';
                firestoreUpdates['educatedMerchantState.timerEndsAt'] = addActionTimer();
                firestoreUpdates['educatedMerchantState.activityLog'] = arrayUnion({ message: activityMessage, timestamp: Timestamp.now() });
            } else if (landingProperty.ownerId !== playerId) {
                const ownerIndex = getPlayerIndexById(localGameCopy.players, landingProperty.ownerId);
                const rent = landingProperty.rent || 0;
                let rentMessage = '';

                if ((localGameCopy.players[playerIndex].money || 0) < rent) {
                    localGameCopy.players[ownerIndex].money = (localGameCopy.players[ownerIndex].money || 0) + (localGameCopy.players[playerIndex].money || 0);
                    localGameCopy.players[playerIndex].money = 0;
                    localGameCopy.players[playerIndex].status = 'bankrupt';
                    localGameCopy.players[playerIndex].bankruptAt = nowTimestamp();
                    rentMessage = `${activityMessage} لكنه أفلس لأنه لم يستطع دفع الإيجار لـ ${localGameCopy.players[ownerIndex].name}.`;
                } else {
                    localGameCopy.players[playerIndex].money = (localGameCopy.players[playerIndex].money || 0) - rent;
                    localGameCopy.players[ownerIndex].money = (localGameCopy.players[ownerIndex].money || 0) + rent;
                    rentMessage = `${activityMessage} ودفع ${rent} دينار إيجار لـ ${localGameCopy.players[ownerIndex].name}.`;
                }
                
                firestoreUpdates.players = localGameCopy.players;
                const { updates } = endTurnInternal(localGameCopy, playerId, rentMessage);
                Object.assign(firestoreUpdates, updates);
            } else {
                const { updates } = endTurnInternal(localGameCopy, playerId, `${activityMessage} فهو يملكها بالفعل.`);
                Object.assign(firestoreUpdates, updates);
            }
        } else if (landingProperty.type === 'fine') {
            firestoreUpdates.gameState = 'question';
            firestoreUpdates['educatedMerchantState.timerEndsAt'] = addActionTimer();
            firestoreUpdates['educatedMerchantState.activityLog'] = arrayUnion({ message: activityMessage, timestamp: Timestamp.now() });
            firestoreUpdates['educatedMerchantState.currentQuestion'] = questionForFine;
            firestoreUpdates['educatedMerchantState.pendingFine'] = { playerId, fineAmount: landingProperty.fineAmount ?? DEFAULT_FINE };
        }
        
        tx.update(gameRef, firestoreUpdates);
    });
}


export async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  
  // Pre-transaction logic
  const initialGameDoc = await getDoc(gameRef);
  if (!initialGameDoc.exists()) throw new Error('اللعبة غير موجودة.');
  const game = initialGameDoc.data() as Game;

  if (game.gameState !== 'property_action') throw new Error('ليس وقت شراء العقارات.');
  if (game.educatedMerchantState?.turnOrder?.[game.educatedMerchantState?.currentTurnIndex] !== playerId) {
    throw new Error('ليس دورك للشراء.');
  }
  const currentPlayer = ensure(game.players.find((p) => p.id === playerId), 'Player disappeared');
  const propertyToBuy = ensure(game.educatedMerchantState?.board?.[currentPlayer.position], 'Property disappeared');
  if (propertyToBuy.type !== 'property' || propertyToBuy.ownerId) throw new Error('هذا العقار غير متاح للشراء.');
  if ((currentPlayer.money || 0) < propertyToBuy.price) throw new Error('رصيدك لا يكفي لشراء هذا العقار.');
  
  const question = await fetchRandomQuestion(propertyToBuy.category);

  // Transaction logic
  await runTransaction(db, async (tx) => {
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

    // Create a deep copy for local manipulation
    const localGameCopy = JSON.parse(JSON.stringify(game));
    const playerIndex = getPlayerIndexById(localGameCopy.players, playerId);
    let activityMessage = '';
    
    if (pendingPurchase) {
      const propertyName = pendingPurchase.propertyName || 'عقار مجهول';
      if (isCorrect) {
        const propertyIndex = localGameCopy.educatedMerchantState.board.findIndex((p: Property) => p.id === pendingPurchase.propertyId);
        if (propertyIndex !== -1) {
          localGameCopy.educatedMerchantState.board[propertyIndex].ownerId = playerId;
          localGameCopy.educatedMerchantState.board[propertyIndex].color = localGameCopy.players[playerIndex].color;
        }
        activityMessage = `${localGameCopy.players[playerIndex].name} أجاب بشكل صحيح وامتلك "${propertyName}"!`;
        localGameCopy.players[playerIndex].propertiesCount = (localGameCopy.players[playerIndex].propertiesCount || 0) + 1;
      } else {
        const refund = Math.round(pendingPurchase.price / 4);
        localGameCopy.players[playerIndex].money = (localGameCopy.players[playerIndex].money || 0) + refund;
        activityMessage = `${localGameCopy.players[playerIndex].name} أجاب بشكل خاطئ على سؤال "${propertyName}" واسترد ${refund} دينار.`;
      }
    } else if (pendingFine) {
      if (isCorrect) {
        activityMessage = `${localGameCopy.players[playerIndex].name} أجاب بشكل صحيح ونجا من الغرامة!`;
      } else {
        const fine = pendingFine.fineAmount ?? DEFAULT_FINE;
        if ((localGameCopy.players[playerIndex].money || 0) < fine) {
          localGameCopy.players[playerIndex].money = 0;
          localGameCopy.players[playerIndex].status = 'bankrupt';
          localGameCopy.players[playerIndex].bankruptAt = nowTimestamp();
          activityMessage = `${localGameCopy.players[playerIndex].name} أجاب خطأ وأفلس لأنه لم يستطع دفع الغرامة.`;
        } else {
          localGameCopy.players[playerIndex].money = (localGameCopy.players[playerIndex].money || 0) - fine;
          activityMessage = `${localGameCopy.players[playerIndex].name} أجاب خطأ ودفع غرامة ${fine} دينار.`;
        }
      }
    }

    const { updates, isGameOver } = endTurnInternal(localGameCopy, playerId, activityMessage);
    gameEnded = isGameOver;

    if (isGameOver) {
      finalGameDataForLeagueUpdate = { ...game, ...updates };
    }

    // Always clear pending states
    updates['educatedMerchantState.pendingPurchase'] = deleteField();
    updates['educatedMerchantState.pendingFine'] = deleteField();
    updates['educatedMerchantState.currentQuestion'] = deleteField();
    
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
    let localGameCopy = JSON.parse(JSON.stringify(game)); 

    if (game.gameState === 'rolling' || game.gameState === 'property_action') {
      ({ updates, isGameOver: gameEnded } = endTurnInternal(game, currentPlayerId, activityMessage));
       if (gameEnded) finalGameDataForLeagueUpdate = { ...game, ...updates };
    } else if (game.gameState === 'question') {
        const pendingPurchase = game.educatedMerchantState?.pendingPurchase;
        const pendingFine = game.educatedMerchantState?.pendingFine;
        
        if (pendingPurchase) {
            const playerIndex = getPlayerIndexById(localGameCopy.players, pendingPurchase.playerId);
            const refund = Math.round((pendingPurchase.price || 0) / 4);
            localGameCopy.players[playerIndex].money = (localGameCopy.players[playerIndex].money || 0) + refund;
            activityMessage = `${currentPlayer?.name} لم يجب في الوقت واسترد ${refund} دينار.`;
        } else if (pendingFine) {
            const playerIndex = getPlayerIndexById(localGameCopy.players, pendingFine.playerId);
            const fine = (pendingFine.fineAmount ?? DEFAULT_FINE);
            if ((localGameCopy.players[playerIndex].money || 0) < fine) {
                localGameCopy.players[playerIndex].money = 0;
                localGameCopy.players[playerIndex].status = 'bankrupt';
                localGameCopy.players[playerIndex].bankruptAt = nowTimestamp();
            } else {
                localGameCopy.players[playerIndex].money = (localGameCopy.players[playerIndex].money || 0) - fine;
            }
            activityMessage = `${currentPlayer?.name} لم يجب في الوقت وتم تطبيق الغرامة.`;
        }
        
        ({ updates, isGameOver: gameEnded } = endTurnInternal(localGameCopy, currentPlayerId, activityMessage));
        if (gameEnded) finalGameDataForLeagueUpdate = { ...localGameCopy, ...updates };
        
        updates['educatedMerchantState.pendingPurchase'] = deleteField();
        updates['educatedMerchantState.pendingFine'] = deleteField();
        updates['educatedMerchantState.currentQuestion'] = deleteField();

    } else {
      return; 
    }

    if (updates && Object.keys(updates).length > 0) {
      tx.update(gameRef, updates);
    }
  });

   if (gameEnded && finalGameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
    }
}

function endTurnInternal(
  game: Game,
  playerId: string,
  extraMessage: string = '',
): { isGameOver: boolean; updates: any } {
  const localGameCopy = JSON.parse(JSON.stringify(game));

  // Release properties of any newly bankrupted players
  localGameCopy.educatedMerchantState.board = localGameCopy.educatedMerchantState.board.map((prop: Property) => {
    const owner = localGameCopy.players.find((p: Player) => p.id === prop.ownerId);
    if (owner && owner.status === 'bankrupt') {
      return { ...prop, ownerId: null, color: undefined };
    }
    return prop;
  });

  localGameCopy.players = localGameCopy.players.map((p: Player) => {
    if (p.status === 'bankrupt' && (p.money || 0) > 0) return { ...p, money: 0 };
    return p;
  });

  const activePlayers = localGameCopy.players.filter((p: Player) => p.status === 'alive');

  if (activePlayers.length <= 1) {
    const winner = activePlayers[0];
    const ranking = [...localGameCopy.players]
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
      players: localGameCopy.players,
      'educatedMerchantState.timerEndsAt': deleteField(),
      'educatedMerchantState.board': localGameCopy.educatedMerchantState.board,
      'educatedMerchantState.activityLog': arrayUnion({ message: extraMessage, timestamp: Timestamp.now() }),
    };
    return { isGameOver: true, updates: finalGameData };
  }

  const turnOrder = ensure(localGameCopy.educatedMerchantState.turnOrder, 'Turn order missing');
  const currentTurnIndex = ensure(localGameCopy.educatedMerchantState.currentTurnIndex, 'Current turn index missing.');

  let nextTurnIndex = findNextAliveIndex(turnOrder, localGameCopy.players, currentTurnIndex);

  const currentMoves = localGameCopy.educatedMerchantState?.movesThisRound || 0;
  let newMoves = currentMoves + 1;
  let newRound = localGameCopy.round || 1;

  if (newMoves >= activePlayers.length) {
    newRound++;
    newMoves = 0;
  }

  const maxRounds = localGameCopy.educatedMerchantState?.settings?.maxRounds || DEFAULT_MAX_ROUNDS;

  if (newRound > maxRounds) {
    const winner = activePlayers.reduce((a, b) => ((a.money || 0) > (b.money || 0) ? a : b));
    const ranking = [...localGameCopy.players]
      .sort((a, b) => (b.money || 0) - (a.money || 0))
      .map((p, i) => ({ playerId: p.id, name: p.name, rank: i + 1, bankruptAt: p.bankruptAt || null }));
    const finalGameData: any = {
      gameState: 'final_results',
      gameResult: { winner: winner?.id || 'none', message: `انتهت الجولات! الفائز هو ${winner?.name || ''} بأعلى رصيد.`, ranking },
      players: localGameCopy.players,
      'educatedMerchantState.board': localGameCopy.educatedMerchantState.board,
       'educatedMerchantState.activityLog': arrayUnion({ message: extraMessage, timestamp: Timestamp.now() }),
    };
    return { isGameOver: true, updates: finalGameData };
  }

  const finalUpdates: any = {
    'educatedMerchantState.board': localGameCopy.educatedMerchantState.board,
    'educatedMerchantState.currentTurnIndex': nextTurnIndex,
    'educatedMerchantState.timerEndsAt': addActionTimer(),
    round: newRound,
    players: localGameCopy.players,
    'educatedMerchantState.movesThisRound': newMoves,
  };

  // Only change gameState if it's not already being set to final_results
  if (!finalUpdates.gameState) {
      finalUpdates.gameState = 'rolling';
  }
  
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
