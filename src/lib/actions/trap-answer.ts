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
  orderBy,
  limit,
  arrayUnion,
  updateDoc,
} from 'firebase/firestore';
import type { Game, Player, TrapQuestion, UserProfile, League, EmojiReactionType } from '@/types';
import { isFirebaseError, safeCompareStrings, shuffle } from './helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';


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
             'trapAnswerState.trickStats': { trickedBy: {}, trickedOthers: {} }, // Initialize trick stats
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

        const questionsCol = collection(db, "trap_answer_questions");
        
        const q = query(questionsCol, where("category", "==", category));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            throw new Error(`لا توجد أسئلة في قسم "${category}". يرجى إضافة المزيد من صفحة الأدمن.`);
        }
        
        const randomIndex = Math.floor(Math.random() * querySnapshot.docs.length);
        const randomQuestionDoc = querySnapshot.docs[randomIndex];
        const randomQuestion = { id: randomQuestionDoc.id, ...randomQuestionDoc.data() } as TrapQuestion;
        
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
            
            const activePlayers = game.players.filter(p => p.status === 'alive');
            const hasEveryoneAnswered = activePlayers.every(p => newPlayerAnswers.hasOwnProperty(p.id));

            if (hasEveryoneAnswered) {
                const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
                const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);
                
                const timedOutPlayersCount = Object.values(newPlayerAnswers).filter(ans => ans === null).length;
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
                    'trapAnswerState.playerAnswers': newPlayerAnswers, // Make sure to write the last answer
                    'trapAnswerState.timerEndsAt': timerEndsAt,
                    'trapAnswerState.shuffledAnswers': shuffledAnswers,
                };

                if (dummyAnswerForRound !== undefined) {
                    updateData['trapAnswerState.dummyAnswerForRound'] = dummyAnswerForRound;
                } else {
                    updateData['trapAnswerState.dummyAnswerForRound'] = deleteField();
                }

                transaction.update(gameRef, updateData);
            } else {
                 transaction.update(gameRef, {
                    [`trapAnswerState.playerAnswers`]: newPlayerAnswers,
                });
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

export async function setPlayerPresence(gameId: string, playerId: string, presence: 'present' | 'away') {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            const game = gameDoc.data() as Game;

            const playerIndex = game.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) return;

            const updateData: any = {};
            updateData[`players.${playerIndex}.presence`] = presence;
            
            // If player is away during a critical phase, add them to the away list for the round
            if (presence === 'away' && (game.gameState === 'answer-submission' || game.gameState === 'guessing')) {
                updateData['trapAnswerState.awayPlayerIds'] = arrayUnion(playerId);
            }

            transaction.update(gameRef, updateData);
        });
    } catch(e) {
        // Fail silently, this is a non-critical update
        console.warn("Could not update player presence:", e);
    }
}

/**
 * A pure function to calculate scores for a round of Trap Answer.
 * This function is separated for testability and clarity.
 * @param activePlayers All players currently in the game.
 * @param question The current question object.
 * @param playerAnswers A map of player IDs to their submitted trap answers.
 * @param playerGuesses A map of player IDs to their chosen guess.
 * @returns An object containing the score breakdown for the round.
 */
export function calculateTrapAnswerScores(
    activePlayers: Player[],
    question: TrapQuestion,
    playerAnswers: Record<string, string | null>,
    playerGuesses: Record<string, string | null>
) {
    const roundScores: Game['trapAnswerState']['lastRoundResults']['scores'] = activePlayers.reduce((acc, p) => ({ ...acc, [p.id]: { points: 0, breakdown: [] } }), {});
    const newTrickStats: Game['trapAnswerState']['trickStats'] = { trickedBy: {}, trickedOthers: {} };
    const timedOutGuesserIds: string[] = [];


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

    Object.entries(playerGuesses).forEach(([guesserId, chosenAnswer]) => {
        if (chosenAnswer === null || chosenAnswer === '__TIMEOUT__') {
             if (chosenAnswer === '__TIMEOUT__') {
                timedOutGuesserIds.push(guesserId);
            }
            return;
        }

        if (chosenAnswer === question.answer) {
            roundScores[guesserId].points += 2;
            roundScores[guesserId].breakdown.push({ reason: "إجابة صحيحة", points: 2 });
        } else {
            const chosenGroup = answerGroups.find(g => safeCompareStrings(g.text, chosenAnswer!) > 0.85);
            if (chosenGroup?.authors.includes(guesserId)) {
                roundScores[guesserId].points -= 1;
                roundScores[guesserId].breakdown.push({ reason: "صوّت لنفسه", points: -1 });
            } else if (chosenGroup) {
                // The guesser was tricked
                if (!newTrickStats.trickedBy[guesserId]) newTrickStats.trickedBy[guesserId] = [];
                newTrickStats.trickedBy[guesserId].push(...chosenGroup.authors);
                
                chosenGroup.authors.forEach(authorId => {
                    const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';
                    roundScores[authorId].points += 1;
                    roundScores[authorId].breakdown.push({ reason: `خدع ${guesserName}`, points: 1 });
                    
                    // The author tricked the guesser
                    if (!newTrickStats.trickedOthers[authorId]) newTrickStats.trickedOthers[authorId] = [];
                    newTrickStats.trickedOthers[authorId].push(guesserId);
                });
            }
        }
    });

    const resultsByAnswer: Game['trapAnswerState']['lastRoundResults']['answers'] = [];
    resultsByAnswer.push({ text: question.answer, isCorrect: true, authorIds: null, guesserIds: [] });
    answerGroups.forEach(group => {
        resultsByAnswer.push({ text: group.text, isCorrect: false, authorIds: group.authors, guesserIds: [] });
    });

    Object.entries(playerGuesses).forEach(([guesserId, chosenAnswer]) => {
        if (chosenAnswer && chosenAnswer !== '__TIMEOUT__') {
            const resultEntry = resultsByAnswer.find(r => safeCompareStrings(r.text, chosenAnswer) > 0.85);
            if (resultEntry) {
                resultEntry.guesserIds.push(guesserId);
            }
        }
    });

    return { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds };
}


export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guessing') return;
        if (game.trapAnswerState?.playerGuesses?.[playerId]) return;

        // If guess is null (from a timeout), set it to a special value.
        const finalGuess = guess === null ? '__TIMEOUT__' : guess;


        const newPlayerGuesses = { ...(game.trapAnswerState?.playerGuesses || {}), [playerId]: finalGuess };
        
        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newPlayerGuesses).length >= activePlayers.length) {
            const { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds } = calculateTrapAnswerScores(
                activePlayers,
                game.trapAnswerState!.currentQuestion!,
                game.trapAnswerState!.playerAnswers!,
                newPlayerGuesses
            );

            const finalScores = { ...(game.playerScores || {}) };
            Object.entries(roundScores).forEach(([pid, data]) => {
                finalScores[pid] = (finalScores[pid] || 0) + data.points;
            });

             const mergedTrickStats = {
                trickedBy: { ...game.trapAnswerState?.trickStats?.trickedBy },
                trickedOthers: { ...game.trapAnswerState?.trickStats?.trickedOthers },
            };

            Object.entries(newTrickStats.trickedBy).forEach(([trickedId, trickerIds]) => {
                mergedTrickStats.trickedBy[trickedId] = [...(mergedTrickStats.trickedBy[trickedId] || []), ...trickerIds];
            });
            Object.entries(newTrickStats.trickedOthers).forEach(([trickerId, trickedIds]) => {
                mergedTrickStats.trickedOthers[trickerId] = [...(mergedTrickStats.trickedOthers[trickerId] || []), ...trickedIds];
            });
            
            const roundResults: Game['trapAnswerState']['lastRoundResults'] = {
                scores: roundScores,
                answers: resultsByAnswer,
                timedOutGuesserIds,
            };

            transaction.update(gameRef, {
                gameState: 'round-results',
                playerScores: finalScores,
                'trapAnswerState.playerGuesses': newPlayerGuesses,
                'trapAnswerState.lastRoundResults': roundResults,
                'trapAnswerState.timerEndsAt': null,
                'trapAnswerState.trickStats': mergedTrickStats,
            });
        } else {
             transaction.update(gameRef, { 
                'trapAnswerState.playerGuesses': newPlayerGuesses 
            });
        }
    });
}


export async function nextTrapAnswerRound(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    let gameDataForLeagueUpdate: Game | null = null;

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.hostId !== hostId) throw new Error("Only the host can start the next round.");

            const currentRound = game.round || 0;
            const totalRounds = game.trapAnswerState?.settings?.rounds || 10;
            
            if (currentRound >= totalRounds) {
                const finalAwardsResult = calculateEndOfGameAwards(game);
                const winnerId = finalAwardsResult.winUpdate?.userId;
                
                const finalGameData: Game = { 
                    ...game, 
                    gameState: 'final_results' as const, 
                    gameResult: { winner: winnerId || '', message: 'انتهت اللعبة' },
                     trapAnswerState: {
                        ...(game.trapAnswerState!),
                        finalAwards: finalAwardsResult.specialAwards
                    }
                };

                gameDataForLeagueUpdate = finalGameData;
                
                transaction.update(gameRef, { 
                    gameState: 'final_results',
                    gameResult: finalGameData.gameResult,
                    'trapAnswerState.finalAwards': finalGameData.trapAnswerState.finalAwards
                });
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
                'trapAnswerState.awayPlayerIds': [], // Reset away players for the new round
            });
        });

        // Perform league update outside of the main transaction
        if (gameDataForLeagueUpdate) {
            await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
        }

    } catch (error) {
        console.error("Error in nextTrapAnswerRound:", error);
        // Handle error appropriately
    }
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
    const gameDoc = await getDoc(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) {
        return;
    }
    
    if (!game.trapAnswerState?.timerEndsAt || Date.now() < game.trapAnswerState.timerEndsAt.toMillis()) {
        return;
    }


    if (game.gameState === 'category-selection') {
        const turnOrder = game.trapAnswerState?.turnOrder || [];
        const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
        const playerWhoseTurnItIs = turnOrder[currentTurnIndex];
        const categories = game.trapAnswerState?.fiveRandomCategories;
        
        if (!categories || categories.length === 0 || !playerWhoseTurnItIs) return;
        
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        await selectCategoryAndGetQuestion(gameId, playerWhoseTurnItIs, randomCategory);

    } else if (game.gameState === 'answer-submission') {
        const activePlayers = game.players.filter(p => p.status === 'alive');
        for (const player of activePlayers) {
             if (!game.trapAnswerState?.playerAnswers?.hasOwnProperty(player.id)) {
                await submitTrapAnswer(gameId, player.id, '');
             }
        }
    } else if (game.gameState === 'guessing') {
        const activePlayers = game.players.filter(p => p.status === 'alive');
        for (const player of activePlayers) {
             if (!game.trapAnswerState?.playerGuesses?.[player.id]) {
                await submitGuess(gameId, player.id, null);
            }
        }
    }
  } catch (error) {
      console.error("Error in handleTimeout:", error);
  }
}
