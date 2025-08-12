

'use server';

/**
 * @fileoverview Actions specific to the "Trap Answer" game.
 * @version 3.3
 * @summary This version tracks AFK players across rounds for a potential cheater list.
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
    arrayRemove,
    updateDoc,
    limit,
    type Transaction,
    orderBy,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';
import type { Game, Player, TrapQuestion, UserProfile, EmojiReactionType, GameState } from '@/types';
import { isFirebaseError, safeCompareStrings, shuffle } from './helpers';
import { calculateTrapAnswerScores } from './helpers/trap-answer-helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';
import { getTrapAnswerCategories } from './admin';

// --- Constants for Game Logic ---
const SIMILARITY_THRESHOLD = 0.85;
const CATEGORY_SELECTION_TIME_S = 30;
const DEFAULT_ANSWER_TIME_S = 60;

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
        
        // Fetch the most up-to-date categories directly from the source of truth
        const categoriesResult = await getTrapAnswerCategories();
        if (!categoriesResult.success || !categoriesResult.categories || categoriesResult.categories.length === 0) {
            throw new Error("لا يمكن بدء اللعبة، لم يتم العثور على أقسام أسئلة صالحة.");
        }
        const allCategories = categoriesResult.categories;
        
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
            'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + CATEGORY_SELECTION_TIME_S * 1000),
            'trapAnswerState.awayPlayerIds': [],
            'trapAnswerState.afkStats': {}, // Initialize AFK stats
        });
    });
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
        const randomKey = Math.random();
        
        const q1 = query(questionsCol, where("category", "==", category), where("randomKey", ">=", randomKey), limit(1));
        let querySnapshot = await getDocs(q1);

        if (querySnapshot.empty) {
            const q2 = query(questionsCol, where("category", "==", category), where("randomKey", "<", randomKey), limit(1));
            querySnapshot = await getDocs(q2);
        }

        if (querySnapshot.empty) {
            throw new Error(`لا توجد أسئلة في قسم "${category}".`);
        }
        
        const questionDoc = querySnapshot.docs[0];
        const randomQuestion = { id: questionDoc.id, ...questionDoc.data() as Omit<TrapQuestion, 'id'> };

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
            'trapAnswerState.shuffledAnswers': [],
            'trapAnswerState.awayPlayerIds': [],
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
            const updatedGame = { ...game, trapAnswerState: { ...game.trapAnswerState, playerGuesses: newPlayerGuesses } } as Game;
            await _advanceToResults(transaction, gameRef, updatedGame);
        }
    });
}

export async function nextTrapAnswerRound(gameId: string, hostId: string) {
    let gameDataForLeagueUpdate: Game | null = null;

    try {
        await runTransaction(db, async (transaction) => {
            const gameRef = doc(db, 'games', gameId);
            if (!gameRef) throw new Error("Game reference is invalid.");
            
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
                        finalAwards: {
                            ...finalAwardsResult.specialAwards,
                            afkStats: game.trapAnswerState?.afkStats || {}
                        }
                    }
                };
                gameDataForLeagueUpdate = finalGameData;
                
                transaction.update(gameRef, { 
                    gameState: 'final_results',
                    gameResult: finalGameData.gameResult,
                    'trapAnswerState.finalAwards': finalGameData.trapAnswerState.finalAwards,
                    'trapAnswerState.timerEndsAt': deleteField(),
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
                    'trapAnswerState.selectedCategory': deleteField(),
                    'trapAnswerState.currentQuestion': deleteField(),
                    'trapAnswerState.timerEndsAt': Timestamp.fromMillis(Date.now() + CATEGORY_SELECTION_TIME_S * 1000),
                    'trapAnswerState.reactions': {},
                    'trapAnswerState.shuffledAnswers': [],
                    'trapAnswerState.awayPlayerIds': [], // Reset away status for the new round
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

// --- Timeout and Reactions ---

export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        
        const timerEndsAt = game.trapAnswerState?.timerEndsAt;
        if (!timerEndsAt || timerEndsAt.toMillis() > Date.now()) {
            return; 
        }

        if (game.hostId !== hostId) return;
        
        transaction.update(gameRef, {'trapAnswerState.timerEndsAt': deleteField()});

        if (game.gameState === 'category-selection') {
            const turnOrder = game.trapAnswerState?.turnOrder || [];
            const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
            const playerWhoseTurnItIs = turnOrder[currentTurnIndex];
            const categories = game.trapAnswerState?.fiveRandomCategories;
            if (!categories || categories.length === 0 || !playerWhoseTurnItIs) return;
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];
            
             const questionsCol = collection(db, "trap_answer_questions");
            const randomKey = Math.random();
            const q1 = query(questionsCol, where("category", "==", randomCategory), where("randomKey", ">=", randomKey), limit(1));
            let querySnapshot = await getDocs(q1);

            if (querySnapshot.empty) {
                const q2 = query(questionsCol, where("category", "==", randomCategory), where("randomKey", "<", randomKey), limit(1));
                querySnapshot = await getDocs(q2);
            }

            if (querySnapshot.empty) {
                throw new Error(`لا توجد أسئلة في قسم "${randomCategory}".`);
            }
            
            const questionDoc = querySnapshot.docs[0];
            const randomQuestion = { id: questionDoc.id, ...questionDoc.data() as Omit<TrapQuestion, 'id'> };

            const answerTime = game.trapAnswerState?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
            const newTimerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);

            transaction.update(gameRef, {
                gameState: 'answer-submission',
                'trapAnswerState.currentQuestion': randomQuestion,
                'trapAnswerState.playerAnswers': {},
                'trapAnswerState.playerGuesses': {},
                'trapAnswerState.lastRoundResults': {},
                'trapAnswerState.selectedCategory': randomCategory,
                'trapAnswerState.timerEndsAt': newTimerEndsAt,
                'trapAnswerState.shuffledAnswers': [],
                'trapAnswerState.awayPlayerIds': [],
            });


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

export async function setAwayStatus(gameId: string, playerId: string, isAway: boolean): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    try {
        const updateData = {
            'trapAnswerState.awayPlayerIds': isAway ? arrayUnion(playerId) : arrayRemove(playerId)
        };
        await updateDoc(gameRef, updateData);
    } catch (error) {
        console.error(`Failed to update away status for player ${playerId} in game ${gameId}:`, error);
    }
}


// --- INTERNAL HELPER FUNCTIONS ---

async function _advanceToGuessing(transaction: Transaction, gameRef: any, game: Game, isTimeout: boolean = false) {
    const playerAnswers = { ...(game.trapAnswerState?.playerAnswers || {}) };
    const awayPlayerIdsInAnsweringPhase = game.trapAnswerState?.awayPlayerIds || [];

    
    if (isTimeout) {
        const activePlayers = game.players.filter(p => p.status === 'alive');
        for (const player of activePlayers) {
            if (!playerAnswers.hasOwnProperty(player.id)) {
                 playerAnswers[player.id] = null;
            }
        }
    }

    const answerTime = game.trapAnswerState?.settings?.answerTime || DEFAULT_ANSWER_TIME_S;
    const timerEndsAt = Timestamp.fromMillis(Date.now() + answerTime * 1000);
    const question = game.trapAnswerState?.currentQuestion;
    if (!question) throw new Error("Question data is missing for advancing state.");
    
    // Create a Set of unique, non-null, non-empty, and correctly-cased trap answers from players.
    const uniquePlayerTraps = new Set(
        Object.values(playerAnswers)
            .filter((ans): ans is string => typeof ans === 'string' && ans.trim() !== '')
            .map(ans => ans.trim())
    );

    // Start building the final list of options
    const allPossibleAnswers = new Set<string>([question.answer]);
    uniquePlayerTraps.forEach(trap => allPossibleAnswers.add(trap));
    
    // Only add dummy answers if we have less than 4 unique options so far.
    if (allPossibleAnswers.size < 4 && Array.isArray(question.dummyAnswers) && question.dummyAnswers.length > 0) {
        const shuffledDummies = shuffle([...question.dummyAnswers]);
        for (const dummy of shuffledDummies) {
            if (allPossibleAnswers.size >= 4) break;
            allPossibleAnswers.add(dummy);
        }
    }

    const shuffledAnswers = shuffle(Array.from(allPossibleAnswers));
    
    transaction.update(gameRef, {
        gameState: 'guessing',
        'trapAnswerState.playerAnswers': playerAnswers,
        'trapAnswerState.timerEndsAt': timerEndsAt,
        'trapAnswerState.shuffledAnswers': shuffledAnswers,
        'trapAnswerState.awayPlayerIds': [], // Reset for guessing phase
        'trapAnswerState.awayPlayerIdsInAnsweringPhase': awayPlayerIdsInAnsweringPhase, // Snapshot
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
    
    const awayInAnswering = game.trapAnswerState.awayPlayerIdsInAnsweringPhase || [];
    const awayInGuessing = game.trapAnswerState.awayPlayerIds || [];
    const awayPlayerIdsDuringRound = Array.from(new Set([...awayInAnswering, ...awayInGuessing]));
    
    const { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds } = calculateTrapAnswerScores(
        activePlayers,
        game.trapAnswerState.currentQuestion,
        game.trapAnswerState.playerAnswers,
        playerGuesses,
        awayPlayerIdsDuringRound,
        game.trapAnswerState.shuffledAnswers || []
    );

    const finalScores = { ...(game.playerScores || {}) };
    Object.entries(roundScores).forEach(([pid, data]) => {
        if (data && typeof data.points === 'number') {
             finalScores[pid] = (finalScores[pid] || 0) + data.points;
        }
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

    const roundResults = { scores: roundScores, answers: resultsByAnswer, timedOutGuesserIds, awayPlayerIdsDuringRound };
    
    // Update AFK stats
    const afkStats = { ...(game.trapAnswerState.afkStats || {}) };
    awayPlayerIdsDuringRound.forEach(playerId => {
        afkStats[playerId] = (afkStats[playerId] || 0) + 1;
    });

    transaction.update(gameRef, {
        gameState: 'round-results',
        playerScores: finalScores,
        'trapAnswerState.playerGuesses': playerGuesses,
        'trapAnswerState.lastRoundResults': roundResults,
        'trapAnswerState.timerEndsAt': deleteField(),
        'trapAnswerState.trickStats': mergedTrickStats,
        'trapAnswerState.awayPlayerIds': [],
        'trapAnswerState.afkStats': afkStats, // Save the updated AFK stats
    });
}
