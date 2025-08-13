

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
  type Transaction,
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
  let attempts = 0;
  let idx = (startIndex + 1) % turnOrder.length;
  while (attempts < turnOrder.length) {
    const pid = turnOrder[idx];
    const p = players.find((x) => x.id === pid);
    if (p && p.status === 'alive') return idx;
    idx = (idx + 1) % turnOrder.length;
    attempts++;
  }
  return -1; // No other alive players found
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
    if (!category) return null;
    const questionsCol = collection(db, 'educated_merchant_questions');
    const randomKey = Math.random();
    let q = query(questionsCol, where('category', '==', category), where('randomKey', '>=', randomKey), limit(1));
    let qs = await getDocs(q);

    if (qs.empty) {
        q = query(questionsCol, where('category', '==', category), where('randomKey', '<', randomKey), limit(1));
        qs = await getDocs(q);
    }
    if (qs.empty) {
        console.warn(`No questions found for category: "${category}"`);
        return null;
    }
    const questionDoc = qs.docs[0];
    const questionData = { id: questionDoc.id, ...questionDoc.data() } as EducatedMerchantQuestion;
    questionData.options = shuffle([...(questionData.dummyAnswers || []), questionData.answer]);
    return questionData;
}

// -----------------------------
// Core Internal Logic
// -----------------------------
function _endTurnInternal(game: Game): Game {
    const turnOrder = ensure(game.educatedMerchantState?.turnOrder, 'ترتيب الدور مفقود');
    let currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex, 'فهرس الدور الحالي مفقود');
    
    let round = game.round ?? 1;
    let movesThisRound = game.educatedMerchantState?.movesThisRound ?? 0;
    
    const nextPlayerIndex = findNextAliveIndex(turnOrder, game.players, currentTurnIndex);

    if (nextPlayerIndex === -1) {
       return _checkForWinnerAndEndGame(game);
    }

    if (nextPlayerIndex <= currentTurnIndex) {
        round++;
    }

    const maxRounds = game.educatedMerchantState?.settings?.maxRounds ?? DEFAULT_MAX_ROUNDS;
    if (round > maxRounds) {
        return _checkForWinnerAndEndGame(game);
    }

    movesThisRound = 0; // Reset for the new turn

    return {
        ...game,
        gameState: 'rolling',
        round,
        educatedMerchantState: {
            ...game.educatedMerchantState!,
            currentTurnIndex: nextPlayerIndex,
            lastDiceRoll: null,
            timerEndsAt: addActionTimer(),
            movesThisRound,
            pendingFine: null,
            pendingPurchase: null,
            newlyBoughtPropertyId: null,
        }
    };
}


function _checkForWinnerAndEndGame(game: Game): Game {
    const alivePlayers = game.players.filter(p => p.status === 'alive');
    if (alivePlayers.length <= 1) {
        const winner = alivePlayers.length === 1 
            ? alivePlayers[0] 
            : [...game.players].sort((a,b) => (b.money ?? 0) - (a.money ?? 0))[0];

        return {
            ...game,
            gameState: 'final_results',
            gameResult: {
                winner: winner?.id ?? 'none',
                message: `انتهت اللعبة! الفائز هو ${winner?.name ?? 'لا أحد'}.`
            },
            educatedMerchantState: {
                ...game.educatedMerchantState!,
                timerEndsAt: null,
            }
        };
    }
    // If no winner, return the game state as is
    return game;
}

// -----------------------------
// Public API
// -----------------------------
export async function startGame(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    const categoriesResult = await getEducatedMerchantCategories();
    if (!categoriesResult?.success || !categoriesResult?.categories?.length) throw new Error('لا توجد أقسام متاحة للعبة.');

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        const game = snap.data() as Game;
        if (!game) throw new Error('اللعبة غير موجودة');

        const players: Player[] = game.players.map((p) => ({ ...p, money: START_MONEY, status: 'alive', position: 0, propertiesCount: 0 }));
        const board = await generateBoard(categoriesResult.categories);
        const shuffledColors = shuffle([...COLORS]);
        players.forEach((p, i) => { p.color = shuffledColors[i % shuffledColors.length]; });
        
        tx.update(gameRef, {
            gameState: 'rolling',
            round: 1,
            players,
            educatedMerchantState: {
                settings: game.educatedMerchantState?.settings ?? { maxRounds: 20, categories: categoriesResult.categories },
                board,
                turnOrder: shuffle(players.map((p) => p.id)),
                currentTurnIndex: 0,
                activityLog: [{ message: `اللعبة بدأت بواسطة ${hostId}`, timestamp: nowTimestamp() }],
                timerEndsAt: addActionTimer(),
            },
        });
    });
}

// ... other actions like handleTimeout, purchaseProperty etc will go here ...
export { rollDice, purchaseProperty, answerQuestion, handleTimeout, endTurn };

async function endTurn(gameId: string, playerId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    let game = gameDoc.data() as Game;

    const updatedGame = _endTurnInternal(game);
    tx.update(gameRef, updatedGame);
  });
}

async function handleTimeout(gameId: string, callerId: string): Promise<void> {
  // This function is still useful for host-called timeouts if other timers are needed.
  // For now, most logic is in applyTimeoutIfNeeded
}


async function rollDice(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    let gameDataForLeagueUpdate: Game | null = null;

    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        if (game.gameState !== 'rolling') return;
        if (game.educatedMerchantState.turnOrder[game.educatedMerchantState.currentTurnIndex] !== playerId) {
            throw new Error("ليس دورك لرمي النرد.");
        }
        
        const diceRoll = randomDiceRoll(game.educatedMerchantState?.settings?.diceMax);
        const players = clonePlayers(game.players);
        const board = cloneBoard(ensure(game.educatedMerchantState.board));
        const logEvents: { message: string, timestamp: Timestamp }[] = [];
        
        const playerIndex = getPlayerIndexById(players, playerId);
        const player = players[playerIndex];
        const oldPosition = player.position;
        const newPosition = (oldPosition + diceRoll) % BOARD_SIZE;
        
        player.position = newPosition;
        if (newPosition < oldPosition) {
            player.money = (player.money || 0) + PASS_GO_REWARD;
            logEvents.push({ message: `حصل ${player.name} على ${PASS_GO_REWARD} دينار لعبور نقطة البداية.`, timestamp: nowTimestamp() });
        }
        logEvents.push({ message: `${player.name} رمى النرد وحصل على ${diceRoll}، وانتقل إلى "${board[newPosition].name}".`, timestamp: nowTimestamp() });
        
        const landOnTile = board[newPosition];
        
        let updates: any = {
            players,
            'educatedMerchantState.lastDiceRoll': diceRoll,
            'educatedMerchantState.rollAnimationNonce': Math.random(),
            'educatedMerchantState.activityLog': arrayUnion(...logEvents)
        };
        
        if (landOnTile.type === 'property') {
            if (landOnTile.ownerId && landOnTile.ownerId !== playerId) {
                const owner = players.find(p => p.id === landOnTile.ownerId);
                const rent = landOnTile.rent;
                if (owner) {
                    player.money = (player.money || 0) - rent;
                    owner.money = (owner.money || 0) + rent;
                    updates.players = players;
                    updates['educatedMerchantState.lastRentPayment'] = { payer: player.name, owner: owner.name, amount: rent, nonce: Math.random() };
                    logEvents.push({ message: `دفع ${player.name} ${rent} دينار إيجاراً إلى ${owner.name}.`, timestamp: nowTimestamp() });

                    if ((player.money || 0) < 0) {
                        owner.money! += player.money!;
                        player.money = 0;
                        player.status = 'bankrupt';
                        player.bankruptAt = nowTimestamp();
                        logEvents.push({ message: `${player.name} أفلس!`, timestamp: nowTimestamp() });
                    }
                    
                    const gameAfterPayment = { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game;
                    const finalGameState = _checkForWinnerAndEndGame(gameAfterPayment);
                    if (finalGameState.gameState === 'final_results') {
                        gameDataForLeagueUpdate = finalGameState;
                        updates = { ...updates, ...finalGameState };
                    } else {
                        updates.gameState = 'turn_end';
                    }
                }
            } else {
                updates.gameState = 'property_action';
            }
        } else if (landOnTile.type === 'fine') {
            const question = await fetchRandomQuestion(landOnTile.category);
            if(question) {
                updates.gameState = 'question';
                updates['educatedMerchantState.currentQuestion'] = question;
                updates['educatedMerchantState.pendingFine'] = { playerId, fineAmount: landOnTile.fineAmount || DEFAULT_FINE };
                updates['educatedMerchantState.timerEndsAt'] = addActionTimer(QUESTION_TIME_SECONDS);
            } else {
                player.money = (player.money || 0) - (landOnTile.fineAmount || DEFAULT_FINE);
                logEvents.push({ message: `دفع ${player.name} غرامة قدرها ${landOnTile.fineAmount || DEFAULT_FINE} دينار (لا توجد أسئلة متاحة).`, timestamp: nowTimestamp() });
                if ((player.money || 0) < 0) {
                    player.status = 'bankrupt';
                    player.bankruptAt = nowTimestamp();
                    logEvents.push({ message: `${player.name} أفلس!`, timestamp: nowTimestamp() });
                }
                const gameAfterFine = _endTurnInternal({ ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game);
                updates = { ...updates, ...gameAfterFine };
            }
        } else {
            const gameAfterGo = _endTurnInternal({ ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board } } as Game);
            updates = { ...updates, ...gameAfterGo };
        }
        
        tx.update(gameRef, updates);
    });

    if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}

async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    const game = gameDoc.data() as Game;

    const player = game.players.find((p) => p.id === playerId);
    if (!player) throw new Error("Player not found.");
    
    const property = game.educatedMerchantState.board[player.position];
    if (property.type !== 'property' || property.ownerId) return;

    const price = property.price || 0;
    if ((player.money || 0) < price) throw new Error("لا تملك ما يكفي من المال.");
    
    const question = await fetchRandomQuestion(property.category);
    if (!question) throw new Error(`لا توجد أسئلة متاحة في قسم "${property.category}" للشراء.`);

    const newMoney = (player.money || 0) - price;

    tx.update(gameRef, {
        gameState: 'question',
        'players': game.players.map(p => p.id === playerId ? { ...p, money: newMoney } : p),
        'educatedMerchantState.pendingPurchase': { playerId, propertyId: property.id, price, questionId: question.id, propertyName: property.name },
        'educatedMerchantState.currentQuestion': question,
        'educatedMerchantState.timerEndsAt': addActionTimer(QUESTION_TIME_SECONDS)
    });
  });
}

async function answerQuestion(gameId: string, playerId: string, givenAnswer: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let gameDataForLeagueUpdate: Game | null = null;
  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    const game = gameDoc.data() as Game;

    if (game.gameState !== 'question') return;
    const pendingPurchase = game.educatedMerchantState.pendingPurchase;
    const pendingFine = game.educatedMerchantState.pendingFine;
    if ((!pendingPurchase || pendingPurchase.playerId !== playerId) && (!pendingFine || pendingFine.playerId !== playerId)) {
      return;
    }
    
    const question = ensure(game.educatedMerchantState.currentQuestion, "السؤال الحالي مفقود.");
    const players = clonePlayers(game.players);
    const board = cloneBoard(ensure(game.educatedMerchantState.board));
    const logEvents: { message: string, timestamp: Timestamp }[] = [];
    const playerIndex = getPlayerIndexById(players, playerId);
    const player = players[playerIndex];

    const isCorrect = question.answer === givenAnswer;

    if (pendingPurchase) {
        if (isCorrect) {
            const propertyIndex = board.findIndex(p => p.id === pendingPurchase.propertyId);
            board[propertyIndex].ownerId = playerId;
            player.propertiesCount = (player.propertiesCount ?? 0) + 1;
            logEvents.push({ message: `أجاب ${player.name} بشكل صحيح واشترى ${pendingPurchase.propertyName}!`, timestamp: nowTimestamp() });
        } else {
            const refund = Math.round(pendingPurchase.price / 4);
            player.money = (player.money || 0) + refund;
            logEvents.push({ message: `أجاب ${player.name} بشكل خاطئ وخسر جزءًا من المبلغ.`, timestamp: nowTimestamp() });
        }
    } else if (pendingFine) {
        if (!isCorrect) {
            player.money = (player.money || 0) - pendingFine.fineAmount;
            logEvents.push({ message: `أجاب ${player.name} بشكل خاطئ ودفع غرامة ${pendingFine.fineAmount} دينار.`, timestamp: nowTimestamp() });
             if ((player.money || 0) < 0) {
                player.status = 'bankrupt';
                player.bankruptAt = nowTimestamp();
                logEvents.push({ message: `${player.name} أفلس!`, timestamp: nowTimestamp() });
             }
        } else {
            logEvents.push({ message: `أجاب ${player.name} بشكل صحيح ونجا من الغرامة.`, timestamp: nowTimestamp() });
        }
    }
    
    const tempGame = { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board, activityLog: [...game.educatedMerchantState.activityLog, ...logEvents] } };
    const finalState = _checkForWinnerAndEndGame(tempGame);

    if (finalState.gameState === 'final_results') {
        tx.update(gameRef, finalState);
        gameDataForLeagueUpdate = finalState;
    } else {
        tx.update(gameRef, _endTurnInternal(tempGame));
    }
  });

   if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}

