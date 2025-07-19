





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
  getDoc,
  FieldValue,
  increment,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import type { Game, Player, TrapQuestion, UserProfile } from '@/types';
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
        
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<TrapQuestion, 'id'> }));
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


export async function submitTrapAnswer(gameId: string, playerId: string, answer: string, isTimeout: boolean = false) {
    const gameRef = doc(db, 'games', gameId);

    const gameDoc = await getDoc(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    let game = gameDoc.data() as Game;

    if (game.gameState !== 'answer-submission') throw new Error("Not in answer submission phase.");
    if (game.trapAnswerState?.playerAnswers?.[playerId]) return { success: true, alreadySubmitted: true };

    let finalAnswer: string | null = answer.trim();

    if (isTimeout) {
        finalAnswer = null; // Don't assign a dummy answer, just skip their turn.
    } else {
        const correctAnswer = game.trapAnswerState?.currentQuestion?.answer;
        if (!correctAnswer) throw new Error("Correct answer not found for this round.");
        const normalizedCorrectAnswer = correctAnswer.trim();

        if (finalAnswer.toLowerCase() === normalizedCorrectAnswer.toLowerCase()) {
            return { error: "known_answer" };
        }
        const similarity = compareTwoStrings(finalAnswer.toLowerCase(), normalizedCorrectAnswer.toLowerCase());
        if (similarity >= 0.70) {
            return { error: "إجابتك قريبة جدًا من الإجابة الصحيحة. حاول أن تكون أكثر إبداعًا في تضليلك!" };
        }
    }

    await runTransaction(db, async (transaction) => {
        const freshGameDoc = await transaction.get(gameRef);
        game = freshGameDoc.data() as Game;
        
        const newPlayerAnswers = { ...(game.trapAnswerState?.playerAnswers || {})};
        if (finalAnswer !== null) {
            newPlayerAnswers[playerId] = finalAnswer;
        }

        const playersActed = [...(game.trapAnswerState?.playersActed || []), playerId];
        transaction.update(gameRef, { 
            'trapAnswerState.playerAnswers': newPlayerAnswers,
            'trapAnswerState.playersActed': playersActed 
        });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        
        if (playersActed.length >= activePlayers.length) {
            const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
            const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);
            transaction.update(gameRef, { 
                gameState: 'guessing',
                'trapAnswerState.timerEndsAt': timerEndsAt,
                'trapAnswerState.playersActed': [], // Reset for next phase
            });
        }
    });

    return { success: true };
}

export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guessing') return;
        if (game.trapAnswerState?.playerGuesses?.[playerId]) return;

        let finalGuess = guess;
        if (finalGuess === null) { // This indicates a timeout
             const uniqueAnswers = Array.from(new Set(Object.values(game.trapAnswerState?.playerAnswers || {})));
             const answers = [
                game.trapAnswerState?.currentQuestion?.answer,
                ...uniqueAnswers
            ].filter(Boolean) as string[];
            finalGuess = answers[0] || "لا يوجد"; // Default to first available answer
        }


        const newPlayerGuesses = { ...(game.trapAnswerState?.playerGuesses || {}), [playerId]: finalGuess };
        transaction.update(gameRef, { 'trapAnswerState.playerGuesses': newPlayerGuesses });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newPlayerGuesses).length === activePlayers.length) {
            const currentScores = { ...(game.playerScores || {}) };
            const correctAnswer = game.trapAnswerState!.currentQuestion!.answer;
            const playerAnswers = game.trapAnswerState!.playerAnswers!;

            // Group players by the answer they submitted
            const answerAuthors: Record<string, string[]> = {};
            Object.entries(playerAnswers).forEach(([authorId, answerText]) => {
                if (!answerAuthors[answerText]) {
                    answerAuthors[answerText] = [];
                }
                answerAuthors[answerText].push(authorId);
            });
            
            const resultsByAnswer: Record<string, { authorIds: string[] | null, guesserIds: string[] }> = {};
            const allUniqueAnswers = Array.from(new Set([correctAnswer, ...Object.values(playerAnswers)]));

            allUniqueAnswers.forEach(ans => {
                resultsByAnswer[ans] = { 
                    authorIds: ans === correctAnswer ? null : (answerAuthors[ans] || []),
                    guesserIds: [] 
                };
            });

            Object.entries(newPlayerGuesses).forEach(([guesserId, chosenAnswer]) => {
                if(chosenAnswer && resultsByAnswer[chosenAnswer]) {
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
                    const trapAuthors = answerAuthors[chosenAnswer];
                    if (trapAuthors && trapAuthors.length > 0) {
                        trapAuthors.forEach(authorId => {
                           if (guesserId !== authorId) {
                               const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';
                               currentScores[authorId] = (currentScores[authorId] || 0) + 1;
                               roundScores[authorId].points += 1;
                               roundScores[authorId].breakdown.push({ 
                                   reason: `خدع ${guesserName}`, 
                                   points: 1 
                               });
                           }
                        });
                    }
                }
            });

            const roundResults: Game['trapAnswerState']['lastRoundResults'] = {
                scores: roundScores,
                answers: Object.entries(resultsByAnswer).map(([text, data]) => ({
                    text,
                    isCorrect: data.authorIds === null,
                    authorIds: data.authorIds,
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
            // Game is over, check for leaderboard reset
            const batch = writeBatch(db);
            const usersRef = collection(db, 'users');
            const allUsersSnapshot = await getDocs(usersRef);
            const allUsers = allUsersSnapshot.docs.map(d => ({...d.data(), uid: d.id } as UserProfile));

            // Add current game scores to leaderboard points before checking for winner
            const finalScores = game.playerScores || {};
            const scoresWithLeaderboard = allUsers.map(user => {
                const gameScore = finalScores[user.uid] || 0;
                // This is a temporary calculation, not written to DB yet
                return { ...user, finalPoints: (user.leaderboardPoints || 0) + gameScore };
            });

            const maxPoints = Math.max(...scoresWithLeaderboard.map(u => u.finalPoints));

            if (maxPoints >= 30) {
                // Find winner, award trophy, reset all points
                const winner = scoresWithLeaderboard.sort((a,b) => b.finalPoints - a.finalPoints)[0];
                if (winner) {
                    const winnerRef = doc(db, 'users', winner.uid);
                    batch.update(winnerRef, { 
                        trophies: increment(1),
                        leaderboardPoints: 0 // Winner also resets
                    });
                    // Save the last champion's info for the main page
                    const championRef = doc(db, 'game_settings', 'leaderboard_champion');
                    batch.set(championRef, { name: winner.name, avatarId: winner.avatarId });
                }

                // Reset everyone else's leaderboard points
                allUsers.filter(u => u.uid !== winner?.uid).forEach(user => {
                    const userRef = doc(db, 'users', user.uid);
                    batch.update(userRef, { leaderboardPoints: 0 });
                });
                
            } else {
                // Distribute points for this game
                const sortedPlayers = game.players.filter(p => p.status === 'alive').sort((a,b) => (finalScores[b.id] || 0) - (finalScores[a.id] || 0));
                const leaderboardPointsMap = [3, 2, 1]; // 1st, 2nd, 3rd

                for (let i = 0; i < sortedPlayers.length && i < leaderboardPointsMap.length; i++) {
                    const player = sortedPlayers[i];
                    const points = leaderboardPointsMap[i];
                    if (player && points) {
                        const playerRef = doc(db, 'users', player.id);
                        batch.update(playerRef, {
                            leaderboardPoints: increment(points)
                        });
                    }
                }
            }
            
            await batch.commit(); // Commit all leaderboard updates
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
            'trapAnswerState.playersActed': [],
        });
    });
}
