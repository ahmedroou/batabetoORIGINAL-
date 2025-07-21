

/**
 * @fileoverview Actions specific to the "The Prison" game.
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
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion } from '@/types';

function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
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
        
        // Assign roles
        const shuffledPlayers = shuffle([...activePlayers]);
        const judge = shuffledPlayers[0];

        const updatedPlayers = game.players.map(p => {
            return { ...p, role: p.id === judge.id ? 'judge' : 'contestant', status: 'alive' };
        });
        
        // Get first question
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
            gameState: 'open_auction_answering', // First round is always an open auction
            round: 1,
            playerScores: game.players.filter(p => p.id !== judge.id).reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            prisonState: {
                settings: game.prisonState?.settings || { biddingTime: 30, answeringTime: 45, rounds: 10 },
                judgeId: judge.id,
                currentQuestion: randomQuestion,
                prisonLog: [],
                roundsSinceLastWin: updatedPlayers.filter(p=> p.role === 'contestant').reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
                openAuctionSubmissions: {},
                answeringEndsAt: Timestamp.fromMillis(Date.now() + answeringTime * 1000),
            },
        });
    });
}

export async function judgeRound(gameId: string, judgeId: string, results: Record<string, number>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can submit results.");
        
        let updatedPlayers = [...game.players];
        const newPrisonLog = [...(game.prisonState?.prisonLog || [])];
        const newScores = { ...(game.playerScores || {}) };
        
        let lastRoundResult: Game['prisonState']['lastRoundResult'];

        if (game.gameState === 'judging' && game.prisonState?.bidWinnerId) {
            // Closed Auction Judging
            const bidWinnerId = game.prisonState.bidWinnerId;
            const bidAmount = game.prisonState.bids[bidWinnerId];
            const correctAnswers = results[bidWinnerId];

            const winner = updatedPlayers.find(p => p.id === bidWinnerId);
            if (!winner) throw new Error("Bid winner not found.");

            if (correctAnswers >= bidAmount) {
                // Success
                newScores[bidWinnerId] = (newScores[bidWinnerId] || 0) + 2; // +2 for winning the auction
                lastRoundResult = {
                    winnerId: bidWinnerId,
                    wasSuccess: true,
                    message: `نجح ${winner.name} في المزاد وأجاب على ${correctAnswers} إجابة صحيحة!`,
                    points: { [bidWinnerId]: 2 }
                };
                if (winner.status === 'in_prison') {
                    const winnerIndex = updatedPlayers.findIndex(p => p.id === bidWinnerId);
                    updatedPlayers[winnerIndex].status = 'alive';
                    const logIndex = newPrisonLog.findIndex(l => l.playerId === bidWinnerId);
                    if(logIndex > -1) newPrisonLog.splice(logIndex, 1);
                }
            } else {
                // Failure
                lastRoundResult = {
                    loserId: bidWinnerId,
                    wasSuccess: false,
                    message: `فشل ${winner.name} في المزاد. كان المطلوب ${bidAmount} وأجاب على ${correctAnswers} فقط.`
                };
                if (winner.status === 'alive') {
                    const winnerIndex = updatedPlayers.findIndex(p => p.id === bidWinnerId);
                    updatedPlayers[winnerIndex].status = 'in_prison';
                    newPrisonLog.push({ playerId: bidWinnerId, roundsInPrison: 0 });
                }
            }
        } else if (game.gameState === 'open_auction_judging') {
            // Open Auction Judging
            const sortedResults = Object.entries(results).sort(([, a], [, b]) => a - b);
            
            if (updatedPlayers.every(p => p.status === 'in_prison')) {
                // All in prison, highest gets out
                const winnerEntry = sortedResults[sortedResults.length - 1];
                const winnerId = winnerEntry[0];
                const winnerIndex = updatedPlayers.findIndex(p => p.id === winnerId);
                updatedPlayers[winnerIndex].status = 'alive';
                const logIndex = newPrisonLog.findIndex(l => l.playerId === winnerId);
                if(logIndex > -1) newPrisonLog.splice(logIndex, 1);
                const winner = updatedPlayers[winnerIndex];
                lastRoundResult = {
                     message: `الجميع في السجن! ${winner.name} كان الأفضل وخرج من السجن.`
                };
            } else {
                // Normal open auction, lowest goes to prison
                const loserEntry = sortedResults[0];
                const loserId = loserEntry[0];
                const loserIndex = updatedPlayers.findIndex(p => p.id === loserId);
                updatedPlayers[loserIndex].status = 'in_prison';
                newPrisonLog.push({ playerId: loserId, roundsInPrison: 0 });
                const loser = updatedPlayers[loserIndex];
                lastRoundResult = {
                     message: `للأسف، ${loser.name} كان الأسوأ وسيدخل السجن.`
                };
            }
        } else {
            throw new Error("Invalid state for judging.");
        }

        // Add points for players outside prison
        updatedPlayers.forEach(p => {
            if (p.status === 'alive' && p.role === 'contestant') {
                newScores[p.id] = (newScores[p.id] || 0) + 1;
                if(lastRoundResult.points) lastRoundResult.points[p.id] = (lastRoundResult.points[p.id] || 0) + 1;
                else lastRoundResult.points = { [p.id]: 1 };
            } else if (p.status === 'in_prison' && p.role === 'contestant') {
                 newScores[p.id] = (newScores[p.id] || 0) - 1;
                 if(lastRoundResult.points) lastRoundResult.points[p.id] = (lastRoundResult.points[p.id] || 0) - 1;
                 else lastRoundResult.points = { [p.id]: -1 };
            }
        });


        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: 'results',
            'prisonState.prisonLog': newPrisonLog,
            'prisonState.lastRoundResult': lastRoundResult,
        });
    });
}


export async function nextRound(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can proceed.");

        const contestants = game.players.filter(p => p.role === 'contestant');
        const prisoners = contestants.filter(p => p.status === 'in_prison');

        let nextGameState: Game['gameState'];

        if (prisoners.length === 0 || prisoners.length === contestants.length) {
            nextGameState = 'open_auction_answering';
        } else {
            nextGameState = 'bidding';
        }
        
        // Get next question
        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        let timerEndsAt: Timestamp;
        if(nextGameState === 'open_auction_answering'){
            const answeringTime = game.prisonState?.settings?.answeringTime || 45;
            timerEndsAt = Timestamp.fromMillis(Date.now() + answeringTime * 1000);
        } else {
            const biddingTime = game.prisonState?.settings?.biddingTime || 30;
            timerEndsAt = Timestamp.fromMillis(Date.now() + biddingTime * 1000);
        }


        transaction.update(gameRef, {
            gameState: nextGameState,
            round: (game.round || 1) + 1,
            'prisonState.currentQuestion': randomQuestion,
            'prisonState.openAuctionSubmissions': {},
            'prisonState.bids': {},
            'prisonState.withdrawnBidders': [],
            'prisonState.bidWinnerId': null,
            'prisonState.answererSubmission': [],
            'prisonState.judgedAnswers': {},
            'prisonState.lastRoundResult': {},
            'prisonState.auctionEndsAt': timerEndsAt,
            'prisonState.answeringEndsAt': timerEndsAt,
        });
    });
}
