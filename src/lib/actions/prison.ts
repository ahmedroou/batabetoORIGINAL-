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
    deleteField
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion } from '@/types';
import { getPrisonJudgeResults } from '@/app/actions';


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
        const gameDoc = await transaction.get( gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const updatedPlayers = game.players.map(p => ({ ...p, role: 'contestant', status: 'alive' }));
        
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
            gameState: 'open_auction',
            round: 1,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            prisonState: {
                settings: game.prisonState?.settings,
                currentQuestion: randomQuestion,
                prisonHistory: updatedPlayers.reduce((acc, p) => ({ ...acc, [p.id]: { inPrison: 0, winsWithoutBidding: 0 } }), {}),
                openAuctionSubmissions: {},
                aiJudgeResults: [],
                timerEndsAt: Timestamp.fromMillis(Date.now() + answeringTime * 1000),
            },
        });
    });
}

export async function submitOpenAuctionAnswers(gameId: string, playerId: string, answers: string[]): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.gameState !== 'open_auction') return;
            if (game.prisonState?.openAuctionSubmissions?.[playerId]) return;
            
            const finalAnswers = answers.filter(a => a.trim() !== "");
            
            const newSubmissions = { ...(game.prisonState?.openAuctionSubmissions || {}), [playerId]: finalAnswers };
            
            transaction.update(gameRef, {
                [`prisonState.openAuctionSubmissions`]: newSubmissions,
            });
            
            if (!game.prisonState) game.prisonState = { settings: { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 }};
            game.prisonState.openAuctionSubmissions = newSubmissions;
            
            const activeContestants = game.players.filter(p => p.role === 'contestant' && p.status !== 'executed');
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

export async function judgeAnswersAndProceed(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can trigger judging.");
        if (game.gameState !== 'judging') return;
        if ((game.prisonState?.aiJudgeResults?.length || 0) > 0) return;

        const submissions = game.prisonState?.openAuctionSubmissions || {};
        const playerSubmissions = Object.entries(submissions).map(([playerId, answers]) => {
            const player = game.players.find(p => p.id === playerId);
            return {
                playerId: playerId,
                name: player?.name || 'Unknown',
                answers: answers || [],
            };
        });
        
        const questionText = game.prisonState?.currentQuestion?.text || game.prisonState?.closedAuctionQuestion?.text || '';

        const aiResults = await getPrisonJudgeResults({
            question: questionText,
            submissions: playerSubmissions,
        });

        transaction.update(gameRef, {
            'prisonState.aiJudgeResults': aiResults.results,
        });
    });
}

export async function proceedToResults(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can proceed.");
        if (game.gameState !== 'judging' || (game.prisonState?.aiJudgeResults || []).length === 0) return;
        
        const aiResults = game.prisonState!.aiJudgeResults!;
        let updatedPlayers = [...game.players];
        const newScores = { ...(game.playerScores || {}) };
        const roundScores: Game['prisonState']['lastRoundResult']['points'] = {};
        
        const contestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        contestants.forEach(p => {
            roundScores[p.id] = { points: 0, breakdown: [] };
        });

        let lastRoundMessage = "انتهى المزاد!";
        let lastRoundWinnerId: string | null = null;
        
        // Handle logic for both open and closed auctions
        if(game.prisonState.auctionWinnerId) { // Closed Auction
            const winnerResult = aiResults.find(r => r.playerId === game.prisonState!.auctionWinnerId);
            const winnerName = winnerResult?.name || 'الفائز';
            const bidAmount = game.prisonState?.bids?.[game.prisonState.auctionWinnerId] || 0;
            const isSuccess = winnerResult && winnerResult.score >= bidAmount;
            
            if (isSuccess) {
                lastRoundMessage = `نجح ${winnerName} في تحقيق المزايدة!`;
                roundScores[game.prisonState.auctionWinnerId]!.points += 2;
                roundScores[game.prisonState.auctionWinnerId]!.breakdown.push({ reason: 'فوز بالمزاد', points: 2 });
                lastRoundWinnerId = game.prisonState.auctionWinnerId;
            } else {
                lastRoundMessage = `فشل ${winnerName} في تحقيق المزايدة وسيدخل السجن.`;
            }
             // Survivor points for others
            contestants.forEach(p => {
                if (p.id !== game.prisonState?.auctionWinnerId) {
                    roundScores[p.id]!.points += 1;
                    roundScores[p.id]!.breakdown.push({ reason: 'نجاة', points: 1 });
                }
            });

        } else { // Open Auction
            const correctCounts = aiResults.map(res => ({
                playerId: res.playerId,
                count: res.score,
            }));
            
            if (correctCounts.length > 0) {
                const scores = correctCounts.map(c => c.count);
                const maxScore = Math.max(...scores);
                const minScore = Math.min(...scores);
                
                const winners = correctCounts.filter(c => c.count === maxScore);
                const losers = correctCounts.filter(c => c.count === minScore);
                
                // Undisputed winner logic
                if (winners.length === 1 && (scores.length === 1 || maxScore > minScore)) {
                    const winnerId = winners[0].playerId;
                    roundScores[winnerId]!.points += 2;
                    roundScores[winnerId]!.breakdown.push({ reason: 'أداء متميز', points: 2 });
                    
                    const winnerPlayer = game.players.find(p => p.id === winnerId);
                    if (winnerPlayer?.status !== 'in_prison') {
                        roundScores[winnerId]!.points += 1;
                        roundScores[winnerId]!.breakdown.push({ reason: 'مكافأة الحرية', points: 1 });
                    }

                    lastRoundWinnerId = winnerId;
                    const winnerName = winnerPlayer?.name;
                    lastRoundMessage = `${winnerName} هو الفائز في المزاد المفتوح!`;
                }
                
                // Undisputed loser logic
                if (losers.length === 1 && scores.length > 1 && maxScore > minScore) {
                     const loserId = losers[0].playerId;
                     roundScores[loserId]!.points -= 1;
                     roundScores[loserId]!.breakdown.push({ reason: 'الخاسر في المزاد', points: -1 });
                }

                // Survivor points
                contestants.forEach(p => {
                    const isWinner = winners.length === 1 && winners[0].playerId === p.id && maxScore > minScore;
                    const isLoser = losers.length === 1 && losers[0].playerId === p.id && maxScore > minScore;
                    if (!isWinner && !isLoser) {
                        roundScores[p.id]!.points += 1;
                        roundScores[p.id]!.breakdown.push({ reason: 'نجاة', points: 1 });
                    }
                });
            }
        }
       
        Object.entries(roundScores).forEach(([playerId, data]) => {
            if (data.points !== 0) {
                newScores[playerId] = (newScores[playerId] || 0) + data.points;
            }
        });

        const lastRoundResult: Game['prisonState']['lastRoundResult'] = {
            message: lastRoundMessage,
            points: roundScores,
        };
       
        transaction.update(gameRef, {
            playerScores: newScores,
            gameState: 'results',
            'prisonState.lastRoundResult': lastRoundResult,
            'prisonState.lastRoundWinnerId': lastRoundWinnerId,
            'prisonState.timerEndsAt': deleteField(),
        });
     });
}

export async function submitBid(gameId: string, playerId: string, amount: number, withdraw: boolean = false): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.gameState !== 'closed_auction_bidding') return;
            if (game.prisonState?.withdrawnBidders?.includes(playerId)) throw new Error("لقد انسحبت بالفعل من المزاد.");
            
            const newBids = { ...(game.prisonState?.bids || {}), [playerId]: amount };
            const newWithdrawn = [...(game.prisonState?.withdrawnBidders || [])];
            if (withdraw) {
                newWithdrawn.push(playerId);
            }

            transaction.update(gameRef, {
                'prisonState.bids': newBids,
                'prisonState.withdrawnBidders': newWithdrawn,
            });

            if (!game.prisonState) game.prisonState = { settings: { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 }};
            game.prisonState.bids = newBids;
            game.prisonState.withdrawnBidders = newWithdrawn;

            const activeBidders = game.players.filter(p => p.status !== 'executed' && p.role === 'contestant');
            const hasEveryoneBid = activeBidders.every(p => game.prisonState?.bids?.hasOwnProperty(p.id) || game.prisonState?.withdrawnBidders?.includes(p.id));

            if (hasEveryoneBid) {
                const finalBids = Object.entries(game.prisonState.bids).filter(([pid]) => !game.prisonState?.withdrawnBidders?.includes(pid));
                if (finalBids.length === 0) { 
                     transaction.update(gameRef, { gameState: 'results', 'prisonState.lastRoundResult': { message: "انتهى المزاد بانسحاب الجميع!" } });
                     return;
                }
                
                const sortedBids = finalBids.sort((a, b) => b[1] - a[1]);
                const winnerId = sortedBids[0][0];
                const loserId = sortedBids.length > 1 ? sortedBids[sortedBids.length - 1][0] : null;
                
                const answeringTime = game.prisonState?.settings?.answeringTime || 45;

                transaction.update(gameRef, {
                    gameState: 'closed_auction_answering',
                    'prisonState.auctionWinnerId': winnerId,
                    'prisonState.auctionLoserId': loserId,
                    'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000),
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting bid:", error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

export async function submitClosedAuctionAnswer(gameId: string, playerId: string, answers: string[]): Promise<{ success: boolean; error?: string }> {
     const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            if (game.gameState !== 'closed_auction_answering') return;
            if (game.prisonState?.auctionWinnerId !== playerId) throw new Error("لست الفائز بالمزاد.");
            
            // This is now a two-step process. First, submit answers and move to judging.
            const judgingTime = game.prisonState?.settings?.judgingTime || 60;
            transaction.update(gameRef, { 
                'prisonState.openAuctionSubmissions': { [playerId]: answers }, // Reuse this field for judging
                gameState: 'judging',
                'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + judgingTime * 1000),
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting closed auction answer:", error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}


export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;
        
        if (game.gameState !== 'results') return;

        let updatedPlayers = [...game.players];
        const newPrisonHistory = JSON.parse(JSON.stringify(game.prisonState?.prisonHistory || {}));
        const lastRoundResult = game.prisonState?.lastRoundResult;
        
        // Update prison status based on last round result
        const openAuctionLoserId = Object.entries(lastRoundResult?.points || {})
            .find(([, data]) => data.breakdown.some(b => b.reason === 'الخاسر في المزاد'))?.[0];
            
        const closedAuctionLoserId = game.prisonState.auctionWinnerId && game.prisonState.lastRoundResult?.points?.[game.prisonState.auctionWinnerId]?.points < 2 ? game.prisonState.auctionWinnerId : null;
        
        const openAuctionWinnerId = game.prisonState.lastRoundWinnerId;

        updatedPlayers.forEach(p => {
            if (p.role === 'contestant' && p.status !== 'executed') {
                 if (!newPrisonHistory[p.id]) newPrisonHistory[p.id] = { inPrison: 0, winsWithoutBidding: 0 };
                
                let entersPrison = false;
                if(openAuctionLoserId === p.id) entersPrison = true;
                if(closedAuctionLoserId === p.id) entersPrison = true;

                let isFreed = false;
                if(openAuctionWinnerId === p.id && p.status === 'in_prison') isFreed = true;
                if(game.prisonState?.auctionWinnerId === p.id && !closedAuctionLoserId && p.status === 'in_prison') isFreed = true;


                if (entersPrison) {
                    p.status = 'in_prison';
                    newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
                } else if (isFreed) {
                     p.status = 'alive';
                     newPrisonHistory[p.id].inPrison = 0;
                } else if(p.status === 'in_prison') {
                     newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
                } else {
                    newPrisonHistory[p.id].inPrison = 0;
                }
            }
        });
        
        // Handle execution
        updatedPlayers = updatedPlayers.map(p => {
            if (p.status !== 'executed' && newPrisonHistory[p.id]?.inPrison >= 3) {
                return { ...p, status: 'executed' };
            }
            return p;
        });
        
        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        const remainingContestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        if (currentRound >= totalRounds || remainingContestants.length < 2) {
            transaction.update(gameRef, { gameState: 'final_results', players: updatedPlayers });
            return;
        }
        
        const playersInPrisonCount = updatedPlayers.filter(p => p.status === 'in_prison').length;
        const playersOutsidePrisonCount = updatedPlayers.filter(p => p.status === 'alive').length;

        let nextGameState: 'open_auction' | 'closed_auction_bidding' = 'open_auction';
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
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: nextGameState,
            round: currentRound + 1,
            'prisonState.prisonHistory': newPrisonHistory,
            'prisonState.currentQuestion': nextGameState === 'open_auction' ? randomQuestion : deleteField(),
            'prisonState.closedAuctionQuestion': nextGameState === 'closed_auction_bidding' ? randomQuestion : deleteField(),
            'prisonState.openAuctionSubmissions': {},
            'prisonState.aiJudgeResults': [],
            'prisonState.bids': {},
            'prisonState.withdrawnBidders': [],
            'prisonState.auctionWinnerId': deleteField(),
            'prisonState.auctionLoserId': deleteField(),
            'prisonState.lastRoundWinnerId': deleteField(),
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + timerDuration * 1000),
        });
    });
}
