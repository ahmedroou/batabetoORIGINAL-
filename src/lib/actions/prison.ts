

/**
 * @fileoverview Actions specific to the "The Prison" game.
 */

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    collection,
    query,
    getDocs,
    getDoc,
    Timestamp,
    deleteField,
    arrayUnion,
    writeBatch,
    increment,
    type Transaction,
    type FieldValue,
    updateDoc,
    setDoc,
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion, PlayerProgress, JudgePrisonAnswersInput, JudgeSingleSubmissionOutput } from '@/types';
import { judgePrisonAnswers as getPrisonJudgeResults } from '@/ai/flows/judge-prison-answers-flow';
import { updateLeagueScoresForGameEnd } from './user';


/**
 * A simple shuffle function to randomize array elements.
 * @param {Array<any>} array - The array to shuffle.
 * @returns {Array<any>} The shuffled array.
 */
function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    // While there remain elements to shuffle.
    while (currentIndex !== 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

/**
 * Updates the game settings. Only the host can perform this action in the lobby state.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @param {Game['prisonState']['settings']} settings - The new settings to apply.
 * @returns {Promise<void>}
 * @throws {Error} If the game is not found, player is not host, or game is not in lobby state.
 */
export async function updatePrisonSettings(gameId: string, hostId: string, settings: Game['prisonState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can change settings.");
        }
        if (game.gameState !== 'lobby') {
            throw new Error("Settings can only be changed in the lobby.");
        }

        transaction.update(gameRef, { 'prisonState.settings': settings });
    });
}

/**
 * Starts "The Prison" game. Only the host can perform this, and requires at least 2 players.
 * Initializes player roles, scores, and prison history.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @returns {Promise<void>}
 * @throws {Error} If game not found, player not host, or insufficient players.
 */
export async function startPrisonGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can start the game.");
        }
        if (game.players.length < 2) {
            throw new Error("The game requires at least 2 players.");
        }

        // Initialize all players as contestants, alive, and set up initial prison history
        const updatedPlayers = game.players.map(p => ({ ...p, role: 'contestant', status: 'alive' }));
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'instructions', // Start with instructions phase
            round: 1,
            // Initialize scores for all players to 0
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            prisonState: {
                settings: game.prisonState?.settings, // Preserve existing settings
                // Initialize prison history for each player
                prisonHistory: updatedPlayers.reduce((acc, p) => ({ ...acc, [p.id]: { inPrison: 0, roundsWithoutWinningAuction: 0 } }), {}),
                rejudgeRequestsUsedBy: [], // Track who has used their re-judge ability for the whole game.
            },
        });
    });
}

/**
 * Proceeds the game from the instructions phase to the first open auction round.
 * Selects a random question and sets the timer.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @returns {Promise<void>}
 * @throws {Error} If game not found, player not host, or no questions available.
 */
export async function proceedFromInstructions(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only host can proceed from instructions.");
        }
        if (game.gameState !== 'instructions') {
            // If not in instructions, do nothing (idempotent)
            return;
        }

        // Fetch all available prison questions
        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            throw new Error(`لا توجد أسئلة للعبة السجن. يرجى رفع المزيد من الأسئلة من صفحة الأدمن.`);
        }
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)]; // Select a random question
        
        const answeringTime = game.prisonState?.settings?.answeringTime || 45; // Default to 45 seconds

        transaction.update(gameRef, {
            gameState: 'open_auction', // Transition to open auction
            'prisonState.currentQuestion': randomQuestion, // Set the current question
            'prisonState.openAuctionSubmissions': {}, // Reset submissions for the new round
            'prisonState.playerProgress': {}, // Reset live player progress
            'prisonState.aiJudgeResults': [], // Clear previous AI judge results
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000), // Set timer
        });
    });
}

/**
 * Updates a player's live answers during the open auction or closed auction answering phase.
 * This is for real-time display and is not a final submission.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player.
 * @param {string[]} answers - The current list of answers from the player.
 * @returns {Promise<void>}
 */
export async function updateOpenAuctionProgress(gameId: string, playerId: string, answers: string[]) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                // If game doesn't exist, simply return without throwing an error
                // as this is a live update and the game might have ended or been deleted.
                return;
            }
            const game = gameDoc.data() as Game;

            // Only allow updates if in open auction or closed auction answering phase
            if (game.gameState !== 'open_auction' && game.gameState !== 'closed_auction_answering') {
                return;
            }

            // Update the player's progress with their current answers
            transaction.update(gameRef, {
                [`prisonState.playerProgress.${playerId}.answers`]: answers,
            });
        });
    } catch (error) {
        console.error("Error updating open auction progress:", error);
        // Do not throw here as this is a non-critical live update.
    }
}


/**
 * Submits a player's final answers for the closed auction phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player submitting answers.
 * @param {string[]} answers - The list of answers submitted by the player.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function submitClosedAuctionAnswer(gameId: string, playerId: string, answers: string[]): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw new Error("Game not found.");
            }
            const game = gameDoc.data() as Game;

            if (game.gameState !== 'closed_auction_answering') {
                return; // Only allow submission in closed_auction_answering phase
            }
            if (game.prisonState?.auctionWinnerId !== playerId) {
                throw new Error("لست الفائز بالمزاد."); // Only the winner can submit answers
            }
            
            // Store the winner's answers in openAuctionSubmissions for judging
            transaction.update(gameRef, { 
                'prisonState.openAuctionSubmissions': { [playerId]: answers },
                'prisonState.timerEndsAt': deleteField(), // Remove the timer
                 gameState: 'judging', // Transition to judging phase
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error submitting closed auction answer:", error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

/**
 * Asynchronously judges a single player's submission and updates the game state.
 * @param {string} gameId - The ID of the game.
 * @param {JudgePrisonAnswersInput} singlePlayerInput - The input for a single player's submission.
 * @param {boolean} isRejudging - Flag for re-evaluation.
 */
async function judgeSinglePlayerAndUpdate(gameId: string, singlePlayerInput: JudgePrisonAnswersInput, isRejudging: boolean) {
    try {
        const judgeOutput = await getPrisonJudgeResults({ input: singlePlayerInput, useProModel: isRejudging });
        
        if (judgeOutput && judgeOutput.results.length > 0) {
            const singleResult = judgeOutput.results[0];
            const gameRef = doc(db, 'games', gameId);
            
            await updateDoc(gameRef, {
                'prisonState.aiJudgeResults': arrayUnion(singleResult)
            });
        } else {
             console.warn(`AI judge returned no result for player ${singlePlayerInput.submissions[0].playerId} in game ${gameId}`);
        }
    } catch (error) {
        console.error(`Error judging submission for player ${singlePlayerInput.submissions[0].playerId} in game ${gameId}:`, error);
    }
}


/**
 * Triggers the AI judge to evaluate answers. This is manually triggered by the host.
 * @param {string} gameId - The ID of the game.
 * @param {boolean} [isRejudging=false] - Whether this is a re-evaluation.
 * @returns {Promise<void>}
 */
export async function judgeAnswersAndProceed(gameId: string, isRejudging: boolean = false) {
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found for judging.");
        
        const currentGameState = gameDoc.data()?.gameState;
        if (currentGameState !== 'judging' && currentGameState !== 'rejudging') {
            console.warn(`Judging called for game ${gameId} in wrong state: ${currentGameState}`);
            return;
        }

        if (gameDoc.data().prisonState?.judgingStarted) {
            console.warn("Judging process already started for game:", gameId);
            return;
        }
        transaction.update(gameRef, { 
            'prisonState.judgingStarted': true,
            'prisonState.aiJudgeResults': []
        });
    });

    const gameDoc = await getDoc(gameRef);
    if (!gameDoc.exists()) throw new Error("Game disappeared after starting judging.");
    const game = gameDoc.data() as Game;

    const allSubmissions = game.prisonState?.openAuctionSubmissions || {};
    const playerSubmissions = Object.entries(allSubmissions).map(([playerId, answers]) => {
        const player = game.players.find(p => p.id === playerId);
        return {
            playerId: playerId,
            name: player?.name || 'Unknown',
            answers: answers || [],
        };
    });

    if (playerSubmissions.length === 0) {
        console.warn(`No submissions found for game ${gameId} to judge.`);
        await updateDoc(gameRef, { gameState: 'results' });
        return;
    }
    
    for (const submission of playerSubmissions) {
        if (!submission.answers || submission.answers.length === 0) {
            const zeroResult: JudgeSingleSubmissionOutput = {
                playerId: submission.playerId,
                name: submission.name,
                correctAnswers: [],
                score: 0,
                evaluation: "لم يقدم اللاعب أي إجابات."
            };
            await updateDoc(gameRef, {
                'prisonState.aiJudgeResults': arrayUnion(zeroResult)
            });
            continue;
        }

        const singlePlayerInput: JudgePrisonAnswersInput = {
            question: game.prisonState?.currentQuestion?.text || game.prisonState?.closedAuctionQuestion?.text || '',
            submissions: [submission],
            rejudgeReason: isRejudging ? {
                name: game.prisonState?.activeRejudgeRequest?.name || 'Unknown',
                reason: game.prisonState?.activeRejudgeRequest?.reason || ''
            } : undefined,
        };
        await judgeSinglePlayerAndUpdate(gameId, singlePlayerInput, isRejudging);
    }
}



/**
 * Proceeds the game from the judging phase to the results phase, calculates scores,
 * and updates player statuses (in prison, executed, freed).
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @returns {Promise<void>}
 * @throws {Error} If game not found, player not host, or no judge results.
 */
export async function proceedToResults(gameId: string, hostId: string) {
    let finalGameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
         const gameDoc = await transaction.get(doc(db, 'games', gameId));
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only host can proceed to results.");
        }
         if (!game.prisonState?.aiJudgeResults || game.prisonState.aiJudgeResults.length === 0) {
            console.warn(`Attempted to proceed to results for game ${gameId} without AI judge results.`);
            return;
        }

        const { updatedGame, gameDataForLeague } = await proceedToResultsInternal(gameId, hostId, transaction, game.prisonState.aiJudgeResults);
        transaction.update(doc(db, 'games', gameId), updatedGame);
        finalGameDataForLeagueUpdate = gameDataForLeague;
    });

    if (finalGameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
    }
}

/**
 * Internal logic for processing results. Can be called directly from another transaction.
 * Returns the update object and the final game state for league score updates.
 */
async function proceedToResultsInternal(gameId: string, hostId: string, transaction: Transaction, aiResults: Game['prisonState']['aiJudgeResults']): Promise<{ updatedGame: object, gameDataForLeague: Game | null }> {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) {
        throw new Error("Game not found.");
    }
    const game = gameDoc.data() as Game;

    let updatedPlayers = [...game.players];
    const roundScores: Game['prisonState']['lastRoundResult']['points'] = {};
    
    const lastResultData: Partial<Game['prisonState']['lastRoundResult']> = {};
    
    const activeContestants = game.players.filter(p => p.role === 'contestant' && p.status !== 'executed' && p.status !== 'left');
    
    activeContestants.forEach(p => {
        roundScores[p.id] = { points: 0, breakdown: [] };
    });

    if (game.prisonState?.isRejectionJustified && game.prisonState?.judgeExplanation) {
        const rejudgerId = game.prisonState?.rejudgeRequestsUsedBy?.slice(-1)[0];
        if (rejudgerId && roundScores[rejudgerId]) {
            roundScores[rejudgerId].points -= 1;
            roundScores[rejudgerId].breakdown.push({ reason: 'اعتراض خاطئ', points: -1 });
        }
    }

    if (game.prisonState?.auctionWinnerId) { // Closed Auction Logic
        const winnerResult = aiResults.find(r => r.playerId === game.prisonState!.auctionWinnerId);
        const winnerIndex = updatedPlayers.findIndex(p => p.id === game.prisonState!.auctionWinnerId);

        if (winnerIndex !== -1) {
            const winner = updatedPlayers[winnerIndex];
            const bidAmount = game.prisonState?.highestBid || 0;
            const isSuccess = (winnerResult?.score || 0) >= bidAmount;
            
            if (isSuccess) {
                lastResultData.message = `نجح ${winner.name} في تحقيق المزايدة!`;
                roundScores[winner.id]!.points += 2;
                roundScores[winner.id]!.breakdown.push({ reason: 'فوز بالمزاد', points: 2 });

                if (winner.status === 'in_prison') {
                    updatedPlayers[winnerIndex].status = 'alive';
                    lastResultData.freedPlayerName = winner.name;
                    lastResultData.freedPlayerAvatarId = winner.avatarId;
                    lastResultData.message += ` وتم تحريره من السجن!`;
                }
            } else {
                lastResultData.message = `فشل ${winner.name} في تحقيق المزايدة.`;
                const scoreDifference = bidAmount - (winnerResult?.score || 0);
                if (scoreDifference > 0) {
                    roundScores[winner.id]!.points -= scoreDifference;
                    roundScores[winner.id]!.breakdown.push({ reason: `نقص ${scoreDifference} إجابات`, points: -scoreDifference });
                }
                
                if (winner.status === 'in_prison') {
                    roundScores[winner.id]!.points -= 2;
                    roundScores[winner.id]!.breakdown.push({ reason: 'عقوبة الفشل في السجن', points: -2 });
                    lastResultData.message += " سيظل في السجن مع عقوبة إضافية.";
                } else {
                    updatedPlayers[winnerIndex].status = 'in_prison';
                    lastResultData.message += " سيدخل السجن.";
                }
            }
        } else {
             lastResultData.message = `غادر الفائز بالمزاد اللعبة!`;
        }

        activeContestants.forEach(p => {
            if (p.id !== game.prisonState?.auctionWinnerId && p.status === 'alive') {
                 roundScores[p.id]!.points += 1;
                 roundScores[p.id]!.breakdown.push({ reason: 'نجاة', points: 1 });
            }
        });

    } else { // Open Auction Logic
        const finalScores = aiResults.map(res => ({
            playerId: res.playerId,
            finalScore: res.score
        }));
        
        if (finalScores.length > 0) {
            finalScores.forEach(({ playerId }) => {
                const playerResult = aiResults.find(r => r.playerId === playerId);
                if (playerResult) {
                    const totalSubmitted = (game.prisonState?.openAuctionSubmissions?.[playerId] || []).length;
                    const incorrectCount = totalSubmitted - playerResult.score;
                    if (incorrectCount > 0) {
                        const penalty = -Math.floor(incorrectCount / 2);
                        if (penalty < 0) {
                            roundScores[playerId]!.points += penalty;
                            roundScores[playerId]!.breakdown.push({ reason: 'إجابات خاطئة', points: penalty });
                        }
                    }
                }
            });
            
            const scoresList = finalScores.map(c => c.finalScore);
            const maxScore = Math.max(...scoresList);
            const minScore = Math.min(...scoresList);
            
            const winners = finalScores.filter(c => c.finalScore === maxScore);
            const losers = finalScores.filter(c => c.finalScore === minScore);
            
            let winnerMessage = "";
            let loserMessage = "";

            if (winners.length > 0 && (scoresList.length === 1 || maxScore > minScore)) {
                winners.forEach(winner => {
                    const winnerIndex = updatedPlayers.findIndex(p => p.id === winner.playerId);
                    const winnerPlayer = updatedPlayers[winnerIndex];
                    if (winnerPlayer) {
                        winnerMessage = `الفائز بالجولة هو ${winnerPlayer.name}!`;
                        if (winnerPlayer.status === 'in_prison') {
                            updatedPlayers[winnerIndex].status = 'alive';
                            lastResultData.freedPlayerName = winnerPlayer.name;
                            lastResultData.freedPlayerAvatarId = winnerPlayer.avatarId;
                            winnerMessage += ` وتم تحريره!`;
                            roundScores[winner.playerId]!.points += 2;
                            roundScores[winner.playerId]!.breakdown.push({ reason: 'فوز وتحرير', points: 2 });
                        } else {
                            roundScores[winner.playerId]!.points += 3;
                            roundScores[winner.playerId]!.breakdown.push({ reason: 'فوز بالمزاد', points: 3 });
                        }
                    }
                });
            }

            if (losers.length === 1 && maxScore > minScore) {
                const loserId = losers[0].playerId;
                const loserIndex = updatedPlayers.findIndex(p => p.id === loserId);
                if (loserIndex !== -1 && updatedPlayers[loserIndex].status === 'alive') {
                    updatedPlayers[loserIndex].status = 'in_prison';
                    loserMessage = `الخاسر هو ${updatedPlayers[loserIndex].name} وسيدخل السجن.`;
                }
            }
            
            lastResultData.message = [winnerMessage, loserMessage].filter(Boolean).join(' ');
            if (!lastResultData.message) lastResultData.message = "انتهى المزاد بالتعادل!";

            finalScores.forEach(({ playerId }) => {
                 const isWinner = winners.some(w => w.playerId === playerId) && maxScore > minScore;
                 const isLoser = losers.length === 1 && losers[0].playerId === playerId && maxScore > minScore;
                 if (!isWinner && !isLoser && updatedPlayers.find(p => p.id === playerId)?.status === 'alive') {
                     roundScores[playerId]!.points += 1;
                     roundScores[playerId]!.breakdown.push({ reason: 'نجاة', points: 1 });
                 }
            });
        }
    }
    
    updatedPlayers.forEach(p => {
         if (p.status === 'in_prison' && roundScores[p.id]) {
            roundScores[p.id]!.points -= 1;
            roundScores[p.id]!.breakdown.push({ reason: 'عقوبة السجن', points: -1 });
         }
    });

    const newTotalScores = { ...(game.playerScores || {}) };
    Object.entries(roundScores).forEach(([playerId, data]) => {
        if (data.points !== 0) { 
            newTotalScores[playerId] = (newTotalScores[playerId] || 0) + data.points;
        }
    });
    
    const finalLastRoundResult: Game['prisonState']['lastRoundResult'] = {
        message: lastResultData.message || "انتهت الجولة.",
        points: roundScores,
        ...lastResultData,
    };
    
    const updatedGame = {
        players: updatedPlayers,
        playerScores: newTotalScores,
        gameState: 'results',
        'prisonState.lastRoundResult': finalLastRoundResult,
        'prisonState.timerEndsAt': deleteField(),
        'prisonState.judgingStarted': deleteField(),
        'prisonState.judgeExplanation': deleteField(),
    };

    const finalGameObjectForLeague = { ...game, ...updatedGame };
    
    return { updatedGame, gameDataForLeague: finalGameObjectForLeague };
}

export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const currentRound = game.round || 1;
        const totalRounds = game.prisonState?.settings.rounds || 10;
        
        if (currentRound >= totalRounds) {
            const finalGameData = { ...game, gameState: 'final_results' as const };
            gameDataForLeagueUpdate = finalGameData;
            transaction.update(gameRef, { gameState: 'final_results' });
            return;
        }

        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            throw new Error(`لا توجد أسئلة كافية للعبة السجن.`);
        }
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
        
        const isClosedAuction = game.players.some(p => p.status === 'in_prison');
        const nextGameState = isClosedAuction ? 'closed_auction_bidding' : 'open_auction';
        const timerDuration = isClosedAuction ? (game.prisonState?.settings.biddingTime || 30) : (game.prisonState?.settings.answeringTime || 45);

        transaction.update(gameRef, {
            gameState: nextGameState,
            round: currentRound + 1,
            'prisonState.currentQuestion': isClosedAuction ? deleteField() : randomQuestion,
            'prisonState.closedAuctionQuestion': isClosedAuction ? randomQuestion : deleteField(),
            'prisonState.openAuctionSubmissions': {},
            'prisonState.playerProgress': {},
            'prisonState.aiJudgeResults': [],
            'prisonState.lastRoundResult': deleteField(),
            'prisonState.auctionWinnerId': deleteField(),
            'prisonState.highestBid': deleteField(),
            'prisonState.bids': {},
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + timerDuration * 1000),
        });
    });

    if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}


export async function submitBid(gameId: string, playerId: string, amount: number, changeQuestion?: boolean) {
    const gameRef = doc(db, 'games', gameId);
    return runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (changeQuestion) {
             if ((game.prisonState?.questionChangersUsedBy || []).includes(playerId)) {
                 throw new Error("لقد استخدمت قدرتك على تغيير السؤال بالفعل.");
             }
             const questionsCol = collection(db, "prison_questions");
             const snapshot = await getDocs(questionsCol);
             if (snapshot.empty) throw new Error("لا توجد أسئلة كافية لتغيير السؤال.");
             const questions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
             const newQuestion = questions[Math.floor(Math.random() * questions.length)];

             transaction.update(gameRef, {
                 'prisonState.closedAuctionQuestion': newQuestion,
                 'prisonState.questionChangersUsedBy': arrayUnion(playerId)
             });
             return { success: true };
        }
        
        const currentHighestBid = game.prisonState?.highestBid || 0;
        if (isNaN(amount) || amount <= currentHighestBid) {
            throw new Error(`يجب أن تكون مزايدتك أعلى من ${currentHighestBid}.`);
        }

        transaction.update(gameRef, {
            [`prisonState.bids.${playerId}`]: amount,
            'prisonState.highestBid': amount
        });
        return { success: true };
    }).catch((e: any) => {
        return { success: false, error: e.message };
    });
}


export async function handleTimeout(gameId: string, callerId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            const game = gameDoc.data() as Game;

            if (game.hostId !== callerId) {
                return;
            }
            if (!game.prisonState?.timerEndsAt || Date.now() < game.prisonState.timerEndsAt.toMillis()) {
                return; 
            }

            if (game.gameState === 'open_auction') {
                const submissions: Record<string, string[]> = { ...(game.prisonState?.openAuctionSubmissions || {}) };
                const activePlayers = game.players.filter(p => p.status === 'alive');
                
                activePlayers.forEach(p => {
                    submissions[p.id] = game.prisonState?.playerProgress?.[p.id]?.answers || [];
                });

                transaction.update(gameRef, {
                    'prisonState.openAuctionSubmissions': submissions,
                    gameState: 'judging',
                    'prisonState.timerEndsAt': deleteField(),
                });
            } else if (game.gameState === 'closed_auction_bidding') {
              const bids = game.prisonState?.bids || {};
              if (Object.keys(bids).length === 0) {
                transaction.update(gameRef, { gameState: 'results', 'prisonState.lastRoundResult': { message: "لا أحد زايد. انتهت الجولة.", points: {} } });
                return;
              }

              let winnerId = '';
              let highestBid = 0;
              Object.entries(bids).forEach(([playerId, bid]) => {
                if (bid > highestBid) {
                  highestBid = bid;
                  winnerId = playerId;
                }
              });

              const answeringTime = game.prisonState?.settings?.answeringTime || 45;
              transaction.update(gameRef, {
                gameState: 'closed_auction_answering',
                'prisonState.auctionWinnerId': winnerId,
                'prisonState.highestBid': highestBid,
                'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000),
              });

            } else if (game.gameState === 'closed_auction_answering') {
              const winnerId = game.prisonState.auctionWinnerId!;
              const winnerAnswers = game.prisonState.playerProgress?.[winnerId]?.answers || [];
              transaction.update(gameRef, {
                'prisonState.openAuctionSubmissions': { [winnerId]: winnerAnswers },
                'prisonState.timerEndsAt': deleteField(),
                gameState: 'judging',
              });
            }
        });
    } catch (error) {
        console.error("Error in handleTimeout:", error);
    }
}

export async function requestRejudge(gameId: string, playerId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    
    return runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const player = game.players.find(p => p.id === playerId);

        if (game.gameState !== 'judging') throw new Error("لا يمكن طلب إعادة التقييم إلا بعد ظهور النتائج الأولية.");
        if ((game.prisonState?.rejudgeRequestsUsedBy || []).includes(playerId)) throw new Error("لقد استخدمت فرصتك لإعادة التقييم بالفعل.");
        if (game.prisonState?.activeRejudgeRequest) throw new Error("هناك طلب إعادة تقييم قيد التنفيذ بالفعل.");

        const requestData = { playerId, name: player?.name || 'مجهول', reason };

        transaction.update(gameRef, {
            'prisonState.activeRejudgeRequest': requestData,
            'prisonState.rejudgeRequestsUsedBy': arrayUnion(playerId),
            gameState: 'rejudging',
            'prisonState.judgingStarted': false,
        });

        return { success: true };
    }).catch((e: any) => {
        return { success: false, error: e.message };
    });
}
