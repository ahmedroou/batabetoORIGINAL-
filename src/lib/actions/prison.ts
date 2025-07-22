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
                judgeInactiveRounds: 0,
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
        
        const correctCounts: {playerId: string, name: string, count: number}[] = contestants
            .map(p => ({
                playerId: p.id,
                name: p.name,
                count: Object.values(judgedAnswers[p.id] || {}).filter(Boolean).length
            }));
            
        let lastRoundMessage = "انتهى المزاد المفتوح بتقييم القاضي.";

        if (correctCounts.length > 0) {
            const scores = correctCounts.map(c => c.count);
            const maxScore = Math.max(...scores);
            const minScore = Math.min(...scores);
            
            const winners = correctCounts.filter(c => c.count === maxScore);
            const losers = correctCounts.filter(c => c.count === minScore);
            
            // Winners get +2 only if there is ONE winner.
            if (winners.length === 1 && scores.length > 1) {
                const winnerId = winners[0].playerId;
                roundScores[winnerId]!.points += 2;
                roundScores[winnerId]!.breakdown.push({ reason: 'أداء متميز (بلا منازع)', points: 2 });
                lastRoundMessage = `${winners[0].name} هو الفائز في المزاد المفتوح!`;
            } else if (winners.length > 1) {
                 lastRoundMessage = `تعادل في الصدارة! لا يوجد فائز متميز هذه الجولة.`;
            }
            
            // Losers get -1 and go to prison. This happens even if there's a tie for last place.
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
       
        // Survivors get points (+1 for being out of prison)
        updatedPlayers.forEach(p => {
            if (p.role === 'contestant' && p.status === 'alive') {
                roundScores[p.id]!.points += 1;
                roundScores[p.id]!.breakdown.push({ reason: 'بقاء خارج السجن', points: 1 });
            }
        });
        
        // Update total scores
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
            roundScores[winnerId]!.points += 2;
            roundScores[winnerId]!.breakdown.push({ reason: 'فوز بالمزاد', points: 2 });
            
            if (winner.status === 'in_prison') {
                updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? { ...p, status: 'alive' } : p);
            }
        } else {
            newScores[winnerId] = (newScores[winnerId] || 0) - 1;
            roundScores[winnerId]!.points -= 1;
            roundScores[winnerId]!.breakdown.push({ reason: 'فشل في المزاد', points: -1 });

            if (winner.status === 'alive') {
                updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? { ...p, status: 'in_prison' } : p);
            }
        }

        updatedPlayers.forEach(p => {
            if (p.role === 'contestant' && p.status === 'alive' && p.id !== winnerId) {
                newScores[p.id] = (newScores[p.id] || 0) + 1;
                roundScores[p.id]!.points += 1;
                roundScores[p.id]!.breakdown.push({ reason: 'بقاء خارج السجن', points: 1 });
            }
        });
       
        const lastRoundResult: Game['prisonState']['lastRoundResult'] = {
            message: wasSuccess ? `${winner.name} نجح في المزاد!` : `${winner.name} فشل في المزاد!`,
            wasSuccess,
            winnerId: wasSuccess ? winnerId : null,
            loserId: !wasSuccess ? winnerId : undefined,
            points: roundScores,
            ratedBy: [],
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

// Functions that can be called by a timer or automatically
export async function endTimerAndProceed(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        const judgeId = game.prisonState?.judgeId;
        if(!judgeId) return;

        if (game.gameState === 'open_auction_answering') {
            const activeContestants = game.players.filter(p => p.role === 'contestant' && p.status === 'alive');
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
            // Judge is inactive, end the round with no changes and increment inactivity counter.
            const inactiveRounds = (game.prisonState?.judgeInactiveRounds || 0) + 1;
            
            if (inactiveRounds >= 3) {
                // End game due to inactive judge
                 transaction.update(gameRef, {
                    gameState: 'judge_left',
                    gameResult: {
                        winner: 'judge_left',
                        message: `القاضي لم يكن متفاعلاً، انتهت اللعبة!`,
                    }
                });
            } else {
                // Go to results page with a message and increment counter
                 transaction.update(gameRef, {
                    gameState: 'results',
                    'prisonState.lastRoundResult': { message: "انتهى وقت القاضي ولم يصدر حكمه. لا تغيير في النقاط.", points: {}, ratedBy: [] },
                    'prisonState.judgeInactiveRounds': inactiveRounds,
                    'prisonState.timerEndsAt': deleteField(),
                });
            }
        }
        else if (game.gameState === 'bidding' || game.gameState === 'bidding_tiebreaker') {
            const bids = game.prisonState?.bids || {};
            let bidders: string[];
            if (game.gameState === 'bidding_tiebreaker') {
                bidders = game.prisonState?.tieBreakerContestants || [];
            } else {
                bidders = game.players.filter(p => p.role === 'contestant' && p.status !== 'in_prison').map(p => p.id);
            }
            const validBids = Object.entries(bids).filter(([id]) => bidders.includes(id));
            
            if (validBids.length === 0) {
                // If no valid bids, transition to results (or next round directly if no points change needed)
                transaction.update(gameRef, { 
                    gameState: 'results', 
                    'prisonState.lastRoundResult': { message: "لا أحد زايد. تستمر الجولة." , points: {}, ratedBy: []} 
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
            await judgeAnswerLive(gameId, judgeId, false);
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
            if (p.role === 'contestant' && p.status !== 'executed') {
                if (!newPrisonHistory[p.id]) newPrisonHistory[p.id] = { inPrison: 0, winsWithoutBidding: 0 };
                
                if (p.status === 'in_prison') {
                    newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
                    newPrisonHistory[p.id].winsWithoutBidding = 0;
                } else {
                    newPrisonHistory[p.id].inPrison = 0;
                    if (lastRoundResult.wasSuccess) { 
                        newPrisonHistory[p.id].winsWithoutBidding = p.id === lastRoundResult.winnerId ? 0 : (newPrisonHistory[p.id].winsWithoutBidding || 0) + 1;
                    }
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
        
        const remainingContestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        if (currentRound >= totalRounds || remainingContestants.length < 2) {
            transaction.update(gameRef, { gameState: 'final_results', players: updatedPlayers });
            return;
        }

        const prisoners = remainingContestants.filter(p => p.status === 'in_prison');
        let nextGameState: Game['gameState'] = 'bidding';
        if (prisoners.length === 0 || prisoners.length === remainingContestants.length || newlyImprisonedForNotBidding) {
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
            'prisonState.reactions': {},
            'prisonState.shuffledAnswers': [],
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
        const gameDoc = await getDoc(gameRef);
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

export async function judgeAnswer(gameId: string, judgeId: string, playerId: string, answerIndex: number, isCorrect: boolean) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can do this.");
        if (game.gameState !== 'judging') throw new Error("Not in judging phase.");

        const currentJudged = game.prisonState.judgedAnswers || {};
        const playerJudged = currentJudged[playerId] || {};
        playerJudged[answerIndex] = isCorrect;
        
        transaction.update(gameRef, {
            [`prisonState.judgedAnswers.${playerId}`]: playerJudged
        });
    });
}
