
'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import type { Game } from '@/types';
import { isFirebaseError } from './helpers';

function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[currentIndex], array[currentIndex]];
    }
    return array;
}

export async function updateGameSettings(gameId: string, hostId: string, settings: Game['trapAnswerState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'trapAnswerState.settings': settings });
    });
}

export async function startTrapAnswerGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const turnOrder = shuffle(game.players.map(p => p.id));
        const allCategories = game.trapAnswerState?.settings?.categories || [];
        const fiveRandomCategories = shuffle([...allCategories]).slice(0, 5);

        transaction.update(gameRef, {
            gameState: 'category-selection',
            round: 1,
            'trapAnswerState.turnOrder': turnOrder,
            'trapAnswerState.currentTurnIndex': 0,
            'trapAnswerState.fiveRandomCategories': fiveRandomCategories,
            'trapAnswerState.playerAnswers': {},
            'trapAnswerState.playerGuesses': {},
            'trapAnswerState.lastRoundResults': {},
            'trapAnswerState.selectedCategory': null,
            'trapAnswerState.currentQuestion': null,
        });
    });
}

export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const currentTurnPlayerId = game.trapAnswerState?.turnOrder?.[game.trapAnswerState.currentTurnIndex];
        if (currentTurnPlayerId !== playerId) throw new Error("It's not your turn to choose.");
        if (game.gameState !== 'category-selection') throw new Error("Not in category selection phase.");
        
        const q = query(collection(db, "trap_answer_questions"), where("category", "==", category));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            throw new Error(`No questions found for category: ${category}. Please add questions from the admin page.`);
        }
        
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        transaction.update(gameRef, {
            gameState: 'answer-submission',
            'trapAnswerState.selectedCategory': category,
            'trapAnswerState.currentQuestion': randomQuestion,
        });
    });
}


export async function submitTrapAnswer(gameId: string, playerId: string, answer: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'answer-submission') throw new Error("Not in answer submission phase.");
        if (game.trapAnswerState?.playerAnswers?.[playerId]) throw new Error("You have already submitted an answer.");

        const correctAnswer = game.trapAnswerState?.currentQuestion?.answer;
        if (answer.trim().toLowerCase() === correctAnswer?.trim().toLowerCase()) {
            throw new Error("known_answer");
        }

        const newPlayerAnswers = { ...(game.trapAnswerState?.playerAnswers || {}), [playerId]: answer };
        transaction.update(gameRef, { 'trapAnswerState.playerAnswers': newPlayerAnswers });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newPlayerAnswers).length === activePlayers.length) {
            transaction.update(gameRef, { gameState: 'guessing' });
        }
    });
}

export async function submitGuess(gameId: string, playerId: string, guess: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guessing') throw new Error("Not in guessing phase.");
        if (game.trapAnswerState?.playerGuesses?.[playerId]) throw new Error("You have already guessed.");

        const newPlayerGuesses = { ...(game.trapAnswerState?.playerGuesses || {}), [playerId]: guess };
        transaction.update(gameRef, { 'trapAnswerState.playerGuesses': newPlayerGuesses });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newPlayerGuesses).length === activePlayers.length) {
            // All players have guessed, calculate results
            const currentScores = { ...(game.playerScores || {}) };
            const roundResults: Game['trapAnswerState']['lastRoundResults'] = {
                correctAnswer: game.trapAnswerState.currentQuestion!.answer,
                scores: {}
            };

            const correctAnswer = game.trapAnswerState.currentQuestion!.answer;
            const playerAnswers = game.trapAnswerState.playerAnswers!;

            activePlayers.forEach(p => {
                roundResults.scores[p.id] = { points: 0, breakdown: [] };
            });

            // Calculate points
            Object.entries(newPlayerGuesses).forEach(([guesserId, chosenAnswer]) => {
                if (chosenAnswer === correctAnswer) {
                    // Guessed correctly
                    currentScores[guesserId] = (currentScores[guesserId] || 0) + 2;
                    roundResults.scores[guesserId].points += 2;
                    roundResults.scores[guesserId].breakdown.push({ reason: "Correct Answer", points: 2 });
                } else {
                    // Guessed a fake answer, find the owner of the fake answer
                    const trickedPlayerId = Object.keys(playerAnswers).find(id => playerAnswers[id] === chosenAnswer);
                    if (trickedPlayerId) {
                        currentScores[trickedPlayerId] = (currentScores[trickedPlayerId] || 0) + 1;
                        roundResults.scores[trickedPlayerId].points += 1;
                        roundResults.scores[trickedPlayerId].breakdown.push({ reason: "Tricked a player", points: 1 });
                    }
                }
            });

            transaction.update(gameRef, {
                gameState: 'round-results',
                playerScores: currentScores,
                'trapAnswerState.lastRoundResults': roundResults
            });
        }
    });
}


export async function nextTrapAnswerRound(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the next round.");

        const currentRound = game.round || 0;
        const totalRounds = game.trapAnswerState?.settings?.rounds || 10;
        
        if (currentRound >= totalRounds) {
            transaction.update(gameRef, { gameState: 'final-results' });
            return;
        }

        const nextTurnIndex = (game.trapAnswerState.currentTurnIndex + 1) % game.players.length;
        const allCategories = game.trapAnswerState?.settings?.categories || [];
        const fiveRandomCategories = shuffle([...allCategories]).slice(0, 5);
        
        transaction.update(gameRef, {
            gameState: 'category-selection',
            round: currentRound + 1,
            'trapAnswerState.currentTurnIndex': nextTurnIndex,
            'trapAnswerState.fiveRandomCategories': fiveRandomCategories,
            'trapAnswerState.playerAnswers': {},
            'trapAnswerState.playerGuesses': {},
            'trapAnswerState.lastRoundResults': {},
            'trapAnswerState.selectedCategory': null,
            'trapAnswerState.currentQuestion': null,
        });
    });
}
