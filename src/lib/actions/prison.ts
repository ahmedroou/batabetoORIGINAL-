

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
                roundsSinceLastWin: updatedPlayers.filter(p=> p.role === 'contestant').reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
                openAuctionSubmissions: {},
                judgedAnswers: {},
                timerEndsAt: Timestamp.fromMillis(Date.now() + answeringTime * 1000),
            },
        });
    });
}

export async function submitOpenAuctionAnswers(gameId: string, playerId: string, answers: string[], isTimeout: boolean = false) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.gameState !== 'open_auction_answering') return;
            if (game.prisonState?.openAuctionSubmissions?.[playerId]) return;
            
            const finalAnswers = isTimeout ? [] : answers;
            
            const newSubmissions = { ...(game.prisonState?.openAuctionSubmissions || {}), [playerId]: finalAnswers };
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

export async function judgeAnswerLive(gameId: string, judgeId: string, playerId: string, answerIndex: number, isCorrect: boolean) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
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


export async function judgeOpenAuction(gameId: string, judgeId: string, judgeNotes: Record<string, string>, judgedAnswers: Record<string, Record<number, boolean>>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) throw new Error("Only the judge can submit results.");
        if (game.gameState !== 'judging') throw new Error("Not in judging phase.");
        
        let updatedPlayers = [...game.players];
        const contestants = updatedPlayers.filter(p => p.role === 'contestant');
        let newPrisonLog = [...(game.prisonState?.prisonLog || [])];
        const newScores = { ...(game.playerScores || {}) };

        let lastRoundResult: Game['prisonState']['lastRoundResult'] = { message: '', points: {}, judgeNotes: judgeNotes || {} };

        const correctCounts: Record<string, number> = {};
        Object.keys(game.prisonState?.openAuctionSubmissions || {}).forEach(playerId => {
            const count = Object.values(judgedAnswers[playerId] || {}).filter(Boolean).length;
            correctCounts[playerId] = count;
        });
        
        const everyoneInPrison = contestants.every(p => p.status === 'in_prison');
        
        if (everyoneInPrison) {
             const sortedResults = Object.entries(correctCounts).sort(([, a], [, b]) => b - a);
             const winnerEntry = sortedResults[0];
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
             const resultsOfPlayersOutside = Object.entries(correctCounts)
                .filter(([id]) => playersOutsidePrison.some(p => p.id === id))
                .sort(([, a], [, b]) => a - b);
                
             const minScore = resultsOfPlayersOutside[0]?.[1] ?? -1;
             const losers = resultsOfPlayersOutside.filter(([, score]) => score === minScore);

             let loserId;
             if (losers.length === 1) {
                 loserId = losers[0][0];
             } else { // Tie-breaker based on prison time
                const getRoundsInPrison = (pid: string) => newPrisonLog.find(l => l.playerId === pid)?.roundsInPrison ?? -1;
                losers.sort((a, b) => getRoundsInPrison(b[0]) - getRoundsInPrison(a[0]));
                loserId = losers[0]?.[0];
             }

             if(loserId){
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

export async function endJudgingByTimer(gameId: string, judgeId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        
        if (game.prisonState?.judgeId !== judgeId) return;
        if (game.gameState !== 'judging') return;
        
        await judgeOpenAuction(gameId, judgeId, game.prisonState?.lastRoundResult?.judgeNotes || {}, game.prisonState?.judgedAnswers || {});
    });
}


export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        // Increment rounds for players in prison
        let updatedPlayers = [...game.players];
        const newScores = { ...(game.playerScores || {}) };

        const updatedPrisonLog = (game.prisonState?.prisonLog || []).map(log => {
             // Deduct point for staying in prison
            newScores[log.playerId] = (newScores[log.playerId] || 0) - 1;
            return {
                ...log,
                roundsInPrison: log.roundsInPrison + 1
            };
        });
        
        // Check for executions
        let executedPlayerName: string | null = null;
        const playersToExecute = updatedPrisonLog.filter(log => log.roundsInPrison >= 3);
        
        if (playersToExecute.length > 0) {
            const playerToExecuteId = playersToExecute[0].playerId; // Execute one at a time for simplicity
            const playerIndex = updatedPlayers.findIndex(p => p.id === playerToExecuteId);
            if (playerIndex !== -1) {
                updatedPlayers[playerIndex].status = 'executed';
                executedPlayerName = updatedPlayers[playerIndex].name;
            }
        }
        
        // Remove executed players from the log
        const finalPrisonLog = updatedPrisonLog.filter(log => log.roundsInPrison < 3);

        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        if (currentRound >= totalRounds) {
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

        // Prepare the last round result for the new round, including execution info
        const newLastRoundResult: Game['prisonState']['lastRoundResult'] = { 
            message: '', // Will be populated by the next action
            points: {} // Reset points for the new round results
        };

        if (executedPlayerName) {
            newLastRoundResult.executedPlayerName = executedPlayerName;
        }

        // Add prison point deductions to the breakdown for display
        updatedPrisonLog.forEach(log => {
             const player = game.players.find(p => p.id === log.playerId);
             if (player && player.status === 'in_prison') {
                 if (!newLastRoundResult.points) newLastRoundResult.points = {};
                 newLastRoundResult.points[log.playerId] = -1;
             }
        });


        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: nextGameState,
            round: currentRound + 1,
            'prisonState.prisonLog': finalPrisonLog,
            'prisonState.currentQuestion': randomQuestion,
            'prisonState.openAuctionSubmissions': {},
            'prisonState.bids': {},
            'prisonState.judgedAnswers': {},
            'prisonState.withdrawnBidders': [],
            'prisonState.bidWinnerId': null,
            'prisonState.liveAnswer': '',
            'prisonState.lastRoundResult': newLastRoundResult,
            'prisonState.timerEndsAt': timerEndsAt,
            'prisonState.tieBreakerContestants': [],
        });
    });
}

export async function submitBidOrWithdraw(gameId: string, playerId: string, action: 'bid' | 'withdraw', bidAmount: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const currentState = game.gameState;
        if (currentState !== 'bidding' && currentState !== 'bidding_tiebreaker') {
            throw new Error("ليس وقت المزايدة الآن.");
        }
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.role === 'judge') {
            throw new Error("لا يمكنك المشاركة في المزاد.");
        }
        
        const highestBid = Object.values(game.prisonState?.bids || {}).reduce((max, bid) => Math.max(max, bid), 0);
        
        if (currentState === 'bidding_tiebreaker' && !game.prisonState?.tieBreakerContestants?.includes(playerId)) {
             throw new Error("أنت لست مشاركاً في جولة كسر التعادل.");
        }

        if (action === 'bid') {
            if(bidAmount <= highestBid) throw new Error("يجب أن تكون مزايدتك أعلى من المزايدة الحالية.");
            transaction.update(gameRef, { [`prisonState.bids.${playerId}`]: bidAmount });
        } else { // withdraw
            transaction.update(gameRef, { 'prisonState.withdrawnBidders': arrayUnion(playerId) });
        }
        
    });
}

export async function endBiddingByTimer(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await getDoc(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        const currentState = game.gameState;
        if (currentState !== 'bidding' && currentState !== 'bidding_tiebreaker') return;
        
        const bids = game.prisonState?.bids || {};
        const withdrawnBidders = game.prisonState?.withdrawnBidders || [];
        const tieBreakerContestants = game.prisonState?.tieBreakerContestants || [];
        
        const allContestants = game.players.filter(p => p.role === 'contestant');
        // Determine the pool of eligible bidders for this specific round
        const eligibleBidderIds = (currentState === 'bidding_tiebreaker' && tieBreakerContestants.length > 0)
            ? tieBreakerContestants
            : allContestants.map(p => p.id);

        const activeBids = Object.fromEntries(Object.entries(bids).filter(([id]) => eligibleBidderIds.includes(id) && !withdrawnBidders.includes(id)));

        // Check if all eligible players have withdrawn
        const allEligibleWithdrawn = eligibleBidderIds.every(id => withdrawnBidders.includes(id));

        if (Object.keys(activeBids).length === 0 || allEligibleWithdrawn) {
            // All eligible players either did not bid or withdrew. Skip this auction.
            const allQuestionsQuery = query(collection(db, "prison_questions"));
            const allQuestionsSnapshot = await getDocs(allQuestionsQuery);
            const allQuestions = allQuestionsSnapshot.docs.map(d => ({id: d.id, ...d.data()}));
            let newQuestion = allQuestions[Math.floor(Math.random() * allQuestions.length)];

            // Ensure the new question is different from the old one, if possible
            if (allQuestions.length > 1) {
                while (newQuestion.id === game.prisonState?.currentQuestion?.id) {
                    newQuestion = allQuestions[Math.floor(Math.random() * allQuestions.length)];
                }
            }

            const newBiddingTime = game.prisonState?.settings?.biddingTime || 30;
            transaction.update(gameRef, {
                gameState: 'bidding', // Go back to a normal bidding state
                'prisonState.bids': {},
                'prisonState.withdrawnBidders': [],
                'prisonState.tieBreakerContestants': [],
                'prisonState.currentQuestion': newQuestion,
                'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + newBiddingTime * 1000),
            });
            return;
        }

        const highestBid = Math.max(0, ...Object.values(activeBids));
        const highestBidders = Object.entries(activeBids).filter(([, bid]) => bid === highestBid).map(([id]) => id);
        
        if (highestBidders.length > 1) {
            // Tie-breaker round
            const newBiddingTime = game.prisonState?.settings?.biddingTime || 30;
            transaction.update(gameRef, {
                gameState: 'bidding_tiebreaker',
                'prisonState.tieBreakerContestants': highestBidders,
                'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + newBiddingTime * 1000),
                'prisonState.withdrawnBidders': [], // Reset withdrawals for the tie-break
            });
        } else {
            // We have a winner
            const winnerId = highestBidders[0] || null;
            if (!winnerId) {
                // This case should ideally not happen if bids exist, but as a fallback, restart.
                const newBiddingTime = game.prisonState?.settings?.biddingTime || 30;
                transaction.update(gameRef, {
                    gameState: 'bidding',
                    'prisonState.bids': {},
                    'prisonState.withdrawnBidders': [],
                    'prisonState.tieBreakerContestants': [],
                    'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + newBiddingTime * 1000),
                });
                return;
            }

            const answeringTime = game.prisonState?.settings?.answeringTime || 45;
            transaction.update(gameRef, {
                gameState: 'answering',
                'prisonState.bidWinnerId': winnerId,
                'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000),
                'prisonState.tieBreakerContestants': [],
            });
        }
    });
}

export async function submitLiveAnswer(gameId: string, playerId: string, text: string) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, { 'prisonState.liveAnswer': text });
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
        const bidAmount = game.prisonState!.bids![winnerId]!;
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
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
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

        // If the judge left, the game document should be deleted by the last rating player
        if (game.gameState === 'judge_left') {
            const activePlayers = game.players.filter(p => p.status !== 'left' && p.role !== 'judge');
            const ratedCount = (game.prisonState?.lastRoundResult?.ratedBy || []).length;
            if (ratedCount + 1 >= activePlayers.length) {
                transaction.delete(gameRef);
            } else {
                 transaction.update(gameRef, {
                     'prisonState.lastRoundResult.ratedBy': arrayUnion(playerId)
                 });
            }
        }
    });
}

    

