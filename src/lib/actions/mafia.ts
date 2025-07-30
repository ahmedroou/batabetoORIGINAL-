

/**
 * @fileoverview Actions specific to the "Mafia" game.
 * This file contains all server-side logic for the Mafia game,
 * including starting the game, progressing through phases, handling player actions,
 * and determining win/loss conditions.
 */

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
    deleteField,
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    Transaction,
    arrayUnion,
} from 'firebase/firestore';
import type { Game, Player, NightAction, NightResult, Role, MafiaRole, Team, PrivateChat, UserProfile } from '@/types';
import { getPlayerFromUserId } from './helpers';
import { MAFIA_ROLES, getRoleDistribution } from '@/data/mafia-roles';
import { updateLeagueScoresForGameEnd } from './user';


/**
 * A utility function to shuffle an array randomly.
 * Implements the Fisher-Yates (aka Knuth) shuffle algorithm.
 * @param {any[]} array - The array to be shuffled.
 * @returns {any[]} The shuffled array.
 */
function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    // Iterate from the end of the array to the beginning.
    while (currentIndex !== 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // Swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

/**
 * Updates the game settings. Can only be performed by the host while in the 'lobby' state.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @param {{ nightDuration: number, discussionDuration: number, votingDuration: number }} settings - The new game settings.
 * @throws {Error} If the game is not found, the user is not the host, or the game is not in the lobby.
 */
export async function updateGameSettings(gameId: string, hostId: string, settings: { nightDuration: number, discussionDuration: number, votingDuration: number }) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        // Update the settings within the mafiaState object.
        transaction.update(gameRef, { 'mafiaState.settings': settings });
    });
}

/**
 * Starts the Mafia game, distributes roles, and transitions the game state.
 * Can only be performed by the host. Requires a minimum of 4 players.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 * @throws {Error} If the game is not found, the user is not the host, or there are insufficient players.
 */
export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        // --- Validations ---
        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') {
            // Prevent starting the game if it's already started.
            console.warn(`Attempted to start game ${gameId} which is not in lobby state.`);
            return;
        }
        if (game.players.length < 4) throw new Error("The game requires at least 4 players.");

        // --- Role Distribution Logic ---
        const rolesToDistribute = getRoleDistribution(game.players.length);
        const shuffledRoles = shuffle(rolesToDistribute);
        
        const updatedPlayers = game.players.map((player, index) => {
            const roleId = shuffledRoles[index] as MafiaRole;
            const roleInfo = MAFIA_ROLES.find(r => r.id === roleId);
            if (!roleInfo) throw new Error(`Role with id ${roleId} not found.`);
            return {
                ...player,
                role: roleId,
                team: roleInfo.team,
                status: 'alive' as const,
                isProtected: false,
                apparentRole: roleId,
            };
        });
        
        const roleRevealDuration = 15;

        // --- Update Game Document in Firestore ---
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'role_reveal',
            round: 1,
            playerScores: {},
            'mafiaState.phase': 'role_reveal',
            'mafiaState.rolesInGame': rolesToDistribute,
            'mafiaState.night': 1,
            'mafiaState.events': [],
            'mafiaState.nightActions': {},
            'mafiaState.killedPlayer': null,
            'mafiaState.savedPlayer': null,
            'mafiaState.investigationResult': null,
            'mafiaState.spyResult': null,
            'mafiaState.lastVotedOut': null,
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + roleRevealDuration * 1000), 
        });
    });
}


/**
 * Progresses the game to the next phase. Controlled by the host after the timer expires.
 * This function acts as a state machine, determining the next state based on the current one.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 */
export async function hostProgressNextPhase(gameId: string, hostId: string) {
    if (!gameId) {
        console.error("hostProgressNextPhase called with invalid gameId");
        return;
    }

    const gameRef = doc(db, 'games', gameId);

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                console.warn(`Game ${gameId} not found during phase progression.`);
                return;
            }
            const game = gameDoc.data() as Game;

            // --- Validations ---
            if (game.hostId !== hostId) {
                console.warn(`User ${hostId} is not the host of game ${gameId}.`);
                return;
            }
            
            const timerExpired = !game.mafiaState?.timerEndsAt || Date.now() >= game.mafiaState.timerEndsAt.toMillis();
            if (!timerExpired) {
                // Prevent host from progressing before time is up.
                throw new Error("لا يمكن الانتقال للمرحلة التالية قبل انتهاء الوقت.");
            }

            // --- State Machine Logic ---
            switch (game.gameState) {
                case 'role_reveal':
                    await progressToNight(game.id, transaction);
                    break;
                case 'night':
                    await processNight(game.id, transaction);
                    break;
                case 'discussion':
                    // Transition from discussion to voting.
                    transaction.update(gameRef, {
                        gameState: 'voting',
                        'mafiaState.phase': 'voting',
                        'mafiaState.votes': {}, // Reset votes for the new voting round.
                        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + (game.mafiaState?.settings?.votingDuration || 60) * 1000)
                    });
                    break;
                case 'voting':
                    await processVotes(game.id, transaction);
                    break;
                case 'voting_results':
                     if (game.id) { 
                         await progressToNight(game.id, transaction);
                    }
                    break;
                case 'final_results':
                    // Game has ended, no further progression.
                    break;
                default:
                    console.warn(`Unhandled game state for progression: ${game.gameState} in game ${gameId}`);
                    break;
            }
        });
    } catch (error) {
        console.error(`Error progressing phase for game ${gameId}:`, error);
        throw error;
    }
}


/**
 * Submits a player's night action to the game state.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player performing the action.
 * @param {NightAction} action - The details of the action being performed.
 * @throws {Error} If the game or player is not found, or if the action is invalid for the player's role.
 */
export async function submitNightAction(gameId: string, playerId: string, action: NightAction) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') return; // Actions only allowed during the night.

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.status !== 'alive') throw new Error("You cannot perform an action.");

        const role = MAFIA_ROLES.find(r => r.id === player.role);
        // Validate that the player's role has a night action.
        if (!role || !['killer', 'doctor', 'detective', 'spy', 'explosive', 'shifter'].includes(role.id)) {
            throw new Error("Your role does not have a night action.");
        }
        
        // Atomically update the nightActions map for the player.
        transaction.update(gameRef, {
            [`mafiaState.nightActions.${playerId}`]: action
        });
    });
}

/**
 * Transitions the game to the next night phase or ends the game if a win condition is met.
 * This is an internal function called by `hostProgressNextPhase`.
 * @param {string} gameId - The ID of the game.
 * @param {Transaction} transaction - The current Firestore transaction.
 */
async function progressToNight(gameId: string, transaction: Transaction) {
    if (!gameId) {
        console.error("progressToNight called with undefined gameId");
        throw new Error("Internal server error: gameId is undefined.");
    }
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for progressing to night");
    const game = gameDoc.data() as Game;

    // First, check if the game has ended.
    const winCondition = checkWinConditions(game);
    if (winCondition.isGameOver) {
        transaction.update(gameRef, {
            gameState: 'final_results',
            gameResult: { winner: winCondition.winner, message: winCondition.message }
        });
        
        const playersToUpdateLeaguesFor = game.players.filter(p => p.status !== 'left');
        const userLeaguesPromises = playersToUpdateLeaguesFor.map(p => getDoc(doc(db, 'users', p.id)));
        const userLeagueDocs = await Promise.all(userLeaguesPromises);
        const userLeagues = userLeagueDocs.map(d => d.data() as UserProfile)

        await updateLeagueScoresForGameEnd(game, userLeagues, transaction);
        return;
    }

    const nightDuration = game.mafiaState?.settings?.nightDuration || 70;

    // Reset player-specific states for the new night.
    const playersResetForNight = game.players.map(p => ({
        ...p,
        isProtected: false, 
    }));

    // Atomically update the game state to the new night phase.
    transaction.update(gameRef, {
        players: playersResetForNight, // Save the reset player states.
        gameState: 'night',
        'mafiaState.phase': 'night',
        'mafiaState.night': (game.mafiaState?.night || 0) + 1,
        // Reset all fields for the new night.
        'mafiaState.nightActions': {}, 
        'mafiaState.events': [], 
        'mafiaState.killedPlayer': null, 
        'mafiaState.savedPlayer': null, 
        'mafiaState.investigationResult': null, 
        'mafiaState.spyResult': null, 
        'mafiaState.lastVotedOut': null, 
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + nightDuration * 1000)
    });
}

/**
 * Processes all submitted night actions and calculates the outcome.
 * This is an internal function called by `hostProgressNextPhase`.
 * @param {string} gameId - The ID of the game.
 * @param {Transaction} transaction - The current Firestore transaction.
 */
async function processNight(gameId: string, transaction: Transaction) {
    if (!gameId) {
        console.error("processNight called with undefined gameId");
        throw new Error("Internal server error: gameId is undefined.");
    }
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for processing night.");
    const game = gameDoc.data() as Game;

    let updatedPlayers = [...game.players];
    const nightActions = game.mafiaState?.nightActions || {};
    const nightEvents: NightResult[] = [];
    let existingPrivateChats = game.mafiaState?.privateChats || [];

    const alivePlayers = updatedPlayers.filter(p => p.status === 'alive');
    
    // --- Action Processing Order (important for game logic) ---

    // 1. Shifter's action (choosing disguise) - affects what the spy sees.
    const shifter = alivePlayers.find(p => p.role === 'shifter');
    if (shifter && nightActions[shifter.id]?.disguiseAs) {
        const shifterIndex = updatedPlayers.findIndex(p => p.id === shifter.id);
        if(shifterIndex !== -1) {
            updatedPlayers[shifterIndex].apparentRole = nightActions[shifter.id]!.disguiseAs;
        }
    }
    
    // 2. Doctor's action (protection) - affects the killer's outcome.
    const doctor = alivePlayers.find(p => p.role === 'doctor');
    if (doctor && nightActions[doctor.id]?.targetId) {
        const savedPlayerId = nightActions[doctor.id]!.targetId!;
        const savedPlayerIndex = updatedPlayers.findIndex(p => p.id === savedPlayerId);
        if (savedPlayerIndex !== -1) {
            updatedPlayers[savedPlayerIndex].isProtected = true;
        }
    }

    // 3. Spy's action & private chat creation
    let spyResult: { playerId: string; role: MafiaRole; isShifter: boolean; isSoldier: boolean } | null = null;
    const spy = alivePlayers.find(p => p.role === 'spy');
    if (spy && nightActions[spy.id]?.targetId) {
        const targetId = nightActions[spy.id]!.targetId!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);
        if (targetPlayer?.role === 'soldier') {
            // If spy targets a soldier, the spy's attempt fails.
            nightEvents.push({ type: 'spy_report', message: `فشلت محاولة التجسس! ${targetPlayer.name} جندي وقد كشفك.` });
        } else if (targetPlayer) {
             spyResult = { playerId: targetId, role: targetPlayer.apparentRole!, isShifter: targetPlayer.role === 'shifter', isSoldier: false };
             // Create a private chat if the spy successfully finds another mafia member.
             if (targetPlayer.team === 'mafia') {
                const members = [spy.id, targetPlayer.id].sort();
                const chatId = members.join('-');
                const chatExists = existingPrivateChats.some(c => c.id === chatId);
                if (!chatExists) {
                    existingPrivateChats.push({
                        id: chatId,
                        members: members,
                        messages: [],
                    });
                }
             }
        }
    }

    // 4. Killer's action & Explosive's reaction
    const killer = alivePlayers.find(p => p.role === 'killer');
    if (killer && nightActions[killer.id]?.killTarget) {
        const targetId = nightActions[killer.id]!.killTarget!;
        const targetPlayerIndex = updatedPlayers.findIndex(p => p.id === targetId);

        if (targetPlayerIndex !== -1 && updatedPlayers[targetPlayerIndex].status === 'alive') {
            const targetPlayer = updatedPlayers[targetPlayerIndex];
            if (targetPlayer.isProtected) {
                // The target was saved by the doctor.
                nightEvents.push({ type: 'save_success', message: `نجا ${targetPlayer.name} من هجوم بفضل الطبيب!` });
            } else {
                // The target is killed.
                updatedPlayers[targetPlayerIndex].status = 'killed';
                nightEvents.push({ type: 'death', message: `قُتل اللاعب ${targetPlayer.name} (${MAFIA_ROLES.find(r => r.id === targetPlayer.role)?.name}) في الليل.` });

                // Check for Explosive retaliation.
                const explosive = alivePlayers.find(p => p.id === targetId && p.role === 'explosive');
                if (explosive && nightActions[explosive.id]?.targetId) {
                    const explosiveVictimId = nightActions[explosive.id]!.targetId!;
                    const explosiveVictimIndex = updatedPlayers.findIndex(p => p.id === explosiveVictimId);
                    if (explosiveVictimIndex !== -1 && updatedPlayers[explosiveVictimIndex].status === 'alive') {
                         updatedPlayers[explosiveVictimIndex].status = 'killed';
                         const victim = updatedPlayers[explosiveVictimIndex];
                         nightEvents.push({ type: 'death', message: `قام ${explosive.name} بتفجير ${victim.name} (${MAFIA_ROLES.find(r => r.id === victim.role)?.name}) معه!` });
                    }
                }
            }
        }
    }

    // 5. Detective's action
    let investigationResult: { playerId: string; team: Team; } | null = null;
    const detective = alivePlayers.find(p => p.role === 'detective');
    if (detective && nightActions[detective.id]?.targetId) {
        const targetId = nightActions[detective.id]!.targetId!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);
        if (targetPlayer) {
            investigationResult = { playerId: targetId, team: targetPlayer.team! };
        }
    }
    
    // --- Transition to Day Phase ---
    const discussionDuration = game.mafiaState?.settings?.discussionDuration || 180;
    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'discussion',
        'mafiaState.phase': 'discussion',
        'mafiaState.events': nightEvents,
        'mafiaState.investigationResult': investigationResult,
        'mafiaState.spyResult': spyResult,
        'mafiaState.privateChats': existingPrivateChats,
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + discussionDuration * 1000),
    });
}

/**
 * Submits a player's vote during the day phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} voterId - The ID of the player voting.
 * @param {string | null} targetId - The ID of the player being voted for, or null for "no one".
 */
export async function submitVote(gameId: string, voterId: string, targetId: string | null) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        if (game.gameState !== 'voting') return; 

        const player = game.players.find(p => p.id === voterId);
        if (!player || player.status !== 'alive') throw new Error("Only alive players can vote.");

        // Validate that the target is also alive.
        if (targetId && targetId !== "no_one") {
            const targetPlayer = game.players.find(p => p.id === targetId);
            if (!targetPlayer || targetPlayer.status !== 'alive') throw new Error("You can only vote for an alive player.");
        }

        const updatedVotes = { ...(game.mafiaState?.votes || {}), [voterId]: targetId };
        transaction.update(gameRef, { 'mafiaState.votes': updatedVotes });
    });
}

/**
 * Processes all votes at the end of the voting phase to determine who is eliminated.
 * This is an internal function called by `hostProgressNextPhase`.
 * @param {string} gameId - The ID of the game.
 * @param {Transaction} transaction - The current Firestore transaction.
 */
async function processVotes(gameId: string, transaction: Transaction) {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for processing votes.");
    const game = gameDoc.data() as Game;

    const votes = game.mafiaState?.votes || {};
    const voteCounts: Record<string, number> = {};
    
    // Count votes for each player.
    Object.values(votes).forEach(targetId => {
        if (targetId && targetId !== "no_one") {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });

    const maxVotes = Math.max(0, ...Object.values(voteCounts));
    const playersWithMaxVotes = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

    let playerVotedOutId: string | null = null;
    let updatedPlayers = [...game.players];

    // If there is a single player with the most votes, they are eliminated.
    if (maxVotes > 0 && playersWithMaxVotes.length === 1) {
        playerVotedOutId = playersWithMaxVotes[0];
        const votedPlayerIndex = updatedPlayers.findIndex(p => p.id === playerVotedOutId);
        if (votedPlayerIndex !== -1) {
            updatedPlayers[votedPlayerIndex].status = 'voted_out';
        }
    }

    // After voting, check for win conditions again.
    const freshGameData = { ...game, players: updatedPlayers };
    const winCondition = checkWinConditions(freshGameData);

    if (winCondition.isGameOver) {
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'final_results',
            gameResult: { winner: winCondition.winner, message: winCondition.message }
        });
        
        const playersToUpdateLeaguesFor = freshGameData.players.filter(p => p.status !== 'left');
        const userLeaguesPromises = playersToUpdateLeaguesFor.map(p => getDoc(doc(db, 'users', p.id)));
        const userLeagueDocs = await Promise.all(userLeaguesPromises);
        const userLeagues = userLeagueDocs.map(d => d.data() as UserProfile)

        await updateLeagueScoresForGameEnd(freshGameData, userLeagues, transaction);
        return;
    }

    // Otherwise, transition to the voting results display phase.
    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'voting_results',
        'mafiaState.phase': 'voting_results',
        'mafiaState.votes': {}, // Reset votes.
        'mafiaState.lastVotedOut': {
            playerId: playerVotedOutId,
            tie: playersWithMaxVotes.length !== 1, // Indicate if there was a tie.
        },
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + 10 * 1000) // 10-second timer for results.
    });
}


/**
 * Checks for game-ending conditions.
 * @param {Game} game - The current game state.
 * @returns {{ isGameOver: boolean; winner?: 'good' | 'mafia' | 'تعادل'; message?: string }} An object indicating the game's status.
 */
function checkWinConditions(game: Game): { isGameOver: boolean; winner?: 'good' | 'mafia' | 'تعادل'; message?: string } {
    const alivePlayers = game.players.filter(p => p.status === 'alive');
    if (alivePlayers.length === 0) {
        return { isGameOver: true, winner: 'تعادل', message: "لم ينجُ أحد!" };
    }

    const mafiaTeam = alivePlayers.filter(p => p.team === 'mafia');
    const goodTeam = alivePlayers.filter(p => p.team === 'good');
    
    // Good team wins if all mafia members are eliminated.
    if (mafiaTeam.length === 0) {
        return { isGameOver: true, winner: 'good', message: 'لقد نجح فريق الخير في القضاء على جميع أفراد المافيا!' };
    }

    // Mafia team wins if their number is equal to or greater than the number of good team members.
    if (mafiaTeam.length >= goodTeam.length) {
        return { isGameOver: true, winner: 'mafia', message: 'لقد سيطرت المافيا على المدينة!' };
    }
    
    // Otherwise, the game continues.
    return { isGameOver: false };
}

/**
 * Sends a message in a private chat between two players (e.g., Spy and Mafia).
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player sending the message.
 * @param {string} chatId - The ID of the private chat.
 * @param {string} text - The message content.
 */
export async function sendPrivateChatMessage(gameId: string, playerId: string, chatId: string, text: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const player = game.players.find(p => p.id === playerId);
        if (!player) throw new Error("Player not found.");

        const privateChats = game.mafiaState?.privateChats || [];
        const chatIndex = privateChats.findIndex(c => c.id === chatId);
        if (chatIndex === -1) throw new Error("Chat not found.");
        if (!privateChats[chatIndex].members.includes(playerId)) throw new Error("You are not part of this chat.");

        const newMessage = {
            senderId: playerId,
            senderName: player.name,
            text: text,
            timestamp: Timestamp.now(),
        };

        privateChats[chatIndex].messages.push(newMessage);
        
        transaction.update(gameRef, { 'mafiaState.privateChats': privateChats });
    });
}
