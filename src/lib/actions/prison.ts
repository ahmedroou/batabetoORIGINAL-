

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
    Timestamp,
    deleteField,
    arrayUnion
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion, PlayerProgress, JudgePrisonAnswersInput } from '@/types';
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
export async function updateGameSettings(gameId: string, hostId: string, settings: Game['prisonState']['settings']) {
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
 * @throws {Error} If the game is not found, player is not host, or insufficient players.
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
                gameState: 'judging', // Transition to judging phase
                'prisonState.judgingStarted': true, // Indicate judging has started
                'prisonState.timerEndsAt': deleteField(), // Remove the timer
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting closed auction answer:", error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

/**
 * Triggers the AI judge to evaluate answers and proceeds the game.
 * Can be used for initial judging or re-judging.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @returns {Promise<void>}
 * @throws {Error} If game not found.
 */
export async function judgeAnswersAndProceed(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;
        
        if (game.hostId !== hostId) {
            throw new Error("Only the host can judge.");
        }
        
        if (game.gameState !== 'judging' && game.gameState !== 'rejudging') {
            return;
        }

        const rejudgeRequest = game.prisonState?.activeRejudgeRequest;

        // Prepare the submissions for the AI
        const allSubmissions = game.prisonState?.openAuctionSubmissions || {};
        const playerSubmissions = Object.entries(allSubmissions).map(([playerId, answers]) => {
           const player = game.players.find(p => p.id === playerId);
           return {
               playerId: playerId,
               name: player?.name || 'Unknown',
               answers: answers || [],
           };
        });
        
        // Prepare the AI input
        const aiInput: JudgePrisonAnswersInput = {
             question: game.prisonState?.currentQuestion?.text || game.prisonState?.closedAuctionQuestion?.text || '',
             submissions: playerSubmissions,
        };
        
        // If it's a rejudge, add the reason to the input
        if (rejudgeRequest) {
            aiInput.rejudgeReason = {
                 playerId: rejudgeRequest.playerId,
                 name: rejudgeRequest.name,
                 reason: rejudgeRequest.reason,
            };
        }
        
        // Call the AI judge
        const judgeOutput = await getPrisonJudgeResults(aiInput);

        let finalResults = judgeOutput.results;

        // If this was a rejudge, merge the results intelligently.
        if (rejudgeRequest) {
            const originalResults = game.prisonState?.aiJudgeResults || [];
            const updatedResultIds = new Set(finalResults.map(r => r.playerId));
            
            // Create a new merged result array
            const mergedResults = originalResults.map(originalResult => {
                // If the new results have an entry for this player, use it.
                const updatedResult = finalResults.find(r => r.playerId === originalResult.playerId);
                return updatedResult || originalResult;
            });

            // Add any completely new player results (should not happen, but for safety)
            finalResults.forEach(newResult => {
                if (!mergedResults.some(r => r.playerId === newResult.playerId)) {
                    mergedResults.push(newResult);
                }
            });
            finalResults = mergedResults;
        }

        // Prepare the data to update in Firestore
        const updateData: any = {
             'prisonState.aiJudgeResults': finalResults,
             'prisonState.judgeExplanation': judgeOutput.judgeExplanation || deleteField(),
             'prisonState.isRejectionJustified': judgeOutput.isRejectionJustified || false,
        };

        if (rejudgeRequest) {
             updateData['prisonState.activeRejudgeRequest'] = deleteField();
        }

        // Always return to 'judging' state to allow host to review before proceeding.
        updateData.gameState = 'judging'; 

        transaction.update(gameRef, updateData);
    });
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
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
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
        
        const aiResults = game.prisonState!.aiJudgeResults!;
        let updatedPlayers = [...game.players];
        const roundScores: Game['prisonState']['lastRoundResult']['points'] = {};
        let lastRoundMessage = "انتهى المزاد!";
        
        const lastResultData: Partial<Game['prisonState']['lastRoundResult']> = {};
        
        const activeContestants = game.players.filter(p => p.role === 'contestant' && p.status !== 'executed' && p.status !== 'left');
        activeContestants.forEach(p => {
            roundScores[p.id] = { points: 0, breakdown: [] };
        });

        // Apply penalty for unjustified rejections
        if (game.prisonState?.isRejectionJustified && game.prisonState?.judgeExplanation) {
            const rejudgerId = game.prisonState?.rejudgeRequestsUsedBy?.slice(-1)[0];
            if (rejudgerId && roundScores[rejudgerId]) {
                roundScores[rejudgerId].points -= 1;
                roundScores[rejudgerId].breakdown.push({ reason: 'اعتراض خاطئ', points: -1 });
            }
        }

        if (game.prisonState.auctionWinnerId) { // Closed Auction Logic
            const winnerResult = aiResults.find(r => r.playerId === game.prisonState!.auctionWinnerId);
            const winnerIndex = updatedPlayers.findIndex(p => p.id === game.prisonState!.auctionWinnerId);

            if (winnerIndex === -1) {
                lastRoundMessage = `غادر الفائز بالمزاد اللعبة!`;
            } else {
                const winner = updatedPlayers[winnerIndex];
                const bidAmount = game.prisonState?.highestBid || 0;
                
                const isSuccess = (winnerResult?.score || 0) >= bidAmount;
                
                if (isSuccess) {
                    lastRoundMessage = `نجح ${winner.name} في تحقيق المزايدة!`;
                    roundScores[winner.id]!.points += 2;
                    roundScores[winner.id]!.breakdown.push({ reason: 'فوز بالمزاد', points: 2 });

                    if (winner.status === 'in_prison') {
                        updatedPlayers[winnerIndex].status = 'alive';
                        lastResultData.freedPlayerName = winner.name;
                        lastResultData.freedPlayerAvatarId = winner.avatarId;
                        lastRoundMessage += ` وتم تحريره من السجن!`;
                    }
                } else {
                    lastRoundMessage = `فشل ${winner.name} في تحقيق المزايدة.`;
                    const scoreDifference = bidAmount - (winnerResult?.score || 0);
                    if (scoreDifference > 0) {
                        roundScores[winner.id]!.points -= scoreDifference;
                        roundScores[winner.id]!.breakdown.push({ reason: `نقص ${scoreDifference} إجابات`, points: -scoreDifference });
                    }
                    
                    if (winner.status === 'in_prison') {
                        roundScores[winner.id]!.points -= 2;
                        roundScores[winner.id]!.breakdown.push({ reason: 'عقوبة الفشل في السجن', points: -2 });
                        lastRoundMessage += " سيظل في السجن مع عقوبة إضافية.";
                    } else {
                        updatedPlayers[winnerIndex].status = 'in_prison';
                        lastRoundMessage += " سيدخل السجن.";
                    }
                }
            }

            // Survivors (all players except the auction winner who are outside prison)
            activeContestants.forEach(p => {
                if (p.id !== game.prisonState?.auctionWinnerId) {
                     if (p.status === 'alive') {
                         roundScores[p.id]!.points += 1;
                         roundScores[p.id]!.breakdown.push({ reason: 'نجاة', points: 1 });
                     }
                }
            });

        } else { // Open Auction Logic
            const finalScores = aiResults.map(res => ({
                playerId: res.playerId,
                finalScore: res.score
            }));
            
            if (finalScores.length > 0) {
                // Calculate and apply penalties for wrong answers FIRST for ALL players
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
                
                lastRoundMessage = [winnerMessage, loserMessage].filter(Boolean).join(' ');

                // Award points to survivors (non-winners and non-losers)
                finalScores.forEach(({ playerId }) => {
                     const isWinner = winners.some(w => w.playerId === playerId) && maxScore > minScore;
                     const isLoser = losers.length === 1 && losers[0].playerId === playerId && maxScore > minScore;
                     if (!isWinner && !isLoser) {
                         const player = updatedPlayers.find(p => p.id === playerId);
                         if(player && player.status === 'alive') {
                            roundScores[playerId]!.points += 1;
                            roundScores[playerId]!.breakdown.push({ reason: 'نجاة', points: 1 });
                         }
                     }
                });
            }
        }
        
        // Penalty for players in prison
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
            message: lastRoundMessage,
            points: roundScores,
            ...lastResultData,
        };
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newTotalScores,
            gameState: 'results',
            'prisonState.lastRoundResult': finalLastRoundResult,
            'prisonState.timerEndsAt': deleteField(),
            'prisonState.judgingStarted': deleteField(),
            'prisonState.judgeExplanation': deleteField(),
        });
    });
}

/**
 * Submits a player's bid in the closed auction or allows them to change the question.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player submitting the bid.
 * @param {number} amount - The bid amount.
 * @param {boolean} changeQuestion - True if the player wants to change the question instead of bidding.
 * @returns {Promise<{ success: boolean; error?: string }>}
 * @throws {Error} If game not found, not in bidding phase, player cannot participate, bid invalid, or question change already used.
 */
export async function submitBid(gameId: string, playerId: string, amount: number, changeQuestion: boolean = false): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw new Error("Game not found.");
            }
            let game = gameDoc.data() as Game;

            if (game.gameState !== 'closed_auction_bidding') {
                return; // Only allow bids in the closed_auction_bidding phase
            }

            const player = game.players.find(p => p.id === playerId);
            if (!player || (player.status !== 'alive' && player.status !== 'in_prison')) {
                throw new Error("لا يمكنك المشاركة في هذا المزاد.");
            }

            if (changeQuestion) {
                const usedChangers = game.prisonState?.questionChangersUsedBy || [];
                if (usedChangers.includes(playerId)) {
                    throw new Error("لقد استخدمت ميزة تغيير السؤال بالفعل.");
                }

                // Fetch a new random question
                const q = query(collection(db, "prison_questions"));
                const querySnapshot = await getDocs(q);
                const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
                const newQuestion = questions[Math.floor(Math.random() * questions.length)];

                // Reset bids and highest bid when question changes
                transaction.update(gameRef, {
                    'prisonState.closedAuctionQuestion': newQuestion,
                    'prisonState.bids': {}, // Clear all previous bids
                    'prisonState.highestBid': 0, // Reset highest bid
                    'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + (game.prisonState?.settings?.biddingTime || 30) * 1000), // Reset timer
                    'prisonState.questionChangersUsedBy': [...usedChangers, playerId], // Mark player as having used the ability
                    'prisonState.lastRoundResult.message': `${player.name} قام بتغيير السؤال!`, // Update last round message for display
                });
                return; // Exit transaction after changing question
            }

            // If not changing question, process the bid
            const highestBid = game.prisonState?.highestBid || 0;
            if (isNaN(amount) || amount <= highestBid) {
                throw new Error(`يجب أن تكون مزايدتك أعلى من ${highestBid}.`);
            }
            
            // Update bids and highest bid
            const newBids = { ...(game.prisonState?.bids || {}), [playerId]: amount };
            const newHighestBid = Math.max(highestBid, amount);
            
            transaction.update(gameRef, {
                'prisonState.bids': newBids,
                'prisonState.highestBid': newHighestBid,
            });

            // Check if all players have bid AFTER our update.
            const activeBidders = game.players.filter(p => (p.status === 'alive' || p.status === 'in_prison'));
            const allHaveBid = activeBidders.every(p => newBids.hasOwnProperty(p.id));

            if (allHaveBid) {
                 const finalBids = Object.entries(newBids) as [string, number][];
                 const sortedBids = finalBids.sort((a, b) => b[1] - a[1]);
                 const winnerId = sortedBids[0][0];
                 transaction.update(gameRef, {
                    gameState: 'closed_auction_answering',
                    'prisonState.auctionWinnerId': winnerId,
                    'prisonState.timerEndsAt': deleteField(),
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting bid:", error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}


/**
 * Advances the game to the next round or to final results if the game ends.
 * Handles prison sentencing, executions, and determines the next auction type.
 * @param {string} gameId - The ID of the game.
 * @returns {Promise<void>}
 * @throws {Error} If game not found.
 */
export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        let game = gameDoc.data() as Game;
        
        if (game.gameState !== 'results') {
            return; // Only allow proceeding from results phase
        }
        
        let updatedPlayers = [...game.players]; // Create a mutable copy of players
        // Deep copy prison history to avoid direct mutation issues
        const newPrisonHistory = JSON.parse(JSON.stringify(game.prisonState?.prisonHistory || {}));
        const newScores = { ...(game.playerScores || {}) };
        let executedPlayer: Player | undefined = undefined; // Track if a player was executed this round

        // --- Update Inactivity and Prison Status ---
        updatedPlayers.forEach(p => {
            if (!newPrisonHistory[p.id]) { 
                newPrisonHistory[p.id] = { inPrison: 0, roundsWithoutWinningAuction: 0 };
            }

            if (p.status === 'alive') {
                // Determine if player won the last closed auction
                const wonClosedAuction = game.prisonState?.auctionWinnerId === p.id && !!game.prisonState?.lastRoundResult?.freedPlayerName;
                // Determine if player was among winners of the open auction
                const wonOpenAuction = !game.prisonState?.auctionWinnerId && (game.prisonState?.lastRoundResult?.points?.[p.id]?.points || 0) > 1;

                if (wonClosedAuction || wonOpenAuction) {
                    newPrisonHistory[p.id].roundsWithoutWinningAuction = 0;
                } else {
                    newPrisonHistory[p.id].roundsWithoutWinningAuction = (newPrisonHistory[p.id].roundsWithoutWinningAuction || 0) + 1;
                }
            } else { 
                newPrisonHistory[p.id].roundsWithoutWinningAuction = 0;
            }
        });
        
        updatedPlayers = updatedPlayers.map(p => {
            if (p.status === 'alive' && newPrisonHistory[p.id].roundsWithoutWinningAuction >= 4) {
                newPrisonHistory[p.id].inPrison = 1;
                newPrisonHistory[p.id].roundsWithoutWinningAuction = 0;
                return { ...p, status: 'in_prison' };
            }
            return p;
        });

        updatedPlayers.forEach(p => {
            if (p.status === 'in_prison') {
                newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
            } else {
                newPrisonHistory[p.id].inPrison = 0;
            }
        });
        
        updatedPlayers = updatedPlayers.map(p => {
            if (p.status === 'in_prison' && newPrisonHistory[p.id]?.inPrison >= 4) {
                executedPlayer = p;
                return { ...p, status: 'executed' };
            }
            return p;
        });
        
        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        const remainingContestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed' && p.status !== 'left');
        
        if (currentRound >= totalRounds || remainingContestants.length < 2 || game.prisonState?.gameShouldEndAfterThis) {
             let message = "انتهت اللعبة ";
            if (currentRound >= totalRounds) {
                message += "ببلوغ الحد الأقصى بالجولات.";
            } else if (game.prisonState?.gameShouldEndAfterThis) {
                message = `انتهت اللعبة بإعدام آخر السجناء!`;
            } else {
                message += "لعدم وجود عدد كافٍ من المتنافسين.";
            }
            
            transaction.update(gameRef, { 
                gameState: 'final_results',
                players: updatedPlayers,
                gameResult: { winner: 'game_over', message },
                'prisonState.timerEndsAt': deleteField(),
            });

            // Update league scores at the end of the game
            await updateLeagueScoresForGameEnd(game, transaction);
            return;
        }

        if (executedPlayer && remainingContestants.length < 2) {
             transaction.update(gameRef, { 
                players: updatedPlayers,
                playerScores: newScores,
                'prisonState.prisonHistory': newPrisonHistory,
                'prisonState.lastRoundResult': {
                    message: `تم إعدام ${executedPlayer.name}.`,
                    executedPlayerName: executedPlayer.name,
                    executedPlayerAvatarId: executedPlayer.avatarId,
                    points: game.prisonState?.lastRoundResult?.points || {},
                },
                gameState: 'results', 
                'prisonState.gameShouldEndAfterThis': true 
            });
            return;
        }
        
        const playersInPrisonCount = updatedPlayers.filter(p => p.status === 'in_prison').length;
        const playersOutsidePrisonCount = updatedPlayers.filter(p => p.status === 'alive').length;

        let nextGameState: 'open_auction' | 'closed_auction_bidding';
        let timerDuration: number;
        
        if (playersInPrisonCount > 0 && playersOutsidePrisonCount > 0) {
            nextGameState = 'closed_auction_bidding';
            timerDuration = game.prisonState?.settings?.biddingTime || 30;
        } else {
            nextGameState = 'open_auction';
            timerDuration = game.prisonState?.settings?.answeringTime || 45;
        }

        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
        
        const lastRoundResult: Partial<Game['prisonState']['lastRoundResult']> = {};
        if (executedPlayer) {
            lastRoundResult.executedPlayerName = executedPlayer.name;
            lastRoundResult.executedPlayerAvatarId = executedPlayer.avatarId;
        }
        if (game.prisonState?.lastRoundResult?.freedPlayerName) {
            lastRoundResult.freedPlayerName = game.prisonState.lastRoundResult.freedPlayerName;
            lastRoundResult.freedPlayerAvatarId = game.prisonState.lastRoundResult.freedPlayerAvatarId;
        }

        transaction.update(gameRef, {
            players: updatedPlayers, 
            playerScores: newScores, 
            gameState: nextGameState, 
            round: currentRound + 1, 
            'prisonState.prisonHistory': newPrisonHistory, 
            'prisonState.currentQuestion': nextGameState === 'open_auction' ? randomQuestion : deleteField(),
            'prisonState.closedAuctionQuestion': nextGameState === 'closed_auction_bidding' ? randomQuestion : deleteField(),
            'prisonState.openAuctionSubmissions': {}, 
            'prisonState.playerProgress': {}, 
            'prisonState.aiJudgeResults': [], 
            'prisonState.bids': {}, 
            'prisonState.withdrawnBidders': [], 
            'prisonState.highestBid': 0, 
            'prisonState.auctionWinnerId': deleteField(), 
            'prisonState.lastRoundWinnerId': deleteField(), 
            'prisonState.lastRoundResult': lastRoundResult, 
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + timerDuration * 1000), 
            'prisonState.judgingStarted': deleteField(), 
            'prisonState.judgeExplanation': deleteField(), 
            'prisonState.activeRejudgeRequest': deleteField(),
            'prisonState.isRejectionJustified': deleteField(),
        });
    });
}

/**
 * Requests a re-evaluation of answers by the AI judge.
 * A player can only request this once per game.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player requesting re-judge.
 * @param {string} reason - The reason for the re-judge request.
 * @returns {Promise<{ success: boolean; error?: string }>}
 * @throws {Error} If game not found, not in judging phase, re-judge already active, or player already used their chance.
 */
export async function requestRejudge(gameId: string, playerId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw new Error("Game not found.");
            }
            const game = gameDoc.data() as Game;

            if (game.gameState !== 'judging') {
                throw new Error("لا يمكن طلب إعادة التقييم الآن.");
            }
            if (game.prisonState?.activeRejudgeRequest) {
                throw new Error("إعادة التقييم جارية بالفعل.");
            }

            const player = game.players.find(p => p.id === playerId);
            if (!player) {
                throw new Error("Player not found.");
            }

            const usedRejudge = (game.prisonState?.rejudgeRequestsUsedBy || []).includes(playerId);
            if (usedRejudge) {
                throw new Error("لقد استخدمت فرصة إعادة التقييم الخاصة بك بالفعل.");
            }
            
            const newRequest = { playerId, name: player.name, reason };
            
            transaction.update(gameRef, {
                'prisonState.activeRejudgeRequest': newRequest,
                'prisonState.rejudgeRequestsUsedBy': arrayUnion(playerId),
                'gameState': 'rejudging', 
            });
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}


/**
 * Handles game state transitions when a timer expires.
 * Only the host should trigger this function.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @returns {Promise<void>}
 * @throws {Error} If game not found.
 */
export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error('Game not found');
            const game = gameDoc.data() as Game;

            if (game.hostId !== hostId) {
                return; // Only host should trigger this
            }
            
            if (!game.prisonState?.timerEndsAt || Date.now() < game.prisonState.timerEndsAt.toMillis()) {
                return; 
            }

            if (game.gameState === 'open_auction') {
                const activePlayers = game.players.filter((p) => p.role === 'contestant' && p.status !== 'executed' && p.status !== 'left');
                const submissions = { ...game.prisonState?.openAuctionSubmissions || {} };
                
                // Ensure all active players have a submission entry, even if it's from progress or empty.
                activePlayers.forEach((p) => {
                    if (!submissions.hasOwnProperty(p.id)) {
                        const savedAnswers = game.prisonState?.playerProgress?.[p.id]?.answers || [];
                        submissions[p.id] = savedAnswers;
                    }
                });
                
                transaction.update(gameRef, {
                    'prisonState.openAuctionSubmissions': submissions,
                    gameState: 'judging', 
                    'prisonState.judgingStarted': true, 
                    'prisonState.timerEndsAt': deleteField(), 
                });

            } else if (game.gameState === 'closed_auction_bidding') {
                const bids = game.prisonState?.bids || {};
                
                const finalBids = Object.entries(bids) as [string, number][]; 
                if (finalBids.length === 0) {
                    transaction.update(gameRef, {
                        gameState: 'results',
                        'prisonState.lastRoundResult': { message: 'انتهى المزاد بانسحاب الجميع أو عدم وجود مزايدات.' },
                        'prisonState.timerEndsAt': deleteField(),
                    });
                    return;
                }

                const sortedBids = finalBids.sort((a, b) => b[1] - a[1]);
                const winnerId = sortedBids[0][0]; 
                const answeringTime = game.prisonState?.settings?.answeringTime || 45;

                transaction.update(gameRef, {
                    gameState: 'closed_auction_answering',
                    'prisonState.auctionWinnerId': winnerId, 
                    'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000), 
                });

            } else if (game.gameState === 'closed_auction_answering') {
                const winnerId = game.prisonState?.auctionWinnerId;
                if (!winnerId) {
                    return; 
                }
                
                const savedAnswers = game.prisonState?.playerProgress?.[winnerId]?.answers || [];
                transaction.update(gameRef, {
                    'prisonState.openAuctionSubmissions': { [winnerId]: savedAnswers },
                    gameState: 'judging', 
                    'prisonState.judgingStarted': true, 
                    'prisonState.timerEndsAt': deleteField(), 
                });
            } else if (game.gameState === 'judging') {
                // The judging phase has its own timer for rejudging. If it expires, proceed.
                await proceedToResults(gameId, hostId);
            }
        });
    } catch (error) {
        console.error(`Error handling timeout for game ${gameId}:`, error);
    }
}


/**
 * Adds 20 seconds to the judging timer. Host only.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @returns {Promise<void>}
 */
export async function addTimeToJudging(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can add time.");
        }

        if (game.gameState !== 'judging') {
            throw new Error("Time can only be added during the judging phase.");
        }

        const currentTimerEnd = game.prisonState?.timerEndsAt?.toMillis() || Date.now();
        const newTimerEnd = Timestamp.fromMillis(currentTimerEnd + 20 * 1000);

        transaction.update(gameRef, {
            'prisonState.timerEndsAt': newTimerEnd,
        });
    });
}
