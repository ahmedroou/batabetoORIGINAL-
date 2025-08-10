

import type { Game } from '@/types';

/**
 * A pure function for testability. It calculates the updates needed for players at the end of a game.
 * @param game The final game state object.
 * @returns An object containing the necessary updates.
 */
export function calculateEndOfGameAwards(game: Game) {
    const finalScores = game.playerScores || {};
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    
    // Sort players by final score
    const sortedPlayers = [...playersToUpdate].sort((a, b) => (finalScores[b.id] || 0) - (finalScores[a.id] || 0));

    // Define awards based on rank
    const awardTiers = [
        { leaderboardPoints: 3, coins: 2 }, // 1st place
        { leaderboardPoints: 2, coins: 1 }, // 2nd place
        { leaderboardPoints: 1, coins: 0 }, // 3rd place
    ];

    const updates: Record<string, { leaderboardPoints: number, coins: number, gamesPlayed: number }> = {};
    let winUpdate: { userId: string; gameType: Game['gameType']; } | null = null;
    let specialAwards: Game['trapAnswerState']['finalAwards'] = {};
    
    const isTeamGame = ['red', 'blue', 'good', 'mafia'].includes(game.gameResult?.winner || '');
    const isShortTrapAnswerGame = game.gameType === 'trap-answer' && (game.trapAnswerState?.settings?.rounds || 10) <= 7;

    
    if (isTeamGame) {
        // Team-based awards
        const winningTeam = game.gameResult!.winner;
        playersToUpdate.forEach(player => {
            if (player.team === winningTeam) {
                updates[player.id] = { leaderboardPoints: 3, coins: 2, gamesPlayed: 1 };
            } else {
                updates[player.id] = { leaderboardPoints: 0, coins: 0, gamesPlayed: 1 };
            }
        });
    } else {
        // Individual awards
        const playerRanks: { id: string, rank: number }[] = [];
        let currentRank = 0;
        let lastScore = -Infinity;
        sortedPlayers.forEach((player, index) => {
             if ((finalScores[player.id] || 0) < lastScore) {
                currentRank = index + 1;
            } else if (lastScore === -Infinity) {
                currentRank = 1;
            }
            playerRanks.push({ id: player.id, rank: currentRank });
            lastScore = finalScores[player.id] || 0;
        });
        
        playerRanks.forEach(({ id, rank }) => {
            let playerAwards = { leaderboardPoints: 0, coins: 0 };
            // Only give standard awards if it's not a short trap-answer game
            if (!isShortTrapAnswerGame) {
                 playerAwards = (rank - 1) < awardTiers.length ? awardTiers[rank-1] : { leaderboardPoints: 0, coins: 0 };
            }
            updates[id] = { ...playerAwards, gamesPlayed: 1 };
        });

        // The winner is determined regardless of game length, but awards are not given for short games
        if (playerRanks.length > 0 && playerRanks[0].rank === 1) {
            const firstPlaceScore = finalScores[playerRanks[0].id] || 0;
            const winners = sortedPlayers.filter(p => (finalScores[p.id] || 0) === firstPlaceScore);
            if (winners.length === 1) {
                winUpdate = { userId: playerRanks[0].id, gameType: game.gameType };
            }
        }
    }

    // Handle special awards for Trap Answer game
    if (game.gameType === 'trap-answer') {
        let deceivedFool: Game['trapAnswerState']['finalAwards']['deceivedFool'] = null;
        let cunningDeceiver: Game['trapAnswerState']['finalAwards']['cunningDeceiver'] = null;

        const trickStats = game.trapAnswerState?.trickStats || { trickedBy: {}, trickedOthers: {} };

        // Cunning Deceiver
        if (Object.keys(trickStats.trickedOthers).length > 0) {
            const deceiverCandidates = Object.entries(trickStats.trickedOthers).sort((a, b) => b[1].length - a[1].length);
            if (deceiverCandidates.length > 0) {
                const deceiverId = deceiverCandidates[0][0];
                const deceiverPlayer = game.players.find(p => p.id === deceiverId);
                if (deceiverPlayer) {
                    cunningDeceiver = { playerId: deceiverId, name: deceiverPlayer.name, avatarId: deceiverPlayer.avatarId, count: trickStats.trickedOthers[deceiverId].length };
                    if (updates[deceiverId]) {
                        updates[deceiverId].leaderboardPoints += 1;
                    } else {
                        updates[deceiverId] = { leaderboardPoints: 1, coins: 0, gamesPlayed: 1 };
                    }
                }
            }
        }
        
        // Deceived Fool
        if (Object.keys(trickStats.trickedBy).length > 0) {
            const foolCandidates = Object.entries(trickStats.trickedBy).sort((a, b) => b[1].length - a[1].length);
            if (foolCandidates.length > 0) {
                const foolId = foolCandidates[0][0];
                const foolPlayer = game.players.find(p => p.id === foolId);
                if (foolPlayer) {
                    deceivedFool = { playerId: foolId, name: foolPlayer.name, avatarId: foolPlayer.avatarId, count: trickStats.trickedBy[foolId].length };
                }
            }
        }
        
        specialAwards = { cunningDeceiver, deceivedFool };
    }


    return { updates, winUpdate, specialAwards };
}

