
import type { Game, SocialRank, PermissionId } from '@/types';


/**
 * A pure function for testability. It calculates the updates needed for players at the end of a game.
 * @param game The final game state object.
 * @param allRanks All social ranks available in the game, to avoid re-fetching.
 * @returns An object containing the necessary updates.
 */
export function calculateEndOfGameAwards(game: Game, allRanks: SocialRank[]) {
    const finalScores = game.playerScores || {};
    // This now correctly gets all player IDs from the game object itself.
    const playerIdsInGame = game.players.map(p => p.id);

    const updates: Record<string, { leaderboardPoints: number, coins: number, gamesPlayed: Record<string, number>, challengePoints?: number, permissions?: PermissionId[] }> = {};
    
    // Initialize updates for all players in the game.
    playerIdsInGame.forEach(pid => {
        updates[pid] = {
            leaderboardPoints: 0,
            coins: 0,
            gamesPlayed: { [game.gameType]: 1 },
            challengePoints: 0,
        };
    });

    let winUpdate: { userId: string; gameType: Game['gameType']; } | null = null;
    let specialAwards: Game['trapAnswerState']['finalAwards'] = {};
    
    const isTeamGame = ['red', 'blue', 'good', 'mafia'].includes(game.gameResult?.winner || '');
    
    // Check for short game condition safely
    const trapState = game.trapAnswerState;
    const isShortTrapAnswerGame = game.gameType === 'trap-answer' && (trapState?.settings?.rounds ?? 10) < 2;


    const isEducatedMerchantGame = game.gameType === 'educated-merchant';

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

    
    if (isTeamGame) {
        // Team-based awards
        const winningTeam = game.gameResult!.winner;
        game.players.forEach(player => {
            if (!player.team) return;
            const isWinner = player.team === winningTeam;
            const points = isWinner ? 3 : 0;
            updates[player.id].leaderboardPoints = points;
            updates[player.id].coins = isWinner ? 2 : 0;
            updates[player.id].challengePoints = points;
        });
    } else if (!isShortTrapAnswerGame) { // Awards for non-short individual games
        // Individual awards
        const sortedPlayerIds = Object.keys(finalScores).sort((a, b) => (finalScores[b] || 0) - (finalScores[a] || 0));
        const playerRanks: { id: string, rank: number }[] = [];
        let currentRank = 0;
        let lastScore = Infinity;
        
        sortedPlayerIds.forEach((playerId, index) => {
            const score = finalScores[playerId] || 0;
            if (score < lastScore) {
               currentRank = index + 1;
            }
            playerRanks.push({ id: playerId, rank: currentRank });
            lastScore = score;
        });
        
        playerRanks.forEach(({ id, rank }) => {
            let playerAwards = { leaderboardPoints: 0, coins: 0, challengePoints: 0 };
            
            if (isEducatedMerchantGame) {
                const tier = (rank - 1) < educatedMerchantAwardTiers.length ? educatedMerchantAwardTiers[rank - 1] : null;
                if(tier) playerAwards = { ...tier, challengePoints: tier.leaderboardPoints };
            } else {
                const tier = (rank - 1) < awardTiers.length ? awardTiers[rank - 1] : null;
                if(tier) playerAwards = { ...tier, challengePoints: tier.leaderboardPoints };
            }
            
            if (updates[id]) {
              updates[id].leaderboardPoints = playerAwards.leaderboardPoints;
              updates[id].coins = playerAwards.coins;
              updates[id].challengePoints = playerAwards.challengePoints;
            }
        });

        if (playerRanks.length > 0 && playerRanks[0].rank === 1) {
            const firstPlaceScore = finalScores[playerRanks[0].id] || 0;
            const winners = sortedPlayerIds.filter(pid => (finalScores[pid] || 0) === firstPlaceScore);
            if (winners.length === 1) {
                winUpdate = { userId: playerRanks[0].id, gameType: game.gameType };
            }
        }
    }

    if (game.gameType === 'trap-answer' && trapState) {
        let deceivedFool: Game['trapAnswerState']['finalAwards']['deceivedFool'] = null;
        let cunningDeceiver: Game['trapAnswerState']['finalAwards']['cunningDeceiver'] = null;

        const trickStats = trapState.trickStats || { trickedBy: {}, trickedOthers: {} };

        if (Object.keys(trickStats.trickedOthers).length > 0) {
            const deceiverCandidates = Object.entries(trickStats.trickedOthers).sort((a, b) => b[1].length - a[1].length);
            if (deceiverCandidates.length > 0 && deceiverCandidates[0][1].length > 0) {
                const deceiverId = deceiverCandidates[0][0];
                const deceiverPlayer = game.players.find(p => p.id === deceiverId);
                if (deceiverPlayer && updates[deceiverId]) {
                    cunningDeceiver = { playerId: deceiverId, name: deceiverPlayer.name, avatarId: deceiverPlayer.avatarId, count: trickStats.trickedOthers[deceiverId]!.length };
                    updates[deceiverId].leaderboardPoints += 1;
                    updates[deceiverId].challengePoints = (updates[deceiverId].challengePoints || 0) + 1;
                }
            }
        }
        
        if (Object.keys(trickStats.trickedBy).length > 0) {
            const foolCandidates = Object.entries(trickStats.trickedBy).sort((a, b) => b[1].length - a[1].length);
            if (foolCandidates.length > 0 && foolCandidates[0][1].length > 0) {
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
        const ranks = allRanks || []; // Fallback to empty array if not provided
        const sortedRanks = [...ranks].sort((a, b) => b.threshold - a.threshold);
        for (const rank of sortedRanks) {
            if (points >= rank.threshold) return rank;
        }
        return sortedRanks.length > 0 ? sortedRanks[sortedRanks.length - 1] : null;
    };


    Object.keys(updates).forEach(playerId => {
        const player = game.players.find(p => p.id === playerId);
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

    return { success: true, data: { updates, winUpdate, specialAwards }};
}
