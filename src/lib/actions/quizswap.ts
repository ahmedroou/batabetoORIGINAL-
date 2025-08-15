
'use server';

/**
 * @fileoverview Server actions for the QuizSwap game.
 * This file contains the core logic for managing the game state,
 * handling player actions, and progressing through game phases.
 */

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, QuizSwapCard, QuizSwapState, QuizSwapPlayerState } from '@/types';
import { shuffle } from './helpers';
import { QUIZ_SWAP_DECK_MAP, QUIZ_SWAP_DECK } from '@/data/quiz-swap-cards';
import { updateLeagueScoresForGameEnd } from './user';

// --- Utilities & Constants ---
const now = () => Timestamp.now();
const inSec = (s: number) => Timestamp.fromMillis(Date.now() + s * 1000);

const getPlayer = (game: Game, playerId: string): QuizSwapPlayerState | undefined => {
  return (game.quizSwapState?.players || []).find(p => p.id === playerId);
};

const requirePlayer = (game: Game, playerId: string): QuizSwapPlayerState => {
  const player = getPlayer(game, playerId);
  if (!player) throw new Error(`Player ${playerId} not found in game ${game.id}`);
  return player;
};

const requireHost = (game: Game, hostId: string) => {
  if (game.hostId !== hostId) throw new Error('Only the host can perform this action.');
};

const isMyTurn = (game: Game, playerId: string): boolean => {
    const state = game.quizSwapState;
    if(!state) return false;
    return state.players[state.turnIndex].id === playerId;
}

// --- Game Initialization ---

export async function startGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    requireHost(game, hostId);
    if (game.gameState !== 'lobby') return;
    if (game.players.length < 2) throw new Error('QuizSwap requires at least 2 players.');

    const shuffledDeck = shuffle([...QUIZ_SWAP_DECK]);
    const players: QuizSwapPlayerState[] = game.players.map(p => ({
      ...p,
      hand: [],
      score: 10,
      protectedIds: [],
      viewedSelf: [],
      viewedByOpp: {},
    }));
    
    // Deal 4 cards to each player
    for (let i = 0; i < 4; i++) {
      for (const player of players) {
        const card = shuffledDeck.pop();
        if (card) {
          player.hand.push(card.id);
        }
      }
    }
    
    const discardPile: string[] = [];
    const firstDiscard = shuffledDeck.pop();
    if (firstDiscard) {
        discardPile.push(firstDiscard.id);
    }

    const quizSwapState: QuizSwapState = {
      settings: {
        turnSeconds: 30,
        peekPhaseSeconds: 20,
        answerSeconds: 20,
        endAfterRounds: 5,
        penalty: { easy: 3, medium: 2, hard: 1 },
      },
      players: players,
      drawPile: shuffledDeck.map(c => c.id),
      discardPile: discardPile,
      round: 1,
      turnIndex: 0,
      phase: 'peek',
      timerEndsAt: inSec(20),
      log: [{ t: Date.now(), event: 'game_start' }],
    };

    tx.update(gameRef, {
      gameState: 'peek', // Transition to the new game state
      quizSwapState: quizSwapState,
    });
  });
}

// --- Player Actions ---

export async function drawFromDeck(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
      const gameDoc = await tx.get(gameRef);
      if(!gameDoc.exists()) throw new Error("Game not found.");
      const game = gameDoc.data() as Game;

      if(!isMyTurn(game, playerId)) throw new Error("Not your turn.");

      const state = game.quizSwapState!;
      const newCardId = state.drawPile.pop();
      if(!newCardId) throw new Error("Draw pile is empty.");
      
      const playerState = requirePlayer(game, playerId);
      if(playerState.hand.length >= 5) throw new Error("Hand is full.");
      playerState.hand.push(newCardId);

      tx.update(gameRef, { 
          'quizSwapState.players': state.players, 
          'quizSwapState.drawPile': state.drawPile,
          'quizSwapState.phase': 'playing'
      });
  });
}

export async function drawFromDiscard(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
      const gameDoc = await tx.get(gameRef);
      if(!gameDoc.exists()) throw new Error("Game not found.");
      const game = gameDoc.data() as Game;
      const state = game.quizSwapState!;
      if(state.players[state.turnIndex].id !== playerId) throw new Error("Not your turn.");

      const newCardId = state.discardPile.pop();
      if(!newCardId) throw new Error("Discard pile is empty.");
      const newCard = QUIZ_SWAP_DECK_MAP.get(newCardId);
      if(newCard?.kind === 'special') {
          state.discardPile.push(newCardId); // put it back
          throw new Error("Cannot pick up a special card from the discard pile.");
      }
      
      const playerState = requirePlayer(game, playerId);
      if(playerState.hand.length >= 5) throw new Error("Hand is full.");
      playerState.hand.push(newCardId);

      tx.update(gameRef, { 
          'quizSwapState.players': state.players, 
          'quizSwapState.discardPile': state.discardPile,
          'quizSwapState.phase': 'playing'
        });
  });
}

export async function playCard(gameId: string, playerId: string, cardId: string, targetPlayerId?: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if(!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const state = game.quizSwapState!;
        if(!isMyTurn(game, playerId)) throw new Error("Not your turn.");
        if(state.phase !== 'playing') throw new Error("You can only play cards during your turn.");
        
        const playerState = requirePlayer(game, playerId);
        const cardIndex = playerState.hand.indexOf(cardId);
        if(cardIndex === -1) throw new Error("Card not in hand.");
        const card = QUIZ_SWAP_DECK_MAP.get(cardId);
        if(!card) throw new Error("Invalid card.");
        
        // Remove card from hand
        playerState.hand.splice(cardIndex, 1);

        if(card.kind === 'question') {
            state.discardPile.push(cardId);
        } else { // Special card
            switch(card.effect) {
                case 'PeekSelf':
                    playerState.viewedSelf = [...new Set([...(playerState.viewedSelf || []), cardId])];
                    break;
                case 'PeekOpponent': {
                    if(!targetPlayerId) throw new Error("Target player required for PeekOpponent.");
                    const targetPlayer = requirePlayer(game, targetPlayerId);
                    if(!targetPlayer.hand[0]) throw new Error("Target player has no cards to peek.");
                    const cardToPeek = targetPlayer.hand[0]; // Peek the first card for simplicity
                    targetPlayer.viewedByOpp[cardToPeek] = [...(targetPlayer.viewedByOpp[cardToPeek] || []), playerId];
                    break;
                }
                case 'SwapWithOpponent': {
                    if(!targetPlayerId) throw new Error("Target player required for Swap.");
                    const targetPlayer = requirePlayer(game, targetPlayerId);
                    if(!targetPlayer.hand.length || !playerState.hand.length) throw new Error("Both players must have cards to swap.");
                    // Simple swap: first card
                    const myCardToSwap = playerState.hand.pop()!;
                    const theirCardToSwap = targetPlayer.hand.pop()!;
                    playerState.hand.push(theirCardToSwap);
                    targetPlayer.hand.push(myCardToSwap);
                    break;
                }
                case 'Burden': {
                    if(!targetPlayerId) throw new Error("Target player required for Burden.");
                    const targetPlayer = requirePlayer(game, targetPlayerId);
                    if(playerState.hand.length < 1) throw new Error("You have no card to give.");
                    const cardToGive = playerState.hand.pop()!;
                    targetPlayer.hand.push(cardToGive);
                    break;
                }
                case 'Shield':
                     playerState.protectedIds = [...(playerState.protectedIds || []), cardId];
                     break;
                // Other effects can be implemented here
            }
            if (card.effect !== 'Shield') {
                state.discardPile.push(cardId);
            }
        }
        
        tx.update(gameRef, { 'quizSwapState': state });
    });
}

export async function endTurn(gameId: string, playerId: string) {
   const gameRef = doc(db, 'games', gameId);
   await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if(!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const state = game.quizSwapState!;
        if(!isMyTurn(game, playerId)) throw new Error("Not your turn.");
        if (state.phase !== 'playing') throw new Error("Can only end turn during 'playing' phase.");
        
        const playerState = requirePlayer(game, playerId);
        if(playerState.hand.length > 4) throw new Error("You must discard down to 4 cards to end your turn.");
        
        const newTurnIndex = (state.turnIndex + 1) % state.players.length;
        const round = state.round + (newTurnIndex === 0 ? 1 : 0);

        tx.update(gameRef, {
            'quizSwapState.turnIndex': newTurnIndex,
            'quizSwapState.round': round,
            'quizSwapState.timerEndsAt': inSec(state.settings.turnSeconds),
            'quizSwapState.phase': 'playing'
        });
   });
}

export async function requestEndGame(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if(!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if(game.quizSwapState!.round < game.quizSwapState!.settings.endAfterRounds) {
            throw new Error("Cannot end the game before the minimum number of rounds.");
        }
        tx.update(gameRef, { 
            'quizSwapState.phase': 'answering',
            'quizSwapState.endGameRequestedBy': playerId
        });
    });
}

export async function submitAnswer(gameId: string, playerId: string, questionId: string, answer: string) {
    // Placeholder for submitting an answer
}
