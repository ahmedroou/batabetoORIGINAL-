
/**
 * @fileoverview This file contains the internal "pure" logic for the Behind the Mask game.
 * These functions are separated to allow for easier testing without mocking database transactions.
 * They should not be called directly from the client.
 */

import type { Game, Player, DayEvent, PrivateEvent, PrivateChat, GameResult, PlayerTeam } from '@/types';
import { ROLES } from '@/data/mafia-roles';

export function checkForWinnerInternal(players: Player[]): Game['gameResult'] | null {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const aliveMafia = alivePlayers.filter(p => p.team === 'mafia');
    const aliveGood = alivePlayers.filter(p => p.team === 'good');
    
    // Stalemate Check: Spy vs Good team (1 vs 1)
    if (alivePlayers.length === 2) {
        const player1 = alivePlayers[0];
        const player2 = alivePlayers[1];
        const isSpyVsGood = (player1.role === 'spy' && player2.team === 'good') || (player2.role === 'spy' && player1.team === 'good');
        if (isSpyVsGood) {
             return { winner: 'draw', message: 'وصلت اللعبة إلى طريق مسدود! لا يمكن للجاسوس القضاء على الفريق الطيب بمفرده.' };
        }
    }

    // Condition 1: Good team wins if all mafia members are eliminated.
    if (aliveMafia.length === 0) {
        return { winner: 'good', message: 'انتصر فريق الخير بعد القضاء على كل الأشرار!' };
    }
    
    // Condition 2: Mafia team wins if their number is strictly greater than the good team's number.
    if (aliveMafia.length > aliveGood.length) {
        return { winner: 'mafia', message: 'انتصرت المافيا بالسيطرة على المدينة!' };
    }
    
    // No winner yet, game continues.
    return null; 
}


export async function processNightInternal(game: Game): Promise<{ updatedPlayers: Player[], newEvents: DayEvent[], newPrivateEvents: Record<string, PrivateEvent[]>, newPrivateChats: Record<string, PrivateChat>, newLastHealedPlayerId: string | null }> {
    const nightActions = game.mafiaState?.nightActions || {};
    let updatedPlayers = JSON.parse(JSON.stringify(game.players)) as Player[];
    const newEvents: DayEvent[] = [];
    const newPrivateEvents: Record<string, PrivateEvent[]> = {};
    const newPrivateChats: Record<string, PrivateChat> = JSON.parse(JSON.stringify(game.mafiaState?.privateChats || {}));

    const addPrivateEvent = (playerId: string, event: PrivateEvent) => {
        if (!newPrivateEvents[playerId]) newPrivateEvents[playerId] = [];
        newPrivateEvents[playerId].push(event);
    };
    
    const healAction = Object.values(nightActions).find(a => a.action === 'heal');
    const killAction = Object.values(nightActions).find(a => a.action === 'kill' && a.targetId !== 'skip');
    
    let newLastHealedPlayerId: string | null = null;
    
    if (healAction?.targetId) {
        newLastHealedPlayerId = healAction.targetId;
    }

    if (killAction && killAction.targetId) {
        const isHealed = healAction?.targetId === killAction.targetId;
        const targetPlayerIndex = updatedPlayers.findIndex((p: Player) => p.id === killAction.targetId);
        
        if (targetPlayerIndex !== -1 && updatedPlayers[targetPlayerIndex].status === 'alive') {
            if (isHealed) {
                newEvents.push({ type: 'protection', message: `تم إنقاذ أحد اللاعبين الليلة الماضية!` });
                const protectedPlayer = updatedPlayers.find((p: Player) => p.id === healAction!.targetId);
                if (protectedPlayer) {
                    addPrivateEvent(healAction!.actorId, {
                        type: 'doctor_success',
                        message: `لقد نجحت في حماية ${protectedPlayer.name}.`,
                        targetPlayer: { id: protectedPlayer.id, name: protectedPlayer.name, avatarId: protectedPlayer.avatarId, role: 'doctor' }
                    });
                }
            } else {
                const killedPlayer = updatedPlayers[targetPlayerIndex];
                updatedPlayers[targetPlayerIndex].status = 'killed';
                newEvents.push({ 
                    type: 'death', 
                    message: `تم العثور على جثة ${killedPlayer.name} هذا الصباح.`,
                    killedPlayer: { name: killedPlayer.name, avatarId: killedPlayer.avatarId },
                });
            }
        }
    }

    Object.values(nightActions).forEach(action => {
        const actorPlayer = updatedPlayers.find((p: Player) => p.id === action.actorId);
        const targetPlayer = updatedPlayers.find((p: Player) => p.id === action.targetId);
        if (!targetPlayer || !actorPlayer) return;

        if (action.action === 'investigate') {
            const actualRole = targetPlayer.role!;
            let reportedTeam: PlayerTeam;

            if (actualRole === 'spy') {
                reportedTeam = 'good';
            } else {
                const apparentRole = targetPlayer.apparentRole || actualRole;
                reportedTeam = ROLES[apparentRole!]?.team;
            }

            addPrivateEvent(action.actorId, {
                type: 'investigation_result',
                message: `تحقيقك كشف أن ${targetPlayer.name} من فريق ${reportedTeam === 'good' ? 'الخير' : 'الشر'}.`,
                targetPlayer: { id: targetPlayer.id, name: targetPlayer.name, avatarId: targetPlayer.avatarId, role: reportedTeam === 'good' ? 'civilian' : 'killer' }
            });
        } else if (action.action === 'spy') {
             if (targetPlayer.role === 'soldier') {
                 addPrivateEvent(action.actorId, {
                    type: 'spy_result_soldier_block',
                    message: `محاولتك للتجسس على ${targetPlayer.name} فشلت! لقد كشفك.`,
                    targetPlayer: { id: targetPlayer.id, name: targetPlayer.name, avatarId: targetPlayer.avatarId, role: 'soldier' }
                 });
                 addPrivateEvent(targetPlayer.id, {
                     type: 'spy_result_soldier_block',
                     message: `حاول اللاعب ${actorPlayer.name} التجسس عليك الليلة الماضية، لكنك كشفته!`,
                     targetPlayer: { id: actorPlayer.id, name: actorPlayer.name, avatarId: actorPlayer.avatarId, role: 'spy' }
                 });
             } else {
                const apparentRole = targetPlayer.apparentRole || targetPlayer.role;
                const roleName = ROLES[apparentRole!]?.name || 'مجهول';
                addPrivateEvent(action.actorId, {
                    type: 'spy_result',
                    message: `تجسسك كشف أن دور ${targetPlayer.name} هو: ${roleName}.`,
                    targetPlayer: { id: targetPlayer.id, name: targetPlayer.name, avatarId: targetPlayer.avatarId, role: apparentRole }
                });
                
                if (apparentRole === 'killer') {
                    const chatId = [action.actorId, action.targetId].sort().join('-');
                    if (!newPrivateChats[chatId]) {
                        newPrivateChats[chatId] = { participants: [action.actorId, action.targetId], messages: [] };
                        addPrivateEvent(action.actorId, { type: 'spy_result', message: `تم فتح قناة تواصل سرية بينك وبين القاتل.`});
                        addPrivateEvent(action.targetId, { type: 'spy_result', message: `الجاسوس كشف هويتك! تم فتح قناة تواصل سرية بينكما.`});
                    }
                }
             }
        } else if (action.action === 'shapeshifter' && action.disguiseRole) {
             const playerIndex = updatedPlayers.findIndex((p: Player) => p.id === action.actorId);
            if(playerIndex > -1) {
                updatedPlayers[playerIndex].apparentRole = action.disguiseRole;
            }
        }
    });

    let playersWithClearedApparentRoles = updatedPlayers.map((p: Player) => {
        const { apparentRole, ...rest } = p;
        return rest;
    });

    return { updatedPlayers: playersWithClearedApparentRoles, newEvents, newPrivateEvents, newPrivateChats, newLastHealedPlayerId };
}


export async function processDayInternal(game: Game) {
    const votes = game.mafiaState?.votes || {};
    const voteCounts: Record<string, number> = {};
    
    Object.values(votes).forEach(targetId => {
        if (targetId) {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });

    let executedPlayerId: string | null = null;
    let maxVotes = 0;
    let tied = false;

    for (const [playerId, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
            executedPlayerId = playerId;
            tied = false;
        } else if (count === maxVotes && maxVotes > 0) {
            tied = true;
        }
    }

    const alivePlayersCount = game.players.filter(p => p.status === 'alive').length;
    if (maxVotes <= Math.floor(alivePlayersCount / 2)) {
        executedPlayerId = null; // No majority, no execution
    }

    if (tied) {
        executedPlayerId = null;
    }
    
    let updatedPlayers = [...game.players];
    let executedPlayer: Player | null = null;

    if (executedPlayerId) {
        const playerIndex = updatedPlayers.findIndex(p => p.id === executedPlayerId);
        if (playerIndex !== -1) {
            updatedPlayers[playerIndex].status = 'voted_out';
            executedPlayer = updatedPlayers[playerIndex];
        }
    }
    return { updatedPlayers, executedPlayer };
}
