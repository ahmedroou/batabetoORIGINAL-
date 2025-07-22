

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
  getDoc,
  FieldValue,
  increment,
  writeBatch,
  setDoc,
  deleteField,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion, UserProfile, League, EmojiReactionType } from '@/types';
import { isFirebaseError } from './helpers';
import { generateGameId } from '@/lib/actions/helpers';


// A safer, internal string comparison function.
function safeCompareStrings(a: string, b: string): number {
    try {
        if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
            return 0;
        }
        const aLower = a.trim().toLowerCase();
        const bLower = b.trim().toLowerCase();

        if (aLower === bLower) return 1.0;

        const pairs = (str: string) => {
            const s = new Set<string>();
            if (!str) return s;
            for (let i = 0; i < str.length - 1; i++) {
                s.add(str.substring(i, i + 2));
            }
            return s;
        };

        const s1 = pairs(aLower);
        const s2 = pairs(bLower);

        if (s1.size === 0 && s2.size === 0) return 1.0;
        if (s1.size === 0 || s2.size === 0) return 0;

        const intersection = new Set([...s1].filter(x => s2.has(x)));
        
        return (2.0 * intersection.size) / (s1.size + s2.size);

    } catch (e) {
        // This catch block makes the function extremely safe against unexpected inputs.
        console.error("Error in safeCompareStrings:", e, {a, b});
        return 0;
    }
}


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
        const gameDoc = await getDoc(gameRef);
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
            playerScores: game.players.filter(p => p.role !== 'judge').reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            prisonState: {
                settings: game.prisonState?.settings || { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 },
                judgeId: judge.id,
                currentQuestion: randomQuestion,
                prisonLog: [],
                prisonHistory: updatedPlayers.filter(p => p.role === 'contestant').reduce((acc, p) => ({ ...acc, [p.id]: { inPrison: 0, winsWithoutBidding: 0 } }), {}),
                openAuctionSubmissions: {},
                judgedAnswers: {},
                timerEndsAt: Timestamp.fromMillis(Date.now() + answeringTime * 1000),
            },
        });
    });
}

export async function submitOpenAuctionAnswers(gameId: string, playerId: string, answers: string[]) {
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
            
            game.prisonState.openAuctionSubmissions = newSubmissions;
            
            const activeContestants = game.players.filter(p => p.role === 'contestant' && p.status !== 'in_prison' && p.status !== 'executed');
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
    } catch (error) {
        console.error("Error in submitOpenAuctionAnswers:", error);
        return { success: false, error: (error as Error).message };
    }
}

export async function judgeAnswerLive(gameId: string, judgeId: string, playerId: string, answerIndex: number, isCorrect: boolean) {
     const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        if(game.prisonState?.judgeId !== judgeId) return;

        const currentJudged = game.prisonState?.judgedAnswers || {};
        const playerJudged = currentJudged[playerId] || {};
        const newPlayerJudged = {...playerJudged, [answerIndex]: isCorrect};

        transaction.update(gameRef, {
            [`prisonState.judgedAnswers.${playerId}`]: newPlayerJudged
        });
     });
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
        const roundScores: Game['prisonState']['lastRoundResult']['scores'] = {};
        
        const contestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        contestants.forEach(p => {
             roundScores[p.id] = { points: 0, breakdown: [] };
        });

        const judgedAnswers = game.prisonState.judgedAnswers || {};
        
        const correctCounts: {playerId: string, count: number}[] = contestants
            .filter(p => game.prisonState?.openAuctionSubmissions?.[p.id] !== undefined)
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

            winners.forEach(winner => {
                const player = updatedPlayers.find(p => p.id === winner.playerId)!;
                if (player.status === 'in_prison') {
                    const playerIndex = updatedPlayers.findIndex(p => p.id === winner.playerId);
                    updatedPlayers[playerIndex].status = 'alive';
                }
                newScores[winner.playerId] = (newScores[winner.playerId] || 0) + 2;
                roundScores[winner.playerId].points += 2;
                roundScores[winner.playerId].breakdown.push({ reason: 'أداء متميز', points: 2 });
            });

            if (maxScore !== minScore && losers.length < correctCounts.length) {
                losers.forEach(loser => {
                    const player = updatedPlayers.find(p => p.id === loser.playerId)!;
                    if (player.status !== 'in_prison') {
                        const playerIndex = updatedPlayers.findIndex(p => p.id === loser.playerId);
                        updatedPlayers[playerIndex].status = 'in_prison';
                        newScores[loser.playerId] = (newScores[loser.playerId] || 0) - 1;
                        roundScores[loser.playerId].points -= 1;
                        roundScores[loser.playerId].breakdown.push({ reason: 'أقل إجابات', points: -1 });
                    }
                });
            }

            const winnerNames = winners.map(w => updatedPlayers.find(p => p.id === w.playerId)?.name).join(', ');
            lastRoundMessage = `${winnerNames} هو الفائز في المزاد المفتوح!`;
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

export async function endJudgingByTimer(gameId: string, judgeId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) return;
        if (game.gameState !== 'judging') return;
        
        await judgeOpenAuction(gameId, judgeId);
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
        const newScores = { ...(game.playerScores || {}) };
        const newPrisonHistory = JSON.parse(JSON.stringify(game.prisonState?.prisonHistory || {}));
        const roundScores: Game['prisonState']['lastRoundResult']['scores'] = {};

        // Update prison history based on current status
        updatedPlayers.forEach(p => {
             if (p.role === 'contestant') {
                if (!newPrisonHistory[p.id]) newPrisonHistory[p.id] = { inPrison: 0, winsWithoutBidding: 0 };
                
                if (p.status === 'in_prison') {
                    newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
                    newPrisonHistory[p.id].winsWithoutBidding = 0; // Reset this counter when imprisoned
                } else if (p.status === 'alive') {
                    newPrisonHistory[p.id].inPrison = 0;
                     if(game.gameState !== 'open_auction_answering' && game.prisonState?.bidWinnerId !== p.id) {
                         newPrisonHistory[p.id].winsWithoutBidding = (newPrisonHistory[p.id].winsWithoutBidding || 0) + 1;
                     }
                }
             }
        });
        
        let executedPlayerName: string | null = null;
        let newlyImprisonedForNotBidding = false;
        
        updatedPlayers = updatedPlayers.map(p => {
            if (p.role === 'contestant' && newPrisonHistory[p.id]?.inPrison >= 3) {
                 if(p.status !== 'executed') {
                     executedPlayerName = p.name;
                     return { ...p, status: 'executed' };
                 }
            }
             if (p.role === 'contestant' && p.status === 'alive' && newPrisonHistory[p.id]?.winsWithoutBidding >= 3) {
                 newlyImprisonedForNotBidding = true;
                 return { ...p, status: 'in_prison' }; // Imprison player for not bidding
             }
            return p;
        });

        // Add points for staying out of prison
        updatedPlayers.forEach(p => {
            if(p.role === 'contestant' && p.status === 'alive') {
                if (!roundScores[p.id]) roundScores[p.id] = { points: 0, breakdown: [] };
                newScores[p.id] = (newScores[p.id] || 0) + 1;
                roundScores[p.id].points += 1;
                roundScores[p.id].breakdown.push({ reason: 'بقاء خارج السجن', points: 1 });
            }
        });

        let newRoundResult: Partial<Game['prisonState']['lastRoundResult']> = { points: roundScores };
        if (executedPlayerName) {
            newRoundResult.executedPlayerName = executedPlayerName;
        }

        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        if (currentRound >= totalRounds || updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed').length < 2) {
            const batch = writeBatch(db);
            const contestants = updatedPlayers.filter(p => p.role === 'contestant');
            
            const finalScores = newScores;
            const sortedPlayers = contestants
               .map(p => ({ id: p.id, score: finalScores[p.id] || 0 }))
               .sort((a, b) => b.score - a.score);

            const leaderboardPoints = [3, 2, 1];
            const coinRewards = [2, 1, 0];

            for (let i = 0; i < sortedPlayers.length; i++) {
                const player = sortedPlayers[i];
                if (!player) continue;
                const playerRef = doc(db, 'users', player.id);
                
                const pointsToAdd = leaderboardPoints[i] || 0;
                if (pointsToAdd > 0) {
                    batch.update(playerRef, { leaderboardPoints: increment(pointsToAdd) });
                }

                const coinsToAdd = coinRewards[i] || 0;
                if (coinsToAdd > 0) {
                    batch.update(playerRef, { coins: increment(coinsToAdd) });
                }
                
                batch.update(playerRef, { gamesPlayed: increment(1) });
            }
            
            await batch.commit(); 
            transaction.update(gameRef, { 
                gameState: 'final_results',
                players: updatedPlayers,
                playerScores: newScores,
            });
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

        let timerDuration: number;
        if(nextGameState === 'open_auction_answering'){
            timerDuration = game.prisonState?.settings?.answeringTime || 45;
        } else {
            timerDuration = game.prisonState?.settings?.biddingTime || 30;
        }
        const timerEndsAt = Timestamp.fromMillis(Date.now() + timerDuration * 1000);

        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: nextGameState,
            round: currentRound + 1,
            'prisonState.prisonHistory': newPrisonHistory,
            'prisonState.prisonLog': updatedPlayers.filter(p => p.status === 'in_prison').map(p => ({playerId: p.id, roundsInPrison: newPrisonHistory[p.id]?.inPrison || 0})),
            'prisonState.currentQuestion': randomQuestion,
            'prisonState.openAuctionSubmissions': {},
            'prisonState.bids': {},
            'prisonState.judgedAnswers': {},
            'prisonState.bidWinnerId': null,
            'prisonState.tieBreakerContestants': deleteField(),
            'prisonState.lastRoundResult': newRoundResult,
            'prisonState.timerEndsAt': timerEndsAt,
        });
    });
}


export async function submitBid(gameId: string, playerId: string, bidAmount: number) {
    const gameRef = doc(db, 'games', gameId);
    let success = false;
    let error: string | null = null;
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await getDoc(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            if (game.gameState !== 'bidding' && game.gameState !== 'bidding_tiebreaker') {
                throw new Error("ليس وقت المزايدة الآن.");
            }

            const player = game.players.find(p => p.id === playerId);
            if (!player || player.role === 'judge') {
                throw new Error("لا يمكنك المشاركة في المزاد.");
            }
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
        success = true;
    } catch (e: any) {
        console.error("Error in submitBid:", e);
        error = e.message || "An unexpected error occurred.";
    }
    return { success, error };
}

export async function endBiddingByTimer(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'bidding' && game.gameState !== 'bidding_tiebreaker') return;
        
        const bids = game.prisonState?.bids || {};
        let bidders: string[];
        if (game.gameState === 'bidding_tiebreaker') {
            bidders = game.prisonState?.tieBreakerContestants || [];
        } else {
            bidders = game.players.filter(p => p.role === 'contestant').map(p => p.id);
        }
        const validBids = Object.entries(bids).filter(([id, _]) => bidders.includes(id));
        
        if (validBids.length === 0) {
            const allQuestionsQuery = query(collection(db, "prison_questions"));
            const allQuestionsSnapshot = await getDocs(allQuestionsQuery);
            const allQuestions = allQuestionsSnapshot.docs.map(d => ({id: d.id, ...d.data() as object}));
            let newQuestion = allQuestions[Math.floor(Math.random() * allQuestions.length)];

            if (allQuestions.length > 1 && game.prisonState?.currentQuestion) {
                while (newQuestion.id === game.prisonState?.currentQuestion?.id) {
                    newQuestion = allQuestions[Math.floor(Math.random() * allQuestions.length)];
                }
            }
            const newBiddingTime = game.prisonState?.settings?.biddingTime || 30;
            transaction.update(gameRef, {
                gameState: 'bidding', 
                'prisonState.bids': {},
                'prisonState.currentQuestion': newQuestion,
                'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + newBiddingTime * 1000),
                'prisonState.tieBreakerContestants': deleteField(),
            });
            return;
        }

        const highestBid = Math.max(0, ...validBids.map(([, bid]) => bid));
        const highestBidders = validBids.filter(([, bid]) => bid === highestBid).map(([id]) => id);
        
        if (highestBidders.length > 1) {
            const tieBreakerBiddingTime = game.prisonState?.settings?.biddingTime || 30;
            transaction.update(gameRef, {
                gameState: 'bidding_tiebreaker',
                'prisonState.bids': {}, // Reset bids for the tie-breaker
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

        const roundScores: Game['prisonState']['lastRoundResult']['scores'] = {};
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
        } else { // Failure
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
            winnerId: wasSuccess ? winnerId : undefined,
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

export async function endAnsweringByTimer(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'answering') return;
        
        transaction.update(gameRef, {
            'prisonState.timerEndsAt': deleteField(),
        });
    });
}

export async function rateJudgeAndFinish(gameId: string, playerId: string, rating: number, judgeLeft: boolean = false) {
    if (rating === 0 && !judgeLeft) return;

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'final_results' && game.gameState !== 'judge_left') return;
        
        const judgeId = game.prisonState!.judgeId!;
        if(playerId === judgeId) return; // Judge can't rate themselves

        const alreadyRated = game.prisonState?.lastRoundResult?.ratedBy?.includes(playerId);
        if(alreadyRated) return;

        const judgeRef = doc(db, 'users', judgeId);
        const judgeDoc = await transaction.get(judgeRef);
        if(!judgeDoc.exists()) return;

        const currentStats = judgeDoc.data().judgeStats || { totalRating: 0, ratingCount: 0 };
        const newTotalRating = currentStats.totalRating + rating;
        const newRatingCount = currentStats.ratingCount + 1;
        
        transaction.update(judgeRef, {
            'judgeStats.totalRating': newTotalRating,
            'judgeStats.ratingCount': newRatingCount,
        });

        transaction.update(gameRef, {
             'prisonState.lastRoundResult.ratedBy': arrayUnion(playerId)
        });
    });
}
