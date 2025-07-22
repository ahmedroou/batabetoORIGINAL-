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
            
            // This is a temporary update to the local `game` object to check for completion
            if (!game.prisonState) game.prisonState = { settings: { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 }};
            game.prisonState.openAuctionSubmissions = newSubmissions;
            
            const activeContestants = game.players.filter(p => p.role === 'contestant' && p.status === 'alive');
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

        const aiResults = await getPrisonJudgeResults({
            question: game.prisonState?.currentQuestion?.text || '',
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
        
        const contestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status === 'alive');
        contestants.forEach(p => {
            roundScores[p.id] = { points: 0, breakdown: [] };
        });

        const correctCounts = aiResults.map(res => ({
            playerId: res.playerId,
            count: res.score,
        }));
            
        let lastRoundMessage = "انتهى المزاد المفتوح بتقييم الذكاء الاصطناعي.";

        if (correctCounts.length > 0) {
            const scores = correctCounts.map(c => c.count);
            const maxScore = Math.max(...scores);
            const minScore = Math.min(...scores);
            
            const winners = correctCounts.filter(c => c.count === maxScore);
            const losers = correctCounts.filter(c => c.count === minScore);
            
            if (winners.length === 1 && scores.length > 1 && maxScore > minScore) {
                const winnerId = winners[0].playerId;
                roundScores[winnerId]!.points += 2;
                roundScores[winnerId]!.breakdown.push({ reason: 'أداء متميز', points: 2 });
                const winnerName = game.players.find(p => p.id === winnerId)?.name;
                lastRoundMessage = `${winnerName} هو الفائز في المزاد المفتوح!`;
            }
            
            if (losers.length > 0 && maxScore > minScore) {
                 losers.forEach(loser => {
                    const loserId = loser.playerId;
                    roundScores[loserId]!.points -= 1;
                    roundScores[loserId]!.breakdown.push({ reason: 'الخاسر في المزاد', points: -1 });
                });
            }
        }
       
        contestants.forEach(p => {
            if (!roundScores[p.id]?.breakdown.some(b => b.reason === 'الخاسر في المزاد') && !roundScores[p.id]?.breakdown.some(b => b.reason === 'أداء متميز')) {
                roundScores[p.id]!.points += 1;
                roundScores[p.id]!.breakdown.push({ reason: 'نجاة', points: 1 });
            }
        });
        
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

            // This is a temporary update to the local `game` object to check for completion
            if (!game.prisonState) game.prisonState = { settings: { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 }};
            game.prisonState.bids = newBids;
            game.prisonState.withdrawnBidders = newWithdrawn;

            const activeBidders = game.players.filter(p => p.status === 'alive' && !newWithdrawn.includes(p.id));
            const hasEveryoneBid = activeBidders.every(p => game.prisonState?.bids?.hasOwnProperty(p.id) || game.prisonState?.withdrawnBidders?.includes(p.id));

            if (hasEveryoneBid) {
                const finalBids = Object.entries(game.prisonState.bids).filter(([pid]) => !game.prisonState?.withdrawnBidders?.includes(pid));
                if (finalBids.length === 0) { 
                     transaction.update(gameRef, { gameState: 'results', 'prisonState.lastRoundResult': { message: "انتهى المزاد بانسحاب الجميع!" } });
                     return;
                }
                
                const sortedBids = finalBids.sort((a, b) => b[1] - a[1]);
                const winnerId = sortedBids[0][0];
                const loserId = sortedBids[sortedBids.length - 1][0];
                
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
            
            const bidAmount = game.prisonState?.bids?.[playerId] || 0;

            const aiResults = await getPrisonJudgeResults({
                question: game.prisonState?.closedAuctionQuestion?.text || '',
                submissions: [{ playerId, name: game.players.find(p=>p.id===playerId)?.name || '', answers }],
            });

            const winnerResult = aiResults.results[0];
            const isSuccess = winnerResult && winnerResult.score >= bidAmount;

            let lastRoundMessage = "";
            const roundScores: Game['prisonState']['lastRoundResult']['points'] = {};
            const newScores = { ...(game.playerScores || {}) };
            const contestants = game.players.filter(p => p.role === 'contestant' && p.status !== 'executed');

            contestants.forEach(p => { roundScores[p.id] = { points: 0, breakdown: [] }; });
            
            if (isSuccess) {
                lastRoundMessage = `نجح ${winnerResult.name} في تحقيق المزايدة!`;
                roundScores[playerId]!.points += 2;
                roundScores[playerId]!.breakdown.push({ reason: 'فوز بالمزاد', points: 2 });
            } else {
                lastRoundMessage = `فشل ${winnerResult.name} في تحقيق المزايدة وسيدخل السجن.`;
                // No points for failure, prison status will be handled in nextRound
            }

            // Survivor points for others
            contestants.forEach(p => {
                if (p.id !== playerId) {
                    roundScores[p.id]!.points += 1;
                    roundScores[p.id]!.breakdown.push({ reason: 'نجاة', points: 1 });
                }
            });

            Object.entries(roundScores).forEach(([pId, data]) => {
                if (data.points !== 0) {
                    newScores[pId] = (newScores[pId] || 0) + data.points;
                }
            });

            const lastRoundResult: Game['prisonState']['lastRoundResult'] = {
                message: lastRoundMessage,
                points: roundScores,
            };

            transaction.update(gameRef, { 
                'prisonState.openAuctionSubmissions': { [playerId]: answers },
                'prisonState.aiJudgeResults': aiResults.results,
                'prisonState.lastRoundResult': lastRoundResult,
                'playerScores': newScores,
                gameState: 'results',
                'prisonState.timerEndsAt': deleteField()
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
        const loserIds = Object.entries(lastRoundResult?.points || {})
            .filter(([, data]) => data.breakdown.some(b => b.reason === 'الخاسر في المزاد'))
            .map(([playerId]) => playerId);

        if (game.prisonState?.auctionLoserId) {
            loserIds.push(game.prisonState.auctionLoserId);
        }
        
        const winnerId = Object.entries(lastRoundResult?.points || {})
            .find(([, data]) => data.breakdown.some(b => b.reason === 'أداء متميز' || b.reason === 'فوز بالمزاد'))?.[0];

        updatedPlayers.forEach(p => {
            if (p.role === 'contestant' && p.status !== 'executed') {
                 if (!newPrisonHistory[p.id]) newPrisonHistory[p.id] = { inPrison: 0, winsWithoutBidding: 0 };
                
                if (loserIds.includes(p.id)) {
                    p.status = 'in_prison';
                } else if (p.id === winnerId) {
                    p.status = 'alive';
                } else if (p.status !== 'in_prison') {
                     p.status = 'alive';
                }

                if(p.status === 'in_prison') {
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
        
        // Determine next round type
        const playersInPrisonCount = updatedPlayers.filter(p => p.status === 'in_prison').length;
        const playersOutsidePrisonCount = updatedPlayers.filter(p => p.status === 'alive').length;

        let nextGameState: GameState;
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
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + timerDuration * 1000),
        });
    });
}
