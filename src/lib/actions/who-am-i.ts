
/**
 * @fileoverview Actions specific to the "Who Am I?" game.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  deleteField,
} from 'firebase/firestore';
import type { Game } from '@/types';
import { getShuffledQuestions, TOTAL_ROUNDS_WHO_AM_I } from './helpers';

export async function startWhoAmIGame(gameId: string, userId: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.hostId !== userId) {
            throw new Error("فقط صاحب الغرفة يمكنه بدء اللعبة.");
        }

        if (game.gameType !== 'who-am-i') {
            throw new Error("Invalid action for this game type.");
        }

        transaction.update(gameRef, { 
            gameState: 'instructions',
        });
    });
}

export async function beginWhoAmIGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if(game.hostId !== hostId) throw new Error("Only the host can start the game.");

        if (game.gameState !== 'instructions') {
            throw new Error("Cannot progress the game at this time.");
        }
        
        if (game.gameType === 'king-of-genius') {
            transaction.update(gameRef, { gameState: 'team_selection' });
            return;
        }
        
        if (game.gameType !== 'who-am-i') {
            throw new Error("Invalid action for this game type.");
        }

        const questionsForGame = await getShuffledQuestions('اكتشف من انا', TOTAL_ROUNDS_WHO_AM_I);
        if (questionsForGame.length < TOTAL_ROUNDS_WHO_AM_I) {
            throw new Error(`لا يوجد أسئلة كافية في قسم "اكتشف من انا" لبدء لعبة. تحتاج اللعبة إلى ${TOTAL_ROUNDS_WHO_AM_I} سؤالاً على الأقل. يرجى رفع المزيد من الأسئلة من صفحة الأدمن.`);
        }

        transaction.update(gameRef, {
            gameState: 'answering',
            readyPlayers: deleteField(),
            questions: questionsForGame,
            currentQuestion: questionsForGame[0],
        });
    });
}

export async function submitAnswer(gameId: string, playerId: string, answer: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameType !== 'who-am-i') throw new Error("Invalid action for this game type.");

        const newAnswers = { ...game.answers, [playerId]: answer };
        
        const updateData: Partial<Omit<Game, 'id'>> = {
            answers: newAnswers
        };

        if (Object.keys(newAnswers).length === game.players.length) {
            updateData.gameState = 'guessing';
        }

        transaction.update(gameRef, updateData);
    });
}

export async function submitGuesses(gameId: string, playerId: string, playerGuesses: Record<string, string>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameType !== 'who-am-i' || !game.scoreMatrix) throw new Error("Invalid action for this game type.");
        
        const newGuesses = { ...game.guesses, [playerId]: playerGuesses };

        const updateData: any = {
            [`guesses.${playerId}`]: playerGuesses
        };

        if (Object.keys(newGuesses).length === game.players.length) {
            const newScoreMatrix = JSON.parse(JSON.stringify(game.scoreMatrix));
            
            Object.keys(newGuesses).forEach(guesserId => {
                const guessesByGuesser = newGuesses[guesserId];
                if (!guessesByGuesser) return;

                Object.keys(guessesByGuesser).forEach(answerAuthorId => {
                    const guessedPlayerId = guessesByGuesser[answerAuthorId];
                    if (answerAuthorId === guessedPlayerId) {
                        if (!newScoreMatrix[guesserId]) newScoreMatrix[guesserId] = {};
                        newScoreMatrix[guesserId][answerAuthorId] = (newScoreMatrix[guesserId][answerAuthorId] || 0) + 1;
                    }
                });
            });

            updateData.scoreMatrix = newScoreMatrix;
            updateData.gameState = 'round_results';
        }

        transaction.update(gameRef, updateData);
    });
}

export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameType !== 'who-am-i' || typeof game.round === 'undefined' || !game.questions) throw new Error("Invalid action for this game type.");
        
        const nextRound = game.round + 1;
        
        if (nextRound >= TOTAL_ROUNDS_WHO_AM_I) {
            transaction.update(gameRef, { gameState: 'final_results' });
        } else {
            transaction.update(gameRef, {
                round: nextRound,
                currentQuestion: game.questions[nextRound],
                gameState: 'answering',
                answers: {},
                guesses: {},
            });
        }
    });
}
