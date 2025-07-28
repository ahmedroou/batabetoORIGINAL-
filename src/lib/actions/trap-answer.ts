

/**
 * @fileoverview Actions specific to the "Trap Answer" game.
 */

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
import type { Game, Player, TrapQuestion, UserProfile, League, EmojiReactionType } from '@/types';
import { isFirebaseError } from './helpers';
import { generateGameId } from '@/lib/actions/helpers';
import { updateLeagueScoresForGameEnd } from './user';


// A safer, internal string comparison function.
export function safeCompareStrings(a: string, b: string): number {
    try {
        if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
            return 0;
        }
        const aLower = a.trim().toLowerCase();
        const bLower = b.trim().toLowerCase();

        if (aLower === bLower) return 1.0;

        const pairs = (str: string) => {
            const s = new Set<string>();
            if (!str) return s;
            for (let i = 0; i < str.length - 1; i++) {
                s.add(str.substring(i, i + 2));
            }
            return s;
        };

        const s1 = pairs(aLower);
        const s2 = pairs(bLower);

        if (s1.size === 0 && s2.size === 0) return 1.0;
        if (s1.size === 0 || s2.size === 0) return 0;

        const intersection = new Set([...s1].filter(x => s2.has(x)));
        
        return (2.0 * intersection.size) / (s1.size + s2.size);

    } catch (e) {
        // This catch block makes the function extremely safe against unexpected inputs.
        console.error("Error in safeCompareStrings:", e, {a, b});
        return 0;
    }
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
             'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + 30 * 1000),
        });
    });
}

export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'category-selection') return;

        const turnOrder = game.trapAnswerState?.turnOrder || [];
        const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
        const playerWhoseTurnItIs = turnOrder[currentTurnIndex];

        if (playerWhoseTurnItIs !== playerId) {
            throw new Error("ليس دورك لاختيار القسم.");
        }
        
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


export async function submitTrapAnswer(gameId: string, playerId: string, answer: string) {
    const gameRef = doc(db, 'games', gameId);

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.gameState !== 'answer-submission') return;
            if (game.trapAnswerState?.playerAnswers?.hasOwnProperty(playerId)) return;
            
            const finalAnswer = !answer.trim() ? null : answer.trim();
            const correctAnswer = game.trapAnswerState?.currentQuestion?.answer;

            if (correctAnswer && finalAnswer && safeCompareStrings(finalAnswer, correctAnswer) > 0.85) {
                throw new Error("لا يمكنك إدخال إجابة مطابقة أو شبيهة بالإجابة الصحيحة. قدم جوابًا مفخخًا!");
            }
            
            const newPlayerAnswers = { ...(game.trapAnswerState?.playerAnswers || {}), [playerId]: finalAnswer };
            transaction.update(gameRef, {
                [`trapAnswerState.playerAnswers`]: newPlayerAnswers,
            });
            
            // Re-read game state to check if everyone answered AFTER our update.
            const activePlayers = game.players.filter(p => p.status === 'alive');
            const hasEveryoneAnswered = activePlayers.every(p => newPlayerAnswers.hasOwnProperty(p.id));

            if (hasEveryoneAnswered) {
                const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
                const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);
                
                const timedOutPlayersCount = activePlayers.filter(p => newPlayerAnswers[p.id] === null).length;
                let dummyAnswerForRound: string | undefined = undefined;

                if (timedOutPlayersCount > 0) {
                    const question = game.trapAnswerState?.currentQuestion;
                    if (question?.dummyAnswers && question.dummyAnswers.length > 0) {
                        dummyAnswerForRound = question.dummyAnswers[Math.floor(Math.random() * question.dummyAnswers.length)];
                    }
                }
                
                const allPossibleAnswers = [game.trapAnswerState.currentQuestion!.answer];
                Object.values(newPlayerAnswers).forEach(ans => {
                    if (ans) allPossibleAnswers.push(ans);
                });
                if (dummyAnswerForRound) {
                    allPossibleAnswers.push(dummyAnswerForRound);
                }
                const uniqueDisplayAnswers = Array.from(new Set(allPossibleAnswers));
                const shuffledAnswers = shuffle(uniqueDisplayAnswers);


                const updateData: any = {
                    gameState: 'guessing',
                    'trapAnswerState.timerEndsAt': timerEndsAt,
                    'trapAnswerState.shuffledAnswers': shuffledAnswers,
                };

                if (dummyAnswerForRound !== undefined) {
                    updateData['trapAnswerState.dummyAnswerForRound'] = dummyAnswerForRound;
                } else {
                    updateData['trapAnswerState.dummyAnswerForRound'] = deleteField();
                }

                transaction.update(gameRef, updateData);
            }
        });
        return { success: true };
    } catch (error) {
        console.error("Detailed error in submitTrapAnswer:", error);
        if (isFirebaseError(error)) {
             return { error: `فشل إرسال الجواب: ${error.message} (Code: ${error.code})` };
        }
        const typedError = error as Error;
        // Check for our custom error message
        if (typedError.message.includes("لا يمكنك إدخال إجابة مطابقة")) {
            return { error: typedError.message };
        }
        return { error: `فشل إرسال الجواب: ${typedError.message}` };
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
            const correctAnswer = game.trapAnswerState?.currentQuestion?.answer;
            const trapAnswers = Object.values(game.trapAnswerState?.playerAnswers || {}).filter(ans => ans);
            const dummyAnswer = game.trapAnswerState?.dummyAnswerForRound;
            const uniqueTrapAnswers = Array.from(new Set([...trapAnswers, dummyAnswer].filter(Boolean)));
            const answers = [correctAnswer, ...uniqueTrapAnswers].filter(Boolean) as string[];
            finalGuess = answers[0] || "لا يوجد";
        }


        const newPlayerGuesses = { ...(game.trapAnswerState?.playerGuesses || {}), [playerId]: finalGuess };
        transaction.update(gameRef, { 'trapAnswerState.playerGuesses': newPlayerGuesses });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newPlayerGuesses).length >= activePlayers.length) {
            const currentScores = { ...(game.playerScores || {}) };
            const correctAnswer = game.trapAnswerState!.currentQuestion!.answer;
            const playerAnswers = game.trapAnswerState!.playerAnswers!;

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

            const dummyAnswer = game.trapAnswerState!.dummyAnswerForRound;
            if (dummyAnswer) {
                 const similarGroup = answerGroups.find(g => safeCompareStrings(g.text, dummyAnswer) > 0.85);
                 if (!similarGroup) {
                      answerGroups.push({ text: dummyAnswer, authors: [] });
                 }
            }
            
            const resultsByAnswer: Record<string, { authorIds: string[] | null, guesserIds: string[] }> = {};
            resultsByAnswer[correctAnswer] = { authorIds: null, guesserIds: [] }; 
            answerGroups.forEach(group => {
                resultsByAnswer[group.text] = { authorIds: group.authors, guesserIds: [] };
            });

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
            transaction.update(gameRef, { gameState: 'final_results' });
            // Award league points
            await updateLeagueScoresForGameEnd(game, transaction);
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
            'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + 30 * 1000),
            'trapAnswerState.dummyAnswerForRound': deleteField(),
            'trapAnswerState.reactions': {}, // Reset reactions for the new round
            'trapAnswerState.shuffledAnswers': [], // Reset shuffled answers
        });
    });
}

export async function sendReaction(gameId: string, playerId: string, emoji: EmojiReactionType) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        
        // Directly update the reaction for the player
        transaction.update(gameRef, {
            [`trapAnswerState.reactions.${playerId}`]: {
                emoji: emoji,
                timestamp: Timestamp.now(),
            }
        });
    });
}

export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only the host can handle timeouts.");

        if (!game.trapAnswerState?.timerEndsAt || Date.now() < game.trapAnswerState.timerEndsAt.toMillis()) {
            return; 
        }

        if (game.gameState === 'category-selection') {
            const categories = game.trapAnswerState?.fiveRandomCategories;
            if (!categories || categories.length === 0) return;
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];
            const playerWhoseTurnItIs = game.trapAnswerState.turnOrder![game.trapAnswerState.currentTurnIndex!];
            
            // This transaction is tricky because we need to read from another collection.
            // We'll commit the game state change and do the question fetch outside.
            // A better approach would be a cloud function, but for client-side actions this is a workaround.
            // For now, let's just trigger the original function with the random category.
            // This is NOT atomic but is the simplest solution without cloud functions.
            await selectCategoryAndGetQuestion(gameId, playerWhoseTurnItIs, randomCategory);
            
        } else if (game.gameState === 'answer-submission') {
            const activePlayers = game.players.filter(p => p.status === 'alive');
            const playerAnswers = game.trapAnswerState.playerAnswers || {};
            
            for (const player of activePlayers) {
                if (!playerAnswers.hasOwnProperty(player.id)) {
                    playerAnswers[player.id] = null; 
                }
            }
            
            const allSubmissions = { ...(game.trapAnswerState.playerAnswers || {}), ...playerAnswers };
            
            const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
            const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);
            
            const timedOutPlayersCount = activePlayers.filter(p => allSubmissions[p.id] === null).length;
            let dummyAnswerForRound: string | undefined = undefined;

            if (timedOutPlayersCount > 0) {
                const question = game.trapAnswerState?.currentQuestion;
                if (question?.dummyAnswers && question.dummyAnswers.length > 0) {
                    dummyAnswerForRound = question.dummyAnswers[Math.floor(Math.random() * question.dummyAnswers.length)];
                }
            }
            
            const allPossibleAnswers = [game.trapAnswerState.currentQuestion!.answer];
            Object.values(allSubmissions).forEach(ans => {
                if (ans) allPossibleAnswers.push(ans);
            });
            if (dummyAnswerForRound) {
                allPossibleAnswers.push(dummyAnswerForRound);
            }
            const uniqueDisplayAnswers = Array.from(new Set(allPossibleAnswers));
            const shuffledAnswers = shuffle(uniqueDisplayAnswers);


            const updateData: any = {
                'trapAnswerState.playerAnswers': allSubmissions,
                gameState: 'guessing',
                'trapAnswerState.timerEndsAt': timerEndsAt,
                'trapAnswerState.shuffledAnswers': shuffledAnswers,
            };

            if (dummyAnswerForRound !== undefined) {
                updateData['trapAnswerState.dummyAnswerForRound'] = dummyAnswerForRound;
            } else {
                updateData['trapAnswerState.dummyAnswerForRound'] = deleteField();
            }

            transaction.update(gameRef, updateData);

        } else if (game.gameState === 'guessing') {
            const activePlayers = game.players.filter(p => p.status === 'alive');
            let playerGuesses = { ...(game.trapAnswerState.playerGuesses || {}) };
            
             for (const player of activePlayers) {
                if (!playerGuesses.hasOwnProperty(player.id)) {
                    playerGuesses[player.id] = game.trapAnswerState.shuffledAnswers?.[0] || 'لا يوجد';
                }
            }
             
             const currentScores = { ...(game.playerScores || {}) };
             const correctAnswer = game.trapAnswerState!.currentQuestion!.answer;
             const playerAnswers = game.trapAnswerState!.playerAnswers!;
 
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
 
             const dummyAnswer = game.trapAnswerState!.dummyAnswerForRound;
             if (dummyAnswer) {
                  const similarGroup = answerGroups.find(g => safeCompareStrings(g.text, dummyAnswer) > 0.85);
                  if (!similarGroup) {
                       answerGroups.push({ text: dummyAnswer, authors: [] });
                  }
             }
             
             const resultsByAnswer: Record<string, { authorIds: string[] | null, guesserIds: string[] }> = {};
             resultsByAnswer[correctAnswer] = { authorIds: null, guesserIds: [] }; 
             answerGroups.forEach(group => {
                 resultsByAnswer[group.text] = { authorIds: group.authors, guesserIds: [] };
             });
 
             Object.entries(playerGuesses).forEach(([guesserId, chosenAnswer]) => {
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
 
             Object.entries(playerGuesses).forEach(([guesserId, chosenAnswer]) => {
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

  } catch(error) {
      console.error("Error in handleTimeout:", error);
  }
}
