
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, updateDoc } from 'firebase/firestore';
import type { Game, ChallengeResult, Player } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';

export async function startKingOfGeniusGame(gameId: string, hostId: string) {
    const gameRef = doc(db, "games", gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can start the game.");
        }
        if (game.gameType !== 'king-of-genius' || game.gameState !== 'lobby') {
            return;
        }

        transaction.update(gameRef, { gameState: 'instructions' });
    });
}

export async function progressToTeamSelection(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can proceed.");
        }
        if (game.gameState !== 'instructions') {
            return;
        }

        transaction.update(gameRef, { gameState: 'team_selection' });
    });
}


// تسمح للاعب باختيار فريق (A أو B)
export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const currentGame = gameDoc.data() as Game;

        const activePlayers = currentGame.players.filter(p => p.status === 'alive');
        const teamAPlayers = activePlayers.filter(p => p.team === 'A');
        const teamBPlayers = activePlayers.filter(p => p.team === 'B');
        const maxTeamSize = 3; 

        if (team === 'A' && teamAPlayers.length >= maxTeamSize && !teamAPlayers.some(p => p.id === playerId)) {
            throw new Error("الفريق الأزرق ممتلئ.");
        }
        if (team === 'B' && teamBPlayers.length >= maxTeamSize && !teamBPlayers.some(p => p.id === playerId)) {
            throw new Error("الفريق الوردي ممتلئ.");
        }

        const playerIndex = currentGame.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found.");
        
        const updatedPlayers = [...currentGame.players];
        updatedPlayers[playerIndex].team = team;
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

// تبدأ اللعبة وتعد التحدي الأول
export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can start the game.");

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (activePlayers.some(p => !p.team)) throw new Error("يجب على جميع اللاعبين اختيار فريق أولاً.");
        
        const teamA = activePlayers.filter(p => p.team === 'A');
        const teamB = activePlayers.filter(p => p.team === 'B');
        if (teamA.length !== teamB.length) throw new Error("يجب أن تكون الفرق متوازنة.");
        if (teamA.length === 0) throw new Error("لا يمكن بدء اللعبة بفرق فارغة.");

        const shuffledChallenges = [...GENIUS_CHALLENGES].sort(() => 0.5 - Math.random());
        const challengeOrder = shuffledChallenges.map(c => c.id);
        const firstChallengeId = challengeOrder[0];
        const { puzzle } = await generateGeniusChallenge({ challengeId: firstChallengeId });

        transaction.update(gameRef, {
            gameState: 'challenge_intro',
            challengeOrder,
            currentChallengeIndex: 0,
            teamScores: { A: 0, B: 0 },
            challengeState: { puzzle, results: [] },
        });
    });
}

// إرسال نتيجة اللاعب لتحدي معين
export async function submitChallengeResult(gameId: string, playerId: string, result: Omit<ChallengeResult, 'playerId' | 'team'>) {
    const gameRef = doc(db, 'games', gameId);

    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;
        
        if (game.gameState !== 'challenge_active') return;

        const player = game.players.find(p => p.id === playerId);
        if (!player?.team) return;

        let currentResults = game.challengeState?.results || [];
        if (currentResults.some(r => r.playerId === playerId)) return;
        
        const newResult: ChallengeResult = { playerId, team: player.team, ...result };
        
        // Use a field update to avoid race conditions
        const newResultsArray = [...currentResults, newResult];
        
        transaction.update(gameRef, { 'challengeState.results': newResultsArray });

        // Re-read the game data after the initial update to get the most current state
        const updatedGameDoc = await transaction.get(gameRef);
        const updatedGame = updatedGameDoc.data() as Game;
        const finalResults = updatedGame.challengeState?.results || [];
        const activePlayersCount = updatedGame.players.filter(p => p.status === 'alive').length;

        if (finalResults.length >= activePlayersCount) {
            const sortedCorrectResults = finalResults
                .filter(r => r.isCorrect)
                .sort((a, b) => a.time - b.time);
            
            const pointsMap = [10, 5, 3, 1];
            const newScores = { ...(updatedGame.teamScores || { A: 0, B: 0 }) };
            
            sortedCorrectResults.forEach((res, index) => {
                const points = pointsMap[index] || 0;
                if (points > 0) {
                    newScores[res.team] = (newScores[res.team] || 0) + points;
                }
            });

            transaction.update(gameRef, {
                teamScores: newScores,
                gameState: 'challenge_results'
            });
        }
    });
}


// الانتقال إلى التحدي التالي أو إنهاء اللعبة
export async function nextChallenge(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can proceed.");

        const nextIndex = (game.currentChallengeIndex || 0) + 1;
        
        if (nextIndex >= (game.challengeOrder?.length || 0)) {
            let winner: Game['gameResult']['winner'] = 'تعادل';
            let message = "انتهت المواجهة بالتعادل!";
            const teamAScore = game.teamScores?.A || 0;
            const teamBScore = game.teamScores?.B || 0;

            if (teamAScore > teamBScore) {
                winner = 'الفريق الأزرق';
                message = "الفريق الأزرق يسحق الفريق الوردي!";
            } else if (teamBScore > teamAScore) {
                winner = 'الفريق الأحمر';
                message = "الفريق الوردي يتغلب على الفريق الأزرق!";
            }

            transaction.update(gameRef, { 
                gameState: 'final_results',
                gameResult: { winner, message }
            });
        } else {
            const nextChallengeId = game.challengeOrder?.[nextIndex];
            if (!nextChallengeId) throw new Error("Challenge not found in order list.");
            
            const { puzzle } = await generateGeniusChallenge({ challengeId: nextChallengeId });
            
            transaction.update(gameRef, {
                currentChallengeIndex: nextIndex,
                gameState: 'challenge_intro',
                challengeState: { puzzle, results: [] },
            });
        }
    });
}
