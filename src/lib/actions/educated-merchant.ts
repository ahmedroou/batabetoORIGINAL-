/* Educated Merchant — Full Refactor & Feature Upgrade
   - Fully updated to match the user's game rules (التاجر المتعلم)
   - Improvements:
     * START_MONEY set to 1000
     * Round counting changed to movesThisRound so a "round" is when every alive player moved
     * Unified timestamps to Firestore Timestamp
     * Added rollAnimationNonce to help front-end trigger animation every roll
     * Robust handling of bankrupt players and automatic property release
     * Final ranking creation (winner + eliminated ordered by bankruptcy time)
     * Avoid nested runTransaction calls by exposing internal helpers that work inside a caller transaction
     * Safer question querying with fallback
     * Clearer Arabic error messages and activity log messages

   Notes:
   - Keep backend purely logic-focused. Frontend should read the fields updated here to animate money changes,
     dice animation, and show question UI based on 'educatedMerchantState.currentQuestion'.
   - Test these functions against a Firestore emulator before deploying (recommended).
*/

'use server';

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
  limit,
  type Transaction,
  setDoc,
} from 'firebase/firestore';
import type { Game, Player, Property, EducatedMerchantQuestion } from '@/types';
import { shuffle } from './helpers';
import { PROPERTY_NAMES } from '@/data/properties';
import { getEducatedMerchantCategories } from './admin';
import { updateLeagueScoresForGameEnd } from './user';

// -----------------------------
// Tunables & constants
// -----------------------------
const BOARD_SIZE = 28; // حلقية
const START_MONEY = 1000; // حسب طلبك
const PASS_GO_REWARD = 200;
const ACTION_TIME_SECONDS = 25;
const MAX_FINES = 3;
const DEFAULT_FINE = 100;
const DEFAULT_MAX_ROUNDS = 20;
const COLORS = ['#F44336', '#2196F3', '#4CAF50', '#FFC107', '#9C27B0', '#009688', '#E91E63', '#607D8B'];
const DICE_MIN = 1;
const DICE_MAX = 5; // "شيء شبيه برمي النرد مكوّن من 5 أرقام"

// -----------------------------
// Helpers
// -----------------------------
function nowTimestamp(): Timestamp {
  return Timestamp.fromMillis(Date.now());
}

function addActionTimer(seconds = ACTION_TIME_SECONDS): Timestamp {
  return Timestamp.fromMillis(Date.now() + seconds * 1000);
}

function randomDiceRoll(): number {
  return Math.floor(Math.random() * (DICE_MAX - DICE_MIN + 1)) + DICE_MIN;
}

function getPlayerIndexById(players: Player[], playerId: string) {
  return players.findIndex((p) => p.id === playerId);
}

function ensure<T>(val: T | undefined | null, message = 'قيمة غير متوقعة مفقودة'): T {
  if (val === undefined || val === null) throw new Error(message);
  return val;
}

// Finds next alive player's index after startIndex (not inclusive). Returns -1 if none found.
function findNextAliveIndex(turnOrder: string[], players: Player[], startIndex: number) {
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

// -----------------------------
// Board generation
// -----------------------------
export async function generateBoard(categories: string[]): Promise<Property[]> {
  const board: Property[] = new Array(BOARD_SIZE).fill(undefined as unknown as Property);

  board[0] = { id: 0, type: 'start', name: 'نقطة البداية', category: '', price: 0, rent: 0, ownerId: null } as Property;

  // Place fines
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
      category: '',
      price: 0,
      rent: 0,
      ownerId: null,
      fineAmount,
    } as Property;
    fineAmount += 50;
  }

  const availablePropertyNames = shuffle([...PROPERTY_NAMES]);

  for (let i = 1; i < BOARD_SIZE; i++) {
    if (board[i]) continue;

    const name = availablePropertyNames.pop() || `عقار ${i}`;
    // price between 100 and 500, round to nearest 10 so it's divisible by 2
    const price = Math.round((Math.random() * (500 - 100) + 100) / 10) * 10;
    const category = categories.length ? categories[Math.floor(Math.random() * categories.length)] : '';

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

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;

    if (game.hostId !== hostId) throw new Error('فقط المضيف يمكنه بدء اللعبة.');

    const categoriesResult = await getEducatedMerchantCategories();
    if (!categoriesResult?.success || !categoriesResult?.categories || categoriesResult.categories.length === 0) {
      throw new Error('فشل تحميل أقسام الأسئلة من الإدارة.');
    }

    const board = await generateBoard(categoriesResult.categories);
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
      'educatedMerchantState.activityLog': [{ message: 'بدأت اللعبة!', timestamp: nowTimestamp() }],
      'educatedMerchantState.timerEndsAt': addActionTimer(),
      'educatedMerchantState.movesThisRound': 0,
      'educatedMerchantState.settings': { maxRounds: DEFAULT_MAX_ROUNDS },
    });
  });
}

export async function rollDice(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    await rollDiceInternal(gameRef, tx, playerId);
  });
}

async function rollDiceInternal(gameRef: ReturnType<typeof doc>, tx: Transaction, playerId: string) {
  const snap = await tx.get(gameRef);
  if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
  const game = snap.data() as Game;

  if (game.gameState !== 'rolling') throw new Error('ليس وقت رمي النرد.');

  const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
  const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');

  if (turnOrder[currentTurnIndex] !== playerId) throw new Error('ليس دورك الآن.');

  const diceRoll = randomDiceRoll();
  const playerIndex = getPlayerIndexById(game.players, playerId);
  if (playerIndex === -1) return;

  const oldPosition = game.players[playerIndex].position || 0;
  const newPosition = (oldPosition + diceRoll) % BOARD_SIZE;

  const updatedPlayers = [...game.players];
  updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], position: newPosition };

  let activityMessage = `${updatedPlayers[playerIndex].name} رمى ${diceRoll}.`;

  if (newPosition < oldPosition) {
    updatedPlayers[playerIndex].money = (updatedPlayers[playerIndex].money || 0) + PASS_GO_REWARD;
    activityMessage += ` وحصل على ${PASS_GO_REWARD} دينار للمرور بنقطة البداية.`;
  }

  // nonce helps frontend trigger the roll animation even if the value is a repeat
  const rollNonce = Date.now();

  tx.update(gameRef, {
    players: updatedPlayers,
    gameState: 'movement',
    'educatedMerchantState.lastDiceRoll': diceRoll,
    'educatedMerchantState.rollAnimationNonce': rollNonce,
    'educatedMerchantState.activityLog': arrayUnion({ message: activityMessage, timestamp: nowTimestamp() }),
    'educatedMerchantState.timerEndsAt': deleteField(),
  });
}

export async function handlePropertyLanding(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;

    const player = game.players.find((p) => p.id === playerId);
    if (!player) return;

    const property = game.educatedMerchantState?.board?.[player.position];
    if (!property) {
      // Just an empty tile - end the turn
      const { updates } = endTurnInternal(game, playerId, `${player.name} وصل إلى مربع فارغ.`);
      tx.update(gameRef, updates);
      return;
    }

    if (property.type === 'property') {
      if (!property.ownerId) {
        // Show purchase option
        tx.update(gameRef, {
          gameState: 'property_action',
          'educatedMerchantState.timerEndsAt': addActionTimer(),
        });
        return;
      }

      if (property.ownerId !== playerId) {
        const ownerIndex = getPlayerIndexById(game.players, property.ownerId);
        const payerIndex = getPlayerIndexById(game.players, playerId);
        const updatedPlayers = [...game.players];
        const rent = property.rent || 0;

        if ((updatedPlayers[payerIndex].money || 0) < rent) {
          // Payer goes bankrupt
          updatedPlayers[ownerIndex].money = (updatedPlayers[ownerIndex].money || 0) + (updatedPlayers[payerIndex].money || 0);
          updatedPlayers[payerIndex].money = 0;
          updatedPlayers[payerIndex].status = 'bankrupt';
          updatedPlayers[payerIndex].bankruptAt = nowTimestamp();

          const activityMessage = `${updatedPlayers[payerIndex].name} أفلس لأنه لم يستطع دفع الإيجار لـ ${updatedPlayers[ownerIndex].name}.`;

          const { updates } = endTurnInternal(game, playerId, activityMessage, { players: updatedPlayers });
          tx.update(gameRef, updates);
          return;
        } else {
          updatedPlayers[payerIndex].money = (updatedPlayers[payerIndex].money || 0) - rent;
          updatedPlayers[ownerIndex].money = (updatedPlayers[ownerIndex].money || 0) + rent;
          const activityMessage = `${game.players[payerIndex].name} دفع ${rent} دينار إيجار لـ ${game.players[ownerIndex].name}.`;

          const { updates } = endTurnInternal(game, playerId, activityMessage, { players: updatedPlayers });
          tx.update(gameRef, updates);
          return;
        }
      }

      // Own property, end turn
      const { updates } = endTurnInternal(game, playerId, `${player.name} وصل إلى عقاره.`);
      tx.update(gameRef, updates);
      return;
    }

    if (property.type === 'fine') {
      const fine = property.fineAmount || DEFAULT_FINE;
      const playerIndex = getPlayerIndexById(game.players, playerId);
      const updatedPlayers = [...game.players];

      if ((updatedPlayers[playerIndex].money || 0) < fine) {
        updatedPlayers[playerIndex].money = 0;
        updatedPlayers[playerIndex].status = 'bankrupt';
        updatedPlayers[playerIndex].bankruptAt = nowTimestamp();
        const activityMessage = `${updatedPlayers[playerIndex].name} أفلس لأنه لم يستطع دفع الغرامة.`;

        const { updates } = endTurnInternal(game, playerId, activityMessage, { players: updatedPlayers });
        tx.update(gameRef, updates);
        return;
      } else {
        updatedPlayers[playerIndex].money = (updatedPlayers[playerIndex].money || 0) - fine;
        const activityMessage = `${updatedPlayers[playerIndex].name} دفع غرامة قدرها ${fine} دينار.`;

        const { updates } = endTurnInternal(game, playerId, activityMessage, { players: updatedPlayers });
        tx.update(gameRef, updates);
        return;
      }
    }

    // Default: end turn (e.g. landing on Start)
    const { updates } = endTurnInternal(game, playerId, `${player.name} وصل إلى نقطة البداية.`);
    tx.update(gameRef, updates);
  });
}

export async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);

    // First, fetch necessary data outside the transaction
    const gameDocForData = await getDoc(gameRef);
    if (!gameDocForData.exists()) throw new Error('اللعبة غير موجودة.');
    const gameData = gameDocForData.data() as Game;

    const player = gameData.players.find((p) => p.id === playerId);
    if (!player) return; // Player not in game

    const property = gameData.educatedMerchantState?.board?.[player.position];
    if (!property || property.type !== 'property') throw new Error('لا يوجد عقار في هذه الخانة.');

    const questionsCol = collection(db, 'trap_answer_questions');
    const randomKey = Math.random();
    let q = query(questionsCol, where('category', '==', property.category), where('randomKey', '>=', randomKey), limit(1));
    let qs = await getDocs(q);

    if (qs.empty) {
        const fallback = query(questionsCol, where('category', '==', property.category), limit(1));
        qs = await getDocs(fallback);
    }

    if (qs.empty) throw new Error(`لا توجد أسئلة متاحة في قسم "${property.category}".`);

    const questionDoc = qs.docs[0];
    const questionData = { id: questionDoc.id, ...questionDoc.data() } as EducatedMerchantQuestion;

    const options = shuffle([...(questionData.dummyAnswers || []), questionData.answer]);
    questionData.options = options;

    // Now, run the transaction with the fetched data
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
        const game = snap.data() as Game;

        const playerIndex = getPlayerIndexById(game.players, playerId);
        if (playerIndex === -1) return;
        const playerInTx = game.players[playerIndex];

        const propertyInTx = game.educatedMerchantState?.board?.[playerInTx.position];
        if (!propertyInTx) throw new Error('لا يوجد عقار في هذه الخانة.');
        if (propertyInTx.ownerId) throw new Error('هذا العقار مملوك بالفعل.');
        if ((playerInTx.money || 0) < propertyInTx.price) throw new Error('رصيدك لا يكفي لشراء هذا العقار.');
        
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], money: (updatedPlayers[playerIndex].money || 0) - propertyInTx.price };

        tx.update(gameRef, {
            players: updatedPlayers,
            gameState: 'question',
            'educatedMerchantState.currentQuestion': questionData,
            'educatedMerchantState.timerEndsAt': addActionTimer(),
            'educatedMerchantState.pendingPurchase': {
                playerId,
                propertyId: propertyInTx.id,
                price: propertyInTx.price,
                questionId: questionData.id,
            },
        });
    });
}

export async function answerQuestion(gameId: string, playerId: string, answer: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let finalGameDataForLeagueUpdate: Game | null = null;
  let gameEnded = false;

  await runTransaction(db, async (tx) => {
    // --- READ PHASE ---
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;

    const pending = game.educatedMerchantState?.pendingPurchase;
    if (game.gameState !== 'question' || !pending || pending.playerId !== playerId) {
      return; // ignore
    }

    const question = ensure(game.educatedMerchantState?.currentQuestion, 'السؤال الحالي مفقود.');
    const isCorrect = answer === question.answer;

    // --- PREPARE WRITES ---
    let board = [...ensure(game.educatedMerchantState?.board, 'اللوح مفقود.')];
    let players = [...game.players];
    const playerIndex = getPlayerIndexById(players, playerId);
    let activityMessage = '';
    let finalUpdates: any = {
      // These will be deleted regardless of outcome
      'educatedMerchantState.pendingPurchase': deleteField(),
      'educatedMerchantState.currentQuestion': deleteField(),
      'educatedMerchantState.timerEndsAt': deleteField(),
    };

    if (isCorrect) {
      const propertyIndex = board.findIndex((p) => p.id === pending.propertyId);
      if (propertyIndex !== -1) {
        board[propertyIndex] = { ...board[propertyIndex], ownerId: playerId, color: players[playerIndex].color } as Property;
      }
      activityMessage = `${players[playerIndex].name} أجاب بشكل صحيح وامتلك "${board[propertyIndex].name}"!`;
      finalUpdates['educatedMerchantState.newlyBoughtPropertyId'] = pending.propertyId;
    } else {
      const refund = Math.round(pending.price / 4);
      players[playerIndex] = { ...players[playerIndex], money: (players[playerIndex].money || 0) + refund };
      activityMessage = `${players[playerIndex].name} أجاب بشكل خاطئ واسترد ${refund} دينار.`;
      finalUpdates['educatedMerchantState.newlyBoughtPropertyId'] = deleteField();
    }
    
    // Merge the player and board updates into the final update object.
    finalUpdates.players = players;
    finalUpdates['educatedMerchantState.board'] = board;
    
    // `endTurnInternal` no longer reads; it just processes the prepared updates.
    // It returns a boolean indicating if the game has ended.
    const { isGameOver, updates } = endTurnInternal(game, playerId, activityMessage, finalUpdates);
    tx.update(gameRef, updates);
    gameEnded = isGameOver;

    if (isGameOver) {
      finalGameDataForLeagueUpdate = { ...game, ...updates };
    }
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
    // --- READ PHASE ---
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;

    // Only the host should trigger timeouts, to prevent multiple triggers.
    if (game.hostId !== hostId) return;

    if (!game.educatedMerchantState?.timerEndsAt || Date.now() < game.educatedMerchantState.timerEndsAt.toMillis()) {
      return; // Timer hasn't expired server-side.
    }

    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
    const currentPlayerId = turnOrder[currentTurnIndex];
    const currentPlayer = game.players.find((p) => p.id === currentPlayerId);

    // --- PREPARE WRITES based on game state ---
    let updates: any = {};
    let activityMessage = '';
    
    switch (game.gameState) {
      case 'rolling': {
        const diceRoll = randomDiceRoll();
        const playerIndex = getPlayerIndexById(game.players, currentPlayerId);
        if (playerIndex === -1) return;

        const updatedPlayers = [...game.players];
        const oldPosition = updatedPlayers[playerIndex].position || 0;
        const newPosition = (oldPosition + diceRoll) % BOARD_SIZE;
        updatedPlayers[playerIndex].position = newPosition;
        
        activityMessage = `انتهى وقت اللاعب ${currentPlayer?.name}، تم رمي النرد تلقائياً: ${diceRoll}.`;
        if (newPosition < oldPosition) {
          updatedPlayers[playerIndex].money = (updatedPlayers[playerIndex].money || 0) + PASS_GO_REWARD;
          activityMessage += ` وحصل على ${PASS_GO_REWARD} دينار للمرور بنقطة البداية.`;
        }

        updates = {
          players: updatedPlayers,
          gameState: 'movement',
          'educatedMerchantState.lastDiceRoll': diceRoll,
          'educatedMerchantState.rollAnimationNonce': Date.now(),
          'educatedMerchantState.activityLog': arrayUnion({ message: activityMessage, timestamp: nowTimestamp() }),
          'educatedMerchantState.timerEndsAt': deleteField(),
        };
        break;
      }
      case 'property_action': {
        activityMessage = `انتهى وقت اللاعب ${currentPlayer?.name} وتخطى شراء العقار.`;
        const endTurnResult = endTurnInternal(game, currentPlayerId, activityMessage);
        updates = endTurnResult.updates;
        gameEnded = endTurnResult.isGameOver;
        if (gameEnded) finalGameDataForLeagueUpdate = { ...game, ...updates };
        break;
      }
      case 'question': {
        const pending = game.educatedMerchantState?.pendingPurchase;
        if (pending) {
          const playerIndex = getPlayerIndexById(game.players, pending.playerId);
          const updatedPlayers = [...game.players];
          const refund = Math.round((pending.price || 0) / 4);
          updatedPlayers[playerIndex].money = (updatedPlayers[playerIndex].money || 0) + refund;

          activityMessage = `${currentPlayer?.name} لم يجب في الوقت واسترد ${refund} دينار.`;
          
          const baseUpdates = {
            players: updatedPlayers,
            'educatedMerchantState.pendingPurchase': deleteField(),
            'educatedMerchantState.currentQuestion': deleteField(),
            'educatedMerchantState.timerEndsAt': deleteField(),
          };

          const endTurnResult = endTurnInternal(game, currentPlayerId, activityMessage, baseUpdates);
          updates = endTurnResult.updates;
          gameEnded = endTurnResult.isGameOver;
          if (gameEnded) finalGameDataForLeagueUpdate = { ...game, ...updates };
        }
        break;
      }
      default:
        // No action needed for other states on timeout
        return;
    }
    
    // --- WRITE PHASE ---
    if (Object.keys(updates).length > 0) {
      tx.update(gameRef, updates);
    }
  });

  if (gameEnded && finalGameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
  }
}

// -----------------------------
// Central end-turn logic
// -----------------------------
function endTurnInternal(
  game: Game,
  playerId: string,
  extraMessage = '',
  extraUpdates: any = {}
): { isGameOver: boolean, updates: any } {
  
  // Create a merged game state from base and pending updates *before* processing logic.
  let mergedGameData = { ...game, ...extraUpdates };
  // Deep merge for players and board if they exist in extraUpdates
  if (extraUpdates.players) mergedGameData.players = [...extraUpdates.players];
  if (extraUpdates['educatedMerchantState.board']) mergedGameData.educatedMerchantState!.board = [...extraUpdates['educatedMerchantState.board']];
  
  // Clean up properties owned by bankrupt players based on the *merged* state.
  const updatedBoard = (mergedGameData.educatedMerchantState?.board || []).map((prop) => {
    const owner = mergedGameData.players.find((p) => p.id === prop.ownerId);
    if (owner && owner.status === 'bankrupt') return { ...prop, ownerId: null, color: undefined } as Property;
    return prop;
  });

  const updatedPlayers = mergedGameData.players.map((p) => {
    if (p.status === 'bankrupt' && (p.money || 0) > 0) return { ...p, money: 0 };
    return p;
  });

  const activePlayers = updatedPlayers.filter((p) => p.status === 'alive');

  // If <= 1 active player => game over
  if (activePlayers.length <= 1) {
    const winner = activePlayers[0];
    const ranking = updatedPlayers
      .sort((a, b) => {
          if (a.status === 'alive' && b.status !== 'alive') return -1;
          if (b.status === 'alive' && a.status !== 'alive') return 1;
          if (a.status === 'bankrupt' && b.status === 'bankrupt') return ((b.bankruptAt as Timestamp)?.toMillis() || 0) - ((a.bankruptAt as Timestamp)?.toMillis() || 0);
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

  // Normal flow: find next alive player's index
  const turnOrder = ensure(mergedGameData.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود أثناء إنهاء الدور.');
  const currentTurnIndex = ensure(mergedGameData.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود أثناء إنهاء الدور.');

  let nextTurnIndex = findNextAliveIndex(turnOrder, updatedPlayers, currentTurnIndex);

  if (nextTurnIndex === -1) {
    const firstAliveId = updatedPlayers.find((p) => p.status === 'alive')?.id;
    const altIndex = turnOrder.findIndex((id) => id === firstAliveId);
    if (altIndex === -1) {
      const finalGameData: any = {
        gameState: 'final_results', gameResult: { winner: 'none', message: 'انتهت اللعبة: لا يوجد فائز.' }, players: updatedPlayers
      };
      return { isGameOver: true, updates: finalGameData };
    }
    nextTurnIndex = altIndex;
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
    const winner = contenders.reduce((a, b) => ((a.money || 0) > (b.money || 0) ? a : b));
    const ranking = updatedPlayers.slice().sort((a, b) => (b.money || 0) - (a.money || 0)).map((p, i) => ({ playerId: p.id, name: p.name, rank: i + 1, bankruptAt: p.bankruptAt || null }));
    const finalGameData: any = { gameState: 'final_results', gameResult: { winner: winner?.id || 'none', message: `انتهت الجولات! الفائز هو ${winner?.name || ''} بأعلى رصيد.`, ranking }, players: updatedPlayers };
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
    finalUpdates['educatedMerchantState.activityLog'] = arrayUnion({ message: extraMessage, timestamp: nowTimestamp() });
  }

  return { isGameOver: false, updates: finalUpdates };
}


export async function endTurn(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('اللعبة غير موجودة.');
    const game = snap.data() as Game;

    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الأدوار مفقود.');
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود.');
    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('ليس دورك لإنهاء الجولة.');

    const { updates } = endTurnInternal(game, playerId, `${game.players.find((p) => p.id === playerId)?.name} أنهى دوره.`);
    tx.update(gameRef, updates);
  });
}
