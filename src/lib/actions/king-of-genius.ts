

'use client';

import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import type { Game, ChallengeResult, Player } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';

export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const currentGame = gameDoc.data() as Game;

        const activePlayers = currentGame.players.filter(p => p.status === 'alive');
        const teamAPlayers = activePlayers.filter(p => p.team === 'A');
        const teamBPlayers = activePlayers.filter(p => p.team === 'B');
        const maxTeamSize = Math.ceil(activePlayers.length / 2);

        if (team === 'A' && teamAPlayers.length >= maxTeamSize) throw new Error("الفريق الأزرق ممتلئ.");
        if (team === 'B' && teamBPlayers.length >= maxTeamSize) throw new Error("الفريق الأحمر ممتلئ.");

        const playerIndex = currentGame.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found.");
        
        const updatedPlayers = [...currentGame.players];
        updatedPlayers[playerIndex].team = team;
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

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

        transaction.update(gameRef, {
            gameState: 'challenge_intro',
            challengeOrder,
            currentChallengeIndex: 0,
            teamScores: { A: 0, B: 0 },
            challengeState: null,
        });
    });
}

export async function submitChallengeResult(gameId: string, playerId: string, result: Omit<ChallengeResult, 'playerId' | 'team'>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'challenge_active') return;

        const player = game.players.find(p => p.id === playerId);
        if (!player || !player.team) throw new Error("Player or team not found");
        
        let challengeState = game.challengeState || { results: [] };
        if (challengeState.results.some((r: any) => r.playerId === playerId)) return; 
        
        const fullResult: ChallengeResult = { playerId, team: player.team, ...result };
        challengeState.results = [...(challengeState.results || []), fullResult];
        
        const activePlayers = game.players.filter(p => p.status === 'alive');
        
        if (challengeState.results.length >= activePlayers.length) {
            const teamAPlayersCount = activePlayers.filter(p => p.team === 'A').length;
            const teamBPlayersCount = activePlayers.filter(p => p.team === 'B').length;

            const sortedResults = challengeState.results
                .filter((r: ChallengeResult) => r.isCorrect)
                .sort((a: ChallengeResult, b: ChallengeResult) => a.time - b.time);
            
            const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };

            sortedResults.forEach((res: ChallengeResult, index: number) => {
                const teamSize = (res.team === 'A' ? teamAPlayersCount : teamBPlayersCount) || 1;
                const points = Math.max(0, teamSize - index);
                if (points > 0) {
                    newScores[res.team] = (newScores[res.team] || 0) + points;
                }
            });
            
            transaction.update(gameRef, { 
                challengeState,
                teamScores: newScores,
                gameState: 'challenge_results',
            });
        } else {
            transaction.update(gameRef, { challengeState });
        }
    });
}

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
                message = "الفريق الأزرق يسحق الفريق الأحمر!";
            } else if (teamBScore > teamAScore) {
                winner = 'الفريق الأحمر';
                message = "الفريق الأحمر يتغلب على الفريق الأزرق!";
            }

            transaction.update(gameRef, { 
                gameState: 'final_results',
                gameResult: { winner, message }
            });
        } else {
            transaction.update(gameRef, {
                currentChallengeIndex: nextIndex,
                gameState: 'challenge_intro',
                challengeState: null,
            });
        }
    });
}
