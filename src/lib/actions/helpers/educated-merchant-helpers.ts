import type { Game, Player, Property, EducatedMerchantQuestion } from '@/types';
import { shuffle } from '../helpers';
import { Timestamp, deleteField, arrayUnion } from 'firebase/firestore';
import { PROPERTY_NAMES } from '@/data/properties';
import { getEducatedMerchantCategories } from '../../actions/admin/settings';

// -----------------------------
// Constants (keep names as requested)
// -----------------------------
const BOARD_SIZE = 28;
const START_MONEY = 1000;
const PASS_GO_REWARD = 200;
const ACTION_TIME_SECONDS = 35;
const QUESTION_TIME_SECONDS = 20;
const MAX_FINES = 3;
const DEFAULT_FINE = 100;
const DEFAULT_MAX_ROUNDS = 20;
const COLORS = ['#F44336', '#2196F3', '#4CAF50', '#FFC107', '#9C27B0', '#009688', '#E91E63', '#607D8B'] as const;
const DICE_MIN = 1;
const DICE_MAX = 6;

// -----------------------------
// Types (stronger result contracts)
// -----------------------------
export type QuestionRequest = { category: string; token: string };

export interface RollDiceResult {
  updates: Record<string, any>;
  needsQuestion: QuestionRequest | null;
  isGameOver: boolean;
  finalGame: Game | null;
}

export interface PurchasePropertyResult {
  updates: Record<string, any>;
  needsQuestion: QuestionRequest;
}

export interface AnswerQuestionResult {
  updates: Record<string, any>;
  isGameOver: boolean;
  finalGame: Game | null;
}

export interface EndTurnResult {
  updates: Record<string, any>;
  isGameOver: boolean;
  finalGame: Game | null;
}

// -----------------------------
// Pure Helper Functions (keep names, improve internals)
// -----------------------------
const EM = 'educatedMerchantState';

const nowTimestamp = (): Timestamp => Timestamp.now();
const addActionTimer = (seconds: number): Timestamp => Timestamp.fromMillis(Date.now() + seconds * 1000);
const randomDiceRoll = (diceMax?: number): number => {
  const max = Math.max(DICE_MIN, diceMax ?? DICE_MAX);
  return Math.floor(Math.random() * (max - DICE_MIN + 1)) + DICE_MIN;
};
const getPlayerIndexById = (players: Player[], playerId: string): number => players.findIndex((p) => p.id === playerId);
const ensure = <T>(val: T | undefined | null, message = 'Unexpected missing value'): T => {
  if (val === undefined || val === null) throw new Error(message);
  return val;
};
const clonePlayers = (players: Player[]): Player[] => players.map((p) => ({ ...p }));
const cloneBoard = (board: Property[]): Property[] => board.map((b) => ({ ...b }));
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

// Compose multiple log lines into one when we must defer to _endTurnInternal's single-log behavior
const composeLog = (parts: string[]): string | null => {
  const txt = parts.filter(Boolean).join(' ');
  return txt.length ? txt : null;
};

// -----------------------------
// Internal Logic Functions (Pure)
// -----------------------------

export function _generateBoard(categories: string[]): Property[] {
  const board: (Property | null)[] = new Array(BOARD_SIZE).fill(null);
  board[0] = { id: 0, type: 'start', name: 'نقطة البداية', category: '', price: 0, rent: 0, ownerId: null } as Property;

  // Pick fine tiles (unique positions, not 0, not necessarily the last)
  const finePositions = new Set<number>();
  while (finePositions.size < MAX_FINES) {
    const pos = Math.floor(Math.random() * (BOARD_SIZE - 2)) + 1; // 1..BOARD_SIZE-2
    if (!finePositions.has(pos)) finePositions.add(pos);
  }

  let fineAmount = DEFAULT_FINE;
  finePositions.forEach((pos) => {
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
  });

  const availablePropertyNames = shuffle([...PROPERTY_NAMES]);
  const propertyCategories = categories.filter((c) => c !== 'قسم الغرامات');

  for (let i = 1; i < BOARD_SIZE; i++) {
    if (board[i]) continue;
    const name = availablePropertyNames.pop() || `عقار ${i}`;
    const price = Math.round((Math.random() * (500 - 100) + 100) / 10) * 10;
    const category = propertyCategories.length > 0 ? propertyCategories[Math.floor(Math.random() * propertyCategories.length)] : '';
    board[i] = { id: i, type: 'property', name, category, price, rent: Math.round(price / 4), ownerId: null } as Property;
  }

  // All slots are filled at this point
  return board as Property[];
}

export async function _getInitialGameState(players: Player[]) {
  // Fetch categories from admin settings if available
  const categoriesResult = await getEducatedMerchantCategories();
  const categories = categoriesResult.categories || ['علوم', 'رياضيات', 'برمجة', 'أحياء', 'كيمياء', 'قسم الغرامات'];
  const board = _generateBoard(categories);
  const turnOrder = shuffle(players.map((p) => p.id));
  const assignedColors = shuffle([...COLORS]);
  const ts = nowTimestamp();

  const updatedPlayers = players.map((p, i) => ({
    ...p,
    money: START_MONEY,
    position: 0,
    propertiesCount: 0,
    status: 'alive' as const,
    color: assignedColors[i % assignedColors.length],
  }));

  return {
    updates: {
      players: updatedPlayers,
      gameState: 'rolling',
      [`${EM}.board`]: board,
      [`${EM}.settings`]: { maxRounds: DEFAULT_MAX_ROUNDS, categories, diceMax: DICE_MAX },
      [`${EM}.turnOrder`]: turnOrder,
      [`${EM}.currentTurnIndex`]: 0,
      [`${EM}.activityLog`]: [{ message: 'بدأت اللعبة!', timestamp: ts }],
      [`${EM}.timerEndsAt`]: addActionTimer(ACTION_TIME_SECONDS),
      [`${EM}.movesThisRound`]: 0,
      [`${EM}.activeCountAtRoundStart`]: updatedPlayers.length,
      round: 1,
    },
  };
}

export function _rollDice(game: Game, playerId: string): RollDiceResult {
  if (game.gameState !== 'rolling') throw new Error('Not in rolling state.');
  const turnOrder = ensure(game.educatedMerchantState?.turnOrder);
  const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex);
  if (turnOrder[currentTurnIndex] !== playerId) throw new Error('Not your turn.');

  const ts = nowTimestamp();
  const players = clonePlayers(game.players);
  const board = cloneBoard(ensure(game.educatedMerchantState?.board));
  const playerIndex = getPlayerIndexById(players, playerId);
  const player = players[playerIndex];

  const diceMax = game.educatedMerchantState?.settings?.diceMax ?? DICE_MAX;
  const diceRollResult = randomDiceRoll(diceMax);
  const oldPosition = player.position;
  const newPosition = (oldPosition + diceRollResult) % BOARD_SIZE;
  player.position = newPosition;

  const landing = ensure(board[newPosition]);
  const diceLog = `${player.name} رمى ${diceRollResult} وتحرك إلى "${landing.name}".`;
  const logs: { message: string; timestamp: Timestamp }[] = [{ message: diceLog, timestamp: ts }];

  if (newPosition < oldPosition) {
    player.money = (player.money || 0) + PASS_GO_REWARD;
    logs.push({ message: `${player.name} مر بنقطة البداية، وحصل على ${PASS_GO_REWARD} دينار.`, timestamp: ts });
  }

  const baseUpdates: Record<string, any> = {
    players,
    [`${EM}.lastDiceRoll`]: diceRollResult,
    [`${EM}.displayingRollResult`]: { number: diceRollResult, nonce: Date.now() },
    [`${EM}.rollAnimationNonce`]: Date.now(),
  };

  let needsQuestion: QuestionRequest | null = null;

  // --- Tile handling ---
  if (landing.type === 'property') {
    if (landing.ownerId && landing.ownerId !== playerId) {
      const ownerIndex = getPlayerIndexById(players, landing.ownerId);
      const owner = ownerIndex >= 0 ? players[ownerIndex] : undefined;
      const rent = landing.rent || 0;

      if (owner) {
        if ((player.money || 0) < rent) {
          const payAll = player.money || 0;
          owner.money = (owner.money || 0) + payAll;
          player.money = 0;
          player.status = 'bankrupt';
          player.bankruptAt = ts;
          logs.push({ message: `${player.name} أفلس لأنه لم يستطع دفع الإيجار لـ ${owner.name}.`, timestamp: ts });
        } else {
          player.money -= rent;
          owner.money += rent;
          logs.push({ message: `${player.name} دفع ${rent} دينار إيجار لـ ${owner.name}.`, timestamp: ts });
        }
      } else {
        // Edge case: property has ownerId not present in players list
        logs.push({ message: `ملاحظة: المالك غير موجود في قائمة اللاعبين لـ "${landing.name}".`, timestamp: ts });
      }

      const msg = composeLog(logs.map((l) => l.message));
      const { updates: endUpdates, isGameOver, finalGame } = _endTurnInternal(
        game,
        playerId,
        msg,
        { players, board }
      );

      return {
        updates: {
          ...baseUpdates,
          [`${EM}.lastRentPayment`]: owner ? { payer: player.name, owner: owner.name, amount: rent, nonce: Date.now() } : deleteField(),
          ...endUpdates,
        },
        needsQuestion: null,
        isGameOver,
        finalGame,
      };
    } else if (landing.ownerId === playerId) {
      logs.push({ message: `${player.name} هبط على ملكيته.`, timestamp: ts });
      const msg = composeLog(logs.map((l) => l.message));
      const { updates: endUpdates, isGameOver, finalGame } = _endTurnInternal(game, playerId, msg, { players, board });
      return { updates: { ...baseUpdates, ...endUpdates }, needsQuestion: null, isGameOver, finalGame };
    } else {
      // Unowned property: allow purchase decision
      return {
        updates: {
          ...baseUpdates,
          gameState: 'property_action',
          [`${EM}.timerEndsAt`]: addActionTimer(ACTION_TIME_SECONDS),
          [`${EM}.activityLog`]: arrayUnion(...logs),
        },
        needsQuestion: null,
        isGameOver: false,
        finalGame: null,
      };
    }
  }

  if (landing.type === 'start') {
    logs.push({ message: `${player.name} استراح عند نقطة البداية.`, timestamp: ts });
    const msg = composeLog(logs.map((l) => l.message));
    const { updates: endUpdates, isGameOver, finalGame } = _endTurnInternal(game, playerId, msg, { players, board });
    return { updates: { ...baseUpdates, ...endUpdates }, needsQuestion: null, isGameOver, finalGame };
  }

  if (landing.type === 'fine') {
    const token = newQuestionToken();
    return {
      updates: {
        ...baseUpdates,
        gameState: 'question',
        [`${EM}.pendingFine`]: { playerId, fineAmount: landing.fineAmount ?? DEFAULT_FINE },
        [`${EM}.timerEndsAt`]: addActionTimer(QUESTION_TIME_SECONDS),
        [`${EM}.questionToken`]: token,
        [`${EM}.activityLog`]: arrayUnion(...logs),
      },
      needsQuestion: { category: 'قسم الغرامات', token },
      isGameOver: false,
      finalGame: null,
    };
  }

  // Fallback for any other tile type
  const msg = composeLog(logs.map((l) => l.message));
  const { updates: endUpdates, isGameOver, finalGame } = _endTurnInternal(game, playerId, msg, { players, board });
  return { updates: { ...baseUpdates, ...endUpdates }, needsQuestion: null, isGameOver, finalGame };
}

export function _purchaseProperty(game: Game, playerId: string): PurchasePropertyResult {
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

  // IMPORTANT: use dot-path updates to avoid overwriting the whole educatedMerchantState object
  const updates = {
    players,
    gameState: 'question' as const,
    [`${EM}.timerEndsAt`]: addActionTimer(QUESTION_TIME_SECONDS),
    [`${EM}.pendingPurchase`]: { playerId, propertyId: property.id, price: property.price, questionId: null, propertyName: property.name },
    [`${EM}.questionToken`]: token,
  };

  return { updates, needsQuestion: { category: property.category, token } };
}

export function _answerQuestion(game: Game, playerId: string, answer: string): AnswerQuestionResult {
  const { pendingPurchase, pendingFine, currentQuestion } = ensure(game.educatedMerchantState);
  if (
    game.gameState !== 'question' ||
    (!pendingPurchase && !pendingFine) ||
    (pendingPurchase?.playerId !== playerId && pendingFine?.playerId !== playerId)
  )
    throw new Error('Not valid to answer question.');

  const question = ensure(currentQuestion as EducatedMerchantQuestion);
  const isCorrect = answer === question.answer;

  const ts = nowTimestamp();
  const players = clonePlayers(game.players);
  const board = cloneBoard(ensure(game.educatedMerchantState.board));
  const playerIndex = getPlayerIndexById(players, playerId);

  let activityMessage = '';
  let extraUpdates: Record<string, any> = {};

  if (pendingPurchase) {
    const propertyName = pendingPurchase.propertyName || 'عقار';
    if (isCorrect) {
      const propIndex = board.findIndex((p) => p.id === pendingPurchase.propertyId);
      if (propIndex !== -1) {
        board[propIndex].ownerId = playerId;
        board[propIndex].color = players[playerIndex].color;
      }
      players[playerIndex].propertiesCount = (players[playerIndex].propertiesCount || 0) + 1;
      activityMessage = `${players[playerIndex].name} أجاب بشكل صحيح وامتلك "${propertyName}"!`;
      extraUpdates = { [`${EM}.newlyBoughtPropertyId`]: pendingPurchase.propertyId };
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
        players[playerIndex].bankruptAt = ts;
        activityMessage = `${players[playerIndex].name} أجاب خطأ وأفلس لأنه لم يستطع دفع الغرامة.`;
      } else {
        players[playerIndex].money -= fine;
        activityMessage = `${players[playerIndex].name} أجاب خطأ ودفع غرامة ${fine} دينار.`;
      }
    }
  }

  const { updates, isGameOver, finalGame } = _endTurnInternal(game, playerId, activityMessage, { players, board });

  Object.assign(updates, {
    ...extraUpdates,
    [`${EM}.pendingPurchase`]: deleteField(),
    [`${EM}.pendingFine`]: deleteField(),
    [`${EM}.currentQuestion`]: deleteField(),
    [`${EM}.questionToken`]: deleteField(),
  });

  return { updates, isGameOver, finalGame };
}

export function _endTurn(game: Game, playerId: string): EndTurnResult {
  if (game.gameState !== 'property_action') throw new Error('Not in property action state.');
  const turnOrder = ensure(game.educatedMerchantState?.turnOrder);
  if (turnOrder[ensure(game.educatedMerchantState.currentTurnIndex)] !== playerId) throw new Error('Not your turn.');

  const player = game.players.find((p) => p.id === playerId);
  return _endTurnInternal(game, playerId, `${player?.name} قرر عدم شراء العقار.`);
}

export function _handleTimeout(game: Game): RollDiceResult {
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
  return _endTurnInternal(
    game,
    currentPlayerId,
    `انتهى وقت اللاعب ${game.players.find((p) => p.id === currentPlayerId)?.name} وتخطى دوره.`
  ) as RollDiceResult;
}

function _endTurnInternal(
  game: Game,
  playerId: string,
  extraMessage: string | null = null,
  extraUpdates?: { players?: Player[]; board?: Property[] }
): EndTurnResult {
  const players = extraUpdates?.players ? clonePlayers(extraUpdates.players) : clonePlayers(game.players);
  const board = extraUpdates?.board ? cloneBoard(extraUpdates.board) : cloneBoard(ensure(game.educatedMerchantState?.board));

  const ts = nowTimestamp();
  const logEvents: { message: string; timestamp: Timestamp }[] = extraMessage ? [{ message: extraMessage, timestamp: ts }] : [];

  // Release properties for any bankrupt owner
  for (let i = 0; i < board.length; i++) {
    const prop = board[i];
    if (!prop) continue;
    const owner = players.find((p) => p.id === prop.ownerId);
    if (owner && owner.status === 'bankrupt') {
      logEvents.push({ message: `تم تحرير "${prop.name}" بعد إفلاس ${owner.name}.`, timestamp: ts });
      board[i] = { ...prop, ownerId: null, color: undefined };
    }
  }

  // Normalize bankrupt balances
  players.forEach((p) => {
    if (p.status === 'bankrupt' && (p.money || 0) > 0) p.money = 0;
  });

  const activePlayers = players.filter((p) => p.status === 'alive');
  let isGameOver = activePlayers.length <= 1;

  const turnOrder = ensure(game.educatedMerchantState?.turnOrder);
  const currentTurnIndex = ensure(game.educatedMerchantState?.currentTurnIndex);
  let nextTurnIndex = findNextAliveIndex(turnOrder, players, currentTurnIndex);

  // Round bookkeeping
  const movesThisRound = game.educatedMerchantState?.movesThisRound ?? 0;
  const activeAtRoundStart = game.educatedMerchantState?.activeCountAtRoundStart ?? activePlayers.length;
  let newMoves = movesThisRound + 1;
  let currentRound = game.round || 1;
  let newActiveAtRoundStart = activeAtRoundStart;

  if (newMoves >= newActiveAtRoundStart) {
    currentRound += 1;
    newMoves = 0;
    newActiveAtRoundStart = players.filter((p) => p.status === 'alive').length;
  }

  const maxRounds = game.educatedMerchantState?.settings?.maxRounds || DEFAULT_MAX_ROUNDS;
  if (currentRound > maxRounds) {
    isGameOver = true;
  }

  if (isGameOver) {
    const winner = activePlayers.reduce((a, b) => ((a.money || 0) > (b.money || 0) ? a : b), activePlayers[0] || null);
    const message = activePlayers.length <= 1
      ? `اللاعب ${winner?.name || ''} هو الناجي الأخير!`
      : `انتهت الجولات! الفائز هو ${winner?.name || ''} بأعلى رصيد.`;

    const finalGameData: Game = {
      ...game,
      players,
      educatedMerchantState: { ...game.educatedMerchantState, board },
      gameState: 'final_results',
      gameResult: { winner: winner?.id || 'none', message },
    } as Game;

    const updates: Record<string, any> = {
      gameState: 'final_results',
      gameResult: finalGameData.gameResult,
      players,
      [`${EM}.board`]: board,
      [`${EM}.timerEndsAt`]: deleteField(),
    };
    if (logEvents.length > 0) {
      updates[`${EM}.activityLog`] = arrayUnion(...logEvents);
    }
    return { isGameOver: true, updates, finalGame: finalGameData };
  }

  if (nextTurnIndex === -1) {
    // Should not happen if game over check is correct, but keep a safe fallback
    return { isGameOver: true, updates: {}, finalGame: null };
  }

  const finalUpdates: Record<string, any> = {
    gameState: 'rolling',
    [`${EM}.board`]: board,
    [`${EM}.currentTurnIndex`]: nextTurnIndex,
    [`${EM}.timerEndsAt`]: addActionTimer(ACTION_TIME_SECONDS),
    round: currentRound,
    players,
    [`${EM}.movesThisRound`]: newMoves,
    [`${EM}.activeCountAtRoundStart`]: newActiveAtRoundStart,
    [`${EM}.lastRentPayment`]: deleteField(),
    [`${EM}.newlyBoughtPropertyId`]: deleteField(),
  };

  if (logEvents.length > 0) finalUpdates[`${EM}.activityLog`] = arrayUnion(...logEvents);

  return { isGameOver: false, updates: finalUpdates, finalGame: null };
}
