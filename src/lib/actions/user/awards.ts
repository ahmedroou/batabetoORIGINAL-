

import type { Game, SocialRank } from '@/types';
import { getRanks } from './queries';


/**
 * A pure function for testability. It calculates the updates needed for players at the end of a game.
 * @param game The final game state object.
 * @param allRanks All social ranks available in the game, to avoid re-fetching.
 * @returns An object containing the necessary updates.
 */
export function calculateEndOfGameAwards(game: Game, allRanks: SocialRank[]) {
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
    
    const educatedMerchantAwardTiers = [
        { leaderboardPoints: 4, coins: 3 }, // 1st place
        { leaderboardPoints: 2, coins: 1 }, // 2nd place
        { leaderboardPoints: 1, coins: 1 }, // 3rd place
    ];

    const updates: Record<string, { leaderboardPoints: number, coins: number, gamesPlayed: Record<string, number>, challengePoints?: number, permissions?: string[] }> = {};
    let winUpdate: { userId: string; gameType: Game['gameType']; } | null = null;
    let specialAwards: Game['trapAnswerState']['finalAwards'] = {};
    
    const isTeamGame = ['red', 'blue', 'good', 'mafia'].includes(game.gameResult?.winner || '');
    const isShortTrapAnswerGame = game.gameType === 'trap-answer' && (game.trapAnswerState?.settings?.rounds || 10) <= 7;
    const isEducatedMerchantGame = game.gameType === 'educated-merchant';

    
    if (isTeamGame) {
        // Team-based awards
        const winningTeam = game.gameResult!.winner;
        playersToUpdate.forEach(player => {
            const points = player.team === winningTeam ? 3 : 0;
            updates[player.id] = { 
                leaderboardPoints: points, 
                coins: player.team === winningTeam ? 2 : 0, 
                gamesPlayed: { [game.gameType]: 1 },
                challengePoints: points,
            };
        });
    } else {
        // Individual awards
        const playerRanks: { id: string, rank: number }[] = [];
        let currentRank = 0;
        let lastScore = -Infinity;
        
        sortedPlayers.forEach((player, index) => {
             const score = finalScores[player.id] || 0;
             if (score !== lastScore) {
                currentRank = index + 1;
            } else if (index === 0) { // First player always gets rank 1
                currentRank = 1;
            }
            playerRanks.push({ id: player.id, rank: currentRank });
            lastScore = score;
        });
        
        playerRanks.forEach(({ id, rank }) => {
            let playerAwards = { leaderboardPoints: 0, coins: 0, challengePoints: 0 };
            
            if (isEducatedMerchantGame) {
                const tier = (rank - 1) < educatedMerchantAwardTiers.length ? educatedMerchantAwardTiers[rank-1] : { leaderboardPoints: 0, coins: 0 };
                playerAwards = { ...tier, challengePoints: tier.leaderboardPoints };
            } else if (!isShortTrapAnswerGame) {
                 const tier = (rank - 1) < awardTiers.length ? awardTiers[rank-1] : { leaderboardPoints: 0, coins: 0 };
                 playerAwards = { ...tier, challengePoints: tier.leaderboardPoints };
            }
            updates[id] = { ...playerAwards, gamesPlayed: { [game.gameType]: 1 } };
        });

        if (playerRanks.length > 0 && playerRanks[0].rank === 1) {
            const firstPlaceScore = finalScores[playerRanks[0].id] || 0;
            const winners = sortedPlayers.filter(p => (finalScores[p.id] || 0) === firstPlaceScore);
            if (winners.length === 1) {
                winUpdate = { userId: playerRanks[0].id, gameType: game.gameType };
            }
        }
    }

    if (game.gameType === 'trap-answer') {
        let deceivedFool: Game['trapAnswerState']['finalAwards']['deceivedFool'] = null;
        let cunningDeceiver: Game['trapAnswerState']['finalAwards']['cunningDeceiver'] = null;

        const trickStats = game.trapAnswerState?.trickStats || { trickedBy: {}, trickedOthers: {} };

        if (Object.keys(trickStats.trickedOthers).length > 0) {
            const deceiverCandidates = Object.entries(trickStats.trickedOthers).sort((a, b) => b[1].length - a[1].length);
            if (deceiverCandidates.length > 0) {
                const deceiverId = deceiverCandidates[0][0];
                const deceiverPlayer = game.players.find(p => p.id === deceiverId);
                if (deceiverPlayer) {
                    cunningDeceiver = { playerId: deceiverId, name: deceiverPlayer.name, avatarId: deceiverPlayer.avatarId, count: trickStats.trickedOthers[deceiverId]!.length };
                    if (updates[deceiverId]) {
                        updates[deceiverId].leaderboardPoints += 1;
                        updates[deceiverId].challengePoints = (updates[deceiverId].challengePoints || 0) + 1;
                    } else {
                        updates[deceiverId] = { leaderboardPoints: 1, coins: 0, gamesPlayed: { [game.gameType]: 1 }, challengePoints: 1 };
                    }
                }
            }
        }
        
        if (Object.keys(trickStats.trickedBy).length > 0) {
            const foolCandidates = Object.entries(trickStats.trickedBy).sort((a, b) => b[1].length - a[1].length);
            if (foolCandidates.length > 0) {
                const foolId = foolCandidates[0][0];
                const foolPlayer = game.players.find(p => p.id === foolId);
                if (foolPlayer) {
                    deceivedFool = { playerId: foolId, name: foolPlayer.name, avatarId: foolPlayer.avatarId, count: trickStats.trickedBy[foolId]!.length };
                }
            }
        }
        
        specialAwards = { cunningDeceiver, deceivedFool };
    }

    // --- New Permissions Calculation ---
    // This part is crucial for the optimization.
    const getRank = (points: number) => {
        const sortedRanks = [...allRanks].sort((a,b) => b.threshold - a.threshold);
        for (const rank of sortedRanks) {
            if (points >= rank.threshold) return rank;
        }
        return sortedRanks[sortedRanks.length - 1] || null;
    };

    Object.keys(updates).forEach(playerId => {
        const player = playersToUpdate.find(p => p.id === playerId);
        if (player) {
            const currentPoints = finalScores[playerId] || 0;
            const awardedPoints = updates[playerId].leaderboardPoints || 0;
            const newTotalPoints = currentPoints + awardedPoints;
            const newRank = getRank(newTotalPoints);
            if (newRank) {
                updates[playerId].permissions = newRank.permissions;
            }
        }
    });

    return { updates, winUpdate, specialAwards };
}
