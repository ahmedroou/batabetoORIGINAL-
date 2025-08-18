

'use server';

/**
 * @fileoverview Server actions for the QuizSwap game — hardened & expanded.
 * - Enforces turn/phase rules, protected cards, and discard-pickup swap rule.
 * - Adds deck reshuffle, peek phase action, proper special effects, and endgame prep.
 * - Keeps types liberal to avoid breaking builds; annotate with comments where state is augmented.
 */

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, type Transaction } from 'firebase/firestore';
import type { Game, Player, QuizSwapCard, QuizSwapState, QuizSwapPlayerState, QuizSwapQuestionCard, QuizSwapSpecialCard } from '@/types';
import { shuffle, safeCompareStrings } from './helpers';
import { QUIZ_SWAP_DECK_MAP, QUIZ_SWAP_DECK } from '@/data/quiz-swap-cards';
import { updateLeagueScoresForGameEnd } from './user/leagues';

// -------------------- Utilities & Constants --------------------
const now = () => Timestamp.now();
const inSec = (s: number) => Timestamp.fromMillis(Date.now() + s * 1000);

const getPlayer = (game: Game, playerId: string): QuizSwapPlayerState | undefined =>
  (game.quizSwapState?.players || []).find((p) => p.id === playerId);

const requirePlayer = (game: Game, playerId: string): QuizSwapPlayerState => {
  const p = getPlayer(game, playerId);
  if (!p) throw new Error(`Player ${playerId} not found in game ${game.id}`);
  return p;
};

const requireHost = (game: Game, hostId: string) => {
  if (game.hostId !== hostId) throw new Error('Only the host can perform this action.');
};

const isMyTurn = (game: Game, playerId: string): boolean => {
  const state = game.quizSwapState;
  if (!state) return false;
  const currentPlayer = state.players[state.turnIndex];
  return currentPlayer?.id === playerId;
};

// Augmented state helpers (kept optional to avoid hard type coupling)
// @ts-expect-error: state augmentation kept flexible
const protectionExpires = (state: QuizSwapState) => (state.protectionExpires as Record<string, number> | undefined) || {};
// @ts-expect-error
const setProtectionExpires = (state: QuizSwapState, map: Record<string, number>) => (state.protectionExpires = map);
// @ts-expect-error
const exposedUntil = (state: QuizSwapState) => (state.exposedUntil as Record<string, number> | undefined) || {};
// @ts-expect-error
const setExposedUntil = (state: QuizSwapState, map: Record<string, number>) => (state.exposedUntil = map);

// Normalize top-of-pile semantics: top = last element
const popTop = (arr: string[]) => arr.pop();
const pushTop = (arr: string[], id: string) => arr.push(id);

const reshuffleIfNeeded = (state: QuizSwapState) => {
  if (state.drawPile.length > 0) return;
  // Keep the top of discard, reshuffle the rest into draw
  if (state.discardPile.length === 0) return; // fully empty — should be rare
  const keepTop = state.discardPile[state.discardPile.length - 1];
  const rest = state.discardPile.slice(0, -1);
  const shuffled = shuffle([...rest]);
  state.drawPile = shuffled;
  state.discardPile = [keepTop!];
};

const ensurePhase = (state: QuizSwapState, phases: QuizSwapState['phase'] | QuizSwapState['phase'][]) => {
  const ok = Array.isArray(phases) ? phases.includes(state.phase) : state.phase === phases;
  if (!ok) throw new Error('Invalid phase for this action.');
};

const ensureCardInHand = (player: QuizSwapPlayerState, cardId: string) => {
  if (!player.hand.includes(cardId)) throw new Error('Card is not in your hand.');
};

const ensureNotProtected = (state: QuizSwapState, player: QuizSwapPlayerState, cardId: string) => {
  // quick check against player's protectedIds array
  if (player.protectedIds?.includes(cardId)) throw new Error('This card is protected.');
  const pe = protectionExpires(state);
  if (pe[cardId] && state.round <= pe[cardId]) throw new Error('This card is protected until a future round.');
};

const discard = (state: QuizSwapState, cardId: string) => pushTop(state.discardPile, cardId);

// -------------------- Game Initialization --------------------
export async function startGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const game = gameSnap.data() as Game;

    requireHost(game, hostId);
    if (game.gameState !== 'lobby') return;
    if (game.players.length < 2) throw new Error('QuizSwap requires at least 2 players.');

    const deck = shuffle([...QUIZ_SWAP_DECK]);
    const players: QuizSwapPlayerState[] = game.players.map((p) => ({
      ...p,
      hand: [],
      score: 10,
      protectedIds: [],
      viewedSelf: [],
      viewedByOpp: {},
      // @ts-expect-error augment — for special state on player
      activatedSpecials: [], // e.g., FreeQuestion/BonusPoint ids kept in hand but "used"
      // @ts-expect-error
      answers: {},
    }));

    // Deal 4 to each player (top=last, so pop from end)
    for (let i = 0; i < 4; i++) {
      for (const pl of players) {
        const c = deck.pop();
        if (c) pl.hand.push(c.id);
      }
    }

    const discardPile: string[] = [];
    const first = deck.pop();
    if (first) discardPile.push(first.id); // face-up start

    const quizSwapState: QuizSwapState = {
      settings: {
        turnSeconds: 30,
        peekPhaseSeconds: 20,
        answerSeconds: 20,
        endAfterRounds: 5,
        penalty: { easy: 3, medium: 2, hard: 1 },
        // @ts-expect-error add judge threshold if absent in type
        judgeThreshold: 0.5,
      },
      players,
      drawPile: deck.map((c) => c.id),
      discardPile,
      round: 1,
      turnIndex: 0,
      phase: 'peek',
      // @ts-expect-error timer field may not exist in type
      timerEndsAt: inSec(20),
      log: [{ t: Date.now(), event: 'game_start' }],
    } as any;

    // Init protection/expose maps
    setProtectionExpires(quizSwapState, {});
    setExposedUntil(quizSwapState, {});

    tx.update(gameRef, {
      gameState: 'peek',
      quizSwapState,
    });
  });
}

// -------------------- Peek Phase --------------------
/** Player may peek exactly one of their cards during peek phase. */
export async function peekOwnCard(gameId: string, playerId: string, cardId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    const state = game.quizSwapState!;

    ensurePhase(state, 'peek');
    const player = requirePlayer(game, playerId);
    ensureCardInHand(player, cardId);

    if (player.viewedSelf && player.viewedSelf.length > 0) throw new Error('You already peeked a card.');

    player.viewedSelf = [cardId];

    // If all players peeked OR timer elapsed, transition to play phase
    const allPeeked = state.players.every((p) => (p.viewedSelf?.length || 0) > 0);
    if (allPeeked) {
      state.phase = 'playing';
      // start first turn timer
      // @ts-expect-error
      state.timerEndsAt = inSec(state.settings.turnSeconds);
    }

    tx.update(gameRef, { 'quizSwapState': state, gameState: state.phase === 'playing' ? 'playing' : 'peek' });
  });
}

// -------------------- Draw / Discard --------------------
export async function drawFromDeck(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const game = gameSnap.data() as Game;

    if (!isMyTurn(game, playerId)) throw new Error('Not your turn.');

    const state = game.quizSwapState!;
    ensurePhase(state, ['playing']);

    reshuffleIfNeeded(state);
    const newCardId = popTop(state.drawPile);
    if (!newCardId) throw new Error('Draw pile is empty.');

    const player = requirePlayer(game, playerId);
    if (player.hand.length >= 5) throw new Error('Hand is full (max 5 during actions).');

    player.hand.push(newCardId);
    
    // NEW LOGIC: check for hand size after draw
    if (player.hand.length >= 5) {
        state.phase = 'discarding';
    }

    tx.update(gameRef, {
      'quizSwapState': state,
      'gameState': state.phase
    });
  });
}

/**
 * Draw the top of discard — allowed only if it is a Question, and must immediately swap with a card from hand.
 */
export async function drawFromDiscard(gameId: string, playerId: string, swapOutCardId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const game = gameSnap.data() as Game;

    if (!isMyTurn(game, playerId)) throw new Error('Not your turn.');

    const state = game.quizSwapState!;
    ensurePhase(state, ['playing']);

    const topId = popTop(state.discardPile);
    if (!topId) throw new Error('Discard pile is empty.');
    const topCard = QUIZ_SWAP_DECK_MAP.get(topId);
    if (!topCard) throw new Error('Invalid card on discard.');
    if (topCard.kind === 'special') {
      // Put back and reject
      pushTop(state.discardPile, topId);
      throw new Error('Cannot pick up a special card from the discard pile.');
    }

    const player = requirePlayer(game, playerId);

    // Must swap immediately with a non-protected card in hand
    ensureCardInHand(player, swapOutCardId);
    ensureNotProtected(state, player, swapOutCardId);

    // Take discard card into hand, discard chosen one
    player.hand.push(topId);

    // Remove the chosen hand card
    const idx = player.hand.indexOf(swapOutCardId);
    if (idx === -1) throw new Error('Chosen swap-out card not in hand.');
    player.hand.splice(idx, 1);

    discard(state, swapOutCardId);
    
    // Hand size does not change, so no need for 'discarding' phase check here.

    tx.update(gameRef, {
      'quizSwapState.players': state.players,
      'quizSwapState.discardPile': state.discardPile,
    });
  });
}

// -------------------- Playing Cards (questions or specials) --------------------
export type PlayOptions = {
  targetPlayerId?: string; // opponent for effects
  targetCardId?: string;   // card id in target hand or self hand depending on effect
  myCardId?: string;       // explicit card from self hand (for swap/burden)
};

export async function playCard(
  gameId: string,
  playerId: string,
  cardId: string,
  options?: PlayOptions | string // keep backward-compat if an old client passes targetPlayerId string
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists()) throw new Error('Game not found.');
    const game = gameSnap.data() as Game;

    if (!isMyTurn(game, playerId)) throw new Error('Not your turn.');

    const state = game.quizSwapState!;
    ensurePhase(state, ['playing', 'discarding']);

    const player = requirePlayer(game, playerId);
    ensureCardInHand(player, cardId);

    // normalize options
    const opts: PlayOptions = typeof options === 'string' ? { targetPlayerId: options } : (options || {});

    const card = QUIZ_SWAP_DECK_MAP.get(cardId) as QuizSwapCard | undefined;
    if (!card) throw new Error('Invalid card.');

    if (card.kind === 'question') {
      // Player chooses to discard a question from hand
      // Check protection
      ensureNotProtected(state, player, cardId);
      // Remove & discard
      player.hand.splice(player.hand.indexOf(cardId), 1);
      discard(state, cardId);
      
      // If we were in discarding phase, move back to playing
      if(state.phase === 'discarding') {
          state.phase = 'playing';
      }

    } else {
      // Special effects
      const effect = (card as QuizSwapSpecialCard).effect;

      const discardAfterUse = () => {
        // remove special from hand and discard it
        const i = player.hand.indexOf(cardId);
        if (i >= 0) player.hand.splice(i, 1);
        discard(state, cardId);
        if(state.phase === 'discarding') {
            state.phase = 'playing';
        }
      };

      switch (effect) {
        case 'PeekSelf': {
          const target = opts.targetCardId;
          if (!target) throw new Error('Select one of your cards to peek.');
          ensureCardInHand(player, target);
          // mark as viewed
          player.viewedSelf = Array.from(new Set([...(player.viewedSelf || []), target]));
          discardAfterUse();
          break;
        }
        case 'PeekOpponent': {
          const oppId = opts.targetPlayerId;
          const target = opts.targetCardId;
          if (!oppId || !target) throw new Error('Target player and card are required for PeekOpponent.');
          const opp = requirePlayer(game, oppId);
          if (!opp.hand.includes(target)) throw new Error('Target card not in opponent hand.');
          // cannot peek protected? Rule allows seeing content; keep allowed but you still can’t steal/swap
          const map = (opp.viewedByOpp || {}) as Record<string, string[]>;
          map[target] = Array.from(new Set([...(map[target] || []), playerId]));
          opp.viewedByOpp = map;
          discardAfterUse();
          break;
        }
        case 'SwapWithOpponent': {
          const oppId = opts.targetPlayerId;
          const myCard = opts.myCardId;
          const theirCard = opts.targetCardId;
          if (!oppId || !myCard || !theirCard) throw new Error('Swap requires opponent id, your card id, and their card id.');
          const opp = requirePlayer(game, oppId);
          ensureCardInHand(player, myCard);
          if (!opp.hand.includes(theirCard)) throw new Error('Opponent card not found.');
          ensureNotProtected(state, player, myCard);
          ensureNotProtected(state, opp, theirCard);
          // swap
          player.hand.splice(player.hand.indexOf(myCard), 1, theirCard);
          opp.hand.splice(opp.hand.indexOf(theirCard), 1, myCard);
          discardAfterUse();
          break;
        }
        case 'Burden': {
          const oppId = opts.targetPlayerId;
          const myCard = opts.myCardId; // which card to give
          if (!oppId || !myCard) throw new Error('Burden requires opponent id and a card from your hand.');
          const opp = requirePlayer(game, oppId);
          ensureCardInHand(player, myCard);
          ensureNotProtected(state, player, myCard);
          // transfer
          player.hand.splice(player.hand.indexOf(myCard), 1);
          opp.hand.push(myCard);
          discardAfterUse();
          break;
        }
        case 'Shield': {
          const target = opts.targetCardId; // which of YOUR cards to shield
          if (!target) throw new Error('Choose one of your cards to shield.');
          ensureCardInHand(player, target);
          // Apply protection until end of next round
          const pe = { ...protectionExpires(state) };
          pe[target] = state.round + 1;
          setProtectionExpires(state, pe);
          player.protectedIds = Array.from(new Set([...(player.protectedIds || []), target]));
          discardAfterUse();
          break;
        }
        case 'Expose': {
          const oppId = opts.targetPlayerId;
          const target = opts.targetCardId; // card in that opponent's hand to expose
          if (!oppId || !target) throw new Error('Expose requires opponent and a target card.');
          const opp = requirePlayer(game, oppId);
          if (!opp.hand.includes(target)) throw new Error('Target card not in opponent hand.');
          const exp = { ...exposedUntil(state) };
          exp[target] = state.round; // visible to everyone except owner until round ends
          setExposedUntil(state, exp);
          discardAfterUse();
          break;
        }
        case 'FreeQuestion': {
          // Replace one of your question cards; the FreeQuestion special stays in hand and counts as auto-correct at end
          const target = opts.targetCardId;
          if (!target) throw new Error('Choose a question card in your hand to replace.');
          ensureCardInHand(player, target);
          const q = QUIZ_SWAP_DECK_MAP.get(target) as QuizSwapQuestionCard | undefined;
          if (!q || q.kind !== 'question') throw new Error('Target must be a question card.');
          // Remove target question and keep the FreeQuestion in hand (mark as activated)
          player.hand.splice(player.hand.indexOf(target), 1);
          discard(state, target);
          // mark special as activated so it cannot be re-used
          // @ts-expect-error augment
          player.activatedSpecials = Array.from(new Set([...(player.activatedSpecials || []), cardId]));
          // NOTE: do NOT discard the FreeQuestion card; it remains in hand as the slot placeholder
          if(state.phase === 'discarding') {
            state.phase = 'playing';
          }
          break;
        }
        case 'BonusPoint': {
          // Replace one of your questions; keep BonusPoint in hand; +1 will be applied at end
          const target = opts.targetCardId;
          if (!target) throw new Error('Choose a question card in your hand to replace.');
          ensureCardInHand(player, target);
          const q = QUIZ_SWAP_DECK_MAP.get(target) as QuizSwapQuestionCard | undefined;
          if (!q || q.kind !== 'question') throw new Error('Target must be a question card.');
          player.hand.splice(player.hand.indexOf(target), 1);
          discard(state, target);
          // mark as activated to prevent re-playing semantics (though it sits in hand)
          // @ts-expect-error augment
          player.activatedSpecials = Array.from(new Set([...(player.activatedSpecials || []), cardId]));
           if(state.phase === 'discarding') {
            state.phase = 'playing';
          }
          break;
        }
        default: {
          // Unknown specials fall back to discard to avoid softlocks
          discardAfterUse();
        }
      }
    }

    tx.update(gameRef, { 'quizSwapState': state, gameState: state.phase });
  });
}

// -------------------- Turn Management --------------------
export async function endTurn(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    const state = game.quizSwapState!;

    if (!isMyTurn(game, playerId)) throw new Error('Not your turn.');
    ensurePhase(state, ['playing']);

    // Advance turn & possibly round
    const nextTurn = (state.turnIndex + 1) % state.players.length;
    const newRound = state.round + (nextTurn === 0 ? 1 : 0);

    // Clear protections that expire before/equal to newRound when a new round begins
    if (nextTurn === 0) {
      const pe = { ...protectionExpires(state) };
      for (const [cid, exp] of Object.entries(pe)) {
        if (newRound > exp) {
          delete pe[cid];
          // also remove from owners' protectedIds arrays
          state.players.forEach((p) => (p.protectedIds = (p.protectedIds || []).filter((x) => x !== cid)));
        }
      }
      setProtectionExpires(state, pe);
      // clear exposes at round boundary
      setExposedUntil(state, {});
    }

    state.turnIndex = nextTurn;
    state.round = newRound;
    // @ts-expect-error timer field may not exist in type
    state.timerEndsAt = inSec(state.settings.turnSeconds);

    tx.update(gameRef, {
      'quizSwapState.turnIndex': nextTurn,
      'quizSwapState.round': newRound,
      'quizSwapState.timerEndsAt': state.timerEndsAt,
      'quizSwapState.phase': 'playing',
    });
  });
}

// -------------------- Ending the Game & Answer Phase --------------------
export async function requestEndGame(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    const state = game.quizSwapState!;

    if (state.round < state.settings.endAfterRounds) throw new Error('Cannot end the game before the minimum number of rounds.');

    // Prepare per-player answering queues and apply passive bonuses
    const answerPlan: Record<string, string[]> = {}; // playerId -> ordered question IDs to ask

    for (const p of state.players) {
      // BonusPoint: +1 per active bonus card present in hand and marked activated
      // @ts-expect-error augment
      const activated: string[] = p.activatedSpecials || [];

      const handCards = p.hand.map((cid) => QUIZ_SWAP_DECK_MAP.get(cid)).filter(Boolean) as QuizSwapCard[];

      // Auto-correct: FreeQuestion cards in hand (by id & effect) — do not ask any question for those slots
      const autoCorrectCount = handCards.filter((c) => c.kind === 'special' && (c as QuizSwapSpecialCard).effect === 'FreeQuestion' && activated.includes(c.id)).length;

      // Bonus points now
      const bonusCount = handCards.filter((c) => c.kind === 'special' && (c as QuizSwapSpecialCard).effect === 'BonusPoint' && activated.includes(c.id)).length;
      p.score += bonusCount; // apply +1 each

      // Collect questions from hand to ask (exclude specials entirely; FreeQuestion specials stay but skip asking)
      const questions = handCards.filter((c) => c.kind === 'question') as QuizSwapQuestionCard[];
      answerPlan[p.id] = questions.map((q) => q.id);

      // Pre-mark answers for auto-correct (no penalties later)
      if (autoCorrectCount > 0) {
        // No direct question ids for FreeQuestion; they act as placeholders. We simply allow fewer questions to be asked.
        // Nothing else needed here; scoring remains 10 + bonuses, penalties apply only on wrong answers among `questions`.
      }
    }

    // @ts-expect-error store plan in state
    state.answerPlan = answerPlan;
    // queue order in seating order
    // @ts-expect-error
    state.answeringQueue = state.players.map((p) => p.id);
    // @ts-expect-error
    state.currentPlayerAnswering = state.answeringQueue[0] || null;
    // @ts-expect-error
    state.currentQuestionIndex = 0;
    state.phase = 'answering';

    tx.update(gameRef, { quizSwapState: state, gameState: 'answering' });
  });
}

export async function submitAnswer(gameId: string, playerId: string, answer: string) {
  const gameRef = doc(db, 'games', gameId);
  let finalGame: Game | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    const state = game.quizSwapState!;

    if (state.phase !== 'answering') throw new Error('Not in answering phase.');
    // @ts-expect-error
    const queue: string[] = state.answeringQueue || [];
    // @ts-expect-error
    let curPlayerId: string | null = state.currentPlayerAnswering || null;
    if (!curPlayerId || curPlayerId !== playerId) throw new Error("It's not your turn to answer.");

    const plan: Record<string, string[]> = (state as any).answerPlan || {};
    const ids = plan[playerId] || [];
    // @ts-expect-error
    const idx: number = state.currentQuestionIndex || 0;

    if (idx >= ids.length) {
      // Nothing to answer; move on
      const nextIdx = queue.indexOf(playerId) + 1;
      if (nextIdx >= queue.length) {
        // end game
        finishGame(state, game);
        tx.update(gameRef, { quizSwapState: state, gameState: game.gameState, gameResult: game.gameResult });
        finalGame = game;
        return;
      } else {
        // advance to next player
        // @ts-expect-error
        state.currentPlayerAnswering = queue[nextIdx];
        // @ts-expect-error
        state.currentQuestionIndex = 0;
        tx.update(gameRef, { quizSwapState: state });
        return;
      }
    }

    const qId = ids[idx]!;
    const q = QUIZ_SWAP_DECK_MAP.get(qId) as QuizSwapQuestionCard | undefined;
    if (!q) throw new Error('Question not found.');

    const threshold = (state.settings as any).judgeThreshold ?? 0.5;
    const sim = safeCompareStrings(answer, q.answer);
    const isCorrect = sim >= threshold;

    const player = requirePlayer(game, playerId);
    if (!isCorrect) {
      const pen = state.settings.penalty[q.difficulty];
      player.score -= pen;
    }
    // record answer
    // @ts-expect-error optional answers map on player
    player.answers = { ...(player.answers || {}), [qId]: { answer, isCorrect, time: 0, sim } };

    // advance within player
    // @ts-expect-error
    state.currentQuestionIndex = idx + 1;

    if (state.currentQuestionIndex >= ids.length) {
      // move to next player or end
      const nextIdx = queue.indexOf(playerId) + 1;
      if (nextIdx >= queue.length) {
        finishGame(state, game);
        finalGame = game;
      } else {
        // @ts-expect-error
        state.currentPlayerAnswering = queue[nextIdx];
        // @ts-expect-error
        state.currentQuestionIndex = 0;
      }
    }

    tx.update(gameRef, { quizSwapState: state, gameState: game.gameState, gameResult: game.gameResult });
  });

  if (finalGame) {
    await updateLeagueScoresForGameEnd(finalGame).catch(() => void 0);
  }
}

// Helper to finalize standings
function finishGame(state: QuizSwapState, game: Game) {
  state.phase = 'final_results';
  game.gameState = 'final_results';
  // winner by highest score
  const sorted = [...state.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const winner = sorted[0];
  game.gameResult = { winner: winner?.id, message: `${winner?.name || 'Player'} is the winner!` } as any;
}
