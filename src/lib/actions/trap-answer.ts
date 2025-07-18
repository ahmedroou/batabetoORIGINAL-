
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
} from 'firebase/firestore';
import type { Game, Player } from '@/types';
import { isFirebaseError } from './helpers';
import { compareTwoStrings } from 'string-similarity';


function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
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
             playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
        });
    });
}

export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const currentTurnPlayerId = game.trapAnswerState?.turnOrder?.[game.trapAnswerState.currentTurnIndex || 0];
        if (currentTurnPlayerId !== playerId) throw new Error("It's not your turn to choose.");
        if (game.gameState !== 'category-selection') throw new Error("Not in category selection phase.");
        
        const q = query(collection(db, "trap_answer_questions"), where("category", "==", category));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            throw new Error(`No questions found for category: ${category}. Please add questions from the admin page.`);
        }
        
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
        const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
        const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);


        transaction.update(gameRef, {
            gameState: 'answer-submission',
            'trapAnswerState.selectedCategory': category,
            'trapAnswerState.currentQuestion': randomQuestion,
            'trapAnswerState.timerEndsAt': timerEndsAt,
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
        if (!correctAnswer) throw new Error("Correct answer not found for this round.");

        const userAnswer = answer.trim();
        const normalizedCorrectAnswer = correctAnswer.trim();

        // 1. Check for exact match (case-insensitive)
        if (userAnswer.toLowerCase() === normalizedCorrectAnswer.toLowerCase()) {
            throw new Error("known_answer");
        }

        // 2. Check for high similarity
        const similarity = compareTwoStrings(userAnswer.toLowerCase(), normalizedCorrectAnswer.toLowerCase());
        const SIMILARITY_THRESHOLD = 0.70; // 70%
        if (similarity >= SIMILARITY_THRESHOLD) {
             throw new Error("إجابتك قريبة جدًا من الإجابة الصحيحة. حاول أن تكون أكثر إبداعًا في تضليلك!");
        }

        const newPlayerAnswers = { ...(game.trapAnswerState?.playerAnswers || {}), [playerId]: userAnswer };
        transaction.update(gameRef, { 'trapAnswerState.playerAnswers': newPlayerAnswers });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newPlayerAnswers).length === activePlayers.length) {
            const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
            const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);
            transaction.update(gameRef, { 
                gameState: 'guessing',
                'trapAnswerState.timerEndsAt': timerEndsAt,
             });
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
            const currentScores = { ...(game.playerScores || {}) };
            const correctAnswer = game.trapAnswerState.currentQuestion!.answer;
            const playerAnswers = game.trapAnswerState.playerAnswers!;

            const answerAuthors: Record<string, string> = { [correctAnswer]: 'correct' };
            Object.entries(playerAnswers).forEach(([authorId, answerText]) => {
                answerAuthors[answerText] = authorId;
            });
            
            const resultsByAnswer: Record<string, { authorId: string, guesserIds: string[] }> = {};
            // Initialize with all possible answers
            const allAnswers = [correctAnswer, ...Object.values(playerAnswers)];
            allAnswers.forEach(ans => {
                const authorId = answerAuthors[ans] || 'unknown';
                resultsByAnswer[ans] = { authorId, guesserIds: [] };
            });

            Object.entries(newPlayerGuesses).forEach(([guesserId, chosenAnswer]) => {
                if (resultsByAnswer[chosenAnswer]) {
                    resultsByAnswer[chosenAnswer].guesserIds.push(guesserId);
                }
            });
            
            const roundScores: Game['trapAnswerState']['lastRoundResults']['scores'] = {};
            activePlayers.forEach(p => {
                roundScores[p.id] = { points: 0, breakdown: [] };
            });

            Object.entries(newPlayerGuesses).forEach(([guesserId, chosenAnswer]) => {
                if (chosenAnswer === correctAnswer) {
                    currentScores[guesserId] = (currentScores[guesserId] || 0) + 2;
                    roundScores[guesserId].points += 2;
                    roundScores[guesserId].breakdown.push({ reason: "إجابة صحيحة", points: 2 });
                } else {
                    const trickedPlayerId = Object.keys(playerAnswers).find(id => playerAnswers[id] === chosenAnswer);
                    if (trickedPlayerId) {
                        currentScores[trickedPlayerId] = (currentScores[trickedPlayerId] || 0) + 1;
                        roundScores[trickedPlayerId].points += 1;
                        roundScores[trickedPlayerId].breakdown.push({ 
                            reason: `خدع ${activePlayers.find(p => p.id === guesserId)?.name || 'لاعب'}`, 
                            points: 1 
                        });
                    }
                }
            });

            const roundResults: Game['trapAnswerState']['lastRoundResults'] = {
                scores: roundScores,
                answers: Object.entries(resultsByAnswer).map(([text, data]) => ({
                    text,
                    isCorrect: data.authorId === 'correct',
                    authorId: data.authorId === 'correct' ? null : data.authorId,
                    guesserIds: data.guesserIds,
                })),
            };

            transaction.update(gameRef, {
                gameState: 'round-results',
                playerScores: currentScores,
                'trapAnswerState.lastRoundResults': roundResults,
                'trapAnswerState.timerEndsAt': null, // Clear timer for results screen
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

        const nextTurnIndex = ((game.trapAnswerState?.currentTurnIndex || 0) + 1) % game.players.length;
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
            'trapAnswerState.timerEndsAt': null,
        });
    });
}
