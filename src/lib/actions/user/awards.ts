import type { Game, SocialRank, PermissionId } from '@/types';
import { recordGamePointsScoredEvent } from '../events';

/**
 * A pure function for testability. It calculates the updates needed for players at the end of a game.
 * @param game The final game state object.
 * @param allRanks All social ranks available in the game, to avoid re-fetching.
 * @returns An object containing the necessary updates.
 */
export function calculateEndOfGameAwards(game: Game, allRanks: SocialRank[]) {
    const finalScores = game.playerScores || {};
    const playerIdsInGame = game.players.map(p => p.id);

    const updates: Record<string, { leaderboardPoints: number, coins: number, gamesPlayed: Record<string, number>, winCounts?: Record<string, number>, challengePoints?: number, permissions?: PermissionId[] }> = {};
    
    playerIdsInGame.forEach(pid => {
        updates[pid] = {
            leaderboardPoints: 0,
            coins: 0,
            gamesPlayed: { [game.gameType]: 1 },
            winCounts: {},
            challengePoints: 0,
        };
    });

    let winUpdate: { userId: string; gameType: Game['gameType']; } | null = null;
    let specialAwards: Game['trapAnswerState']['finalAwards'] | Game['drawAndDeceiveState']['lastRoundResults'] = {};
    
    const isTeamGame = ['red', 'blue', 'good', 'mafia'].includes(game.gameResult?.winner || '');
    
    const trapState = game.trapAnswerState;
    const isShortTrapAnswerGame = game.gameType === 'trap-answer' && (trapState?.settings?.rounds ?? 10) < 2;


    const isEducatedMerchantGame = game.gameType === 'educated-merchant';

    const awardTiers = [
        { leaderboardPoints: 3, coins: 2 },
        { leaderboardPoints: 2, coins: 1 },
        { leaderboardPoints: 1, coins: 0 },
    ];
    
    const educatedMerchantAwardTiers = [
        { leaderboardPoints: 4, coins: 3 },
        { leaderboardPoints: 2, coins: 1 },
        { leaderboardPoints: 1, coins: 1 },
    ];

    
    if (isTeamGame) {
        const winningTeam = game.gameResult!.winner;
        game.players.forEach(player => {
            if (!player.team) return;
            const isWinner = player.team === winningTeam;
            const points = isWinner ? 3 : 0;
            updates[player.id].leaderboardPoints = points;
            updates[player.id].coins = isWinner ? 2 : 0;
            updates[player.id].challengePoints = points;
        });
    } else if (!isShortTrapAnswerGame) { 
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
                if (updates[winUpdate.userId]) {
                    updates[winUpdate.userId].winCounts = { [game.gameType]: 1 };
                }
            }
        }
    }

    if (game.gameType === 'trap-answer' && trapState) {
        let deceivedFool: Game['trapAnswerState']['finalAwards']['deceivedFool'] = null;
        let cunningDeceiver: Game['trapAnswerState']['finalAwards']['cunningDeceiver'] = null;
        const afkStats: Record<string, number> = {};

        if (Array.isArray(trapState.history)) {
            for (const roundHistory of trapState.history) {
                if (Array.isArray(roundHistory.awayPlayerIdsDuringRound)) {
                    for (const afkPlayerId of roundHistory.awayPlayerIdsDuringRound) {
                        afkStats[afkPlayerId] = (afkStats[afkPlayerId] || 0) + 1;
                    }
                }
            }
        }


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
        
        specialAwards = { cunningDeceiver, deceivedFool, afkStats };
    }
    
    if (game.gameType === 'draw-and-deceive') {
        const sortedPlayerIds = Object.keys(finalScores).sort((a, b) => (finalScores[b] || 0) - (finalScores[a] || 0));
        if (sortedPlayerIds.length > 0) {
            const winnerId = sortedPlayerIds[0];
            const winningScore = finalScores[winnerId];
            const winners = sortedPlayerIds.filter(pid => (finalScores[pid] || 0) === winningScore);
            if (winners.length === 1) {
                 winUpdate = { userId: winnerId, gameType: 'draw-and-deceive' };
                 if (updates[winnerId]) {
                    updates[winnerId].winCounts = { 'draw-and-deceive': 1 };
                 }
            }
        }
    }

    // --- Fire off events for any challenge points scored ---
    Object.entries(updates).forEach(([playerId, playerUpdates]) => {
        if (playerUpdates.challengePoints && playerUpdates.challengePoints > 0) {
            // This is a fire-and-forget operation, no need to await it.
            recordGamePointsScoredEvent(playerId, game.gameType, game.id, playerUpdates.challengePoints);
        }
    });


    const getRank = (points: number) => {
        const ranks = allRanks || []; 
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