
'use server';

/**
 * @fileoverview Server-side actions for the "Mafia" game.
 * This file contains the core game logic, including starting the game,
 * handling night actions, processing day/night cycles, and determining winners.
 */

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, PlayerRole, NightAction, DayEvent, NightActionType, PlayerTeam, PrivateChatMessage } from '@/types';
import { getRoleDistribution, ROLES } from '@/data/mafia-roles';
import { updateLeagueScoresForGameEnd } from './user';

// --- Game Constants ---
const ROLE_REVEAL_DURATION = 15; // seconds
const NIGHT_PHASE_DURATION = 40; // seconds
const DAY_PHASE_DURATION = 60;   // seconds
const VOTING_PHASE_DURATION = 30; // seconds

// Helper function to shuffle an array
function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Starts the Mafia game. This function is called by the host from the lobby.
 * It distributes roles, sets the initial game state, and starts the role reveal phase.
 * @param {string} gameId - The ID of the game to start.
 * @param {string} hostId - The ID of the user starting the game, must be the host.
 * @throws {Error} If the user is not the host, the game is not in the lobby, or player count is invalid.
 */
export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);

    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("اللعبة غير موجودة.");
        
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("فقط صاحب الغرفة يمكنه بدء اللعبة.");
        if (game.gameState !== 'lobby') return; // Prevent starting a game that's already started

        const players = game.players.filter(p => p.status !== 'left');
        if (players.length < 4 || players.length > 8) {
            throw new Error("عدد اللاعبين يجب أن يكون بين 4 و 8.");
        }

        // --- Role Distribution ---
        const rolesToDistribute = getRoleDistribution(players.length);
        const shuffledPlayers = shuffle(players);
        const updatedPlayers = shuffledPlayers.map((player, index) => ({
            ...player,
            role: rolesToDistribute[index],
            team: ROLES[rolesToDistribute[index]].team,
            status: 'alive' as const, // Ensure all players start as alive
        }));
        
        // --- Setting up the first phase (Role Reveal) ---
        const roleRevealEndsAt = Timestamp.fromMillis(Date.now() + ROLE_REVEAL_DURATION * 1000);

        transaction.update(gameRef, {
            players: updatedPlayers, // This is the crucial part: save the updated players with roles.
            gameState: 'role_reveal',
            round: 1, // Using 'round' to represent the day number
            playerScores: {}, // Reset scores
            'mafiaState.phase': 'role_reveal',
            'mafiaState.rolesInGame': rolesToDistribute,
            'mafiaState.night': 1,
            'mafiaState.events': [],
            'mafiaState.nightActions': {},
            'mafiaState.timerEndsAt': roleRevealEndsAt, 
        });
    });
}

/**
 * Submits a player's action during the night phase.
 * @param {object} params - The action parameters.
 * @param {string} params.gameId - The ID of the game.
 * @param {string} params.actorId - The ID of the player performing the action.
 * @param {NightActionType | 'shapeshift'} params.action - The type of action being performed.
 * @param {string} params.targetId - The ID of the player being targeted (or role name for shapeshifter).
 * @throws {Error} If the game state is incorrect or the action is invalid.
 */
export async function submitNightAction(params: { gameId: string; actorId: string; action: NightActionType | 'shapeshift'; targetId: string; }) {
    const { gameId, actorId, action, targetId } = params;
    const gameRef = doc(db, 'games', gameId);

    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("اللعبة غير موجودة.");

        const game = gameDoc.data() as Game;
        if (game.gameState !== 'night') return;
        
        const actor = game.players.find(p => p.id === actorId);
        if (!actor || actor.status !== 'alive') throw new Error("لا يمكنك القيام بأي إجراء.");
        
        // Specific validation for doctor's cooldown
        if (action === 'heal' && game.mafiaState?.lastHealed === targetId) {
            throw new Error("لا يمكنك علاج نفس الشخص في ليلتين متتاليتين.");
        }

        const actionData: NightAction = { actorId, action, targetId };
        
        transaction.update(gameRef, {
            [`mafiaState.nightActions.${actorId}`]: actionData,
        });
    });
}

/**
 * Processes the results of the night phase and transitions the game to the day phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host, to ensure only one process runs.
 * @throws {Error} If the user is not the host or the game state is incorrect.
 */
export async function processNight(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) return;
        if (game.gameState !== 'night') return;

        const nightActions = game.mafiaState?.nightActions || {};
        const events: DayEvent[] = [];
        let updatedPlayers = [...game.players];
        let lastHealed: string | undefined = undefined;

        // --- Action Processing Logic ---
        const killAction = Object.values(nightActions).find(a => a.action === 'kill');
        const healAction = Object.values(nightActions).find(a => a.action === 'heal');
        const investigations = Object.values(nightActions).filter(a => a.action === 'investigate');
        const spyActions = Object.values(nightActions).filter(a => a.action === 'spy');
        
        // 1. Process Healing
        if (healAction) {
            lastHealed = healAction.targetId;
        }

        // 2. Process Kills
        let killedPlayerId: string | null = null;
        if (killAction && killAction.targetId !== healAction?.targetId) {
            const killedPlayerIndex = updatedPlayers.findIndex(p => p.id === killAction.targetId);
            if (killedPlayerIndex !== -1) {
                updatedPlayers[killedPlayerIndex].status = 'killed';
                killedPlayerId = killAction.targetId;
                events.push({ type: 'death', message: `تم العثور على ${updatedPlayers[killedPlayerIndex].name} مقتولاً هذا الصباح.` });
            }
        } else if (killAction && killAction.targetId === healAction?.targetId) {
            events.push({ type: 'protection', message: 'نجا أحد اللاعبين من هجوم بفضل الطبيب!' });
        }

        // 3. Process Investigations & Spying
        investigations.forEach(action => {
            const target = updatedPlayers.find(p => p.id === action.targetId);
            if (target) {
                const team = ROLES[target.role!].team;
                events.push({ type: 'investigation', message: `كشف المحقق أن ${target.name} من فريق ${team === 'mafia' ? 'الشر' : 'الخير'}.`, revealedTeam: team });
            }
        });

        // 4. Process Spying and create private chats if needed
        let newPrivateChats = { ...(game.mafiaState?.privateChats || {}) };
        spyActions.forEach(action => {
            const spy = updatedPlayers.find(p => p.id === action.actorId);
            const target = updatedPlayers.find(p => p.id === action.targetId);
            if (spy && target) {
                let revealedRole = target.role!;
                let eventMessage = `كشف الجاسوس أن دور ${target.name} هو ${ROLES[revealedRole].name}.`;

                if (target.role === 'soldier') {
                    eventMessage = `حاول الجاسوس التجسس على جندي، فانكشفت هويته! الجاسوس هو ${spy.name}.`;
                    revealedRole = 'spy'; // The revealed role is the spy's
                } else if (target.role === 'shapeshifter') {
                    const shapeshifterAction = Object.values(nightActions).find(a => a.actorId === target.id);
                    if (shapeshifterAction) {
                        revealedRole = shapeshifterAction.targetId as PlayerRole; // TargetId holds the fake role
                        eventMessage = `كشف الجاسوس أن دور ${target.name} هو ${ROLES[revealedRole].name}.`;
                    }
                }
                
                events.push({ type: 'spy_reveal', message: eventMessage, revealedRole });

                // Check if spy found the killer
                if (target.role === 'killer') {
                    const chatId = `chat_${spy.id}_${target.id}`;
                    if (!newPrivateChats[chatId]) {
                        newPrivateChats[chatId] = {
                            participants: [spy.id, target.id],
                            messages: [],
                        };
                    }
                }
            }
        });


        // --- Check for Winner ---
        const winnerCheck = checkForWinner(updatedPlayers);
        if (winnerCheck) {
            transaction.update(gameRef, {
                players: updatedPlayers,
                gameState: 'final_results',
                gameResult: winnerCheck,
            });
            await updateLeagueScoresForGameEnd(game, transaction);
            return;
        }
        
        // --- Transition to Day Phase ---
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'day',
            'mafiaState.phase': 'day',
            'mafiaState.events': events,
            'mafiaState.lastHealed': lastHealed,
            'mafiaState.lastKilled': killedPlayerId,
            'mafiaState.privateChats': newPrivateChats,
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + DAY_PHASE_DURATION * 1000),
        });
    });
}

/**
 * Handles the logic for transitioning from day/voting to the next phase (night or results).
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host.
 */
export async function processDay(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) return;
        if (game.gameState !== 'voting') return;

        const votes = game.mafiaState?.votes || {};
        const voteCounts: Record<string, number> = {};
        Object.values(votes).forEach(targetId => {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        });

        let maxVotes = 0;
        let playersToExecute: string[] = [];
        for (const playerId in voteCounts) {
            if (voteCounts[playerId] > maxVotes) {
                maxVotes = voteCounts[playerId];
                playersToExecute = [playerId];
            } else if (voteCounts[playerId] === maxVotes) {
                playersToExecute.push(playerId);
            }
        }
        
        let updatedPlayers = [...game.players];
        const newEvents: DayEvent[] = [];
        
        if (playersToExecute.length === 1) {
            const executedPlayerId = playersToExecute[0];
            const playerIndex = updatedPlayers.findIndex(p => p.id === executedPlayerId);
            if (playerIndex !== -1) {
                updatedPlayers[playerIndex].status = 'voted_out';
                newEvents.push({type: 'execution', message: `قرر الجميع إعدام ${updatedPlayers[playerIndex].name}. كان دوره هو ${ROLES[updatedPlayers[playerIndex].role!].name}.`});
                
                // Bomber's ability check
                if (updatedPlayers[playerIndex].role === 'bomber') {
                    const bomberAction = Object.values(game.mafiaState?.nightActions || {}).find(a => a.actorId === executedPlayerId);
                    if (bomberAction) {
                        const targetIndex = updatedPlayers.findIndex(p => p.id === bomberAction.targetId);
                        if (targetIndex !== -1 && updatedPlayers[targetIndex].status === 'alive') {
                             updatedPlayers[targetIndex].status = 'killed';
                             newEvents.push({type: 'death', message: `عند موته، فجّر الانتحاري ${updatedPlayers[targetIndex].name} معه!`});
                        }
                    }
                }
            }
        } else {
             newEvents.push({type: 'execution', message: 'لم يتمكن اللاعبون من الاتفاق على شخص واحد لإعدامه. لم يمت أحد اليوم.'});
        }
        
        const winnerCheck = checkForWinner(updatedPlayers);
        if (winnerCheck) {
            transaction.update(gameRef, {
                players: updatedPlayers,
                gameState: 'final_results',
                gameResult: winnerCheck,
                'mafiaState.events': game.mafiaState?.events?.concat(newEvents) || newEvents
            });
            await updateLeagueScoresForGameEnd(game, transaction);
            return;
        }

        // Transition to next night
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'night',
            'mafiaState.phase': 'night',
            'mafiaState.night': (game.mafiaState?.night || 1) + 1,
            'mafiaState.nightActions': {},
            'mafiaState.votes': {},
            'mafiaState.events': [], // Clear events for the new day
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + NIGHT_PHASE_DURATION * 1000),
        });
    });
}

/**
 * Submits a player's vote during the day phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} voterId - The ID of the player voting.
 * @param {string} targetId - The ID of the player being voted for.
 * @throws {Error} If the game state is incorrect or the player cannot vote.
 */
export async function submitVote(gameId: string, voterId: string, targetId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'voting') return;
        const voter = game.players.find(p => p.id === voterId);
        if (!voter || voter.status !== 'alive') throw new Error("لا يمكنك التصويت.");

        transaction.update(gameRef, {
            [`mafiaState.votes.${voterId}`]: targetId,
        });
    });
}

/**
 * Sends a message in a private chat between the spy and the killer.
 * @param {string} gameId - The ID of the game.
 * @param {string} chatId - The ID of the private chat.
 * @param {string} senderId - The ID of the message sender.
 * @param {string} message - The content of the message.
 */
export async function sendPrivateChatMessage(gameId: string, chatId: string, senderId: string, message: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        
        const game = gameDoc.data() as Game;
        const chat = game.mafiaState?.privateChats?.[chatId];
        const sender = game.players.find(p => p.id === senderId);

        if (!chat || !sender || !chat.participants.includes(senderId)) return;
        
        const newMessage: PrivateChatMessage = {
            senderId,
            senderName: sender.name,
            message,
            timestamp: Timestamp.now(),
        };

        const updatedMessages = [...chat.messages, newMessage];

        transaction.update(gameRef, {
            [`mafiaState.privateChats.${chatId}.messages`]: updatedMessages,
        });
    });
}


/**
 * Checks if a winning or losing condition has been met.
 * @param {Player[]} players - The current list of all players.
 * @returns {Game['gameResult'] | null} The game result object if the game has ended, otherwise null.
 */
function checkForWinner(players: Player[]): Game['gameResult'] | null {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const mafiaTeam = alivePlayers.filter(p => p.team === 'mafia');
    const goodTeam = alivePlayers.filter(p => p.team === 'good');

    // Win condition for the Good team: The killer is eliminated.
    const killer = players.find(p => p.role === 'killer');
    if (!killer || killer.status !== 'alive') {
        return { winner: 'good', message: 'تم القضاء على القاتل! فريق الخير ينتصر.' };
    }

    // Win condition for the Mafia team: They equal or outnumber the Good team.
    if (mafiaTeam.length >= goodTeam.length) {
        return { winner: 'mafia', message: 'سيطر فريق الشر على المدينة! المافيا تفوز.' };
    }
    
    // No winner yet
    return null;
}
