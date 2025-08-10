
'use server';

/**
 * @fileoverview Actions specific to the "Trap Answer" game.
 * Rebuilt from scratch to ensure stability and correct logic flow.
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
  deleteField,
  increment,
  writeBatch,
  arrayUnion,
  updateDoc,
} from 'firebase/firestore';
import type { Game, Player, TrapQuestion, UserProfile, EmojiReactionType, GameState } from '@/types';
import { isFirebaseError, safeCompareStrings, shuffle } from './helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';


// --- Settings and Game Setup ---

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
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            'trapAnswerState.turnOrder': turnOrder,
            'trapAnswerState.currentTurnIndex': 0,
            'trapAnswerState.fiveRandomCategories': fiveRandomCategories,
            'trapAnswerState.playerAnswers': {},
            'trapAnswerState.playerGuesses': {},
            'trapAnswerState.lastRoundResults': {},
            'trapAnswerState.trickStats': { trickedBy: {}, trickedOthers: {} },
            'trapAnswerState.awayPlayerIds': [],
            'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + 30 * 1000), // 30s for category selection
        });
    });
}

// --- Player Presence ---

export async function setPlayerPresence(gameId: string, playerId: string, presence: 'present' | 'away') {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            const game = gameDoc.data() as Game;
            
            // Defensive check to ensure players is an array
            if (!Array.isArray(game.players)) return;

            const playerIndex = game.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) return;

            const updateData: any = {};
            updateData[`players.${playerIndex}.presence`] = presence;
            
            // If the player goes away during active phases, record it
            if (presence === 'away' && (game.gameState === 'answer-submission' || game.gameState === 'guessing')) {
                 if (game.trapAnswerState) {
                    updateData['trapAnswerState.awayPlayerIds'] = arrayUnion(playerId);
                }
            }

            transaction.update(gameRef, updateData);
        });
    } catch(e) {
        console.error("Could not update player presence:", e);
    }
}


// --- Core Game Flow Actions ---

export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
    const gameRef = doc(db, 'games', gameId);
    
    // Fetch a random question from the selected category
    const questionsCol = collection(db, "trap_answer_questions");
    const q = query(questionsCol, where("category", "==", category));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        throw new Error(`لا توجد أسئلة في قسم "${category}".`);
    }

    const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<TrapQuestion, 'id'> }));
    const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
    
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

        const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
        const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);

        transaction.update(gameRef, {
            gameState: 'answer-submission',
            'trapAnswerState.selectedCategory': category,
            'trapAnswerState.currentQuestion': randomQuestion,
            'trapAnswerState.playerAnswers': {},
            'trapAnswerState.playerGuesses': {},
            'trapAnswerState.lastRoundResults': {},
            'trapAnswerState.timerEndsAt': timerEndsAt,
        });
    });
}

export async function submitTrapAnswer(gameId: string, playerId: string, answer: string) {
    const gameRef = doc(db, 'games', gameId);

    return runTransaction(db, async (transaction) => {
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

        transaction.update(gameRef, {
            [`trapAnswerState.playerAnswers.${playerId}`]: finalAnswer,
        });

        // The transition to the next state is now handled by the handleTimeout function,
        // which is called when the timer expires or when the last player submits.
        // To ensure this happens, we must re-read the game state *after* our update.
        game = {
            ...game,
            trapAnswerState: {
                ...game.trapAnswerState!,
                playerAnswers: newPlayerAnswers
            }
        };
        
        // If this player is the last one, immediately trigger the timeout logic for the host.
        if (hasEveryoneAnswered && game.hostId === playerId) {
            await handleTimeout(gameId, playerId, transaction);
        }
    }).then(() => ({success: true}))
      .catch((error: any) => {
          console.error("Detailed error in submitTrapAnswer:", error);
          const typedError = error as Error;
          if (typedError.message.includes("لا يمكنك إدخال إجابة مطابقة")) {
              return { error: typedError.message };
          }
          return { error: `فشل إرسال الجواب: ${typedError.message}` };
    });
}

export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guessing') return;
        if (game.trapAnswerState?.playerGuesses?.[playerId]) return;

        const finalGuess = guess === null ? '__TIMEOUT__' : guess;

        const newPlayerGuesses = { ...(game.trapAnswerState?.playerGuesses || {}), [playerId]: finalGuess };
        
        transaction.update(gameRef, { 
            'trapAnswerState.playerGuesses': newPlayerGuesses 
        });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        const hasEveryoneGuessed = activePlayers.every(p => newPlayerGuesses.hasOwnProperty(p.id));

        // If this player is the last one, immediately trigger the timeout logic for the host.
        if (hasEveryoneGuessed && game.hostId === playerId) {
            await handleTimeout(gameId, playerId, transaction);
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
            if (game.gameState !== 'round-results') return;

            const currentRound = game.round || 0;
            const totalRounds = game.trapAnswerState?.settings.rounds || 10;
            
            if (currentRound >= totalRounds) {
                // Game Over Logic
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
                    'trapAnswerState.finalAwards': finalGameData.trapAnswerState.finalAwards,
                    'trapAnswerState.timerEndsAt': null,
                });
            } else {
                // Next Round Logic
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
                    'trapAnswerState.reactions': {},
                    'trapAnswerState.shuffledAnswers': [],
                    'trapAnswerState.awayPlayerIds': [],
                });
            }
        });

        if (gameDataForLeagueUpdate) {
            await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
        }
    } catch (error) {
        console.error("Error in nextTrapAnswerRound:", error);
    }
}


// --- Scoring and Game Logic ---

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

            if (chosenGroup) {
                if (chosenGroup.authors.includes(guesserId)) {
                    roundScores[guesserId].points -= 1;
                    roundScores[guesserId].breakdown.push({ reason: "صوّت لنفسه", points: -1 });
                }

                chosenGroup.authors.forEach(authorId => {
                    const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';
                    roundScores[authorId].points += 1;
                    roundScores[authorId].breakdown.push({ reason: `خدع ${guesserName}`, points: 1 });
                    
                    if (!newTrickStats.trickedOthers[authorId]) newTrickStats.trickedOthers[authorId] = [];
                    newTrickStats.trickedOthers[authorId].push(guesserId);
                });

                if (!chosenGroup.authors.includes(guesserId)) {
                    if (!newTrickStats.trickedBy[guesserId]) newTrickStats.trickedBy[guesserId] = [];
                    newTrickStats.trickedBy[guesserId].push(...chosenGroup.authors);
                }
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


// --- Timeout and Reactions ---

export async function handleTimeout(gameId: string, hostId: string, transaction?: Transaction) {
  const gameRef = doc(db, 'games', gameId);
  
  const processTimeout = async (trans: Transaction) => {
    const gameDoc = await trans.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    const game = gameDoc.data() as Game;
    
    // Only the host can trigger timeout logic
    if (game.hostId !== hostId) {
        return;
    }

    if (!game.trapAnswerState?.timerEndsAt || Date.now() < game.trapAnswerState.timerEndsAt.toMillis()) {
        return; // Timer hasn't expired server-side.
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
        const playerAnswers = { ...(game.trapAnswerState?.playerAnswers || {}) };
        let allAnswered = true;

        for (const player of activePlayers) {
            if (!playerAnswers.hasOwnProperty(player.id)) {
                playerAnswers[player.id] = null; // Mark as timed out
                allAnswered = false; // Mark that we had to force-submit
            }
        }
        
        // Transition to guessing phase
        const answerTime = game.trapAnswerState?.settings?.answerTime || 60;
        const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);
        const question = game.trapAnswerState?.currentQuestion;
        
        const validPlayerAnswers = Object.values(playerAnswers).filter((ans): ans is string => ans !== null);
        const allPossibleAnswers = [question!.answer, ...validPlayerAnswers];
        
        // Add a dummy answer if some players timed out and question has dummies
        const timedOutPlayersCount = Object.values(playerAnswers).filter(ans => ans === null).length;
        if (timedOutPlayersCount > 0 && Array.isArray(question?.dummyAnswers) && question.dummyAnswers.length > 0) {
            allPossibleAnswers.push(question.dummyAnswers[Math.floor(Math.random() * question.dummyAnswers.length)]);
        }

        const uniqueDisplayAnswers = Array.from(new Set(allPossibleAnswers));
        const shuffledAnswers = shuffle(uniqueDisplayAnswers);
        
        trans.update(gameRef, {
            gameState: 'guessing',
            'trapAnswerState.playerAnswers': playerAnswers,
            'trapAnswerState.timerEndsAt': timerEndsAt,
            'trapAnswerState.shuffledAnswers': shuffledAnswers,
        });

    } else if (game.gameState === 'guessing') {
        const activePlayers = game.players.filter(p => p.status === 'alive');
        const playerGuesses = { ...(game.trapAnswerState?.playerGuesses || {}) };
        
        for (const player of activePlayers) {
            if (!playerGuesses.hasOwnProperty(player.id)) {
                playerGuesses[player.id] = '__TIMEOUT__'; // Mark as timed out
            }
        }

        const { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds } = calculateTrapAnswerScores(
            activePlayers,
            game.trapAnswerState!.currentQuestion!,
            game.trapAnswerState!.playerAnswers!,
            playerGuesses
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
        
        const roundResults = { scores: roundScores, answers: resultsByAnswer, timedOutGuesserIds };

        trans.update(gameRef, {
            gameState: 'round-results',
            playerScores: finalScores,
            'trapAnswerState.playerGuesses': playerGuesses,
            'trapAnswerState.lastRoundResults': roundResults,
            'trapAnswerState.timerEndsAt': null,
            'trapAnswerState.trickStats': mergedTrickStats,
        });
    }
  };
  
  if (transaction) {
      await processTimeout(transaction);
  } else {
      await runTransaction(db, processTimeout);
  }
}

export async function sendReaction(gameId: string, playerId: string, emoji: EmojiReactionType) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        
        transaction.update(gameRef, {
            [`trapAnswerState.reactions.${playerId}`]: {
                emoji: emoji,
                timestamp: Timestamp.now(),
            }
        });
    });
}
