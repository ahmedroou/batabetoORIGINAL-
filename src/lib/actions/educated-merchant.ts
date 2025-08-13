

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
const ACTION_TIME_SECONDS = 35; // Slightly increased
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
      category: 'قسم الغرامات', // Fixed: Assign correct category to fine tiles
      price: 0,
      rent: 0,
      ownerId: null,
      fineAmount,
    } as Property;
    fineAmount += 50;
  }

  const availablePropertyNames = shuffle([...PROPERTY_NAMES]);
  // Filter out the 'Fine' category from being assigned to regular properties
  const propertyCategories = categories.filter(c => c !== 'قسم الغرامات');


  for (let i = 1; i < BOARD_SIZE; i++) {
    if (board[i]) continue;

    const name = availablePropertyNames.pop() || `عقار ${i}`;
    const price = Math.round((Math.random() * (500 - 100) + 100) / 10) * 10;
    // Assign a category from the filtered list
    const category = propertyCategories.length ? propertyCategories[Math.floor(Math.random() * propertyCategories.length)] : '';

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
    });
  });
}

// Server is the source of truth for all movement and state changes
export async function rollDice(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    let game = snap.data() as Game;

    if (game.gameState !== 'rolling') throw new Error('ليس وقت رمي النرد.');

    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');

    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('ليس دورك الآن.');

    const playerIndex = getPlayerIndexById(game.players, playerId);
    if (playerIndex === -1) throw new Error('اللاعب غير موجود.');

    const player = game.players[playerIndex];
    const diceRoll = randomDiceRoll();
    const oldPosition = player.position;
    const newPosition = (oldPosition + diceRoll) % BOARD_SIZE;

    const board = ensure(game.educatedMerchantState?.board, 'اللوح مفقود.');
    const landingProperty = ensure(
      board[newPosition],
      'خانة غير موجودة على اللوح'
    );

    let updatedPlayers = [...game.players];
    updatedPlayers[playerIndex] = { ...player, position: newPosition };
    
    let activityMessage = `${player.name} رمى ${diceRoll} وتحرك إلى "${landingProperty.name}".`;

    if (newPosition < oldPosition) {
      updatedPlayers[playerIndex].money = (updatedPlayers[playerIndex].money || 0) + PASS_GO_REWARD;
      activityMessage += ` ومر بنقطة البداية، وحصل على ${PASS_GO_REWARD} دينار.`
    }
    
    let baseUpdates: any = {
      players: updatedPlayers,
      'educatedMerchantState.rollAnimationNonce': Date.now(),
      'educatedMerchantState.lastDiceRoll': diceRoll,
      'educatedMerchantState.timerEndsAt': addActionTimer(),
    };

    game = {...game, ...baseUpdates}; // Update the game object for internal logic

    let finalUpdates: any;

    if (landingProperty.type === 'start') {
      const { updates } = endTurnInternal(game, playerId, activityMessage);
      finalUpdates = updates;
    } else if (landingProperty.type === 'property') {
      if (!landingProperty.ownerId) {
        finalUpdates = { ...baseUpdates, gameState: 'property_action', 'educatedMerchantState.activityLog': arrayUnion({message: activityMessage, timestamp: Timestamp.now()}) };
      } else if (landingProperty.ownerId !== playerId) {
        const ownerIndex = getPlayerIndexById(updatedPlayers, landingProperty.ownerId);
        const rent = landingProperty.rent || 0;
        let rentMessage = '';

        if ((updatedPlayers[playerIndex].money || 0) < rent) {
          updatedPlayers[ownerIndex].money = (updatedPlayers[ownerIndex].money || 0) + (updatedPlayers[playerIndex].money || 0);
          updatedPlayers[playerIndex].money = 0;
          updatedPlayers[playerIndex].status = 'bankrupt';
          updatedPlayers[playerIndex].bankruptAt = nowTimestamp();
          rentMessage = `${activityMessage} لكنه أفلس لأنه لم يستطع دفع الإيجار لـ ${updatedPlayers[ownerIndex].name}.`;
        } else {
          updatedPlayers[playerIndex].money = (updatedPlayers[playerIndex].money || 0) - rent;
          updatedPlayers[ownerIndex].money = (updatedPlayers[ownerIndex].money || 0) + rent;
          rentMessage = `${activityMessage} ودفع ${rent} دينار إيجار لـ ${updatedPlayers[ownerIndex].name}.`;
        }
        
        baseUpdates.players = updatedPlayers;
        game = {...game, ...baseUpdates};
        const { updates } = endTurnInternal(game, playerId, rentMessage);
        finalUpdates = updates;

      } else {
        const { updates } = endTurnInternal(game, playerId, `${activityMessage} فهو يملكها بالفعل.`);
        finalUpdates = updates;
      }
    } else if (landingProperty.type === 'fine') {
      const question = await fetchRandomQuestion('قسم الغرامات');
      finalUpdates = {
        ...baseUpdates,
        'educatedMerchantState.activityLog': arrayUnion({message: activityMessage, timestamp: Timestamp.now()}),
        gameState: 'question',
        'educatedMerchantState.currentQuestion': question,
        'educatedMerchantState.pendingFine': { playerId, fineAmount: landingProperty.fineAmount ?? DEFAULT_FINE },
      };
    } else {
      const { updates } = endTurnInternal(game, playerId, activityMessage);
      finalUpdates = updates;
    }
    
    tx.update(gameRef, finalUpdates);
  });
}

export async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;

    if (game.gameState !== 'property_action') throw new Error('ليس وقت شراء العقارات.');
    if (game.educatedMerchantState?.turnOrder?.[game.educatedMerchantState?.currentTurnIndex] !== playerId) {
      throw new Error('ليس دورك للشراء.');
    }

    const currentPlayer = ensure(game.players.find((p) => p.id === playerId), 'Player disappeared mid-transaction');
    const propertyToBuy = ensure(
      game.educatedMerchantState?.board?.[currentPlayer.position],
      'Property disappeared mid-transaction'
    );

    if (propertyToBuy.type !== 'property' || propertyToBuy.ownerId) throw new Error('هذا العقار غير متاح للشراء.');
    if ((currentPlayer.money || 0) < propertyToBuy.price) throw new Error('رصيدك لا يكفي لشراء هذا العقار.');

    const question = await fetchRandomQuestion(propertyToBuy.category);

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

    let board = [...ensure(game.educatedMerchantState?.board, 'اللوح مفقود.')];
    let players = [...game.players];
    const playerIndex = getPlayerIndexById(players, playerId);
    let activityMessage = '';
    let extraUpdates: any = {
      'educatedMerchantState.currentQuestion': deleteField(),
      'educatedMerchantState.timerEndsAt': deleteField(),
    };

    if (pendingPurchase) {
      extraUpdates['educatedMerchantState.pendingPurchase'] = deleteField();
      const propertyName = pendingPurchase.propertyName || 'عقار مجهول';

      if (isCorrect) {
        const propertyIndex = board.findIndex((p) => p.id === pendingPurchase.propertyId);
        if (propertyIndex !== -1) {
          board[propertyIndex] = {
            ...board[propertyIndex],
            ownerId: playerId,
            color: players[playerIndex].color,
          } as Property;
        }
        activityMessage = `${players[playerIndex].name} أجاب بشكل صحيح وامتلك "${propertyName}"!`;
        extraUpdates['educatedMerchantState.newlyBoughtPropertyId'] = pendingPurchase.propertyId;
        players[playerIndex].propertiesCount = (players[playerIndex].propertiesCount || 0) + 1;

      } else {
        const refund = Math.round(pendingPurchase.price / 4);
        players[playerIndex] = { ...players[playerIndex], money: (players[playerIndex].money || 0) + refund };
        activityMessage = `${players[playerIndex].name} أجاب بشكل خاطئ على سؤال "${propertyName}" واسترد ${refund} دينار.`;
        extraUpdates['educatedMerchantState.newlyBoughtPropertyId'] = deleteField();
      }
    } else if (pendingFine) {
      extraUpdates['educatedMerchantState.pendingFine'] = deleteField();
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

    extraUpdates.players = players;
    extraUpdates['educatedMerchantState.board'] = board;

    const { updates, isGameOver } = endTurnInternal(game, playerId, activityMessage, extraUpdates);
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

    if (game.gameState === 'rolling' || game.gameState === 'property_action') {
      ({ updates } = endTurnInternal(game, currentPlayerId, activityMessage));
    } else if (game.gameState === 'question') {
      const pendingPurchase = game.educatedMerchantState?.pendingPurchase;
      const pendingFine = game.educatedMerchantState?.pendingFine;
      if (pendingPurchase) {
        const playerIndex = getPlayerIndexById(game.players, pendingPurchase.playerId);
        const updatedPlayers = [...game.players];
        const refund = Math.round((pendingPurchase.price || 0) / 4);
        updatedPlayers[playerIndex].money = (updatedPlayers[playerIndex].money || 0) + refund;
        activityMessage = `${currentPlayer?.name} لم يجب في الوقت واسترد ${refund} دينار.`;
        const baseUpdates = {
          players: updatedPlayers,
          'educatedMerchantState.pendingPurchase': deleteField(),
          'educatedMerchantState.currentQuestion': deleteField(),
        };
        ({ updates } = endTurnInternal(game, currentPlayerId, activityMessage, baseUpdates));
      } else if (pendingFine) {
        const playerIndex = getPlayerIndexById(game.players, pendingFine.playerId);
        const updatedPlayers = [...game.players];
        const fine = (pendingFine.fineAmount ?? DEFAULT_FINE);
        if ((updatedPlayers[playerIndex].money || 0) < fine) {
          updatedPlayers[playerIndex].money = 0;
          updatedPlayers[playerIndex].status = 'bankrupt';
          updatedPlayers[playerIndex].bankruptAt = nowTimestamp();
        } else {
          updatedPlayers[playerIndex].money = (updatedPlayers[playerIndex].money || 0) - fine;
        }
        activityMessage = `${currentPlayer?.name} لم يجب في الوقت وتم تطبيق الغرامة.`;
        const baseUpdates = {
          players: updatedPlayers,
          'educatedMerchantState.pendingFine': deleteField(),
          'educatedMerchantState.currentQuestion': deleteField(),
        };
        ({ updates } = endTurnInternal(game, currentPlayerId, activityMessage, baseUpdates));
      } else {
        return;
      }
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
  extraMessage = '',
  extraUpdates: any = {}
): { isGameOver: boolean; updates: any } {
  let mergedGameData = { ...game, ...extraUpdates };
  if (extraUpdates.players) mergedGameData.players = [...extraUpdates.players];

  // Release properties of any newly bankrupted players
  const updatedBoard = (mergedGameData.educatedMerchantState?.board || []).map((prop) => {
    const owner = mergedGameData.players.find((p) => p.id === prop.ownerId);
    if (owner && owner.status === 'bankrupt') {
      const { ownerId, color, ...rest } = prop;
      return { ...rest, ownerId: null, color: undefined } as Property;
    }
    return prop;
  });

  const updatedPlayers = mergedGameData.players.map((p) => {
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

  const turnOrder = ensure(mergedGameData.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود أثناء إنهاء الدور.');
  const currentTurnIndex = ensure(
    mergedGameData.educatedMerchantState?.currentTurnIndex,
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

  const currentMoves = mergedGameData.educatedMerchantState?.movesThisRound || 0;
  let newMoves = currentMoves + 1;
  let newRound = mergedGameData.round || 1;

  if (newMoves >= activePlayers.length) {
    newRound++;
    newMoves = 0;
  }

  const maxRounds = mergedGameData.educatedMerchantState?.settings?.maxRounds || DEFAULT_MAX_ROUNDS;

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
    ...extraUpdates,
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
