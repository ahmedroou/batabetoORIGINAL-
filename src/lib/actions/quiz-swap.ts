
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
import { QUIZ_SWAP_DECK } from '@/data/quiz-swap-cards';
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
      viewedByOpp: [],
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
// NOTE: These are placeholders. The full logic for each action needs to be implemented.

export async function drawFromDeck(gameId: string, playerId: string) {
  // Placeholder for drawing from deck logic
}

export async function drawFromDiscard(gameId: string, playerId: string) {
  // Placeholder for drawing from discard logic
}

export async function playCard(gameId: string, playerId: string, cardId: string, targetPlayerId?: string) {
    // Placeholder for playing a card
}

export async function endTurn(gameId: string, playerId: string) {
    // Placeholder for ending a turn
}

export async function requestEndGame(gameId: string, playerId: string) {
    // Placeholder for requesting to end the game
}

export async function submitAnswer(gameId: string, playerId: string, questionId: string, answer: string) {
    // Placeholder for submitting an answer
}
