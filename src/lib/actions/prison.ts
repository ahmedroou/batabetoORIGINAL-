
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
                prisonHistory: updatedPlayers.filter(p => p.role === 'contestant').reduce((acc, p) => ({ ...acc, [p.id]: { inPrison: 0 } }), {}),
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
            
            const newSubmissions = { ...(game.prisonState?.openAuctionSubmissions || {}), [playerId]: answers };
            transaction.update(gameRef, {
                [`prisonState.openAuctionSubmissions`]: newSubmissions,
            });
            
            game.prisonState.openAuctionSubmissions = newSubmissions;
            
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


export async function judgeOpenAuction(gameId: string, judgeId: string, judgeNotes: Record<string, string>, decisions: Record<string, 'imprison' | 'free' | 'cheat'>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can submit results.");
        if (game.gameState !== 'judging') throw new Error("Not in judging phase.");
        
        let updatedPlayers = [...game.players];
        const newScores = { ...(game.playerScores || {}) };

        let lastRoundResult: Game['prisonState']['lastRoundResult'] = {
            message: '',
            points: {},
            judgeNotes: judgeNotes || {}
        };
        
        let numFreed = 0;
        let numImprisoned = 0;
        let numCheaters = 0;

        Object.entries(decisions).forEach(([playerId, decision]) => {
            const playerIndex = updatedPlayers.findIndex(p => p.id === playerId);
            if(playerIndex === -1) return;
            const player = updatedPlayers[playerIndex];
            let changed = false;

            if (decision === 'free' && player.status === 'in_prison') {
                updatedPlayers[playerIndex].status = 'alive';
                newScores[playerId] = (newScores[playerId] || 0) + 1;
                lastRoundResult.points![playerId] = (lastRoundResult.points![playerId] || 0) + 1;
                numFreed++;
                changed = true;
            } else if ((decision === 'imprison' || decision === 'cheat') && player.status === 'alive') {
                updatedPlayers[playerIndex].status = 'in_prison';
                const penalty = decision === 'cheat' ? -2 : -1;
                newScores[playerId] = (newScores[playerId] || 0) + penalty;
                lastRoundResult.points![playerId] = (lastRoundResult.points![playerId] || 0) + penalty;
                if(decision === 'cheat') numCheaters++; else numImprisoned++;
                changed = true;
            }
        });

        // Generate result message
        const messages = [];
        if (numFreed > 0) messages.push(`أطلق سراح ${numFreed} لاعبين`);
        if (numImprisoned > 0) messages.push(`سجن ${numImprisoned} لاعبين`);
        if (numCheaters > 0) messages.push(`عاقب ${numCheaters} لاعبين بتهمة الغش`);
        
        lastRoundResult.message = messages.length > 0 ? `القاضي ${messages.join(' و')}.` : `القاضي لم يغير حالة أي لاعب.`;

       
        // Re-calculate the prison log based on the new statuses
        const newPrisonLog = updatedPlayers
            .filter(p => p.status === 'in_prison')
            .map(p => {
                const existingLog = game.prisonState?.prisonLog?.find(l => l.playerId === p.id);
                return { playerId: p.id, roundsInPrison: existingLog?.roundsInPrison || 0 };
            });


        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: 'results',
            'prisonState.prisonLog': newPrisonLog,
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
        
        await judgeOpenAuction(gameId, judgeId, game.prisonState?.lastRoundResult?.judgeNotes || {}, {});
    });
}


export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        let updatedPlayers = [...game.players];
        const newScores = { ...(game.playerScores || {}) };
        const newPrisonHistory = JSON.parse(JSON.stringify(game.prisonState?.prisonHistory || {}));
        const newRoundResult: Partial<Game['prisonState']['lastRoundResult']> = { points: {} };

        // Increment rounds for players in prison and deduct points
        const updatedPrisonLog = (game.prisonState?.prisonLog || []).map(log => {
            const newRoundsInPrison = (log.roundsInPrison || 0) + 1;
            newScores[log.playerId] = (newScores[log.playerId] || 0) - 1;
            if (!newPrisonHistory[log.playerId]) newPrisonHistory[log.playerId] = { inPrison: 0 };
            newPrisonHistory[log.playerId].inPrison = (newPrisonHistory[log.playerId].inPrison || 0) + 1;
             if (!newRoundResult.points) newRoundResult.points = {};
             newRoundResult.points![log.playerId] = (newRoundResult.points![log.playerId] || 0) -1;
            return {
                ...log,
                roundsInPrison: newRoundsInPrison
            };
        });
        
        let executedPlayerName: string | null = null;
        const playersToExecute = updatedPrisonLog.filter(log => log.roundsInPrison >= 3);
        
        if (playersToExecute.length > 0) {
            const playerToExecuteId = playersToExecute[0].playerId;
            const playerIndex = updatedPlayers.findIndex(p => p.id === playerToExecuteId);
            if (playerIndex !== -1) {
                updatedPlayers[playerIndex].status = 'executed';
                executedPlayerName = updatedPlayers[playerIndex].name;
            }
        }
        
        // This is a special property for the next round's results screen. It's not part of the final result object
        if (executedPlayerName) {
            newRoundResult.executedPlayerName = executedPlayerName;
        }

        const finalPrisonLog = updatedPrisonLog.filter(log => log.roundsInPrison < 3);
        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        if (currentRound >= totalRounds || updatedPlayers.filter(p => p.status === 'alive').length <= 2) {
            // End of game logic
            const batch = writeBatch(db);
            const contestants = updatedPlayers.filter(p => p.role === 'contestant');
            
            // Get final player rankings
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
                
                // Award Leaderboard Points
                const pointsToAdd = leaderboardPoints[i] || 0;
                if (pointsToAdd > 0) {
                    batch.update(playerRef, { leaderboardPoints: increment(pointsToAdd) });
                }

                // Award Coins
                const coinsToAdd = coinRewards[i] || 0;
                if (coinsToAdd > 0) {
                    batch.update(playerRef, { coins: increment(coinsToAdd) });
                }

                // Increment games played for all contestants
                batch.update(playerRef, { gamesPlayed: increment(1) });
            }
            
            await batch.commit(); // Commit user data changes
            transaction.update(gameRef, { 
                gameState: 'final_results',
                players: updatedPlayers,
                playerScores: newScores,
                'prisonState.prisonLog': finalPrisonLog 
            });
            return;
        }

        const contestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        const prisoners = contestants.filter(p => p.status === 'in_prison');
        let nextGameState: Game['gameState'] = 'bidding';

        if (prisoners.length === 0 || prisoners.length === contestants.length) {
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
            'prisonState.prisonLog': finalPrisonLog,
            'prisonState.prisonHistory': newPrisonHistory,
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
            if (!player || player.role === 'judge' || player.status === 'in_prison') {
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
            bidders = game.players.filter(p => p.role === 'contestant' && p.status === 'alive').map(p => p.id);
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


export async function judgeLiveAnswer(gameId: string, judgeId: string, wasSuccess: boolean, judgeNote: string) {
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
        let newPrisonLog = [...(game.prisonState?.prisonLog || [])];
        const newScores = { ...(game.playerScores || {}) };

        let lastRoundResult: Game['prisonState']['lastRoundResult'] = {
            message: '',
            wasSuccess,
            points: {},
            judgeNotes: { [winnerId]: judgeNote },
        };
        
        if(wasSuccess) {
            lastRoundResult.winnerId = winnerId;
            newScores[winnerId] = (newScores[winnerId] || 0) + 2;
            lastRoundResult.points![winnerId] = 2;
            
            if (winner.status === 'in_prison') {
                updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? { ...p, status: 'alive' } : p);
                const logIndex = newPrisonLog.findIndex(l => l.playerId === winnerId);
                if(logIndex > -1) newPrisonLog.splice(logIndex, 1);
                lastRoundResult.message = `${winner.name} نجح في المزاد وتحرر من السجن!`;
            } else {
                 lastRoundResult.message = `${winner.name} نجح في المزاد وحافظ على حريته!`;
            }

        } else { // Failure
            lastRoundResult.loserId = winnerId;
             if (winner.status === 'alive') {
                 updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? { ...p, status: 'in_prison' } : p);
                 newPrisonLog.push({ playerId: winnerId, roundsInPrison: 0 });
                 lastRoundResult.message = `${winner.name} فشل في المزاد وسيدخل السجن!`;
            } else {
                lastRoundResult.message = `${winner.name} فشل في المزاد وسيبقى في السجن!`;
            }
        }

        updatedPlayers.forEach(p => {
            if (p.role !== 'contestant') return;
            if (p.status === 'alive' && p.id !== winnerId) {
                newScores[p.id] = (newScores[p.id] || 0) + 1;
                if (!lastRoundResult.points) lastRoundResult.points = {};
                lastRoundResult.points[p.id] = (lastRoundResult.points[p.id] || 0) + 1;
            }
        });
        
         transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: 'results',
            'prisonState.prisonLog': newPrisonLog,
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

export async function rateJudgeAndFinish(gameId: string, playerId: string, rating: number) {
    // If rating is 0, the user chose not to rate. Just exit.
    if (rating === 0) {
        return;
    }
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'final_results' && game.gameState !== 'judge_left') return;
        
        const judgeId = game.prisonState!.judgeId!;
        // Prevent judge from rating themselves if they are the last player somehow
        if(playerId === judgeId) return;

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

    });
}
