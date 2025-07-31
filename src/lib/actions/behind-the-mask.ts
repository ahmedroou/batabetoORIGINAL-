
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
} from 'firebase/firestore';
import type { Game, Player, PlayerRole, NightAction, DayEvent, PrivateChatMessage, PublicChatMessage, GameResult, UserProfile, League, PrivateEvent } from '@/types';
import { getRoleDistribution, ROLES } from '@/data/mafia-roles';
import { updateLeagueScoresForGameEnd } from './user';

const ROLE_REVEAL_DURATION_SECONDS = 15;
const NIGHT_PHASE_DURATION_SECONDS = 25;
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
        
        // Allow transition from role_reveal OR voting phase
        if (game.mafiaState?.phase !== 'role_reveal' && game.mafiaState?.phase !== 'voting') {
            return;
        }

        transaction.update(gameRef, {
            'mafiaState.phase': 'night',
            'mafiaState.nightActions': {}, // Clear actions for the new night
            'mafiaState.votes': {}, // Clear votes from previous day
            'mafiaState.events': [], // Clear public events
            // We keep privateEvents for spy/killer chat history, but clear other private messages if needed
            'mafiaState.publicChat': [], // Clear public chat
            'mafiaState.night': (game.mafiaState?.night || 0) + 1, // Increment night number
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + NIGHT_PHASE_DURATION_SECONDS * 1000),
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

            if (game.mafiaState?.phase !== 'night') throw new Error("Night actions can only be submitted at night.");
            
            if (action.action === 'heal' && game.mafiaState.lastHealedPlayerId === action.targetId) {
                throw new Error("لا يمكنك حماية نفس اللاعب مرتين على التوالي.");
            }

            const updateData: any = {
                [`mafiaState.nightActions.${action.actorId}`]: action,
            };

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

    // Pre-fetch all necessary data outside the transaction
    const gameDataSnapshot = await getDoc(gameRef);
    if (!gameDataSnapshot.exists()) throw new Error("Game not found.");
    
    const initialGame = gameDataSnapshot.data() as Game;
    const playerIds = initialGame.players.map(p => p.id);
    
    // Fetch all user profiles and their leagues in one go
    const userProfiles: Record<string, UserProfile> = {};
    const leagueDocs: Record<string, League> = {};

    if (playerIds.length > 0) {
        const userDocs = await Promise.all(playerIds.map(id => getDoc(doc(db, 'users', id))));
        for (const userDoc of userDocs) {
            if (userDoc.exists()) {
                const userData = userDoc.data() as UserProfile;
                userProfiles[userDoc.id] = userData;
                // Fetch league data for this user
                const userLeagues = userData.leagues || [];
                for (const leagueInfo of userLeagues) {
                    if (!leagueDocs[leagueInfo.id]) {
                        const leagueDoc = await getDoc(doc(db, 'leagues', leagueInfo.id));
                        if (leagueDoc.exists()) {
                            leagueDocs[leagueInfo.id] = leagueDoc.data() as League;
                        }
                    }
                }
            }
        }
    }


    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can process the night.");
        if (game.mafiaState?.phase !== 'night') return;

        // --- IN-MEMORY LOGIC ---
        const nightActions = game.mafiaState.nightActions || {};
        let updatedPlayers = [...game.players];
        const newEvents: DayEvent[] = [];
        const newPrivateEvents: Record<string, PrivateEvent[]> = {};
        const newPrivateChats = { ...(game.mafiaState.privateChats || {}) };

        const addPrivateEvent = (playerId: string, event: PrivateEvent) => {
            if (!newPrivateEvents[playerId]) newPrivateEvents[playerId] = [];
            newPrivateEvents[playerId].push(event);
        };
        
        const healAction = Object.values(nightActions).find(a => a.action === 'heal');
        const killAction = Object.values(nightActions).find(a => a.action === 'kill');
        
        let newLastHealedPlayerId: string | null = null;
        
        if (healAction?.targetId) {
            newLastHealedPlayerId = healAction.targetId;
        }

        if (killAction && killAction.targetId) {
            const isHealed = healAction?.targetId === killAction.targetId;
            const targetPlayerIndex = updatedPlayers.findIndex(p => p.id === killAction.targetId);
            
            if (targetPlayerIndex !== -1 && updatedPlayers[targetPlayerIndex].status === 'alive') {
                if (isHealed) {
                    newEvents.push({ type: 'protection', message: `تم إنقاذ أحد اللاعبين الليلة الماضية!` });
                    const protectedPlayer = updatedPlayers.find(p => p.id === healAction!.targetId);
                    if (protectedPlayer) {
                        addPrivateEvent(healAction!.actorId, {
                            type: 'doctor_success',
                            message: `لقد نجحت في حماية ${protectedPlayer.name}.`,
                            targetPlayer: { id: protectedPlayer.id, name: protectedPlayer.name, avatarId: protectedPlayer.avatarId }
                        });
                    }
                } else {
                    updatedPlayers[targetPlayerIndex].status = 'killed';
                    newEvents.push({ type: 'death', message: `تم العثور على جثة ${updatedPlayers[targetPlayerIndex].name} هذا الصباح.` });
                }
            }
        }

        Object.values(nightActions).forEach(action => {
            const actorPlayer = updatedPlayers.find(p => p.id === action.actorId);
            const targetPlayer = updatedPlayers.find(p => p.id === action.targetId);
            if (!targetPlayer || !actorPlayer) return;

            if (action.action === 'investigate') {
                const apparentRole = targetPlayer.apparentRole || targetPlayer.role!;
                const targetTeam = ROLES[apparentRole]?.team;
                addPrivateEvent(action.actorId, {
                    type: 'investigation_result',
                    message: `تحقيقك كشف أن ${targetPlayer.name} من فريق ${targetTeam === 'good' ? 'الخير' : 'الشر'}.`,
                    targetPlayer: { id: targetPlayer.id, name: targetPlayer.name, avatarId: targetPlayer.avatarId, role: apparentRole }
                });
            } else if (action.action === 'spy') {
                 if (targetPlayer.role === 'soldier') {
                     addPrivateEvent(action.actorId, {
                        type: 'spy_result_soldier_block',
                        message: `محاولتك للتجسس على ${targetPlayer.name} فشلت! لقد كشفك.`,
                        targetPlayer: { id: targetPlayer.id, name: targetPlayer.name, avatarId: targetPlayer.avatarId, role: targetPlayer.role }
                     });
                     addPrivateEvent(targetPlayer.id, {
                         type: 'spy_result_soldier_block',
                         message: `حاول اللاعب ${actorPlayer.name} التجسس عليك الليلة الماضية، لكنك كشفته!`,
                         targetPlayer: { id: actorPlayer.id, name: actorPlayer.name, avatarId: actorPlayer.avatarId, role: actorPlayer.role }
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
            } else if (action.action === 'shapeshift' && action.disguiseRole) {
                 const playerIndex = updatedPlayers.findIndex(p => p.id === action.actorId);
                if(playerIndex > -1) {
                    updatedPlayers[playerIndex].apparentRole = action.disguiseRole;
                }
            }
        });
        
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
            updateData['mafiaState.phase'] = 'day';
            updateData['mafiaState.timerEndsAt'] = Timestamp.fromMillis(Date.now() + DAY_PHASE_DURATION_SECONDS * 1000);
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
 * @param {string | null} targetId - The ID of the player being voted for, or null to skip.
 */
export async function submitVote(gameId: string, voterId: string, targetId: string | null): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            if (game.mafiaState?.phase !== 'day') {
                throw new Error("Voting is not active.");
            }
            
            const voter = game.players.find(p => p.id === voterId);
            if (!voter || voter.status !== 'alive') {
                throw new Error("Only living players can vote.");
            }

            transaction.update(gameRef, {
                [`mafiaState.votes.${voterId}`]: targetId,
            });
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
    // Pre-fetch all necessary data outside the transaction
    const gameRef = doc(db, 'games', gameId);
    const gameDataSnapshot = await getDoc(gameRef);
    if (!gameDataSnapshot.exists()) throw new Error("Game not found.");
    
    const initialGame = gameDataSnapshot.data() as Game;
    const playerIds = initialGame.players.map(p => p.id);
    
    // Fetch all user profiles and their leagues in one go
    const userProfiles: Record<string, UserProfile> = {};
    const leagueDocs: Record<string, League> = {};

    if (playerIds.length > 0) {
        const userDocs = await Promise.all(playerIds.map(id => getDoc(doc(db, 'users', id))));
        for (const userDoc of userDocs) {
            if (userDoc.exists()) {
                const userData = userDoc.data() as UserProfile;
                userProfiles[userDoc.id] = userData;
                // Fetch league data for this user
                const userLeagues = userData.leagues || [];
                for (const leagueInfo of userLeagues) {
                    if (!leagueDocs[leagueInfo.id]) {
                        const leagueDoc = await getDoc(doc(db, 'leagues', leagueInfo.id));
                        if (leagueDoc.exists()) {
                            leagueDocs[leagueInfo.id] = leagueDoc.data() as League;
                        }
                    }
                }
            }
        }
    }
    
    // Now run the transaction with all data pre-fetched
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can process the day.");
        if (game.mafiaState?.phase !== 'day') return;

        const votes = game.mafiaState.votes || {};
        const voteCounts: Record<string, number> = {};
        
        Object.values(votes).forEach(targetId => {
            if (targetId) { // Ensure null votes (skips) are not counted here
                voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
            } else {
                // Count null/skip votes separately
                const skipKey = 'skip_vote';
                voteCounts[skipKey] = (voteCounts[skipKey] || 0) + 1;
            }
        });

        let executedPlayerId: string | null = null;
        let maxVotes = 0;
        let tied = false;

        for (const [playerId, count] of Object.entries(voteCounts)) {
            if (playerId === 'skip_vote') continue; // Ignore skip votes for execution check initially
            if (count > maxVotes) {
                maxVotes = count;
                executedPlayerId = playerId;
                tied = false;
            } else if (count === maxVotes && maxVotes > 0) {
                tied = true;
            }
        }

        const skipVotes = voteCounts['skip_vote'] || 0;
        // If skip votes are the highest, or if there's a tie for the highest, no one is executed.
        if (skipVotes >= maxVotes || tied) {
            executedPlayerId = null;
        }
        
        let updatedPlayers = [...game.players];
        const newEvents: DayEvent[] = [];

        if (executedPlayerId) {
            const playerIndex = updatedPlayers.findIndex(p => p.id === executedPlayerId);
            if (playerIndex !== -1) {
                updatedPlayers[playerIndex].status = 'voted_out';
                newEvents.push({ type: 'execution', message: `قرر الجميع إعدام ${updatedPlayers[playerIndex].name}!` });
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
        
        const updateData: any = {
            players: updatedPlayers,
            'mafiaState.events': newEvents,
            'mafiaState.votes': {},
        };

        if (winner) {
            updateData.gameState = 'final_results';
            updateData['mafiaState.phase'] = 'final_results';
            updateData.gameResult = winner;
            updateData['mafiaState.timerEndsAt'] = deleteField();
            
            // Add points for winning team
            const newScores = game.playerScores || {};
            updatedPlayers.forEach(p => {
                if (p.team === winner.winner) {
                    newScores[p.id] = (newScores[p.id] || 0) + 2;
                }
            });
            updateData.playerScores = newScores;

            // Call the league update logic *within* the transaction, now that it doesn't do its own reads.
            updateLeagueScoresForGameEnd({ ...game, players: updatedPlayers, gameResult: winner, playerScores: newScores }, transaction, userProfiles, leagueDocs);

        } else {
            updateData['mafiaState.phase'] = 'night';
            updateData['mafiaState.nightActions'] = {};
            updateData['mafiaState.publicChat'] = []; 
            updateData['mafiaState.night'] = (game.mafiaState.night || 0) + 1;
            updateData['mafiaState.timerEndsAt'] = Timestamp.fromMillis(Date.now() + NIGHT_PHASE_DURATION_SECONDS * 1000);
        }

        transaction.update(gameRef, updateData);
    });
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


/**
 * Checks for a winner based on the current player statuses.
 * @param {Player[]} players - The current list of players.
 * @returns {Game['gameResult'] | null} The game result if a winner is found, otherwise null.
 */
function checkForWinner(players: Player[]): Game['gameResult'] | null {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const aliveMafia = alivePlayers.filter(p => p.team === 'mafia');
    const aliveGood = alivePlayers.filter(p => p.team === 'good');
    
    // Condition 1: Good team wins if the Killer is eliminated.
    const killer = players.find(p => p.role === 'killer');
    if (!killer || killer.status !== 'alive') {
        return { winner: 'good', message: 'انتصر فريق الخير بعد القضاء على القاتل!' };
    }
    
    // Condition 2: Mafia team wins if their number is greater than the good team's number.
    if (aliveMafia.length > aliveGood.length) {
        return { winner: 'mafia', message: 'انتصرت المافيا بالسيطرة على المدينة!' };
    }
    
    // No winner yet, game continues.
    return null; 
}
