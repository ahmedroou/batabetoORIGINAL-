'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import type { Game } from '@/types';
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
 * Small alias to make intent clear when helpers request a question fetch.
 */
type QuestionRequest = { category: string; token: string };

/**
 * Fetch a question and commit it only if the game is still expecting
 * the same question token and hasn't moved on. Extracted to avoid repetition
 * and reduce race-condition risk.
 */
async function fetchAndSetQuestion(
  gameId: string,
  req: QuestionRequest,
): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  try {
    const question = await fetchRandomQuestionForCategory('educated-merchant', req.category);

    // Double-check state under a transaction before committing the question
    await runTransaction(db, async (tx) => {
      const gameSnap = await tx.get(gameRef);
      if (!gameSnap.exists()) return;
      const game = gameSnap.data() as Game;

      // Ensure we're still on a question step for the same token and that
      // no question has already been set by a competing fetch.
      if (
        game.gameState === 'question' &&
        game.educatedMerchantState?.questionToken === req.token &&
        !game.educatedMerchantState?.currentQuestion
      ) {
        tx.update(gameRef, { 'educatedMerchantState.currentQuestion': question });
      }
    });
  } catch (err) {
    // Fail soft: leave state as-is so caller can retry or host can timeout.
    // eslint-disable-next-line no-console
    console.error('[fetchAndSetQuestion] failed', err);
  }
}

/**
 * Starts the "Educated Merchant" game. Only the host can perform this action.
 * Prepares the initial game state, generates the board, and sets the first turn.
 */
export async function startGame(gameId: string, hostId: string): Promise<void> {
  if (!gameId || !hostId) throw new Error('Invalid arguments.');
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;

    if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
    if (!Array.isArray(game.players) || game.players.length < 2) {
      throw new Error('The game requires at least 2 players.');
    }
    if (game.gameState !== 'lobby') return; // Idempotency

    const { updates } = await _getInitialGameState(game.players);
    tx.update(gameRef, updates);
  });
}

/**
 * Handles a player's dice roll and any subsequent automatic events.
 */
export async function rollDice(gameId: string, playerId: string): Promise<void> {
  if (!gameId || !playerId) throw new Error('Invalid arguments.');
  const gameRef = doc(db, 'games', gameId);

  let needsQuestion: QuestionRequest | null = null;
  let finalGameData: Game | null = null;

  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    const { updates, needsQuestion: qReq, isGameOver, finalGame } = _rollDice(game, playerId);
    tx.update(gameRef, updates);

    if (qReq) needsQuestion = qReq;
    if (isGameOver && finalGame) finalGameData = finalGame;
  });

  if (needsQuestion) await fetchAndSetQuestion(gameId, needsQuestion);
  if (finalGameData) await updateLeagueScoresForGameEnd(finalGameData);
}

/**
 * Initiates a property purchase and transitions to a question state if required.
 */
export async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
  if (!gameId || !playerId) throw new Error('Invalid arguments.');
  const gameRef = doc(db, 'games', gameId);

  let needsQuestion: QuestionRequest | null = null;

  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    const { updates, needsQuestion: qReq } = _purchaseProperty(game, playerId);
    tx.update(gameRef, updates);
    if (qReq) needsQuestion = qReq;
  });

  if (needsQuestion) await fetchAndSetQuestion(gameId, needsQuestion);
}

/**
 * Submits a player's answer and resolves the question, potentially ending the game.
 */
export async function answerQuestion(gameId: string, playerId: string, answer: string): Promise<void> {
  if (!gameId || !playerId) throw new Error('Invalid arguments.');
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

  if (finalGameData) await updateLeagueScoresForGameEnd(finalGameData);
}

/**
 * Ends a player's turn (e.g., skip purchase).
 */
export async function endTurn(gameId: string, playerId: string): Promise<void> {
  if (!gameId || !playerId) throw new Error('Invalid arguments.');
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
 * Handles a turn timeout. Only the host may trigger it.
 */
export async function handleTimeout(gameId: string, hostId: string): Promise<void> {
  if (!gameId || !hostId) throw new Error('Invalid arguments.');
  const gameRef = doc(db, 'games', gameId);

  let needsQuestion: QuestionRequest | null = null;
  let finalGameData: Game | null = null;

  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) return; // Game deleted or missing — no-op
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) return; // Only host can trigger timeout

    const { updates, needsQuestion: qReq, isGameOver, finalGame } = _handleTimeout(game);
    tx.update(gameRef, updates);

    if (qReq) needsQuestion = qReq;
    if (isGameOver && finalGame) finalGameData = finalGame;
  });

  if (needsQuestion) await fetchAndSetQuestion(gameId, needsQuestion);
  if (finalGameData) await updateLeagueScoresForGameEnd(finalGameData);
}
