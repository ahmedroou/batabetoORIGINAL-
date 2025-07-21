
'use server';

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
            playerScores: game.players.filter(p => p.role !== 'judge').reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            prisonState: {
                settings: game.prisonState?.settings || { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 },
                judgeId: judge.id,
                currentQuestion: randomQuestion,
                prisonLog: [],
                roundsSinceLastWin: updatedPlayers.filter(p=> p.role === 'contestant').reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
                openAuctionSubmissions: {},
                timerEndsAt: Timestamp.fromMillis(Date.now() + answeringTime * 1000),
            },
        });
    });
}

export async function submitOpenAuctionAnswers(gameId: string, playerId: string, answerText: string, isTimeout: boolean = false) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.gameState !== 'open_auction_answering') return;
            if (game.prisonState?.openAuctionSubmissions?.[playerId]) return;
            
            const answers = isTimeout || !answerText.trim() ? [] : answerText.trim().split('\n').filter(line => line.trim() !== '');
            
            const newSubmissions = { ...(game.prisonState?.openAuctionSubmissions || {}), [playerId]: answers };
            transaction.update(gameRef, {
                [`prisonState.openAuctionSubmissions`]: newSubmissions,
            });
            
            // Check if all contestants have submitted
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


export async function judgeOpenAuction(gameId: string, judgeId: string, correctCounts: Record<string, number>, judgeNotes: Record<string, string>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can submit results.");
        if (game.gameState !== 'judging') throw new Error("Not in judging phase.");
        
        let updatedPlayers = [...game.players];
        const contestants = updatedPlayers.filter(p => p.role === 'contestant');
        let newPrisonLog = [...(game.prisonState?.prisonLog || [])];
        const newScores = { ...(game.playerScores || {}) };
        
        let lastRoundResult: Game['prisonState']['lastRoundResult'] = { message: '', points: {}, judgeNotes: judgeNotes || {} };

        const sortedResults = Object.entries(correctCounts).sort(([, a], [, b]) => a - b);
        
        const everyoneInPrison = contestants.every(p => p.status === 'in_prison');
        
        if (everyoneInPrison) {
             const winnerEntry = sortedResults[sortedResults.length - 1];
             if(winnerEntry) {
                 const winnerId = winnerEntry[0];
                 const winnerIndex = updatedPlayers.findIndex(p => p.id === winnerId);
                 if (winnerIndex > -1) {
                     updatedPlayers[winnerIndex].status = 'alive';
                     const logIndex = newPrisonLog.findIndex(l => l.playerId === winnerId);
                     if(logIndex > -1) newPrisonLog.splice(logIndex, 1);
                     const winner = updatedPlayers[winnerIndex];
                     lastRoundResult.message = `الجميع في السجن! ${winner.name} كان الأفضل وخرج من السجن.`;
                     lastRoundResult.winnerId = winnerId;
                     lastRoundResult.wasSuccess = true;
                 } else {
                      lastRoundResult.message = "لم يتم العثور على الفائز.";
                 }
             } else {
                  lastRoundResult.message = "لا توجد نتائج لتحديد الفائز.";
             }
        } else {
             const playersOutsidePrison = contestants.filter(p => p.status === 'alive');
             const resultsOfPlayersOutside = sortedResults.filter(([id]) => playersOutsidePrison.some(p => p.id === id));
             const loserEntry = resultsOfPlayersOutside[0];
             if(loserEntry){
                 const loserId = loserEntry[0];
                 const loserIndex = updatedPlayers.findIndex(p => p.id === loserId);
                 if(loserIndex > -1){
                     updatedPlayers[loserIndex].status = 'in_prison';
                     newPrisonLog.push({ playerId: loserId, roundsInPrison: 0 });
                     const loser = updatedPlayers[loserIndex];
                     lastRoundResult.message = `للأسف، ${loser.name} كان الأسوأ وسيدخل السجن.`;
                     lastRoundResult.loserId = loserId;
                     lastRoundResult.wasSuccess = false;
                 } else {
                      lastRoundResult.message = "لم يتم العثور على الخاسر.";
                 }
             } else {
                  lastRoundResult.message = "لم يتم تحديد خاسر هذه الجولة.";
             }
        }

        // Update points after determining winner/loser
        updatedPlayers.forEach(p => {
            if (p.role !== 'contestant') return;
            if (p.status === 'alive') {
                newScores[p.id] = (newScores[p.id] || 0) + 1;
                if (!lastRoundResult.points) lastRoundResult.points = {};
                lastRoundResult.points[p.id] = (lastRoundResult.points[p.id] || 0) + 1;
            } else if (p.status === 'in_prison') {
                 newScores[p.id] = (newScores[p.id] || 0) - 1;
                 if (!lastRoundResult.points) lastRoundResult.points = {};
                 lastRoundResult.points[p.id] = (lastRoundResult.points[p.id] || 0) - 1;
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

        let timerDuration: number;
        if(nextGameState === 'open_auction_answering'){
            timerDuration = game.prisonState?.settings?.answeringTime || 45;
        } else { // bidding
            timerDuration = game.prisonState?.settings?.biddingTime || 30;
        }
        const timerEndsAt = Timestamp.fromMillis(Date.now() + timerDuration * 1000);


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
            'prisonState.timerEndsAt': timerEndsAt,
        });
    });
}

export async function submitBidOrWithdraw(gameId: string, playerId: string, action: 'bid' | 'withdraw', bidAmount: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.gameState !== 'bidding') throw new Error("ليس وقت المزايدة الآن.");
        const highestBid = Object.values(game.prisonState?.bids || {}).reduce((max, bid) => Math.max(max, bid), 0);

        if (action === 'bid') {
            if(bidAmount <= highestBid) throw new Error("يجب أن تكون مزايدتك أعلى من المزايدة الحالية.");
            transaction.update(gameRef, { [`prisonState.bids.${playerId}`]: bidAmount });
        } else { // withdraw
            transaction.update(gameRef, { 'prisonState.withdrawnBidders': arrayUnion(playerId) });
        }
        
        // Check if bidding is over
        const bidders = game.players.filter(p => p.role === 'contestant' && p.status === 'alive');
        const withdrawnBidders = [...(game.prisonState?.withdrawnBidders || []), ...(action === 'withdraw' ? [playerId] : [])];
        const activeBidders = bidders.filter(p => !withdrawnBidders.includes(p.id));
        
        if (activeBidders.length <= 1) {
            let winnerId = null;
            if (activeBidders.length === 1) {
                winnerId = activeBidders[0].id;
            } else { // All withdrew, last highest bidder wins
                const bids = game.prisonState?.bids || {};
                const lastHighestBidder = Object.entries(bids).sort(([, a], [, b]) => b - a)[0];
                winnerId = lastHighestBidder ? lastHighestBidder[0] : null;
            }

            const answeringTime = game.prisonState?.settings?.answeringTime || 45;
            transaction.update(gameRef, {
                gameState: 'answering',
                'prisonState.bidWinnerId': winnerId,
                'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000),
            });
        }
    });
}

export async function endBiddingByTimer(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'bidding' || game.hostId !== hostId) return;

        const bids = game.prisonState?.bids || {};
        const highestBidder = Object.entries(bids).sort(([, a], [, b]) => b - a)[0];
        const winnerId = highestBidder ? highestBidder[0] : null;
        
        const answeringTime = game.prisonState?.settings?.answeringTime || 45;
        transaction.update(gameRef, {
            gameState: 'answering',
            'prisonState.bidWinnerId': winnerId,
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000),
        });
    });
}

export async function submitLiveAnswer(gameId: string, playerId: string, text: string) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, { 'prisonState.liveAnswer': text });
}

export async function judgeLiveAnswer(gameId: string, judgeId: string, correctCount: number, judgeNote: string) {
     const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can submit results.");
        if (game.gameState !== 'answering') throw new Error("Not in answering phase.");
        
        const winnerId = game.prisonState!.bidWinnerId!;
        const bidAmount = game.prisonState!.bids![winnerId]!;
        const winner = game.players.find(p => p.id === winnerId)!;
        const wasSuccess = correctCount >= bidAmount;

        let updatedPlayers = [...game.players];
        const newPrisonLog = [...(game.prisonState?.prisonLog || [])];
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
            } else if (p.status === 'in_prison' && p.id !== winnerId) {
                 newScores[p.id] = (newScores[p.id] || 0) - 1;
                 if (!lastRoundResult.points) lastRoundResult.points = {};
                 lastRoundResult.points[p.id] = (lastRoundResult.points[p.id] || 0) - 1;
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

export async function rateJudgeAndFinish(gameId: string, playerId: string, rating: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'final_results') return;
        const judgeId = game.prisonState!.judgeId!;
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
