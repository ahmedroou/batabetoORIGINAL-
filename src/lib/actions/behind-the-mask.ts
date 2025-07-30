
'use server';

/**
 * @fileoverview Actions for the "Behind the Mask" game.
 */

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
    deleteField,
    arrayUnion,
} from 'firebase/firestore';
import type { Game, Player, PlayerRole, NightAction, DayEvent, PrivateChatMessage } from '@/types';
import { getRoleDistribution } from '@/data/mafia-roles';
import { updateLeagueScoresForGameEnd } from './user';

const ROLE_REVEAL_DURATION_SECONDS = 15;
const NIGHT_PHASE_DURATION_SECONDS = 40;
const DAY_PHASE_DURATION_SECONDS = 180; // 3 minutes for discussion
const VOTING_PHASE_DURATION_SECONDS = 45;

/**
 * Starts the game, distributing roles and setting the initial state.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 */
export async function startGame(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return; // Prevent re-starting
        if (game.players.length < 4) throw new Error("The game requires at least 4 players.");

        const rolesToDistribute = getRoleDistribution(game.players.length);

        const updatedPlayers = game.players.map((player, index) => ({
            ...player,
            role: rolesToDistribute[index],
            status: 'alive' as Player['status'],
        }));
        
        const roleRevealDuration = ROLE_REVEAL_DURATION_SECONDS;

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'role_reveal',
            'mafiaState.phase': 'role_reveal',
            round: 1, // Using round to signify day/night cycle number
            playerScores: {}, // Reset scores
            'mafiaState.rolesInGame': rolesToDistribute,
            'mafiaState.night': 1,
            'mafiaState.events': [],
            'mafiaState.nightActions': {},
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + roleRevealDuration * 1000),
        });
    });
}


/**
 * Transitions the game from role reveal to the first night phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 */
export async function transitionToNight(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the night.");
        if (game.mafiaState?.phase !== 'role_reveal' && game.mafiaState?.phase !== 'voting') return;

        transaction.update(gameRef, {
            'mafiaState.phase': 'night',
            'mafiaState.nightActions': {}, // Clear actions for the new night
            'mafiaState.votes': {}, // Clear votes
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + NIGHT_PHASE_DURATION_SECONDS * 1000),
        });
    });
}

/**
 * Submits a player's action during the night phase.
 * @param {string} gameId - The ID of the game.
 *param {NightAction} action - The action being submitted.
 */
export async function submitNightAction(gameId: string, action: NightAction): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            if (game.mafiaState?.phase !== 'night') throw new Error("Night actions can only be submitted at night.");
            
            transaction.update(gameRef, {
                [`mafiaState.nightActions.${action.actorId}`]: action,
            });
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Processes all night actions and transitions the game to the day phase.
 * This should be triggered automatically after the night timer ends, called by the host.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 */
export async function processNight(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can process the night.");
        if (game.mafiaState?.phase !== 'night') return;

        const nightActions = game.mafiaState.nightActions || {};
        let updatedPlayers = [...game.players];
        const newEvents: DayEvent[] = [];
        let lastKilledPlayerId: string | null = null;
        let lastHealedPlayerId: string | null = null;
        const newPrivateChats = { ...(game.mafiaState.privateChats || {}) };

        const killAction = Object.values(nightActions).find(a => a.action === 'kill');
        const healAction = Object.values(nightActions).find(a => a.action === 'heal');
        
        if (killAction && killAction.targetId) {
            const isProtected = healAction?.targetId === killAction.targetId;
            if (isProtected) {
                newEvents.push({ type: 'protection', message: `تم إنقاذ أحد اللاعبين الليلة الماضية!` });
                lastHealedPlayerId = healAction!.targetId;
            } else {
                const targetPlayerIndex = updatedPlayers.findIndex(p => p.id === killAction.targetId);
                if (targetPlayerIndex !== -1) {
                    updatedPlayers[targetPlayerIndex].status = 'killed';
                    lastKilledPlayerId = killAction.targetId;
                    newEvents.push({ type: 'death', message: `تم العثور على جثة ${updatedPlayers[targetPlayerIndex].name} هذا الصباح.` });
                }
            }
        }

        // Process Spy and Detective actions
        Object.values(nightActions).forEach(action => {
            const targetPlayer = updatedPlayers.find(p => p.id === action.targetId);
            if (!targetPlayer) return;

            if (action.action === 'investigate') {
                newEvents.push({ 
                    type: 'investigation', 
                    message: `كشف المحقق أن ${targetPlayer.name} من فريق ${targetPlayer.team === 'good' ? 'الخير' : 'الشر'}.`,
                    revealedTeam: targetPlayer.team
                });
            } else if (action.action === 'spy') {
                 if (targetPlayer.role === 'soldier') {
                     newEvents.push({ type: 'spy_reveal', message: `كشف الجندي جاسوسًا يحاول التسلل إليه!`, revealedRole: 'spy' });
                 } else {
                    const apparentRole = targetPlayer.apparentRole || targetPlayer.role; // Use apparent role if set
                    if (apparentRole === 'killer') {
                        // Open private chat between spy and killer
                        const chatId = `${action.actorId}-${action.targetId}`;
                        if (!newPrivateChats[chatId]) {
                            newPrivateChats[chatId] = { participants: [action.actorId, action.targetId], messages: [] };
                        }
                    }
                 }
            }
        });

        const winner = checkForWinner(updatedPlayers);
        if (winner) {
            transaction.update(gameRef, {
                players: updatedPlayers,
                gameState: 'final_results',
                'mafiaState.phase': 'final_results',
                gameResult: winner
            });
            await updateLeagueScoresForGameEnd(game, transaction);
        } else {
             transaction.update(gameRef, {
                players: updatedPlayers,
                'mafiaState.phase': 'day',
                'mafiaState.events': newEvents,
                'mafiaState.lastKilled': lastKilledPlayerId,
                'mafiaState.lastHealed': lastHealedPlayerId,
                'mafiaState.privateChats': newPrivateChats,
                'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + DAY_PHASE_DURATION_SECONDS * 1000),
            });
        }
    });
}

/**
 * Transitions the game from the day/discussion phase to the voting phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 */
export async function transitionToVoting(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start voting.");
        if (game.mafiaState?.phase !== 'day') return;

        transaction.update(gameRef, {
            'mafiaState.phase': 'voting',
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + VOTING_PHASE_DURATION_SECONDS * 1000),
        });
    });
}


/**
 * Submits a player's vote during the day phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} voterId - The ID of the player voting.
 * @param {string} targetId - The ID of the player being voted for.
 */
export async function submitVote(gameId: string, voterId: string, targetId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.mafiaState?.phase !== 'voting') throw new Error("Voting is not active.");

        transaction.update(gameRef, {
            [`mafiaState.votes.${voterId}`]: targetId,
        });
    });
}

/**
 * Processes the votes at the end of the day and executes a player if a majority is reached.
 * This should be triggered automatically after the day timer ends, called by the host.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 */
export async function processDay(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can process the day.");
        if (game.mafiaState?.phase !== 'voting') return;

        const votes = game.mafiaState.votes || {};
        const voteCounts: Record<string, number> = {};
        Object.values(votes).forEach(targetId => {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        });

        let executedPlayerId: string | null = null;
        let maxVotes = 0;
        for (const [playerId, count] of Object.entries(voteCounts)) {
            if (count > maxVotes) {
                maxVotes = count;
                executedPlayerId = playerId;
            } else if (count === maxVotes) {
                executedPlayerId = null; // Tie, no one is executed
            }
        }
        
        let updatedPlayers = [...game.players];
        const newEvents: DayEvent[] = [];

        if (executedPlayerId) {
            const playerIndex = updatedPlayers.findIndex(p => p.id === executedPlayerId);
            if (playerIndex !== -1) {
                updatedPlayers[playerIndex].status = 'voted_out';
                newEvents.push({ type: 'execution', message: `قرر الجميع إعدام ${updatedPlayers[playerIndex].name}!` });
                 // Bomber's ability check
                if (updatedPlayers[playerIndex].role === 'bomber') {
                    const bomberAction = Object.values(game.mafiaState.nightActions || {}).find(a => a.action === 'bomb' && a.actorId === executedPlayerId);
                    if (bomberAction && bomberAction.targetId) {
                        const targetIndex = updatedPlayers.findIndex(p => p.id === bomberAction.targetId);
                        if (targetIndex !== -1 && updatedPlayers[targetIndex].status === 'alive') {
                             updatedPlayers[targetIndex].status = 'killed';
                             newEvents.push({ type: 'death', message: `أخذ الانتحاري ${updatedPlayers[targetIndex].name} معه إلى القبر!` });
                        }
                    }
                }
            }
        } else {
             newEvents.push({ type: 'execution', message: `لم يتفق الجميع على قرار، ونجا الجميع هذا اليوم.` });
        }
        
        const winner = checkForWinner(updatedPlayers);
        if (winner) {
             transaction.update(gameRef, {
                players: updatedPlayers,
                gameState: 'final_results',
                'mafiaState.phase': 'final_results',
                gameResult: winner,
             });
             await updateLeagueScoresForGameEnd(game, transaction);
        } else {
            // If no winner, go back to night
            transaction.update(gameRef, {
                players: updatedPlayers,
                'mafiaState.phase': 'night',
                'mafiaState.night': (game.mafiaState.night || 1) + 1,
                'mafiaState.votes': {}, // Reset votes for next day
                'mafiaState.events': newEvents, // Carry over execution event to next day's log
                'mafiaState.nightActions': {}, // Reset night actions
                'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + NIGHT_PHASE_DURATION_SECONDS * 1000),
            });
        }
    });
}

/**
 * Sends a private message between the spy and the killer.
 * @param {string} gameId - The ID of the game.
 * @param {string} chatId - The ID of the private chat.
 * @param {PrivateChatMessage} message - The message object.
 */
export async function sendPrivateMessage(gameId: string, chatId: string, message: Omit<PrivateChatMessage, 'timestamp'>): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    const fullMessage = { ...message, timestamp: Timestamp.now() };

    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");

        transaction.update(gameRef, {
            [`mafiaState.privateChats.${chatId}.messages`]: arrayUnion(fullMessage)
        });
    });
}


/**
 * Checks for a winner based on the current player statuses.
 * @param {Player[]} players - The current list of players.
 * @returns {Game['gameResult'] | null} The game result if a winner is found, otherwise null.
 */
function checkForWinner(players: Player[]): Game['gameResult'] | null {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const aliveMafia = alivePlayers.filter(p => p.team === 'mafia');
    const aliveGood = alivePlayers.filter(p => p.team === 'good');

    if (aliveMafia.length === 0) {
        return { winner: 'good', message: 'انتصر فريق الخير بعد القضاء على كل الأشرار!' };
    }
    if (aliveMafia.length >= aliveGood.length) {
        return { winner: 'mafia', message: 'انتصرت المافيا بالسيطرة على المدينة!' };
    }
    return null;
}
