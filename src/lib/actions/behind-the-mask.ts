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
    collection,
    getDocs,
    writeBatch,
    increment,
    type Transaction,
    type FieldValue,
    getDoc,
    query,
    where,
    updateDoc,
} from 'firebase/firestore';
import type { Game, Player, PlayerRole, NightAction, DayEvent, PrivateChatMessage, PublicChatMessage, GameResult, UserProfile, League, PrivateEvent, PlayerTeam } from '@/types';
import { getRoleDistribution, ROLES } from '@/data/mafia-roles';
import { updateLeagueScoresForGameEnd } from './user';


// --- START of inlined helpers from behind-the-mask-helpers.ts ---

/**
 * Pure function to check for a winner based on player statuses.
 * @param players - The current list of players.
 * @returns A GameResult object if there is a winner, otherwise null.
 */
function checkForWinner(players: Player[]): GameResult | null {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const goodTeamCount = alivePlayers.filter(p => p.team === 'good').length;
    const mafiaTeamCount = alivePlayers.filter(p => p.team === 'mafia').length;

    if (mafiaTeamCount === 0) {
        return { winner: 'good', message: 'لقد قضى فريق الخير على كل الأشرار!' };
    }
    if (mafiaTeamCount >= goodTeamCount) {
        return { winner: 'mafia', message: 'لقد سيطر فريق الشر على المدينة!' };
    }
    return null;
}

/**
 * Pure function to process the results of the night phase.
 * @param game - The current game state.
 * @returns An object with updated players, new events, and other state changes.
 */
async function processNightInternal(game: Game) {
    const players = game.players.map(p => ({ ...p })); // Deep copy
    const nightActions = game.mafiaState?.nightActions || {};
    const newEvents: DayEvent[] = [];
    const newPrivateEvents: Record<string, PrivateEvent[]> = {};
    const newPrivateChats: Record<string, any> = game.mafiaState?.privateChats || {};
    let newLastHealedPlayerId: string | null = null;
    let killTarget: { targetId: string, bomberId?: string } | null = null;

    // --- Action Processing Logic ---

    // 1. Protection actions (Doctor)
    const healAction = Object.values(nightActions).find(a => a.action === 'heal');
    if (healAction) {
        const doctor = players.find(p => p.id === healAction.actorId);
        if (doctor && doctor.status === 'alive') {
            const target = players.find(p => p.id === healAction.targetId);
            if (target && target.status === 'alive') {
                target.isProtected = true;
                newLastHealedPlayerId = target.id;
            }
        }
    }

    // 2. Killing actions (Killer)
    const killAction = Object.values(nightActions).find(a => a.action === 'kill');
    if (killAction && killAction.targetId !== 'skip') {
        killTarget = { targetId: killAction.targetId };
    }
    
    // 3. Bomber action - if the bomber was killed, their target is also marked for death
    const bomberAction = Object.values(nightActions).find(a => a.action === 'bomb');
    if(bomberAction && bomberAction.targetId) {
        const bomberPlayer = players.find(p => p.id === bomberAction.actorId);
        if(bomberPlayer && bomberPlayer.status === 'killed' && killAction?.targetId === bomberPlayer.id) {
             killTarget = { targetId: bomberAction.targetId, bomberId: bomberAction.actorId };
        }
    }

    // 4. Resolve kills
    if (killTarget) {
        const targetPlayerIndex = players.findIndex(p => p.id === killTarget!.targetId);
        if (targetPlayerIndex !== -1) {
            const targetPlayer = players[targetPlayerIndex];
            if (targetPlayer.isProtected) {
                newEvents.push({ type: 'protection', message: 'لقد حاول القاتل الهجوم، لكن الطبيب أنقذ الهدف في الوقت المناسب!' });
                if (healAction) {
                    if (!newPrivateEvents[healAction.actorId]) newPrivateEvents[healAction.actorId] = [];
                    newPrivateEvents[healAction.actorId].push({ type: 'doctor_success', message: 'لقد نجحت في إنقاذ هدفك!' });
                }
            } else {
                players[targetPlayerIndex].status = 'killed';
                newEvents.push({ type: 'death', message: `استيقظ أهل المدينة ليجدوا ${targetPlayer.name} قد قُتل!`, killedPlayer: { name: targetPlayer.name, avatarId: targetPlayer.avatarId }});
            }
        }
    }


    // 5. Information gathering actions (Detective, Spy)
    Object.values(nightActions).forEach(action => {
        if (!newPrivateEvents[action.actorId]) newPrivateEvents[action.actorId] = [];

        const actor = players.find(p => p.id === action.actorId);
        if (!actor || actor.status !== 'alive') return;
        
        const target = players.find(p => p.id === action.targetId);
        if (!target) return;

        if (action.action === 'investigate') {
            const targetRole = ROLES[target.role!];
            newPrivateEvents[action.actorId].push({
                type: 'investigation_result',
                message: `تقرير التحقيق: ${target.name} ينتمي إلى ${targetRole.team === 'mafia' ? 'فريق الشر' : 'فريق الخير'}.`,
                targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId }
            });
        } else if (action.action === 'spy') {
             const targetRole = ROLES[target.apparentRole || target.role!];
             
             // Check if target is soldier
            if(target.role === 'soldier') {
                newPrivateEvents[action.actorId].push({
                    type: 'spy_result_soldier_block',
                    message: `لقد حاولت التجسس على ${target.name}، لكنه جندي متأهب وكشفك!`,
                    targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: target.role }
                });
            } else {
                newPrivateEvents[action.actorId].push({
                    type: 'spy_result',
                    message: `تقرير التجسس: دور ${target.name} هو ${targetRole.name}.`,
                    targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: target.apparentRole || target.role! }
                });
                
                // If spy finds a mafia member, open a private chat
                if (targetRole.team === 'mafia') {
                    const chatId = [actor.id, target.id].sort().join('-');
                    if (!newPrivateChats[chatId]) {
                        newPrivateChats[chatId] = { participants: [actor.id, target.id], messages: [] };
                    }
                }
            }
        }
    });

    // Clean up temporary states
    players.forEach(p => {
        delete p.isProtected;
        delete p.apparentRole;
    });

    return { updatedPlayers, newEvents, newPrivateEvents, newPrivateChats, newLastHealedPlayerId };
}


async function processDayInternal(game: Game) {
    const players = [...game.players];
    const votes = game.mafiaState?.votes || {};
    const voteCounts: Record<string, number> = {};
    const events: DayEvent[] = [];
    let executedPlayer: Player | null = null;
    
    Object.values(votes).forEach(targetId => {
        if (targetId) {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });

    const maxVotes = Math.max(0, ...Object.values(voteCounts));
    const mostVotedIds = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);
    
    if (mostVotedIds.length === 1 && maxVotes > 0) {
        const executedPlayerId = mostVotedIds[0];
        const playerIndex = players.findIndex(p => p.id === executedPlayerId);
        if (playerIndex !== -1) {
            players[playerIndex].status = 'voted_out';
            executedPlayer = players[playerIndex];
            events.push({
                type: 'execution',
                message: `بعد نقاش حاد، قرر أهل المدينة إعدام ${executedPlayer!.name}!`,
                executedPlayer: { name: executedPlayer!.name, avatarId: executedPlayer!.avatarId, temporaryTitle: executedPlayer!.temporaryTitle }
            });
        }
    } else {
        events.push({ type: 'no_execution', message: 'لم يتمكن أهل المدينة من الاتفاق على إعدام أحد.' });
    }
    
    const winner = checkForWinner(players);
    const lastExecutedPlayer = executedPlayer ? { name: executedPlayer.name, avatarId: executedPlayer.avatarId, temporaryTitle: executedPlayer.temporaryTitle } : null;

    return { 
        updatedGame: { players, events, lastExecutedPlayer },
        winner
    };
}
// --- END of inlined helpers ---


const ROLE_REVEAL_DURATION_SECONDS = 15;

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
            team: ROLES[rolesToDistribute[index]!].team,
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
            'mafiaState.publicChat': [],
            'mafiaState.privateEvents': {},
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
        
        // Allow transition from role_reveal OR execution phase
        if (game.mafiaState?.phase !== 'role_reveal' && game.mafiaState?.phase !== 'execution') {
            return;
        }
        
        const nightTime = game.mafiaState?.settings?.nightTime || 25;

        transaction.update(gameRef, {
            'mafiaState.phase': 'night',
            'mafiaState.nightActions': {}, // Clear actions for the new night
            'mafiaState.votes': {}, // Clear votes from previous day
            'mafiaState.events': [], // Clear public events
            'mafiaState.publicChat': [], // Clear public chat
            'mafiaState.lastExecutedPlayer': deleteField(), // Clear last executed player
            'mafiaState.night': (game.mafiaState?.night || 0) + 1, // Increment night number
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + nightTime * 1000),
        });
    });
}

/**
 * Submits a player's action during the night phase.
 * @param {string} gameId - The ID of the game.
 * @param {NightAction} action - The action being submitted.
 */
export async function submitNightAction(gameId: string, action: NightAction): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            const actor = game.players.find(p => p.id === action.actorId);
            if (!actor || actor.status !== 'alive') {
                throw new Error("Only living players can perform night actions.");
            }
             if (game.mafiaState?.nightActions?.[action.actorId]) {
                throw new Error("لقد قمت بإرسال قرارك بالفعل لهذه الليلة.");
            }

            if (game.mafiaState?.phase !== 'night') throw new Error("Night actions can only be submitted at night.");
            
            // Skip cooldown check if action is a skip
            if (action.targetId !== 'skip') {
                if (action.action === 'heal' && game.mafiaState.lastHealedPlayerId === action.targetId) {
                    throw new Error("لا يمكنك حماية نفس اللاعب مرتين على التوالي.");
                }

                // Cooldown check for Killer and Detective
                const currentNight = game.mafiaState?.night || 1;
                const lastUsedNight = game.mafiaState?.lastAbilityUse?.[action.actorId] || 0;
                if ((action.action === 'kill' || action.action === 'investigate') && currentNight === lastUsedNight + 1) {
                    throw new Error("يجب أن ترتاح لليلة واحدة قبل استخدام قدرتك مرة أخرى.");
                }
            }


            const updateData: any = {
                [`mafiaState.nightActions.${action.actorId}`]: action,
            };

            // If an ability with a cooldown was used, record the night it was used on.
            if ((action.action === 'kill' || action.action === 'investigate') && action.targetId !== 'skip') {
                updateData[`mafiaState.lastAbilityUse.${action.actorId}`] = game.mafiaState?.night || 1;
            }

            if (action.action === 'shapeshift' && action.disguiseRole) {
                const playerIndex = game.players.findIndex(p => p.id === action.actorId);
                if(playerIndex > -1) {
                    // This is an intended temporary update, it gets cleared at the end of the night
                    updateData[`players.${playerIndex}.apparentRole`] = action.disguiseRole;
                }
            }

            transaction.update(gameRef, updateData);
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

        const { updatedPlayers, newEvents, newPrivateEvents, newPrivateChats, newLastHealedPlayerId } = await processNightInternal(game);
        
        // Remove temporary 'apparentRole' before saving
        let playersWithClearedApparentRoles = updatedPlayers.map(p => {
             // Create a new object without the apparentRole property
            const { apparentRole, ...rest } = p;
            return rest;
        });

        // Check for winner AFTER processing night actions.
        const winner = checkForWinner(playersWithClearedApparentRoles);
        
        const updateData: any = {
            'players': playersWithClearedApparentRoles,
            'mafiaState.events': newEvents,
            'mafiaState.privateEvents': newPrivateEvents,
            'mafiaState.privateChats': newPrivateChats,
            'mafiaState.lastHealedPlayerId': newLastHealedPlayerId ? newLastHealedPlayerId : deleteField(),
        };

        if (winner) {
            updateData.gameState = 'final_results';
            updateData['mafiaState.phase'] = 'final_results';
            updateData.gameResult = winner;
            updateData['mafiaState.timerEndsAt'] = deleteField();
        } else {
            const dayTime = game.mafiaState?.settings?.dayTime || 180;
            updateData['mafiaState.phase'] = 'day';
            updateData['mafiaState.timerEndsAt'] = Timestamp.fromMillis(Date.now() + dayTime * 1000);
        }
        
        transaction.update(gameRef, updateData);
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

        const votingTime = 45; // This could also be a setting

        transaction.update(gameRef, {
            'mafiaState.phase': 'voting',
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + votingTime * 1000),
        });
    });
}


/**
 * Submits a player's vote during the day phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} voterId - The ID of the player voting.
 * @param {string | null} targetId - The ID of the player being voted for, or null to skip.
 */
export async function submitVote(gameId: string, voterId: string, targetId: string | null): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            let game = gameDoc.data() as Game;

            if (game.mafiaState?.phase !== 'day') {
                throw new Error("Voting is not active.");
            }
            
            const voter = game.players.find(p => p.id === voterId);
            if (!voter || voter.status !== 'alive') {
                throw new Error("Only living players can vote.");
            }

            const newVotes = { ...(game.mafiaState.votes || {}), [voterId]: targetId };
            const alivePlayers = game.players.filter(p => p.status === 'alive');
            
            const updateData: any = {
                [`mafiaState.votes.${voterId}`]: targetId,
            };

            // Check if all players have voted
            if (Object.keys(newVotes).length === alivePlayers.length) {
                const currentTimeRemaining = (game.mafiaState.timerEndsAt?.toMillis() || Date.now()) - Date.now();
                if (currentTimeRemaining > 20000) { // If more than 20 seconds remain
                    updateData['mafiaState.timerEndsAt'] = Timestamp.fromMillis(Date.now() + 20000); // Shorten timer to 20 seconds
                }
            }

            transaction.update(gameRef, updateData);
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Processes the votes at the end of the day and executes a player if a majority is reached.
 * This should be triggered automatically after the day timer ends, called by the host.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 */
export async function processDay(gameId: string, hostId: string): Promise<void> {
    let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can process the day.");
        if (game.mafiaState?.phase !== 'day') return;

        const { updatedGame, winner } = await processDayInternal(game);
        
        let updateData: any = {
            players: updatedGame.players,
        };

        if (winner) {
            updateData.gameState = 'final_results';
            updateData['mafiaState.phase'] = 'final_results';
            updateData.gameResult = winner;
            updateData['mafiaState.timerEndsAt'] = deleteField();
            gameDataForLeagueUpdate = { ...game, players: updatedGame.players, gameResult: winner };
        } else {
            // If there's no winner, proceed to the execution phase
            updateData['mafiaState.phase'] = 'execution';
            updateData['mafiaState.events'] = updatedGame.events; 
            updateData['mafiaState.lastExecutedPlayer'] = updatedGame.lastExecutedPlayer;
            updateData['mafiaState.timerEndsAt'] = deleteField(); // Timer is not needed for execution display
        }

        transaction.update(gameRef, updateData);
    });

    if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}

/**
 * Sends a public message during the day phase.
 * @param {string} gameId - The ID of the game.
 * @param {Omit<PublicChatMessage, 'timestamp'>} message - The message object.
 */
export async function sendPublicMessage(gameId: string, message: Omit<PublicChatMessage, 'timestamp'>): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    const fullMessage: PublicChatMessage = { ...message, timestamp: Timestamp.now() };

    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const gameData = gameDoc.data() as Game;

        if (gameData.mafiaState?.phase !== 'day') {
            throw new Error("Can only send messages during the day.");
        }

        const sender = gameData.players.find(p => p.id === message.senderId);
        if (!sender || sender.status !== 'alive') {
            throw new Error("Only living players can send messages.");
        }

        transaction.update(gameRef, {
            'mafiaState.publicChat': arrayUnion(fullMessage)
        });
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
        const game = gameDoc.data() as Game;
        
        const sender = game.players.find(p => p.id === message.senderId);
        if (!sender || sender.status !== 'alive') {
            throw new Error("Only living players can send private messages.");
        }

        transaction.update(gameRef, {
            [`mafiaState.privateChats.${chatId}.messages`]: arrayUnion(fullMessage)
        });
    });
}

export async function updateMafiaSettings(gameId: string, hostId: string, settings: Game['mafiaState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        // When settings change, also update the timer to reflect the new value, but only if the game phase uses it.
        // For lobby, we don't have an active timer, so we just update the settings.
        transaction.update(gameRef, { 'mafiaState.settings': settings });
    });
}
    
