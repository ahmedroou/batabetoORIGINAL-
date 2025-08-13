

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, deleteField } from 'firebase/firestore';
import type { Game, EducatedMerchantQuestion, Player } from '@/types';
import {
  _getInitialGameState,
  _rollDice,
  _purchaseProperty,
  _answerQuestion,
  _endTurn,
  _handleTimeout,
} from './helpers/educated-merchant-helpers';
import { fetchRandomQuestionForCategory } from './helpers/question-helpers';
import { updateLeagueScoresForGameEnd } from './user';


/**
 * Starts the "Educated Merchant" game. Only the host can perform this action.
 * This function prepares the initial game state, generates the board, and sets the first turn.
 * @param gameId - The ID of the game to start.
 * @param hostId - The ID of the user starting the game, who must be the host.
 * @throws Will throw an error if the game is not found, the user is not the host, or there are not enough players.
 */
export async function startGame(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);

  // Pre-transaction data fetching for game setup
  const initialGameState = await _getInitialGameState();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;

    if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
    if (game.players.length < 2) throw new Error('The game requires at least 2 players.');
    if (game.gameState !== 'lobby') return; // Idempotency check

    const { updates } = initialGameState;
    tx.update(gameRef, updates);
  });
}

/**
 * Handles a player's dice roll. This is the primary action for a player's turn.
 * This function will automatically handle subsequent events like rent payment, landing on special tiles,
 * and determining if the turn should end or proceed to another action state.
 * @param gameId - The ID of the current game.
 * @param playerId - The ID of the player rolling the dice.
 * @throws Will throw an error if it's not the player's turn or the game is in an incorrect state.
 */
export async function rollDice(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let postTransactionFetch: { category: string; token: string } | null = null;
  let finalGameData: Game | null = null;

  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    const { updates, needsQuestion, isGameOver, finalGame } = _rollDice(game, playerId);
    
    tx.update(gameRef, updates);

    if (needsQuestion) postTransactionFetch = needsQuestion;
    if (isGameOver && finalGame) finalGameData = finalGame;
  });

  if (postTransactionFetch) {
    const question = await fetchRandomQuestionForCategory('educated-merchant', postTransactionFetch.category);
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        // Verify that the game is still waiting for this specific question
        if(game.gameState === 'question' && game.educatedMerchantState?.questionToken === postTransactionFetch?.token) {
            tx.update(gameRef, { 'educatedMerchantState.currentQuestion': question });
        }
    });
  }

  if (finalGameData) {
    await updateLeagueScoresForGameEnd(finalGameData);
  }
}

/**
 * Initiates the purchase process for a property. This deducts the money from the player
 * and transitions the game to a 'question' state, waiting for the player to answer.
 * @param gameId - The ID of the current game.
 * @param playerId - The ID of the player attempting the purchase.
 * @throws Will throw an error if the purchase is not possible (e.g., not enough money, not player's turn).
 */
export async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let postTransactionFetch: { category: string; token: string } | null = null;

  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    const { updates, needsQuestion } = _purchaseProperty(game, playerId);
    
    tx.update(gameRef, updates);
    
    if (needsQuestion) postTransactionFetch = needsQuestion;
  });
  
  if (postTransactionFetch) {
    const question = await fetchRandomQuestionForCategory('educated-merchant', postTransactionFetch.category);
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        if(game.gameState === 'question' && game.educatedMerchantState?.questionToken === postTransactionFetch?.token) {
            tx.update(gameRef, { 'educatedMerchantState.currentQuestion': question });
        }
    });
  }
}

/**
 * Submits a player's answer to a question. This action resolves the 'question' state,
 * finalizing a property purchase or applying a fine, and then ends the player's turn.
 * @param gameId - The ID of the current game.
 * @param playerId - The ID of the player submitting the answer.
 * @param answer - The answer chosen by the player.
 * @throws Will throw an error if it's not the player's turn to answer or the game is in an incorrect state.
 */
export async function answerQuestion(gameId: string, playerId: string, answer: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    let finalGameData: Game | null = null;

    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found.');
        const game = gameDoc.data() as Game;

        const { updates, isGameOver, finalGame } = _answerQuestion(game, playerId, answer);
        
        tx.update(gameRef, updates);

        if (isGameOver && finalGame) finalGameData = finalGame;
    });

    if (finalGameData) {
        await updateLeagueScoresForGameEnd(finalGameData);
    }
}

/**
 * Ends a player's turn, typically used when a player chooses not to purchase a property.
 * @param gameId - The ID of the current game.
 * @param playerId - The ID of the player whose turn it is.
 * @throws Will throw an error if it's not the player's turn or the game is in an incorrect state.
 */
export async function endTurn(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found.');
        const game = gameDoc.data() as Game;
        
        const { updates } = _endTurn(game, playerId);
        
        tx.update(gameRef, updates);
    });
}

/**
 * Handles the expiration of a player's turn timer. This is typically called by the host.
 * It automatically takes a default action for the player (e.g., skipping a purchase) and ends their turn.
 * @param gameId - The ID of the current game.
 * @param hostId - The ID of the user making the call, who must be the host.
 */
export async function handleTimeout(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let postTransactionFetch: { category: string; token: string } | null = null;
  let finalGameData: Game | null = null;

  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) return;
    const game = gameDoc.data() as Game;
    
    if(game.hostId !== hostId) return; // Only host can trigger timeout

    const { updates, needsQuestion, isGameOver, finalGame } = _handleTimeout(game);
    
    tx.update(gameRef, updates);

    if (needsQuestion) postTransactionFetch = needsQuestion;
    if (isGameOver && finalGame) finalGameData = finalGame;
  });

   if (postTransactionFetch) {
    const question = await fetchRandomQuestionForCategory('educated-merchant', postTransactionFetch.category);
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        if(game.gameState === 'question' && game.educatedMerchantState?.questionToken === postTransactionFetch?.token) {
            tx.update(gameRef, { 'educatedMerchantState.currentQuestion': question });
        }
    });
  }

  if (finalGameData) {
    await updateLeagueScoresForGameEnd(finalGameData);
  }
}
