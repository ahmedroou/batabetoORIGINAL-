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
    getDoc,
    FieldValue,
    increment,
    writeBatch,
    deleteField,
    arrayUnion,
    updateDoc
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion, UserProfile, League, EmojiReactionType } from '@/types';
import { isFirebaseError } from './helpers';


// A simple shuffle function
function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function updateGameSettings(gameId: string, hostId: string, settings: Game['prisonState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'prisonState.settings': settings });
    });
}

export async function startPrisonGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 3) throw new Error("The game requires at least 3 players.");

        const activePlayers = game.players.filter(p => p.status === 'alive');
        
        const shuffledPlayers = shuffle([...activePlayers]);
        const judge = shuffledPlayers[0];

        const updatedPlayers = game.players.map(p => {
            return { ...p, role: p.id === judge.id ? 'judge' : 'contestant', status: 'alive' };
        });
        
        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            throw new Error(`لا توجد أسئلة للعبة السجن. يرجى رفع المزيد من الأسئلة من صفحة الأدمن.`);
        }
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
        const answeringTime = game.prisonState?.settings?.answeringTime || 45;

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'open_auction_answering', 
            round: 1,
            playerScores: game.players.filter(p => p.role !== 'judge').reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            prisonState: {
                settings: game.prisonState?.settings,
                judgeId: judge.id,
                currentQuestion: randomQuestion,
                prisonHistory: updatedPlayers.filter(p => p.role === 'contestant').reduce((acc, p) => ({ ...acc, [p.id]: { inPrison: 0, winsWithoutBidding: 0 } }), {}),
                openAuctionSubmissions: {},
                judgedAnswers: {},
                timerEndsAt: Timestamp.fromMillis(Date.now() + answeringTime * 1000),
            },
        });
    });
}

export async function submitOpenAuctionAnswers(gameId: string, playerId: string, answers: string[]): Promise<{success: boolean, error?: string}> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.gameState !== 'open_auction_answering') return;
            if (game.prisonState?.openAuctionSubmissions?.[playerId]) return;
            
            const finalAnswers = answers.filter(a => a.trim() !== "");
            
            const newSubmissions = { ...(game.prisonState?.openAuctionSubmissions || {}), [playerId]: finalAnswers };
            transaction.update(gameRef, {
                [`prisonState.openAuctionSubmissions`]: newSubmissions,
            });
            
            const activeContestants = game.players.filter(p => p.role === 'contestant');
            const hasEveryoneSubmitted = activeContestants.every(p => newSubmissions.hasOwnProperty(p.id));

            if (hasEveryoneSubmitted) {
                const judgingTime = game.prisonState?.settings?.judgingTime || 60;
                transaction.update(gameRef, {
                    gameState: 'judging', 
                    'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + judgingTime * 1000),
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting open auction answers:", error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

export async function judgeOpenAuction(gameId: string, judgeId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can submit results.");
        if (game.gameState !== 'judging') throw new Error("Not in judging phase.");
        
        let updatedPlayers = [...game.players];
        const newScores = { ...(game.playerScores || {}) };
        const roundScores: Game['prisonState']['lastRoundResult']['points'] = {};
        
        const contestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        contestants.forEach(p => {
            roundScores[p.id] = { points: 0, breakdown: [] };
        });

        const judgedAnswers = game.prisonState.judgedAnswers || {};
        
        const correctCounts: {playerId: string, count: number}[] = contestants
            .map(p => ({
                playerId: p.id,
                count: Object.values(judgedAnswers[p.id] || {}).filter(Boolean).length
            }));

        let lastRoundMessage = "لم يشارك أحد في المزاد المفتوح.";
        
        if (correctCounts.length > 0) {
            const scores = correctCounts.map(c => c.count);
            const maxScore = Math.max(...scores);
            const minScore = Math.min(...scores);
            
            const winners = correctCounts.filter(c => c.count === maxScore);
            const losers = correctCounts.filter(c => c.count === minScore);
            
            const isWinnerUndisputed = winners.length === 1;
            const isLoserUndisputed = losers.length === 1 && maxScore !== minScore;
            const areAllScoresEqual = maxScore === minScore && correctCounts.length > 1;

            if (areAllScoresEqual) {
                lastRoundMessage = "تعادل بين جميع اللاعبين! لا تغيير في المراكز.";
            } else {
                if (isWinnerUndisputed) {
                    const winnerId = winners[0].playerId;
                    newScores[winnerId] = (newScores[winnerId] || 0) + 2;
                    roundScores[winnerId].points += 2;
                    roundScores[winnerId].breakdown.push({ reason: 'أداء متميز (بلا منازع)', points: 2 });
                    const winnerPlayerIndex = updatedPlayers.findIndex(p => p.id === winnerId);
                    if (winnerPlayerIndex !== -1 && updatedPlayers[winnerPlayerIndex].status === 'in_prison') {
                       updatedPlayers[winnerPlayerIndex].status = 'alive';
                    }
                    const winnerName = updatedPlayers[winnerPlayerIndex].name;
                    lastRoundMessage = `${winnerName} هو الفائز في المزاد المفتوح!`;
                } else {
                    lastRoundMessage = `تعادل في الصدارة! لا يوجد فائز متميز هذه الجولة.`;
                }

                if (isLoserUndisputed) {
                    const loserId = losers[0].playerId;
                    const loserPlayerIndex = updatedPlayers.findIndex(p => p.id === loserId);
                    if (loserPlayerIndex !== -1 && updatedPlayers[loserPlayerIndex].status !== 'in_prison') {
                        updatedPlayers[loserPlayerIndex].status = 'in_prison';
                    }
                    newScores[loserId] = (newScores[loserId] || 0) - 1;
                    roundScores[loserId].points -= 1;
                    roundScores[loserId].breakdown.push({ reason: 'أقل إجابات', points: -1 });
                }

                // Survivor points
                correctCounts.forEach(({ playerId }) => {
                    const isWinner = isWinnerUndisputed && winners[0].playerId === playerId;
                    const isLoser = isLoserUndisputed && losers[0].playerId === playerId;
                    if (!isWinner && !isLoser) {
                        newScores[playerId] = (newScores[playerId] || 0) + 1;
                        roundScores[playerId].points += 1;
                        roundScores[playerId].breakdown.push({ reason: 'بقاء خارج السجن', points: 1 });
                    }
                });
            }
        }
        
        const lastRoundResult: Game['prisonState']['lastRoundResult'] = {
            message: lastRoundMessage,
            points: roundScores,
        };
       
        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: 'results',
            'prisonState.lastRoundResult': lastRoundResult,
            'prisonState.timerEndsAt': deleteField(),
        });
    });
}

export async function submitBid(gameId: string, playerId: string, bidAmount: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'bidding' && game.gameState !== 'bidding_tiebreaker') {
            throw new Error("ليس وقت المزايدة الآن.");
        }

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.role === 'judge') throw new Error("لا يمكنك المشاركة في المزاد.");
        if (player.status === 'executed') throw new Error("لا يمكنك المشاركة في المزاد.");
        if(game.gameState === 'bidding_tiebreaker' && !game.prisonState?.tieBreakerContestants?.includes(playerId)) {
            throw new Error("أنت لست مشاركًا في جولة كسر التعادل.");
        }
        
        const currentBids = game.prisonState?.bids || {};
        const highestOtherBid = Object.entries(currentBids)
            .filter(([id]) => id !== playerId)
            .reduce((max, [, bid]) => Math.max(max, bid), 0);
        
        if (bidAmount <= highestOtherBid) {
            throw new Error(`يجب أن تكون مزايدتك أعلى من ${highestOtherBid}`);
        }

        transaction.update(gameRef, { [`prisonState.bids.${playerId}`]: bidAmount });
    });
}

export async function judgeAnswerLive(gameId: string, judgeId: string, wasSuccess: boolean) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
       
        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can submit results.");
        if (game.gameState !== 'answering') throw new Error("Not in answering phase.");
       
        const winnerId = game.prisonState!.bidWinnerId!;
        const winner = game.players.find(p => p.id === winnerId)!;
       
        let updatedPlayers = [...game.players];
        const newScores = { ...(game.playerScores || {}) };

        const roundScores: Game['prisonState']['lastRoundResult']['points'] = {};
        updatedPlayers.filter(p => p.role === 'contestant').forEach(p => {
            roundScores[p.id] = { points: 0, breakdown: [] };
        });

        if(wasSuccess) {
            newScores[winnerId] = (newScores[winnerId] || 0) + 2;
            roundScores[winnerId].points += 2;
            roundScores[winnerId].breakdown.push({ reason: 'فوز بالمزاد', points: 2 });
            
            if (winner.status === 'in_prison') {
                updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? { ...p, status: 'alive' } : p);
            }
        } else {
            if (winner.status === 'alive') {
                updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? { ...p, status: 'in_prison' } : p);
            }
        }

        updatedPlayers.forEach(p => {
            if (p.role === 'contestant' && p.status === 'alive' && p.id !== winnerId) {
                newScores[p.id] = (newScores[p.id] || 0) + 1;
                roundScores[p.id].points += 1;
                roundScores[p.id].breakdown.push({ reason: 'بقاء خارج السجن', points: 1 });
            }
        });
       
        const lastRoundResult: Game['prisonState']['lastRoundResult'] = {
            message: wasSuccess ? `${winner.name} نجح في المزاد!` : `${winner.name} فشل في المزاد!`,
            wasSuccess,
            winnerId: wasSuccess ? winnerId : null,
            loserId: !wasSuccess ? winnerId : undefined,
            points: roundScores,
        };
       
        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: 'results',
            'prisonState.lastRoundResult': lastRoundResult,
            'prisonState.timerEndsAt': deleteField(),
        });
    });
}

// Removed executePlayer function as execution is now automatic in nextRound

// Functions that can be called by a timer or automatically
export async function endTimerAndProceed(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.gameState === 'open_auction_answering') {
            const activeContestants = game.players.filter(p => p.role === 'contestant');
            const currentSubmissions = game.prisonState?.openAuctionSubmissions || {};
            activeContestants.forEach(p => {
                if (!currentSubmissions[p.id]) {
                    currentSubmissions[p.id] = []; // Submit empty array on timeout
                }
            });
            const judgingTime = game.prisonState?.settings?.judgingTime || 60;
            transaction.update(gameRef, { 
                'prisonState.openAuctionSubmissions': currentSubmissions,
                gameState: 'judging', 
                'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + judgingTime * 1000)
            });
        }
        else if (game.gameState === 'judging') {
            await judgeOpenAuction(gameId, game.prisonState!.judgeId!);
        }
        else if (game.gameState === 'bidding' || game.gameState === 'bidding_tiebreaker') {
            const bids = game.prisonState?.bids || {};
            let bidders: string[];
            if (game.gameState === 'bidding_tiebreaker') {
                bidders = game.prisonState?.tieBreakerContestants || [];
            } else {
                bidders = game.players.filter(p => p.role === 'contestant').map(p => p.id);
            }
            const validBids = Object.entries(bids).filter(([id]) => bidders.includes(id));
            
            if (validBids.length === 0) {
                // If no valid bids, transition to results (or next round directly if no points change needed)
                transaction.update(gameRef, { 
                    gameState: 'results', 
                    'prisonState.lastRoundResult': { message: "لا أحد زايد. تستمر الجولة." } 
                });
                return;
            }

            const highestBid = Math.max(0, ...validBids.map(([, bid]) => bid));
            const highestBidders = validBids.filter(([, bid]) => bid === highestBid).map(([id]) => id);
            
            if (highestBidders.length > 1) {
                const tieBreakerBiddingTime = game.prisonState?.settings?.biddingTime || 30;
                transaction.update(gameRef, {
                    gameState: 'bidding_tiebreaker',
                    'prisonState.bids': {}, // Reset bids for tiebreaker
                    'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + tieBreakerBiddingTime * 1000),
                    'prisonState.tieBreakerContestants': highestBidders,
                });
            } else {
                const winnerId = highestBidders[0];
                const answeringTime = game.prisonState?.settings?.answeringTime || 45;
                transaction.update(gameRef, {
                    gameState: 'answering',
                    'prisonState.bidWinnerId': winnerId,
                    'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000),
                    'prisonState.tieBreakerContestants': deleteField(), // Clear tiebreaker contestants
                });
            }
        }
        else if (game.gameState === 'answering') {
            // If timer ends during answering, it means the bid winner failed to answer in time.
            // The judgeAnswerLive function is responsible for setting the result.
            // This just ensures the timer is cleared.
            transaction.update(gameRef, { 'prisonState.timerEndsAt': deleteField() });
        }
    });
}

export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;
        
        if (game.gameState !== 'results') return; // Ensure we are in results phase

        let updatedPlayers = [...game.players];
        const newPrisonHistory = JSON.parse(JSON.stringify(game.prisonState?.prisonHistory || {}));
        const lastRoundResult: any = { ...(game.prisonState?.lastRoundResult || {}) };

        // Determine if the previous round was an Open Auction based on message or winner type
        const wasPreviousRoundOpenAuction = lastRoundResult.message?.includes("المزاد المفتوح");
        // Determine if the previous round was a successful Closed Auction for a specific player
        const wasPreviousRoundClosedAuctionSuccess = lastRoundResult.wasSuccess === true && lastRoundResult.winnerId;

        updatedPlayers.forEach(p => {
            if (p.role === 'contestant' && p.status !== 'executed') { // Only process active contestants
                if (!newPrisonHistory[p.id]) newPrisonHistory[p.id] = { inPrison: 0, winsWithoutBidding: 0 };

                if (p.status === 'in_prison') {
                    // If player was in prison, increment inPrison counter and reset winsWithoutBidding
                    newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
                    newPrisonHistory[p.id].winsWithoutBidding = 0;
                } else if (p.status === 'alive') {
                    // If player was alive, reset inPrison counter
                    newPrisonHistory[p.id].inPrison = 0;

                    // Logic for winsWithoutBidding:
                    // Reset if previous was Open Auction, or this player won the Closed Auction.
                    // Increment if previous was Closed Auction and this player did NOT win.
                    if (wasPreviousRoundOpenAuction || (wasPreviousRoundClosedAuctionSuccess && lastRoundResult.winnerId === p.id)) {
                        newPrisonHistory[p.id].winsWithoutBidding = 0;
                    } else {
                        newPrisonHistory[p.id].winsWithoutBidding = (newPrisonHistory[p.id].winsWithoutBidding || 0) + 1;
                    }
                }
            } else {
                // For executed players or judge, reset history if it exists
                if (newPrisonHistory[p.id]) {
                    newPrisonHistory[p.id].inPrison = 0;
                    newPrisonHistory[p.id].winsWithoutBidding = 0;
                }
            }
        });
        
        // Automatic Execution for players in prison for 3+ consecutive rounds
        updatedPlayers = updatedPlayers.map(p => {
            if (p.status === 'in_prison' && newPrisonHistory[p.id]?.inPrison >= 3) {
                lastRoundResult.executedPlayerName = p.name; // Record who was executed for display
                return { ...p, status: 'executed' }; // Change player status to executed
            }
            return p;
        });
        
        // Automatic Imprisonment for players who didn't win a closed auction for 3+ consecutive rounds
        let newlyImprisonedForNotBidding = false;
        updatedPlayers = updatedPlayers.map(p => {
            if (p.role === 'contestant' && p.status === 'alive' && newPrisonHistory[p.id]?.winsWithoutBidding >= 3) {
                newlyImprisonedForNotBidding = true; // Flag to potentially force Open Auction next
                return { ...p, status: 'in_prison' }; // Send player to prison
            }
            return p;
        });
        
        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        // Check for game end conditions
        const remainingContestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        if (currentRound >= totalRounds || remainingContestants.length < 2) {
            transaction.update(gameRef, { gameState: 'final_results', players: updatedPlayers });
            return;
        }

        // Determine next game state (Open Auction or Closed Auction)
        const prisoners = remainingContestants.filter(p => p.status === 'in_prison');
        let nextGameState: Game['gameState'] = 'bidding'; // Default to Closed Auction

        // Conditions for Open Auction
        if (prisoners.length === 0 || prisoners.length === remainingContestants.length || newlyImprisonedForNotBidding) {
            nextGameState = 'open_auction_answering';
        }
        
        // Fetch a new random question
        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        // Determine timer duration for the next state
        let timerDuration = nextGameState === 'open_auction_answering' ? game.prisonState?.settings?.answeringTime || 45 : game.prisonState?.settings?.biddingTime || 30;
        
        // Update game state for the next round
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: nextGameState,
            round: currentRound + 1,
            'prisonState.prisonHistory': newPrisonHistory,
            'prisonState.currentQuestion': randomQuestion,
            'prisonState.openAuctionSubmissions': {}, // Reset submissions for new round
            'prisonState.bids': {}, // Reset bids for new round
            'prisonState.judgedAnswers': {}, // Reset judged answers for new round
            'prisonState.bidWinnerId': null, // Reset bid winner
            'prisonState.tieBreakerContestants': deleteField(), // Clear tiebreaker contestants
            'prisonState.lastRoundResult': lastRoundResult, // Keep last round result for display
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + timerDuration * 1000),
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


export async function rateJudge(gameId: string, playerId: string, rating: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'final_results') throw new Error("Rating is only available at the end of the game.");
        
        const judgeId = game.prisonState?.judgeId;
        if (!judgeId) throw new Error("Judge not found.");
        
        if (game.prisonState?.lastRoundResult?.ratedBy?.includes(playerId)) {
            throw new Error("You have already rated the judge.");
        }

        const judgeRef = doc(db, 'users', judgeId);
        const judgeDoc = await transaction.get(judgeRef);
        if (!judgeDoc.exists()) throw new Error("Judge's profile not found.");

        const judgeData = judgeDoc.data() as UserProfile;
        const newTotalRating = (judgeData.judgeStats?.totalRating || 0) + rating;
        const newRatingCount = (judgeData.judgeStats?.ratingCount || 0) + 1;

        transaction.update(judgeRef, {
            'judgeStats.totalRating': newTotalRating,
            'judgeStats.ratingCount': newRatingCount,
        });

        transaction.update(gameRef, {
            'prisonState.lastRoundResult.ratedBy': arrayUnion(playerId)
        });
    });
    return { success: true };
}
