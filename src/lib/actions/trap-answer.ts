

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
  deleteField,
} from 'firebase/firestore';
import type { Game, Player, TrapQuestion, UserProfile, League } from '@/types';
import { isFirebaseError } from './helpers';

// A safer, internal string comparison function.
function safeCompareStrings(a: string, b: string): number {
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
        return 0;
    }
    const aLower = a.trim().toLowerCase();
    const bLower = b.trim().toLowerCase();

    const pairs = (str: string) => {
        const s = new Set<string>();
        for (let i = 0; i < str.length - 1; i++) {
            s.add(str.substring(i, i + 2));
        }
        return s;
    };

    const s1 = pairs(aLower);
    const s2 = pairs(bLower);
    const intersection = new Set([...s1].filter(x => s2.has(x)));
    
    return (2.0 * intersection.size) / (s1.size + s2.size);
}


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
        const answerTime = game.trapAnswerState?.settings?.answerTime || 60;

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
             'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + answerTime * 1000),
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

    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        if (game.gameState !== 'answer-submission') {
            return;
        }
        if (game.trapAnswerState?.playerAnswers?.hasOwnProperty(playerId)) {
            return;
        }

        // Determine the final answer to be stored.
        // It's null if timed out or the submitted answer is empty.
        // It's the trimmed answer text otherwise.
        const finalAnswer = isTimeout || !answer.trim() ? null : answer.trim();
        
        // This is a direct update. No complex logic, no comparisons. Just save the answer.
        // This makes the submission process robust and fast.
        const newPlayerAnswers = { ...(game.trapAnswerState?.playerAnswers || {}), [playerId]: finalAnswer };
        
        transaction.update(gameRef, {
            [`trapAnswerState.playerAnswers`]: newPlayerAnswers,
        });
        
        // After updating, we check if all players have submitted to advance the game state.
        // We pass the updated game object to the helper function.
        game.trapAnswerState!.playerAnswers = newPlayerAnswers;
        await _checkAndAdvanceToGuessing(transaction, game);
    });

    return { success: true };
}

async function _checkAndAdvanceToGuessing(transaction: any, game: Game) {
    const activePlayers = game.players.filter(p => p.status === 'alive');
    const playerAnswers = game.trapAnswerState?.playerAnswers || {};
    const hasEveryoneAnswered = activePlayers.every(p => playerAnswers.hasOwnProperty(p.id));

    if (hasEveryoneAnswered) {
        const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
        const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);
        
        const timedOutPlayersCount = activePlayers.filter(p => playerAnswers[p.id] === null).length;
        let dummyAnswerForRound: string | undefined = undefined;

        // If at least one player timed out, fetch a dummy answer for them.
        if (timedOutPlayersCount > 0) {
            const question = game.trapAnswerState?.currentQuestion;
            if (question?.dummyAnswers && question.dummyAnswers.length > 0) {
                dummyAnswerForRound = question.dummyAnswers[Math.floor(Math.random() * question.dummyAnswers.length)];
            }
        }
        
        const updateData: any = {
            gameState: 'guessing',
            'trapAnswerState.timerEndsAt': timerEndsAt,
        };

        if (dummyAnswerForRound !== undefined) {
             updateData['trapAnswerState.dummyAnswerForRound'] = dummyAnswerForRound;
        } else {
             // Ensure the field is removed if no dummy answer is needed for this round
             updateData['trapAnswerState.dummyAnswerForRound'] = deleteField();
        }

        transaction.update(doc(db, 'games', game.id), updateData);
    }
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
        if (finalGuess === null) { 
            // Default to the first available answer if timed out
            const correctAnswer = game.trapAnswerState?.currentQuestion?.answer;
            const trapAnswers = Object.values(game.trapAnswerState?.playerAnswers || {}).filter(ans => ans && ans !== "[[CORRECT_ANSWER_KNOWN]]");
            const dummyAnswer = game.trapAnswerState?.dummyAnswerForRound;
            const uniqueTrapAnswers = Array.from(new Set([...trapAnswers, dummyAnswer].filter(Boolean)));
            const answers = [correctAnswer, ...uniqueTrapAnswers].filter(Boolean) as string[];
            finalGuess = answers[0] || "لا يوجد";
        }


        const newPlayerGuesses = { ...(game.trapAnswerState?.playerGuesses || {}), [playerId]: finalGuess };
        transaction.update(gameRef, { 'trapAnswerState.playerGuesses': newPlayerGuesses });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newPlayerGuesses).length >= activePlayers.length) {
            // All players have guessed, process results
            const currentScores = { ...(game.playerScores || {}) };
            const correctAnswer = game.trapAnswerState!.currentQuestion!.answer;
            const playerAnswers = game.trapAnswerState!.playerAnswers!;

            // Merge similar answers to create unique choices and their authors
            const answerGroups: { text: string; authors: string[] }[] = [];
            Object.entries(playerAnswers).forEach(([authorId, answerText]) => {
                 if (answerText === null) return;
                 const similarGroup = answerGroups.find(g => safeCompareStrings(g.text, answerText) > 0.85);
                 if (similarGroup) {
                     similarGroup.authors.push(authorId);
                 } else {
                     answerGroups.push({ text: answerText, authors: [authorId] });
                 }
            });

            // Handle dummy answer if it exists
            const dummyAnswer = game.trapAnswerState!.dummyAnswerForRound;
            if (dummyAnswer) {
                 const similarGroup = answerGroups.find(g => safeCompareStrings(g.text, dummyAnswer) > 0.85);
                 if (!similarGroup) {
                      answerGroups.push({ text: dummyAnswer, authors: [] }); // Empty authors means it's a dummy answer
                 }
            }
            
            // Build the results map for displaying choices
            const resultsByAnswer: Record<string, { authorIds: string[] | null, guesserIds: string[] }> = {};
            // Add correct answer
            resultsByAnswer[correctAnswer] = { authorIds: null, guesserIds: [] }; 
            // Add trap answers
            answerGroups.forEach(group => {
                resultsByAnswer[group.text] = { authorIds: group.authors, guesserIds: [] };
            });

            // Tally guesses
            Object.entries(newPlayerGuesses).forEach(([guesserId, chosenAnswer]) => {
                if(chosenAnswer) {
                     const chosenGroup = answerGroups.find(g => safeCompareStrings(g.text, chosenAnswer) > 0.85);
                     const finalChosenText = chosenAnswer === correctAnswer ? correctAnswer : (chosenGroup ? chosenGroup.text : chosenAnswer);
                     
                     if(resultsByAnswer[finalChosenText]) {
                         resultsByAnswer[finalChosenText].guesserIds.push(guesserId);
                     }
                }
            });
            
            const roundScores: Game['trapAnswerState']['lastRoundResults']['scores'] = {};
            activePlayers.forEach(p => { roundScores[p.id] = { points: 0, breakdown: [] }; });

            // Calculate points
            Object.entries(newPlayerGuesses).forEach(([guesserId, chosenAnswer]) => {
                if (chosenAnswer === correctAnswer) {
                    currentScores[guesserId] = (currentScores[guesserId] || 0) + 2;
                    roundScores[guesserId].points += 2;
                    roundScores[guesserId].breakdown.push({ reason: "إجابة صحيحة", points: 2 });
                } else {
                     const chosenGroup = answerGroups.find(g => safeCompareStrings(g.text, chosenAnswer!) > 0.85);
                     if (chosenGroup && chosenGroup.authors.length > 0) {
                         chosenGroup.authors.forEach(authorId => {
                             if(guesserId !== authorId) {
                                 const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';
                                 currentScores[authorId] = (currentScores[authorId] || 0) + 1;
                                 roundScores[authorId].points += 1;
                                 roundScores[authorId].breakdown.push({ reason: `خدع ${guesserName}`, points: 1 });
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
                'trapAnswerState.timerEndsAt': null,
            });
        }
    });
}


export async function nextTrapAnswerRound(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the next round.");

        const currentRound = game.round || 0;
        const totalRounds = game.trapAnswerState?.settings?.rounds || 10;
        
        if (currentRound >= totalRounds) {
            // Game is over, update gamesPlayed and league scores for all participants
            const batch = writeBatch(db);
            const playerProfiles: UserProfile[] = [];
            
            // Step 1: Fetch all player profiles and update gamesPlayed
            for (const p of game.players) {
                const playerRef = doc(db, 'users', p.id);
                batch.update(playerRef, { gamesPlayed: increment(1) });
                const playerDoc = await getDoc(playerRef);
                if (playerDoc.exists()) {
                    playerProfiles.push({ uid: p.id, ...playerDoc.data() } as UserProfile);
                }
            }

            // Step 2: Update league scores for each player in each of their leagues
            const finalScores = game.playerScores || {};
            for (const profile of playerProfiles) {
                const gameScore = finalScores[profile.uid] || 0;
                if (gameScore > 0 && profile.leagues && profile.leagues.length > 0) {
                    for (const leagueInfo of profile.leagues) {
                        const leagueRef = doc(db, 'leagues', leagueInfo.id);
                        batch.update(leagueRef, {
                            [`scores.${profile.uid}`]: increment(gameScore),
                            [`gamesPlayed.${profile.uid}`]: increment(1)
                        });
                    }
                }
            }
            
            await batch.commit();

            // Then, check for global leaderboard reset (This is separate as it reads all users)
            const leaderboardBatch = writeBatch(db);
            const usersRef = collection(db, 'users');
            const allUsersSnapshot = await getDocs(usersRef);
            const allUsers = allUsersSnapshot.docs.map(d => ({...d.data(), uid: d.id } as UserProfile));

            const scoresWithLeaderboard = allUsers.map(user => {
                const gameScore = finalScores[user.uid] || 0;
                return { ...user, finalPoints: (user.leaderboardPoints || 0) + gameScore };
            });

            const maxPoints = Math.max(...scoresWithLeaderboard.map(u => u.finalPoints));

            if (maxPoints >= 30) {
                const winner = scoresWithLeaderboard.sort((a,b) => b.finalPoints - a.finalPoints)[0];
                if (winner) {
                    const winnerRef = doc(db, 'users', winner.uid);
                    leaderboardBatch.update(winnerRef, { 
                        trophies: increment(1),
                        leaderboardPoints: 0 
                    });
                    const championRef = doc(db, 'game_settings', 'leaderboard_champion');
                    leaderboardBatch.set(championRef, { name: winner.name, avatarId: winner.avatarId });
                }

                allUsers.filter(u => u.uid !== winner?.uid).forEach(user => {
                    const userRef = doc(db, 'users', user.uid);
                    leaderboardBatch.update(userRef, { leaderboardPoints: 0 });
                });
                
            } else {
                const sortedPlayers = game.players
                    .filter(p => p.status === 'alive')
                    .map(p => ({ id: p.id, score: finalScores[p.id] || 0 }))
                    .sort((a, b) => b.score - a.score);

                let rank = -1;
                let lastScore = -1;
                const rankPoints = [3, 2, 1];
                
                for (let i = 0; i < sortedPlayers.length; i++) {
                    const player = sortedPlayers[i];
                    if (player.score !== lastScore) {
                        rank = i;
                    }
                    if (rank < rankPoints.length) {
                        const points = rankPoints[rank];
                        if (points > 0) {
                           const playerRef = doc(db, 'users', player.id);
                           leaderboardBatch.update(playerRef, {
                               leaderboardPoints: increment(points)
                           });
                        }
                    }
                    lastScore = player.score;
                }
            }
            
            await leaderboardBatch.commit(); 
            transaction.update(gameRef, { gameState: 'final-results' });
            return;
        }

        const nextTurnIndex = ((game.trapAnswerState?.currentTurnIndex || 0) + 1) % game.players.length;
        const allCategories = game.trapAnswerState?.settings?.categories || [];
        const fiveRandomCategories = shuffle([...allCategories]).slice(0, 5);
        const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
        
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
            'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + answerTime * 1000),
            'trapAnswerState.dummyAnswerForRound': deleteField(),
        });
    });
}
