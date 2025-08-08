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
        { points: 3, coins: 2 }, // 1st place
        { points: 2, coins: 1 }, // 2nd place
        { points: 1, coins: 0 }, // 3rd place
    ];

    const updates: Record<string, { leaderboardPoints: number, coins: number, gamesPlayed: number }> = {};
    let winUpdate: { userId: string; gameType: Game['gameType']; } | null = null;
    
    const isTeamGame = ['red', 'blue', 'good', 'mafia'].includes(game.gameResult?.winner || '');
    
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
        // Win counts for team games are handled separately if needed, maybe for each member.
        // For simplicity, we can say the 'win' is for the team, not individual stats, unless specified.
    } else {
        // Individual awards
        const playerRanks: { id: string, rank: number }[] = [];
        let currentRank = 0;
        let lastScore = -Infinity;
        sortedPlayers.forEach(player => {
            if ((finalScores[player.id] || 0) !== lastScore) {
                currentRank = playerRanks.length + 1;
            }
            playerRanks.push({ id: player.id, rank: currentRank });
            lastScore = finalScores[player.id] || 0;
        });
        
        playerRanks.forEach(({ id, rank }) => {
            const playerAwards = (rank - 1) < awardTiers.length ? awardTiers[rank-1] : { points: 0, coins: 0 };
             updates[id] = { ...playerAwards, gamesPlayed: 1 };
        });

        if (playerRanks.length > 0 && playerRanks[0].rank === 1) {
            // Check if there is a single winner or a tie for first place
            const firstPlaceScore = finalScores[playerRanks[0].id] || 0;
            const winners = sortedPlayers.filter(p => (finalScores[p.id] || 0) === firstPlaceScore);
            if (winners.length === 1) {
                winUpdate = { userId: playerRanks[0].id, gameType: game.gameType };
            }
        }
    }

    return { updates, winUpdate };
}
