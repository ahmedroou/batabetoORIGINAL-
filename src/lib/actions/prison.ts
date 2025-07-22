

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
import type { Game, Player, PrisonQuestion, UserProfile, EmojiReactionType } from '@/types';
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
            const gameDoc = await getDoc(gameRef);
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
        const game = gameDoc.data() as Game;
        
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
        const submissions = game.prisonState.openAuctionSubmissions || {};
        
        const correctCounts: {playerId: string, count: number}[] = contestants
            .filter(p => submissions?.[p.id] !== undefined)
            .map(p => ({
                playerId: p.id,
                count: Object.values(judgedAnswers[p.id] || {}).filter(Boolean).length
            }));

        let lastRoundMessage = "لم يشارك أحد في المزاد المفتوح.";

        if (correctCounts.length > 0) {
            const maxScore = Math.max(-1, ...correctCounts.map(c => c.count));
            const minScore = Math.min(Infinity, ...correctCounts.map(c => c.count));
            
            const winners = correctCounts.filter(c => c.count === maxScore);
            const losers = correctCounts.filter(c => c.count === minScore);
            
            const isWinnerUndisputed = winners.length === 1 && correctCounts.length > 1;
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
                    const winnerName = updatedPlayers.find(p => p.id === winnerId)?.name;
                    lastRoundMessage = `${winnerName} هو الفائز في المزاد المفتوح!`;
                 } else { // This is the case for a tie for first place
                     lastRoundMessage = `تعادل في الصدارة! لا يوجد فائز متميز هذه الجولة.`;
                 }

                 if (isLoserUndisputed) {
                    const loserId = losers[0].playerId;
                    const playerIndex = updatedPlayers.findIndex(p => p.id === loserId);
                    if (playerIndex !== -1 && updatedPlayers[playerIndex].status !== 'in_prison') {
                        updatedPlayers[playerIndex].status = 'in_prison';
                    }
                    newScores[loserId] = (newScores[loserId] || 0) - 1;
                    roundScores[loserId].points -= 1;
                    roundScores[loserId].breakdown.push({ reason: 'أقل إجابات', points: -1 });
                }
            }
            
            // Handle survivor points
            contestants.forEach(p => {
                 const isWinner = isWinnerUndisputed && winners[0].playerId === p.id;
                 const isLoser = isLoserUndisputed && losers[0].playerId === p.id;
                 if (!isWinner && !isLoser && !areAllScoresEqual) { 
                    newScores[p.id] = (newScores[p.id] || 0) + 1;
                    roundScores[p.id].points += 1;
                    roundScores[p.id].breakdown.push({ reason: 'بقاء خارج السجن', points: 1 });
                }
            });
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

export async function judgeLiveAnswer(gameId: string, judgeId: string, wasSuccess: boolean) {
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

export async function executePlayer(gameId: string, judgeId: string, playerIdToExecute: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can execute players.");
        
        const playerIndex = game.players.findIndex(p => p.id === playerIdToExecute);
        if (playerIndex === -1) throw new Error("Player to execute not found.");

        const history = game.prisonState?.prisonHistory?.[playerIdToExecute];
        if (!history || history.inPrison < 3) {
            throw new Error("This player cannot be executed yet.");
        }

        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].status = 'executed';

        const newPrisonHistory = { ...(game.prisonState?.prisonHistory || {}) };
        if (newPrisonHistory[playerIdToExecute]) {
            newPrisonHistory[playerIdToExecute].inPrison = 0;
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            'prisonState.prisonHistory': newPrisonHistory
        });
    });
}

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
                 transaction.update(gameRef, { gameState: 'results', 'prisonState.lastRoundResult': { message: "لا أحد زايد. تستمر الجولة." } });
                 return;
            }

            const highestBid = Math.max(0, ...validBids.map(([, bid]) => bid));
            const highestBidders = validBids.filter(([, bid]) => bid === highestBid).map(([id]) => id);
            
            if (highestBidders.length > 1) {
                const tieBreakerBiddingTime = game.prisonState?.settings?.biddingTime || 30;
                transaction.update(gameRef, {
                    gameState: 'bidding_tiebreaker',
                    'prisonState.bids': {},
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
                    'prisonState.tieBreakerContestants': deleteField(),
                });
            }
        }
        else if (game.gameState === 'answering') {
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
        
        if (game.gameState !== 'results') return;

        let updatedPlayers = [...game.players];
        const newPrisonHistory = JSON.parse(JSON.stringify(game.prisonState?.prisonHistory || {}));
        const lastRoundResult: any = { ...(game.prisonState?.lastRoundResult || {}) };

        updatedPlayers.forEach(p => {
             if (p.role === 'contestant') {
                if (!newPrisonHistory[p.id]) newPrisonHistory[p.id] = { inPrison: 0, winsWithoutBidding: 0 };
                
                if (p.status === 'in_prison') {
                    newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
                    newPrisonHistory[p.id].winsWithoutBidding = 0;
                } else if (p.status === 'alive') {
                    newPrisonHistory[p.id].inPrison = 0;
                     if(game.gameState !== 'open_auction_answering' && game.prisonState?.bidWinnerId !== p.id) {
                         newPrisonHistory[p.id].winsWithoutBidding = (newPrisonHistory[p.id].winsWithoutBidding || 0) + 1;
                     }
                }
             }
        });
        
        updatedPlayers = updatedPlayers.map(p => {
            if (p.status === 'in_prison' && newPrisonHistory[p.id]?.inPrison >= 3) {
                 lastRoundResult.executedPlayerName = p.name;
                 return { ...p, status: 'executed' };
            }
            return p;
        });
        
        let newlyImprisonedForNotBidding = false;
        updatedPlayers = updatedPlayers.map(p => {
             if (p.role === 'contestant' && p.status === 'alive' && newPrisonHistory[p.id]?.winsWithoutBidding >= 3) {
                 newlyImprisonedForNotBidding = true;
                 return { ...p, status: 'in_prison' };
             }
            return p;
        });
        
        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        if (currentRound >= totalRounds || updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed').length < 2) {
            transaction.update(gameRef, { gameState: 'final_results', players: updatedPlayers });
            return;
        }

        const contestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        const prisoners = contestants.filter(p => p.status === 'in_prison');
        let nextGameState: Game['gameState'] = 'bidding';

        if (prisoners.length === 0 || prisoners.length === contestants.length || newlyImprisonedForNotBidding) {
            nextGameState = 'open_auction_answering';
        }
        
        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        let timerDuration = nextGameState === 'open_auction_answering' ? game.prisonState?.settings?.answeringTime || 45 : game.prisonState?.settings?.biddingTime || 30;
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: nextGameState,
            round: currentRound + 1,
            'prisonState.prisonHistory': newPrisonHistory,
            'prisonState.currentQuestion': randomQuestion,
            'prisonState.openAuctionSubmissions': {},
            'prisonState.bids': {},
            'prisonState.judgedAnswers': {},
            'prisonState.bidWinnerId': null,
            'prisonState.tieBreakerContestants': deleteField(),
            'prisonState.lastRoundResult': lastRoundResult,
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + timerDuration * 1000),
        });
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
