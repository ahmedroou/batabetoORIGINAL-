
'use server';

/**
 * @fileoverview Actions specific to the "Trap Answer" game.
 * @version 3.0 (Corrected)
 * @summary
 * Key Fixes in this version:
 * 1.  **Correct State Propagation**: Fixed a critical bug where the latest player guess was not correctly
 * passed to the scoring function, causing the game to stall. Both `submitTrapAnswer` and `submitGuess` now
 * reliably advance the game state.
 * 2.  **Accurate Timeout Tracking**: The `timedOutGuesserIds` are now correctly calculated and stored in the
 * round results, ensuring timeout information is properly displayed.
 * 3.  **Robust Dummy Answer Handling**: Added safer checks to prevent errors when handling optional dummy answers.
 * 4.  **Code Consistency**: Standardized the logic in `submitTrapAnswer` and `submitGuess` for better
 * maintainability and to prevent similar bugs in the future.
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
    limit,
    type Transaction,
    orderBy
} from 'firebase/firestore';
import type { Game, Player, TrapQuestion, UserProfile, EmojiReactionType, GameState } from '@/types';
import { isFirebaseError, safeCompareStrings, shuffle } from './helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';

// --- Constants for Game Logic ---
const SIMILARITY_THRESHOLD = 0.85;
const CATEGORY_SELECTION_TIME_S = 30;
const DEFAULT_ANSWER_TIME_S = 60;
const DEFAULT_GUESS_TIME_S = 60;

// --- Settings and Game Setup ---

export async function updateGameSettings(gameId: string, hostId: string, settings: Game['trapAnswerState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(thegameRef);
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
            'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + CATEGORY_SELECTION_TIME_S * 1000),
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
            
            if (!Array.isArray(game.players)) return;

            const playerIndex = game.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) return;

            const updateData: any = {};
            updateData[`players.${playerIndex}.presence`] = presence;
            
            if (presence === 'away' && (game.gameState === 'answer-submission' || game.gameState === 'guessing')) {
                 if (game.trapAnswerState) {
                     updateData['trapAnswerState.awayPlayerIds'] = arrayUnion(playerId);
                 }
            }
            transaction.update(gameRef, updateData);
        });
    } catch(e: any) {
        console.error(`Could not update player presence:`, { gameId, playerId, presence, errorMessage: e.message, errorStack: e.stack });
    }
}


// --- Core Game Flow Actions ---

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
            throw new Error(`لا توجد أسئلة في قسم "${category}".`);
        }

        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<TrapQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        const answerTime = game.trapAnswerState?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
        const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);

        transaction.update(gameRef, {
            gameState: 'answer-submission',
            'trapAnswerState.currentQuestion': randomQuestion,
            'trapAnswerState.playerAnswers': {},
            'trapAnswerState.playerGuesses': {},
            'trapAnswerState.lastRoundResults': {},
            'trapAnswerState.selectedCategory': category,
            'trapAnswerState.timerEndsAt': timerEndsAt,
            'trapAnswerState.awayPlayerIds': [],
            'trapAnswerState.shuffledAnswers': [],
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

        if (correctAnswer && finalAnswer && safeCompareStrings(finalAnswer, correctAnswer) > SIMILARITY_THRESHOLD) {
            throw new Error("لا يمكنك إدخال إجابة مطابقة أو شبيهة بالإجابة الصحيحة. قدم جوابًا مفخخًا!");
        }
        
        const newPlayerAnswers = { ...(game.trapAnswerState?.playerAnswers || {}), [playerId]: finalAnswer };
        transaction.update(gameRef, { 'trapAnswerState.playerAnswers': newPlayerAnswers });
        
        const activePlayers = game.players.filter(p => p.status === 'alive');
        const hasEveryoneAnswered = activePlayers.every(p => newPlayerAnswers.hasOwnProperty(p.id));
        
        if (hasEveryoneAnswered) {
            // To ensure the helper function has the absolute latest data, we pass the `newPlayerAnswers`
            // object directly by modifying a clone of the game state.
            const updatedGame = { ...game, trapAnswerState: { ...game.trapAnswerState, playerAnswers: newPlayerAnswers } } as Game;
            await _advanceToGuessing(transaction, gameRef, updatedGame);
        }
    }).then(() => ({success: true}))
      .catch((error: any) => {
          console.error("Detailed error in submitTrapAnswer:", error);
          return { error: `فشل إرسال الجواب: ${error.message}` };
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
        
        transaction.update(gameRef, { 'trapAnswerState.playerGuesses': newPlayerGuesses });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        const hasEveryoneGuessed = activePlayers.every(p => newPlayerGuesses.hasOwnProperty(p.id));

        if (hasEveryoneGuessed) {
            // **FIX**: Pass the newly created `newPlayerGuesses` object to the helper function
            // to ensure it has the latest submission, avoiding a state bug.
            const updatedGame = { ...game, trapAnswerState: { ...game.trapAnswerState, playerGuesses: newPlayerGuesses } } as Game;
            await _advanceToResults(transaction, gameRef, updatedGame);
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
                    'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + CATEGORY_SELECTION_TIME_S * 1000),
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

export async function calculateTrapAnswerScores(
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
        if (answerText === null || answerText.trim() === '') return;
        const similarGroup = answerGroups.find(g => safeCompareStrings(g.text, answerText) > SIMILARITY_THRESHOLD);
        if (similarGroup) {
            similarGroup.authors.push(authorId);
        } else {
            answerGroups.push({ text: answerText, authors: [authorId] });
        }
    });

    Object.entries(playerGuesses).forEach(([guesserId, chosenAnswer]) => {
        if (chosenAnswer === '__TIMEOUT__') {
            timedOutGuesserIds.push(guesserId);
            return;
        }
        if (chosenAnswer === null) return;

        if (safeCompareStrings(chosenAnswer, question.answer) > SIMILARITY_THRESHOLD) {
            roundScores[guesserId].points += 2;
            roundScores[guesserId].breakdown.push({ reason: "إجابة صحيحة", points: 2 });
        } else {
            const chosenGroup = answerGroups.find(g => safeCompareStrings(g.text, chosenAnswer) > SIMILARITY_THRESHOLD);

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
            const resultEntry = resultsByAnswer.find(r => safeCompareStrings(r.text, chosenAnswer) > SIMILARITY_THRESHOLD);
            if (resultEntry) {
                resultEntry.guesserIds.push(guesserId);
            }
        }
    });

    return { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds };
}

// --- Timeout and Reactions ---

export async function handleTimeout(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) return;
    const game = gameDoc.data() as Game;
    
    // Only the host should trigger timeouts to prevent multiple triggers
    if (game.hostId !== playerId) {
        return;
    }

    const timerEndsAt = game.trapAnswerState?.timerEndsAt;
    if (timerEndsAt && timerEndsAt.toMillis() > Date.now()) {
        return; // Timer hasn't expired server-side.
    }

    if (game.gameState === 'category-selection') {
        const turnOrder = game.trapAnswerState?.turnOrder || [];
        const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
        const playerWhoseTurnItIs = turnOrder[currentTurnIndex];
        const categories = game.trapAnswerState?.fiveRandomCategories;
        if (!categories || categories.length === 0 || !playerWhoseTurnItIs) return;
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        
        // This function is async and contains its own transaction logic.
        // It's not ideal to call it from here, but for now we'll do it outside the transaction.
        // A better approach would be to refactor selectCategoryAndGetQuestion to be callable from a transaction.
        transaction.update(gameRef, {'trapAnswerState.timerEndsAt': null}); // Prevent re-triggering
        await selectCategoryAndGetQuestion(gameId, playerWhoseTurnItIs, randomCategory);

    } else if (game.gameState === 'answer-submission') {
        await _advanceToGuessing(transaction, gameRef, game, true);
    } else if (game.gameState === 'guessing') {
        await _advanceToResults(transaction, gameRef, game, true);
    }
  });
}

export async function sendReaction(gameId: string, playerId: string, emoji: EmojiReactionType) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
        [`trapAnswerState.reactions.${playerId}`]: {
            emoji: emoji,
            timestamp: Timestamp.now(),
        }
    });
}


// --- INTERNAL HELPER FUNCTIONS ---

async function _advanceToGuessing(transaction: Transaction, gameRef: any, game: Game, isTimeout: boolean = false) {
    const playerAnswers = { ...(game.trapAnswerState?.playerAnswers || {}) };
    
    if (isTimeout) {
        const activePlayers = game.players.filter(p => p.status === 'alive');
        for (const player of activePlayers) {
            if (!playerAnswers.hasOwnProperty(player.id)) {
                playerAnswers[player.id] = null;
            }
        }
    }

    const guessTime = game.trapAnswerState?.settings?.guessTime || DEFAULT_GUESS_TIME_S;
    const timerEndsAt = Timestamp.fromMillis(Date.now() + guessTime * 1000);
    const question = game.trapAnswerState?.currentQuestion;
    if (!question) throw new Error("Question data is missing for advancing state.");
    
    const validPlayerAnswers = Object.values(playerAnswers).filter((ans): ans is string => ans !== null && ans.trim() !== '');
    let allPossibleAnswers = [question.answer, ...validPlayerAnswers];
    
    // **FIX**: Use a safer check for dummy answers.
    if (Array.isArray(question.dummyAnswers) && question.dummyAnswers.length > 0) {
        allPossibleAnswers.push(question.dummyAnswers[Math.floor(Math.random() * question.dummyAnswers.length)]);
    }

    const uniqueDisplayAnswers = Array.from(new Set(allPossibleAnswers));
    const shuffledAnswers = shuffle(uniqueDisplayAnswers);
    
    transaction.update(gameRef, {
        gameState: 'guessing',
        'trapAnswerState.playerAnswers': playerAnswers,
        'trapAnswerState.timerEndsAt': timerEndsAt,
        'trapAnswerState.shuffledAnswers': shuffledAnswers,
    });
}

async function _advanceToResults(transaction: Transaction, gameRef: any, game: Game, isTimeout: boolean = false) {
    const playerGuesses = { ...(game.trapAnswerState?.playerGuesses || {}) };

    if (isTimeout) {
        const activePlayers = game.players.filter(p => p.status === 'alive');
        for (const player of activePlayers) {
            if (!playerGuesses.hasOwnProperty(player.id)) {
                playerGuesses[player.id] = '__TIMEOUT__';
            }
        }
    }
    
    if (!game.trapAnswerState?.currentQuestion || !game.trapAnswerState?.playerAnswers) {
        throw new Error("Game state is missing necessary data for scoring.");
    }

    const activePlayers = game.players.filter(p => p.status === 'alive');
    // **FIX**: Correctly destructure `timedOutGuesserIds` from the calculation.
    const { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds } = await calculateTrapAnswerScores(
        activePlayers,
        game.trapAnswerState.currentQuestion,
        game.trapAnswerState.playerAnswers,
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
    
    // **FIX**: Use the actual `timedOutGuesserIds` instead of an empty array.
    const roundResults = { scores: roundScores, answers: resultsByAnswer, timedOutGuesserIds };

    transaction.update(gameRef, {
        gameState: 'round-results',
        playerScores: finalScores,
        'trapAnswerState.playerGuesses': playerGuesses,
        'trapAnswerState.lastRoundResults': roundResults,
        'trapAnswerState.timerEndsAt': null,
        'trapAnswerState.trickStats': mergedTrickStats,
    });
}

    