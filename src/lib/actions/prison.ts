

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
import type { Game, Player, PrisonQuestion, PlayerProgress } from '@/types';
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
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'instructions',
            round: 1,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            prisonState: {
                settings: game.prisonState?.settings,
                prisonHistory: updatedPlayers.reduce((acc, p) => ({ ...acc, [p.id]: { inPrison: 0, roundsWithoutWinningAuction: 0 } }), {}),
                questionChangersUsedBy: [],
            },
        });
    });
}

export async function proceedFromInstructions(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can proceed.");
        if (game.gameState !== 'instructions') return;

        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            throw new Error(`لا توجد أسئلة للعبة السجن. يرجى رفع المزيد من الأسئلة من صفحة الأدمن.`);
        }
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
        const answeringTime = game.prisonState?.settings?.answeringTime || 45;

        transaction.update(gameRef, {
            gameState: 'open_auction',
            'prisonState.currentQuestion': randomQuestion,
            'prisonState.openAuctionSubmissions': {},
            'prisonState.playerProgress': {},
            'prisonState.aiJudgeResults': [],
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000),
        });
    });
}

export async function updateOpenAuctionProgress(gameId: string, playerId: string, answers: string[]) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            const game = gameDoc.data() as Game;
            if (game.gameState !== 'open_auction' && game.gameState !== 'closed_auction_answering') return;

            transaction.update(gameRef, {
                [`prisonState.playerProgress.${playerId}.answers`]: answers,
            });
        });
    } catch (error) {
        console.error("Error updating open auction progress:", error);
    }
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
                transaction.update(gameRef, { 
                    gameState: 'judging', 
                    'prisonState.judgingStarted': true,
                    'prisonState.timerEndsAt': null,
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error submitting open auction answers:", error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

export async function judgeAnswersAndProceed(gameId: string, hostId: string, isRejudge: boolean) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can trigger judging.");
        
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
        const rejudgeRequest = game.prisonState?.activeRejudgeRequest;

        const aiResults = await getPrisonJudgeResults({
            question: questionText,
            submissions: playerSubmissions,
            rejudgeReason: isRejudge && rejudgeRequest ? rejudgeRequest : undefined,
        });

        const updateData: any = {
            'prisonState.aiJudgeResults': aiResults.results,
        };

        if (isRejudge) {
            updateData['prisonState.judgeExplanation'] = aiResults.judgeExplanation || deleteField();
            updateData['prisonState.activeRejudgeRequest'] = deleteField(); // Clear the active request
        }
        updateData.gameState = 'judging'; // Ensure it stays in judging phase for host to proceed

        transaction.update(gameRef, updateData);
    });
}

export async function proceedToResults(gameId: string, hostId: string) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can proceed.");
        if (!game.prisonState?.aiJudgeResults || game.prisonState.aiJudgeResults.length === 0) return;
        
        const aiResults = game.prisonState!.aiJudgeResults!;
        const newScores = { ...(game.playerScores || {}) };
        const roundScores: Game['prisonState']['lastRoundResult']['points'] = {};
        let updatedPlayers = [...game.players];
        let lastRoundMessage = "انتهى المزاد!";
        let lastRoundWinnerId: string | null = null;
        let freedPlayerName: string | undefined = undefined;
        
        const contestants = game.players.filter(p => p.role === 'contestant' && p.status !== 'executed');
        contestants.forEach(p => {
            roundScores[p.id] = { points: 0, breakdown: [] };
        });

        
        if(game.prisonState.auctionWinnerId) { // Closed Auction Results
            const winnerResult = aiResults.find(r => r.playerId === game.prisonState!.auctionWinnerId);
            const winnerIndex = updatedPlayers.findIndex(p => p.id === game.prisonState!.auctionWinnerId)!;
            const winner = updatedPlayers[winnerIndex];
            const bidAmount = game.prisonState?.highestBid || 0;
            const isSuccess = winnerResult && winnerResult.score >= bidAmount;
            
            if (isSuccess) {
                lastRoundMessage = `نجح ${winner.name} في تحقيق المزايدة!`;
                roundScores[winner.id]!.points += 2;
                roundScores[winner.id]!.breakdown.push({ reason: 'فوز بالمزاد', points: 2 });
                lastRoundWinnerId = winner.id;
                // Free the winner if they were in prison
                if (winner.status === 'in_prison') {
                    updatedPlayers[winnerIndex].status = 'alive';
                    freedPlayerName = winner.name;
                    lastRoundMessage += ` وتم تحريره من السجن!`;
                }
            } else {
                lastRoundMessage = `فشل ${winner.name} في تحقيق المزايدة وسيدخل السجن.`;
                 if (winnerIndex !== -1) {
                    updatedPlayers[winnerIndex].status = 'in_prison';
                 }
            }
            contestants.forEach(p => {
                if (p.id !== game.prisonState?.auctionWinnerId) {
                    roundScores[p.id]!.points += 1;
                    roundScores[p.id]!.breakdown.push({ reason: 'نجاة', points: 1 });
                }
            });

        } else { // Open Auction Results
            const correctCounts = aiResults.map(res => ({
                playerId: res.playerId,
                count: res.score,
            }));
            
            if (correctCounts.length > 0) {
                const scoresList = correctCounts.map(c => c.count);
                const maxScore = Math.max(...scoresList);
                const minScore = Math.min(...scoresList);
                
                const winners = correctCounts.filter(c => c.count === maxScore);
                const losers = correctCounts.filter(c => c.count === minScore);
                
                if (winners.length > 0 && (scoresList.length === 1 || maxScore > minScore)) {
                    const winnerId = winners[0].playerId;
                    const winnerIndex = updatedPlayers.findIndex(p => p.id === winnerId)!;
                    const winnerPlayer = updatedPlayers[winnerIndex];
                    
                    if (winnerPlayer) {
                        roundScores[winnerId]!.points += 2;
                        roundScores[winnerId]!.breakdown.push({ reason: 'أداء متميز', points: 2 });
                        lastRoundWinnerId = winnerId;
                        
                        lastRoundMessage = `${winnerPlayer.name} هو الفائز في المزاد المفتوح!`;
                        
                        if (winnerPlayer.status === 'in_prison') {
                            updatedPlayers[winnerIndex].status = 'alive';
                            freedPlayerName = winnerPlayer.name;
                            lastRoundMessage += ` وتم تحريره من السجن!`;
                        } else {
                            roundScores[winnerId]!.points += 1;
                            roundScores[winnerId]!.breakdown.push({ reason: 'مكافأة الحرية', points: 1 });
                        }
                    }
                }

                 if (losers.length === 1 && maxScore > minScore) {
                    const loserId = losers[0].playerId;
                    const loserIndex = updatedPlayers.findIndex(p => p.id === loserId);
                    if (loserIndex !== -1 && updatedPlayers[loserIndex].status === 'alive') {
                       updatedPlayers[loserIndex].status = 'in_prison';
                       const loserPlayer = updatedPlayers[loserIndex];
                       lastRoundMessage += ` بينما فشل ${loserPlayer.name} وسيدخل السجن.`;
                       // The loser gets 0 points for the round
                        roundScores[loserId]!.points = 0;
                        roundScores[loserId]!.breakdown = [];
                    }
                }
                
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

        const lastRoundResult: Partial<Game['prisonState']['lastRoundResult']> = {
            message: lastRoundMessage,
            points: roundScores,
        };

        if (freedPlayerName) {
            lastRoundResult.freedPlayerName = freedPlayerName;
        }
       
        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: 'results',
            'prisonState.lastRoundResult': lastRoundResult,
            'prisonState.lastRoundWinnerId': lastRoundWinnerId,
            'prisonState.timerEndsAt': deleteField(),
        });
     });
}

export async function submitBid(gameId: string, playerId: string, amount: number, changeQuestion: boolean = false): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.gameState !== 'closed_auction_bidding') return;

            const player = game.players.find(p => p.id === playerId);
            if (!player || (player.status !== 'alive' && player.status !== 'in_prison')) {
                throw new Error("لا يمكنك المشاركة في هذا المزاد.");
            }

            if (changeQuestion) {
                const usedChangers = game.prisonState?.questionChangersUsedBy || [];
                if (usedChangers.includes(playerId)) {
                    throw new Error("لقد استخدمت ميزة تغيير السؤال بالفعل.");
                }

                const q = query(collection(db, "prison_questions"));
                const querySnapshot = await getDocs(q);
                const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
                const newQuestion = questions[Math.floor(Math.random() * questions.length)];

                transaction.update(gameRef, {
                    'prisonState.closedAuctionQuestion': newQuestion,
                    'prisonState.bids': {},
                    'prisonState.highestBid': 0,
                    'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + (game.prisonState?.settings?.biddingTime || 30) * 1000),
                    'prisonState.questionChangersUsedBy': [...usedChangers, playerId],
                    'prisonState.lastRoundResult.message': `${player.name} قام بتغيير السؤال!`,
                });
                return;
            }

            const highestBid = game.prisonState?.highestBid || 0;
            if (isNaN(amount) || amount <= highestBid) {
                throw new Error(`يجب أن تكون مزايدتك أعلى من ${highestBid}.`);
            }
            
            const newBids = { ...(game.prisonState?.bids || {}), [playerId]: amount };
            const newHighestBid = Math.max(highestBid, amount);
            
            transaction.update(gameRef, {
                'prisonState.bids': newBids,
                'prisonState.highestBid': newHighestBid,
            });
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
            
            transaction.update(gameRef, { 
                'prisonState.openAuctionSubmissions': { [playerId]: answers },
                gameState: 'judging',
                 'prisonState.judgingStarted': true,
                'prisonState.timerEndsAt': null,
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
        const newScores = { ...(game.playerScores || {}) };
        let executedPlayer: Player | undefined = undefined;

        updatedPlayers.forEach(p => {
             if (!newPrisonHistory[p.id]) { // Initialize if player left and rejoined.
                 newPrisonHistory[p.id] = { inPrison: 0, roundsWithoutWinningAuction: 0 };
             }
             if (p.status === 'alive') {
                const isWinnerThisRound = game.prisonState?.lastRoundWinnerId === p.id;
                if (isWinnerThisRound) {
                    newPrisonHistory[p.id].roundsWithoutWinningAuction = 0;
                } else {
                    newPrisonHistory[p.id].roundsWithoutWinningAuction = (newPrisonHistory[p.id].roundsWithoutWinningAuction || 0) + 1;
                }
             } else { 
                 newPrisonHistory[p.id].roundsWithoutWinningAuction = 0;
             }
        });
        
        updatedPlayers = updatedPlayers.map(p => {
             if (p.status === 'alive' && newPrisonHistory[p.id].roundsWithoutWinningAuction >= 4) {
                 newPrisonHistory[p.id].inPrison = 1;
                 newPrisonHistory[p.id].roundsWithoutWinningAuction = 0;
                 return { ...p, status: 'in_prison' };
             }
             return p;
        });

        updatedPlayers.forEach(p => {
            if (p.status === 'in_prison') {
                 newPrisonHistory[p.id].inPrison = (newPrisonHistory[p.id].inPrison || 0) + 1;
                 newScores[p.id] = (newScores[p.id] || 0) - (p.id === executedPlayer?.id ? 0 : 1);
            } else {
                 newPrisonHistory[p.id].inPrison = 0;
            }
        });
        
        updatedPlayers = updatedPlayers.map(p => {
            if (p.status === 'in_prison' && newPrisonHistory[p.id]?.inPrison >= 4) {
                executedPlayer = p;
                return { ...p, status: 'executed' };
            }
            return p;
        });
        
        const currentRound = game.round || 0;
        const totalRounds = game.prisonState?.settings?.rounds || 10;
        
        const remainingContestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'executed');
        if (currentRound >= totalRounds || remainingContestants.length < 2) {
            let message = "انتهت اللعبة ";
            if (currentRound >= totalRounds) {
                message += "ببلوغ الحد الأقصى للجولات."
            } else {
                message += "لعدم وجود عدد كافٍ من المتنافسين."
            }
            transaction.update(gameRef, { 
                gameState: 'final_results', 
                players: updatedPlayers,
                gameResult: { winner: 'judge_left', message },
            });
            return;
        }
        
        const playersInPrisonCount = updatedPlayers.filter(p => p.status === 'in_prison').length;
        const playersOutsidePrisonCount = updatedPlayers.filter(p => p.status === 'alive').length;

        let nextGameState: 'open_auction' | 'closed_auction_bidding';
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
        
        const lastRoundResult: Partial<Game['prisonState']['lastRoundResult']> = {};
        if (executedPlayer) {
            lastRoundResult.executedPlayerName = executedPlayer.name;
            lastRoundResult.executedPlayerAvatarId = executedPlayer.avatarId;
        }
        
        const freedPlayer = game.prisonState?.lastRoundResult?.freedPlayerName
        if (freedPlayer) {
            lastRoundResult.freedPlayerName = freedPlayer
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            playerScores: newScores,
            gameState: nextGameState,
            round: currentRound + 1,
            'prisonState.prisonHistory': newPrisonHistory,
            'prisonState.currentQuestion': nextGameState === 'open_auction' ? randomQuestion : deleteField(),
            'prisonState.closedAuctionQuestion': nextGameState === 'closed_auction_bidding' ? randomQuestion : deleteField(),
            'prisonState.openAuctionSubmissions': {},
            'prisonState.playerProgress': {},
            'prisonState.aiJudgeResults': [],
            'prisonState.bids': {},
            'prisonState.withdrawnBidders': [],
            'prisonState.highestBid': 0,
            'prisonState.auctionWinnerId': deleteField(),
            'prisonState.lastRoundWinnerId': deleteField(),
            'prisonState.lastRoundResult': lastRoundResult,
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + timerDuration * 1000),
        });
    });
}

export async function requestRejudge(gameId: string, playerId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            if (game.gameState !== 'judging') throw new Error("لا يمكن طلب إعادة التقييم الآن.");
            if (game.prisonState?.activeRejudgeRequest) throw new Error("إعادة التقييم جارية بالفعل.");

            const player = game.players.find(p => p.id === playerId);
            if (!player) throw new Error("Player not found.");

            const usedRejudge = (game.prisonState?.rejudgeRequestsUsedBy || []).includes(playerId);
            if (usedRejudge) {
                throw new Error("لقد استخدمت فرصة إعادة التقييم الخاصة بك بالفعل.");
            }
            
            const newRequest = { playerId, name: player.name, reason };
            
            transaction.update(gameRef, {
                'prisonState.activeRejudgeRequest': newRequest,
                'prisonState.rejudgeRequestsUsedBy': [...(game.prisonState?.rejudgeRequestsUsedBy || []), playerId],
                'prisonState.aiJudgeResults': [], // Clear previous results to trigger rejudging
                'gameState': 'rejudging', // New state to indicate re-evaluation
            });
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists()) throw new Error('Game not found');
      const game = gameDoc.data() as Game;
      if (game.hostId !== hostId) return; // Only host should trigger this
      
      // Check if timer has actually expired to prevent premature calls
      if (!game.prisonState?.timerEndsAt || Date.now() < game.prisonState.timerEndsAt.toMillis()) {
        return; 
      }

      if (game.gameState === 'open_auction') {
        const activePlayers = game.players.filter((p) => p.status !== 'executed' && p.status !== 'left');
        const submissions = game.prisonState?.openAuctionSubmissions || {};
        
        activePlayers.forEach((p) => {
          if (!submissions.hasOwnProperty(p.id)) {
            // Submit the player's last known progress instead of an empty array
            const savedAnswers = game.prisonState?.playerProgress?.[p.id]?.answers || [];
            submissions[p.id] = savedAnswers;
          }
        });

        transaction.update(gameRef, {
          'prisonState.openAuctionSubmissions': submissions,
          gameState: 'judging',
          'prisonState.judgingStarted': true,
          'prisonState.timerEndsAt': null,
        });

      } else if (game.gameState === 'closed_auction_bidding') {
        const activePlayers = game.players.filter((p) => p.status === 'alive' || p.status === 'in_prison');
        const bids = game.prisonState?.bids || {};
        const withdrawnBidders = game.prisonState?.withdrawnBidders || [];

        activePlayers.forEach((p) => {
          if (!bids[p.id]) {
            if (!withdrawnBidders.includes(p.id)) {
                withdrawnBidders.push(p.id);
            }
          }
        });
        
        const finalBids = Object.entries(bids);
        if (finalBids.length === 0) {
          transaction.update(gameRef, {
            gameState: 'results',
            'prisonState.lastRoundResult': { message: 'انتهى المزاد بانسحاب الجميع أو عدم وجود مزايدات.' },
            'prisonState.timerEndsAt': null,
          });
          return;
        }

        const sortedBids = finalBids.sort((a, b) => b[1] - a[1]);
        const winnerId = sortedBids[0][0];
        const answeringTime = game.prisonState?.settings?.answeringTime || 45;

        transaction.update(gameRef, {
            gameState: 'closed_auction_answering',
            'prisonState.auctionWinnerId': winnerId,
            'prisonState.withdrawnBidders': withdrawnBidders,
            'prisonState.timerEndsAt': Timestamp.fromMillis(Date.now() + answeringTime * 1000),
        });

      } else if (game.gameState === 'closed_auction_answering') {
        const winnerId = game.prisonState?.auctionWinnerId;
        if (!winnerId) return;
        
        // The winner timed out, so they failed the auction. Submit their saved progress.
        const savedAnswers = game.prisonState?.playerProgress?.[winnerId]?.answers || [];

        transaction.update(gameRef, {
          'prisonState.openAuctionSubmissions': { [winnerId]: savedAnswers }, 
          gameState: 'judging',
          'prisonState.judgingStarted': true,
          'prisonState.timerEndsAt': null,
        });
      }
    });
  } catch (error) {
    console.error(`Error handling timeout for game ${gameId}:`, error);
  }
}
