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
        const gameDoc = await transaction.get(gameRef);
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
            gameState: 'open_auction_answering',
            round: 1,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            prisonState: {
                settings: game.prisonState?.settings,
                currentQuestion: randomQuestion,
                prisonHistory: updatedPlayers.reduce((acc, p) => ({ ...acc, [p.id]: { inPrison: 0, winsWithoutBidding: 0 } }), {}),
                openAuctionSubmissions: {},
                aiJudgeResults: {},
                timerEndsAt: Timestamp.fromMillis(Date.now() + answeringTime * 1000),
            },
        });
    });
}

async function judgeOpenAuction(gameId: string, transaction: any, gameRef: any, game: Game) {
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
    
    let updatedPlayers = [...game.players];
    const newScores = { ...(game.playerScores || {}) };
    const roundScores: Game['prisonState']['lastRoundResult']['points'] = {};
    
    const contestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
    contestants.forEach(p => {
        roundScores[p.id] = { points: 0, breakdown: [] };
    });

    const correctCounts = aiResults.results.map(res => ({
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
        
        if (winners.length === 1 && scores.length > 1) {
            const winnerId = winners[0].playerId;
            roundScores[winnerId]!.points += 2;
            roundScores[winnerId]!.breakdown.push({ reason: 'أداء متميز (بلا منازع)', points: 2 });
            const winnerName = game.players.find(p => p.id === winnerId)?.name;
            lastRoundMessage = `${winnerName} هو الفائز في المزاد المفتوح!`;
        }
        
        if (losers.length > 0 && maxScore !== minScore) {
            losers.forEach(loser => {
                const loserId = loser.playerId;
                const loserPlayerIndex = updatedPlayers.findIndex(p => p.id === loserId);
                if (loserPlayerIndex !== -1) {
                    updatedPlayers[loserPlayerIndex].status = 'in_prison';
                }
                roundScores[loserId]!.points -= 1;
                roundScores[loserId]!.breakdown.push({ reason: 'أقل إجابات', points: -1 });
            });
        }
    }
   
    updatedPlayers.forEach(p => {
        if (p.role === 'contestant' && p.status === 'alive') {
            roundScores[p.id]!.points += 1;
            roundScores[p.id]!.breakdown.push({ reason: 'بقاء خارج السجن', points: 1 });
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
        ratedBy: [],
    };
   
    transaction.update(gameRef, {
        players: updatedPlayers,
        playerScores: newScores,
        gameState: 'results',
        'prisonState.aiJudgeResults': aiResults.results,
        'prisonState.lastRoundResult': lastRoundResult,
        'prisonState.timerEndsAt': deleteField(),
    });
}

export async function submitOpenAuctionAnswers(gameId: string, playerId: string, answers: string[]): Promise<{ success: boolean; error?: string }> {
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
            
            const activeContestants = game.players.filter(p => p.role === 'contestant' && p.status === 'alive');
            const hasEveryoneSubmitted = activeContestants.every(p => newSubmissions.hasOwnProperty(p.id));

            if (hasEveryoneSubmitted) {
                transaction.update(gameRef, { gameState: 'judging', 'prisonState.timerEndsAt': deleteField() });
                await judgeOpenAuction(gameId, transaction, gameRef, { ...game, prisonState: { ...game.prisonState, openAuctionSubmissions: newSubmissions } });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting open auction answers:", error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

export async function endTimerAndProceed(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.gameState === 'open_auction_answering') {
            const activeContestants = game.players.filter(p => p.role === 'contestant' && p.status === 'alive');
            const currentSubmissions = game.prisonState?.openAuctionSubmissions || {};
            activeContestants.forEach(p => {
                if (!currentSubmissions[p.id]) {
                    currentSubmissions[p.id] = [];
                }
            });
            transaction.update(gameRef, { 
                'prisonState.openAuctionSubmissions': currentSubmissions,
                gameState: 'judging',
                'prisonState.timerEndsAt': deleteField()
            });
            await judgeOpenAuction(gameId, transaction, gameRef, { ...game, prisonState: { ...game.prisonState, openAuctionSubmissions: currentSubmissions } });
        }
    });
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
        const lastRoundResult: any = { ...(game.prisonState?.lastRoundResult || {}) };

        updatedPlayers.forEach(p => {
            if (p.role === 'contestant' && p.status !== 'executed') {
                if (!newPrisonHistory[p.id]) newPrisonHistory[p.id] = { inPrison: 0, winsWithoutBidding: 0 };
                
                if (p.status === 'in_prison') {
                    newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
                } else {
                    newPrisonHistory[p.id].inPrison = 0;
                }
            }
        });
        
        let executedPlayerName: string | undefined = undefined;
        updatedPlayers = updatedPlayers.map(p => {
            if (p.status === 'in_prison' && newPrisonHistory[p.id]?.inPrison >= 3) {
                executedPlayerName = p.name;
                return { ...p, status: 'executed' };
            }
            return p;
        });
        
        if (executedPlayerName) {
            lastRoundResult.executedPlayerName = executedPlayerName;
        } else if (lastRoundResult.hasOwnProperty('executedPlayerName')) {
            delete lastRoundResult.executedPlayerName;
        }
        
        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        const remainingContestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        if (currentRound >= totalRounds || remainingContestants.length < 2) {
            transaction.update(gameRef, { gameState: 'final_results', players: updatedPlayers });
            return;
        }

        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        let timerDuration = game.prisonState?.settings?.answeringTime || 45;
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'open_auction_answering',
            round: currentRound + 1,
            'prisonState.prisonHistory': newPrisonHistory,
            'prisonState.currentQuestion': randomQuestion,
            'prisonState.openAuctionSubmissions': {},
            'prisonState.aiJudgeResults': {},
            'prisonState.lastRoundResult': lastRoundResult,
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + timerDuration * 1000),
        });
    });
}
