

import type { Game, Player, Property, EducatedMerchantQuestion } from '@/types';
import { shuffle } from '../helpers';
import { Timestamp } from 'firebase/firestore';
import { PROPERTY_NAMES } from '@/data/properties';
import { deleteField } from 'firebase/firestore';
import { arrayUnion } from 'firebase/firestore';
import { randomInt } from 'crypto';
import { getEducatedMerchantCategories } from '../../actions/admin';

// -----------------------------
// Constants
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
// Pure Helper Functions
// -----------------------------
const nowTimestamp = (): Timestamp => Timestamp.now();
const addActionTimer = (seconds: number): Timestamp => Timestamp.fromMillis(Date.now() + seconds * 1000);
const randomDiceRoll = (diceMax?: number): number => Math.floor(Math.random() * (Math.max(DICE_MIN, diceMax ?? DICE_MAX) - DICE_MIN + 1)) + DICE_MIN;
const getPlayerIndexById = (players: Player[], playerId: string): number => players.findIndex((p) => p.id === playerId);
const ensure = <T>(val: T | undefined | null, message = 'Unexpected missing value'): T => {
    if (val === undefined || val === null) throw new Error(message);
    return val;
};
const clonePlayers = (players: Player[]): Player[] => players.map(p => ({ ...p }));
const cloneBoard = (board: Property[]): Property[] => board.map(b => ({ ...b }));
const newQuestionToken = (): string => `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const findNextAliveIndex = (turnOrder: string[], players: Player[], startIndex: number): number => {
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
};

// -----------------------------
// Internal Logic Functions (Pure)
// -----------------------------

export function _generateBoard(categories: string[]): Property[] {
  const board: Property[] = new Array(BOARD_SIZE).fill(null);
  board[0] = { id: 0, type: 'start', name: 'نقطة البداية', category: '', price: 0, rent: 0, ownerId: null };
  const finePositions = new Set<number>();
  while (finePositions.size < MAX_FINES) {
    finePositions.add(Math.floor(Math.random() * (BOARD_SIZE - 1)) + 1);
  }
  let fineAmount = DEFAULT_FINE;
  finePositions.forEach(pos => {
    board[pos] = { id: pos, type: 'fine', name: 'غرامة', category: 'قسم الغرامات', price: 0, rent: 0, ownerId: null, fineAmount };
    fineAmount += 50;
  });
  const availablePropertyNames = shuffle([...PROPERTY_NAMES]);
  const propertyCategories = categories.filter(c => c !== 'قسم الغرامات');
  for (let i = 1; i < BOARD_SIZE; i++) {
    if (board[i]) continue;
    const name = availablePropertyNames.pop() || `عقار ${i}`;
    const price = Math.round((Math.random() * (500 - 100) + 100) / 10) * 10;
    const category = propertyCategories.length > 0 ? propertyCategories[Math.floor(Math.random() * propertyCategories.length)] : '';
    board[i] = { id: i, type: 'property', name, category, price, rent: Math.round(price / 4), ownerId: null };
  }
  return board;
}


export async function _getInitialGameState(players: Player[]) {
    // This function can be expanded to fetch categories from admin settings if needed
    const categoriesResult = await getEducatedMerchantCategories();
    const categories = categoriesResult.categories || ["علوم", "رياضيات", "برمجة", "أحياء", "كيمياء", "قسم الغرامات"];
    const board = _generateBoard(categories);
    const turnOrder = shuffle(players.map(p => p.id));
    const assignedColors = shuffle([...COLORS]);
    const updatedPlayers = players.map((p, i) => ({
        ...p,
        money: START_MONEY,
        position: 0,
        propertiesCount: 0,
        status: 'alive' as const,
        color: assignedColors[i % assignedColors.length]
    }));

    return {
        updates: {
            players: updatedPlayers,
            gameState: 'rolling',
            'educatedMerchantState.board': board,
            'educatedMerchantState.settings': { maxRounds: DEFAULT_MAX_ROUNDS, categories, diceMax: DICE_MAX },
            'educatedMerchantState.turnOrder': turnOrder,
            'educatedMerchantState.currentTurnIndex': 0,
            'educatedMerchantState.activityLog': [{ message: 'بدأت اللعبة!', timestamp: nowTimestamp() }],
            'educatedMerchantState.timerEndsAt': addActionTimer(ACTION_TIME_SECONDS),
            'educatedMerchantState.movesThisRound': 0,
            'educatedMerchantState.activeCountAtRoundStart': updatedPlayers.length,
            round: 1,
        }
    };
}


function _endTurnInternal(game: Game, playerId: string, extraMessage: string | null = null, extraUpdates?: { players?: Player[], educatedMerchantState?: { board?: Property[] } }): { updates: any, isGameOver: boolean, finalGame: Game | null } {
  const players = extraUpdates?.players ? clonePlayers(extraUpdates.players) : clonePlayers(game.players);
  const board = extraUpdates?.educatedMerchantState?.board ? cloneBoard(extraUpdates.educatedMerchantState.board!) : cloneBoard(ensure(game.educatedMerchantState?.board));
  
  const logEvents: { message: string, timestamp: Timestamp }[] = extraMessage ? [{ message: extraMessage, timestamp: nowTimestamp() }] : [];

  for (let i = 0; i < board.length; i++) {
    const prop = board[i];
    if (!prop) continue;
    const owner = players.find((p) => p.id === prop.ownerId);
    if (owner && owner.status === 'bankrupt') {
      logEvents.push({ message: `تم تحرير "${prop.name}" بعد إفلاس ${owner.name}.`, timestamp: nowTimestamp() });
      board[i] = { ...prop, ownerId: null, color: undefined };
    }
  }

  players.forEach(p => { if (p.status === 'bankrupt' && (p.money || 0) > 0) p.money = 0; });

  const activePlayers = players.filter(p => p.status === 'alive');
  const isGameOver = activePlayers.length <= 1;

  if (isGameOver) {
    const winner = activePlayers[0];
    const finalGameData = { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board }, gameState: 'final_results' as const, gameResult: { winner: winner?.id || 'none', message: `اللاعب ${winner?.name || ''} هو الناجي الأخير!` } };
    const updates = {
        gameState: 'final_results',
        gameResult: finalGameData.gameResult,
        players,
        'educatedMerchantState.board': board,
        'educatedMerchantState.timerEndsAt': deleteField(),
        'educatedMerchantState.activityLog': logEvents.length > 0 ? arrayUnion(...logEvents) : undefined,
    };
    return { isGameOver: true, updates, finalGame: finalGameData as Game };
  }

  const turnOrder = ensure(game.educatedMerchantState?.turnOrder);
  const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex);
  let nextTurnIndex = findNextAliveIndex(turnOrder, players, currentTurnIndex);
  
  if(nextTurnIndex === -1) { // Should not happen if game over check is correct
    return { isGameOver: true, updates: {}, finalGame: null };
  }

  const movesThisRound = game.educatedMerchantState?.movesThisRound ?? 0;
  const activeAtRoundStart = game.educatedMerchantState?.activeCountAtRoundStart ?? activePlayers.length;
  let newMoves = movesThisRound + 1;
  let newRound = game.round || 1;
  let newActiveAtRoundStart = activeAtRoundStart;

  if (newMoves >= newActiveAtRoundStart) {
    newRound += 1;
    newMoves = 0;
    newActiveAtRoundStart = players.filter(p => p.status === 'alive').length;
  }

  const maxRounds = game.educatedMerchantState?.settings?.maxRounds || DEFAULT_MAX_ROUNDS;

  if (newRound > maxRounds) {
    const winner = activePlayers.reduce((a, b) => ((a.money || 0) > (b.money || 0) ? a : b));
    const finalGameData = { ...game, players, educatedMerchantState: { ...game.educatedMerchantState, board }, gameState: 'final_results' as const, gameResult: { winner: winner?.id || 'none', message: `انتهت الجولات! الفائز هو ${winner?.name || ''} بأعلى رصيد.` } };
    const updates = {
        gameState: 'final_results',
        gameResult: finalGameData.gameResult,
        players,
        'educatedMerchantState.board': board,
        'educatedMerchantState.timerEndsAt': deleteField(),
        'educatedMerchantState.activityLog': logEvents.length > 0 ? arrayUnion(...logEvents) : undefined,
    };
    return { isGameOver: true, updates, finalGame: finalGameData as Game };
  }

  const finalUpdates: any = {
    gameState: 'rolling',
    'educatedMerchantState.board': board,
    'educatedMerchantState.currentTurnIndex': nextTurnIndex,
    'educatedMerchantState.timerEndsAt': addActionTimer(ACTION_TIME_SECONDS),
    round: newRound,
    players,
    'educatedMerchantState.movesThisRound': newMoves,
    'educatedMerchantState.activeCountAtRoundStart': newActiveAtRoundStart,
    'educatedMerchantState.lastRentPayment': deleteField(),
    'educatedMerchantState.newlyBoughtPropertyId': deleteField(),
  };

  if (logEvents.length > 0) finalUpdates['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);
  
  return { isGameOver: false, updates: finalUpdates, finalGame: null };
}

export function _rollDice(game: Game, playerId: string) {
    if (game.gameState !== 'rolling') throw new Error('Not in rolling state.');
    const turnOrder = ensure(game.educatedMerchantState?.turnOrder);
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex);
    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('Not your turn.');

    const players = clonePlayers(game.players);
    const board = cloneBoard(ensure(game.educatedMerchantState?.board));
    const playerIndex = getPlayerIndexById(players, playerId);
    const player = players[playerIndex];

    const diceMax = game.educatedMerchantState?.settings?.diceMax ?? DICE_MAX;
    const diceRollResult = randomDiceRoll(diceMax);
    const oldPosition = player.position;
    const newPosition = (oldPosition + diceRollResult) % BOARD_SIZE;
    player.position = newPosition;

    const landingProperty = ensure(board[newPosition]);
    const logEvents: { message: string, timestamp: Timestamp }[] = [{ message: `${player.name} رمى ${diceRollResult} وتحرك إلى "${landingProperty.name}".`, timestamp: nowTimestamp() }];

    if (newPosition < oldPosition) {
        player.money = (player.money || 0) + PASS_GO_REWARD;
        logEvents.push({ message: `${player.name} مر بنقطة البداية، وحصل على ${PASS_GO_REWARD} دينار.`, timestamp: nowTimestamp() });
    }

    const updates: any = { players, 'educatedMerchantState.lastDiceRoll': diceRollResult, 'educatedMerchantState.displayingRollResult': { number: diceRollResult, nonce: Date.now() }, 'educatedMerchantState.rollAnimationNonce': Date.now() };

    let needsQuestion: { category: string; token: string } | null = null;
    
    // Determine next state
    if (landingProperty.type === 'property') {
        if (landingProperty.ownerId && landingProperty.ownerId !== playerId) {
            // Landed on owned property
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
                player.money -= rent;
                players[ownerIndex].money += rent;
                logEvents.push({ message: `${player.name} دفع ${rent} دينار إيجار لـ ${players[ownerIndex].name}.`, timestamp: nowTimestamp() });
            }
            updates['educatedMerchantState.lastRentPayment'] = { payer: player.name, owner: players[ownerIndex].name, amount: rent, nonce: Date.now() };
            // After rent payment, the turn always ends.
            const { updates: endUpdates, isGameOver, finalGame } = _endTurnInternal(game, playerId, null, { players, educatedMerchantState: { board } });
            Object.assign(updates, endUpdates);
            if (logEvents.length > 0) updates['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);
            return { updates, needsQuestion: null, isGameOver, finalGame };

        } else if (landingProperty.ownerId === playerId) {
             // Landed on own property, end turn.
            const { updates: endUpdates, isGameOver, finalGame } = _endTurnInternal(game, playerId, `${player.name} هبط على ملكيته.`, { players, educatedMerchantState: { board } });
            Object.assign(updates, endUpdates);
            if (logEvents.length > 0) updates['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);
            return { updates, needsQuestion: null, isGameOver, finalGame };
        }
        else {
            // Landed on unowned property, go to action phase.
            updates.gameState = 'property_action';
            updates['educatedMerchantState.timerEndsAt'] = addActionTimer(ACTION_TIME_SECONDS);
        }
    } else if (landingProperty.type === 'start') {
        // Landed on start, end turn.
        const { updates: endUpdates, isGameOver, finalGame } = _endTurnInternal(game, playerId, `${player.name} استراح عند نقطة البداية.`, { players, educatedMerchantState: { board } });
        Object.assign(updates, endUpdates);
        if (logEvents.length > 0) updates['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);
        return { updates, needsQuestion: null, isGameOver, finalGame };
        
    } else if (landingProperty.type === 'fine') {
        // Landed on fine, go to question phase.
        const token = newQuestionToken();
        updates.gameState = 'question';
        updates['educatedMerchantState.pendingFine'] = { playerId, fineAmount: landingProperty.fineAmount ?? DEFAULT_FINE };
        updates['educatedMerchantState.timerEndsAt'] = addActionTimer(QUESTION_TIME_SECONDS);
        updates['educatedMerchantState.questionToken'] = token;
        needsQuestion = { category: 'قسم الغرامات', token };
    }

    if (logEvents.length > 0) updates['educatedMerchantState.activityLog'] = arrayUnion(...logEvents);
    return { updates, needsQuestion, isGameOver: false, finalGame: null };
}

export function _purchaseProperty(game: Game, playerId: string) {
    if (game.gameState !== 'property_action') throw new Error('Not in property action state.');
    const turnOrder = ensure(game.educatedMerchantState?.turnOrder);
    const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex);
    if (turnOrder[currentTurnIndex] !== playerId) throw new Error('Not your turn.');

    const players = clonePlayers(game.players);
    const board = cloneBoard(ensure(game.educatedMerchantState?.board));
    const playerIndex = getPlayerIndexById(players, playerId);
    const player = players[playerIndex];
    const property = ensure(board[player.position]);

    if (property.type !== 'property' || property.ownerId) throw new Error('Property not available.');
    if ((player.money || 0) < property.price) throw new Error('Not enough money.');
    
    player.money -= property.price;
    const token = newQuestionToken();
    const updates = {
        players,
        gameState: 'question' as const,
        'educatedMerchantState.timerEndsAt': addActionTimer(QUESTION_TIME_SECONDS),
        'educatedMerchantState.pendingPurchase': { playerId, propertyId: property.id, price: property.price, questionId: null, propertyName: property.name },
        'educatedMerchantState.questionToken': token,
    };
    return { updates, needsQuestion: { category: property.category, token } };
}

export function _answerQuestion(game: Game, playerId: string, answer: string) {
    const { pendingPurchase, pendingFine, currentQuestion } = ensure(game.educatedMerchantState);
    if (game.gameState !== 'question' || (!pendingPurchase && !pendingFine) || (pendingPurchase?.playerId !== playerId && pendingFine?.playerId !== playerId)) throw new Error('Not valid to answer question.');
    
    const question = ensure(currentQuestion);
    const isCorrect = answer === question.answer;

    const players = clonePlayers(game.players);
    const board = cloneBoard(ensure(game.educatedMerchantState.board));
    const playerIndex = getPlayerIndexById(players, playerId);
    let activityMessage = '';
    let extraUpdates = {};

    if (pendingPurchase) {
        const propertyName = pendingPurchase.propertyName || 'عقار';
        if (isCorrect) {
            const propIndex = board.findIndex(p => p.id === pendingPurchase.propertyId);
            if (propIndex !== -1) {
                board[propIndex].ownerId = playerId;
                board[propIndex].color = players[playerIndex].color;
            }
            players[playerIndex].propertiesCount = (players[playerIndex].propertiesCount || 0) + 1;
            activityMessage = `${players[playerIndex].name} أجاب بشكل صحيح وامتلك "${propertyName}"!`;
            extraUpdates = { 'educatedMerchantState.newlyBoughtPropertyId': pendingPurchase.propertyId };
        } else {
            const refund = Math.round((pendingPurchase.price || 0) / 4);
            players[playerIndex].money += refund;
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
                players[playerIndex].money -= fine;
                activityMessage = `${players[playerIndex].name} أجاب خطأ ودفع غرامة ${fine} دينار.`;
            }
        }
    }

    const { updates, isGameOver, finalGame } = _endTurnInternal(game, playerId, activityMessage, { players, educatedMerchantState: { board } });
    
    Object.assign(updates, {
      ...extraUpdates,
      'educatedMerchantState.pendingPurchase': deleteField(),
      'educatedMerchantState.pendingFine': deleteField(),
      'educatedMerchantState.currentQuestion': deleteField(),
      'educatedMerchantState.questionToken': deleteField(),
    });

    return { updates, isGameOver, finalGame };
}

export function _endTurn(game: Game, playerId: string) {
    if (game.gameState !== 'property_action') throw new Error('Not in property action state.');
    const turnOrder = ensure(game.educatedMerchantState?.turnOrder);
    if (turnOrder[ensure(game.educatedMerchantState.currentTurnIndex)] !== playerId) throw new Error('Not your turn.');
    
    const player = game.players.find(p => p.id === playerId);
    return _endTurnInternal(game, playerId, `${player?.name} قرر عدم شراء العقار.`);
}

export function _handleTimeout(game: Game) {
  const timerEndsAt = game.educatedMerchantState?.timerEndsAt;
  if (!timerEndsAt || Date.now() < timerEndsAt.toMillis()) {
    return { updates: {}, isGameOver: false, finalGame: null, needsQuestion: null };
  }

  const state = game.gameState;
  const turnOrder = ensure(game.educatedMerchantState?.turnOrder);
  const currentPlayerId = turnOrder[ensure(game.educatedMerchantState?.currentTurnIndex)];

  if (state === 'rolling') {
    return _rollDice(game, currentPlayerId);
  } else if (state === 'property_action') {
    return _endTurn(game, currentPlayerId);
  } else if (state === 'question') {
    return _answerQuestion(game, currentPlayerId, '__TIMEOUT__');
  }

  // Fallback for safety
  return _endTurnInternal(game, currentPlayerId, `انتهى وقت اللاعب ${game.players.find(p => p.id === currentPlayerId)?.name} وتخطى دوره.`);
}
