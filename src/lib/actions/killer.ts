

/**
 * @fileoverview Actions specific to the "Killer" (Mafia) game.
 * This file contains the core logic for role assignment, night actions, voting, and game state transitions.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  arrayUnion,
  Timestamp,
  deleteField,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import type { Player, Game, GameState, PlayerRole, NightAction, NightResult, ChatMessage, KillerMethod } from '@/types';
import { getPlayerFromUserId } from '@/lib/actions/helpers';


/**
 * Updates the settings for the Killer game (discussion and night time).
 * Only the host can perform this action and only when the game is in the 'lobby' state.
 * @param {string} gameId - The ID of the game to update.
 * @param {string} hostId - The ID of the user attempting to change the settings.
 * @param {Game['killerSettings']} settings - The new settings object for the Killer game.
 */
export async function updateKillerGameSettings(gameId: string, hostId: string, settings: Game['killerSettings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can change settings.");
        }
        if (game.gameState !== 'lobby') {
            throw new Error("Settings can only be changed in the lobby.");
        }

        transaction.update(gameRef, { killerSettings: settings });
    });
}

/**
 * Starts the Killer game.
 * This function assigns roles to players based on the player count and moves the game to the 'role_reveal' state.
 * This action can only be performed by the host.
 * @param {string} gameId - The ID of the game to start.
 * @param {string} userId - The ID of the user starting the game (must be the host).
 * @throws Will throw an error if the user is not the host, the game is of the wrong type, or there are not enough players.
 */
export async function startKillerGame(gameId: string, userId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== userId) {
            throw new Error("فقط صاحب الغرفة يمكنه بدء اللعبة.");
        }
        
        if (game.gameType !== 'killer') throw new Error("Invalid action for this game type.");
        if (game.players.length < 4) throw new Error("تحتاج اللعبة إلى 4 لاعبين على الأقل.");
        if (game.gameState !== 'lobby') return; 

        // --- Role Assignment Logic ---
        const playersForRoles = [...game.players].sort(() => Math.random() - 0.5);
        const playerCount = playersForRoles.length;
        
        // Define base roles and optional roles based on player count
        const rolesToAssign: PlayerRole[] = ['killer', 'detective', 'doctor', 'soldier'];
        if (playerCount >= 5) rolesToAssign.push('spy');
        if (playerCount >= 6) rolesToAssign.push('suicide_bomber');
        if (playerCount >= 7) rolesToAssign.push('impersonator');
        
        // Fill remaining slots with 'civilian' role
        while (rolesToAssign.length < playerCount) {
            rolesToAssign.push('civilian');
        }
        
        const shuffledRoles = rolesToAssign.sort(() => Math.random() - 0.5);

        // Assign roles and initial status to players
        playersForRoles.forEach((player, index) => {
            player.role = shuffledRoles[index];
            player.status = 'alive';
            player.isProtected = false;
        });
        
        const roleRevealTime = 5; // 5 seconds for role reveal

        // Update the game document in Firestore
        transaction.update(gameRef, { 
            players: playersForRoles.sort((a,b) => a.name.localeCompare(b.name)), // Sort players alphabetically for consistent display
            gameState: 'role_reveal',
            turn: 1,
            messages: [],
            votes: {},
            nightActions: {},
            nightResults: {},
            gameResult: deleteField(),
            discussionEndsAt: Timestamp.fromMillis(Date.now() + roleRevealTime * 1000), // Set timer for the role reveal phase
        });
    });
}

/**
 * Progresses the game from the role reveal phase to the night phase.
 * This is triggered automatically by a timeout on the client.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the user triggering the action (must be the host).
 */
export async function progressToNight(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can progress the game.");
        }
        
        if (game.gameState === 'role_reveal' || game.gameState === 'voting_results') {
            const nightTime = game.killerSettings?.nightTime || 40;
            transaction.update(gameRef, {
                gameState: 'night',
                nightActions: {},
                nightResults: {},
                votes: {},
                lastVoteResult: deleteField(),
                discussionEndsAt: Timestamp.fromMillis(Date.now() + nightTime * 1000),
            });
        }
    });
}


/**
 * Submits a player's action for the night phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player submitting the action.
 * @param {NightAction} action - The night action object.
 */
export async function submitNightAction(gameId: string, playerId: string, action: NightAction) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        if (game.gameState !== 'night') throw new Error("لا يمكنك استخدام قدرتك الآن.");

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.status !== 'alive') throw new Error("لا يمكنك القيام بهذا الإجراء.");
        
        const newNightActions = { ...(game.nightActions || {}), [playerId]: action };

        transaction.update(gameRef, { 
            [`nightActions.${playerId}`]: action 
        });
    });
}


/**
 * Processes all night actions in a specific order of priority to ensure correct outcomes.
 * @param {string} gameId - The ID of the game.
 * @param {any} transaction - The Firestore transaction object.
 */
async function processNight(gameId: string, transaction: any) {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) return; 
    const game = gameDoc.data() as Game;
    const nightActions = game.nightActions || {};

    let updatedPlayers = JSON.parse(JSON.stringify(game.players)) as Player[];
    const nightResults: NightResult = {};
    
    updatedPlayers.forEach(p => p.isProtected = false);

    const doctor = updatedPlayers.find(p => p.role === 'doctor' && p.status === 'alive');
    if (doctor && nightActions[doctor.id]) {
        const doctorAction = nightActions[doctor.id];
        if (doctorAction?.protectTarget) {
            const protectedPlayerIndex = updatedPlayers.findIndex(p => p.id === doctorAction.protectTarget);
            if (protectedPlayerIndex !== -1) updatedPlayers[protectedPlayerIndex].isProtected = true;
        }
    }

    const impersonator = updatedPlayers.find(p => p.role === 'impersonator' && p.status === 'alive');
    if(impersonator && nightActions[impersonator.id]) {
        const impersonatorAction = nightActions[impersonator.id];
        if(impersonatorAction?.impersonateRole){
            const impersonatorIndex = updatedPlayers.findIndex(p => p.id === impersonator.id);
            if(impersonatorIndex !== -1) updatedPlayers[impersonatorIndex].apparentRole = impersonatorAction.impersonateRole;
        }
    }
    
    const suicideBomber = updatedPlayers.find(p => p.role === 'suicide_bomber' && p.status === 'alive');
    const suicideBomberAction = suicideBomber ? nightActions[suicideBomber.id] : undefined;

    const killer = updatedPlayers.find(p => p.role === 'killer' && p.status === 'alive');
    if (killer && nightActions[killer.id]) {
        const killerAction = nightActions[killer.id];
        if (killerAction?.killTarget) {
            const victimIndex = updatedPlayers.findIndex(p => p.id === killerAction.killTarget);
            if (victimIndex !== -1) {
                const victim = updatedPlayers[victimIndex];
                if (victim && !victim.isProtected) {
                    victim.status = 'killed';
                    nightResults.killedPlayerId = victim.id;
                    nightResults.killedPlayerName = victim.name;
                    nightResults.killMethod = "طعن بالسكين"; 

                    if (victim.role === 'suicide_bomber' && suicideBomberAction?.setCurseTarget === killer?.id) {
                        const killerIndex = updatedPlayers.findIndex(p => p.id === killer?.id);
                        if (killerIndex !== -1) {
                            updatedPlayers[killerIndex].status = 'killed';
                            nightResults.suicideBomberTakesKillerWithThem = true;
                        }
                    }
                } else {
                    nightResults.wasSaved = true; 
                }
            }
        }
    }
    
    const detective = updatedPlayers.find(p => p.role === 'detective' && p.status === 'alive');
    if (detective && nightActions[detective.id]) {
        const detectiveAction = nightActions[detective.id];
        if (detectiveAction?.checkTarget) {
            const target = updatedPlayers.find(p => p.id === detectiveAction.checkTarget);
            if (target) {
                nightResults.detectiveCheckResult = { targetName: target.name, role: target.apparentRole || target.role! };
            }
        }
    }

    const spy = updatedPlayers.find(p => p.role === 'spy' && p.status === 'alive');
    if (spy && nightActions[spy.id]) {
        const spyAction = nightActions[spy.id];
        if (spyAction?.checkTarget) {
            const target = updatedPlayers.find(p => p.id === spyAction.checkTarget);
            if (target) {
                if (target.role === 'soldier') {
                    nightResults.spyWasSpotted = true; 
                } else {
                    nightResults.spyCheckResult = { targetName: target.name, role: target.apparentRole || target.role! };
                }
            }
        }
    }

    const gameEndResult = checkWinConditions(updatedPlayers);
    if (gameEndResult) {
        transaction.update(gameRef, { ...gameEndResult, players: updatedPlayers });
        return;
    }
    
    const discussionTime = game.killerSettings?.discussionTime || 180;
    
    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'discussion',
        turn: (game.turn || 0) + 1,
        nightResults: nightResults,
        discussionEndsAt: Timestamp.fromMillis(Date.now() + discussionTime * 1000),
    });
}

/**
 * Submits a player's vote during the discussion or tie-breaker phase.
 * @param {string} gameId - The ID of the game.
 * @param {string} voterId - The ID of the player voting.
 * @param {string} votedForId - The ID of the player being voted for.
 */
export async function submitVote(gameId: string, voterId: string, votedForId: string) {
    if (!votedForId) throw new Error("يجب عليك اختيار لاعب للتصويت عليه.");

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        
        const game = gameDoc.data() as Game;
        if (game.gameState !== 'discussion' && game.gameState !== 'tie_breaker_voting') throw new Error("ليس وقت التصويت الآن.");

        const voter = game.players.find(p => p.id === voterId);
        if (!voter || (voter.status !== 'alive')) throw new Error("لا يمكنك التصويت.");
        
        if (game.gameState === 'tie_breaker_voting') {
            const lastVoteTiedPlayers = game.lastVoteResult?.tiedPlayers || [];
            if (lastVoteTiedPlayers.includes(voterId)) {
                throw new Error("لا يمكنك التصويت في جولة كسر التعادل.");
            }
        }
        
        transaction.update(gameRef, { 
            [`votes.${voterId}`]: votedForId 
        });
    });
}

/**
 * Tallies the final votes and determines the outcome (elimination, tie, or tie-breaker).
 * This is an internal helper function.
 * @param {Game} game - The current game object.
 * @returns A partial Game object with the necessary updates for the transaction.
 */
function _tallyVotesAndGetUpdates(game: Game): Partial<Game> & { [key:string]: any } {
    const finalVotes = game.votes || {};
    const voteCounts: Record<string, number> = {};
    
    for (const votedFor of Object.values(finalVotes)) {
        voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1;
    }

    let maxVotes = 0;
    let playersWithMaxVotes: string[] = [];
    for (const playerId in voteCounts) {
        if (voteCounts[playerId] > maxVotes) {
            maxVotes = voteCounts[playerId];
            playersWithMaxVotes = [playerId];
        } else if (voteCounts[playerId] === maxVotes && maxVotes > 0) {
            playersWithMaxVotes.push(playerId);
        }
    }

    let updatedPlayers = [...game.players];
    let nextGameState: GameState = 'voting_results';
    let lastVoteResult: Game['lastVoteResult'] = { wasTie: false };
    let gameEndResult: Game['gameResult'] | null = null;

    if (playersWithMaxVotes.length > 1) { 
        if (game.gameState === 'discussion') { 
            nextGameState = 'tie_breaker_voting';
            lastVoteResult = { wasTie: true, message: `تعادل بين ${playersWithMaxVotes.length} لاعبين! جولة تصويت جديدة بينهم فقط.`, tiedPlayers: playersWithMaxVotes };
        } else { 
            lastVoteResult = { wasTie: true, message: 'حدث تعادل مرة أخرى! لا أحد سيغادر هذه الجولة.' };
        }
    } else if (playersWithMaxVotes.length === 1) { 
        const eliminatedPlayerId = playersWithMaxVotes[0];
        const eliminatedPlayerIndex = updatedPlayers.findIndex(p => p.id === eliminatedPlayerId);
        
        if (eliminatedPlayerIndex !== -1) {
            const eliminatedPlayer = updatedPlayers[eliminatedPlayerIndex];
            updatedPlayers[eliminatedPlayerIndex].status = 'voted_out';
            lastVoteResult = { 
                wasTie: false, 
                message: `تم التصويت لإقصاء ${eliminatedPlayer.name}.`,
                eliminatedPlayerName: eliminatedPlayer.name,
                eliminatedPlayerRole: eliminatedPlayer.role,
            };

            const endResult = checkWinConditions(updatedPlayers);
            if(endResult) {
                 gameEndResult = endResult.gameResult;
                 nextGameState = endResult.gameState;
            }
        }
    } else { 
        lastVoteResult = { wasTie: true, message: 'لم يتم التصويت لإقصاء أي لاعب في هذه الجولة.' };
    }

    const updates: Partial<Game> & { [key:string]: any } = {
        players: updatedPlayers,
        gameState: nextGameState,
        lastVoteResult: lastVoteResult,
        discussionEndsAt: Timestamp.fromMillis(Date.now() + 5 * 1000), 
        votes: {}, 
    };
    if(gameEndResult) {
        updates.gameResult = gameEndResult;
    }
    
    return updates;
}

/**
 * Checks if a win condition has been met after an action (kill or vote).
 * @param {Player[]} players - The current list of all players and their statuses.
 * @returns { { gameState: 'ended', gameResult: Game['gameResult'] } | null } A gameResult object if the game has ended, otherwise null.
 */
function checkWinConditions(players: Player[]): { gameState: 'ended'; gameResult: Game['gameResult'] } | null {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const townTeam = alivePlayers.filter(p => ['detective', 'doctor', 'soldier', 'impersonator', 'civilian', 'suicide_bomber'].includes(p.role!));
    const killer = players.find(p => p.role === 'killer');
    const mafiaTeam = alivePlayers.filter(p => ['killer', 'spy'].includes(p.role!));

    let gameResult: Game['gameResult'] | null = null;
    
    if (mafiaTeam.length > townTeam.length) {
        gameResult = { winner: 'mafia', message: 'سيطرت المافيا على المدينة! فريق المافيا ينتصر!' };
    } 
    else if (killer?.status !== 'alive') {
        gameResult = { winner: 'town', message: `تم القضاء على القاتل! فريق الخير ينتصر!` };
    }

    if (gameResult) {
        return { 
            gameState: 'ended', 
            gameResult: gameResult
        };
    }
    
    return null;
}

/**
 * Submits a chat message from a player.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player sending the message.
 * @param {string} text - The content of the message.
 */
export async function submitMessage(gameId: string, playerId: string, text: string) {
    if (!text.trim()) throw new Error("الرسالة لا يمكن أن تكون فارغة.");
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        
        const player = (gameDoc.data() as Game).players.find(p => p.id === playerId);
        if (!player) throw new Error("لم يتم العثور على اللاعب.");
        if (player.status !== 'alive') throw new Error("لا يمكنك إرسال رسائل.");

        const message: ChatMessage = {
            senderId: player.id,
            senderName: player.name,
            text: text.trim(),
            timestamp: Timestamp.now(),
        };

        transaction.update(gameRef, {
            messages: arrayUnion(message)
        });
    });
}

/**
 * Handles game state transitions when a timer expires.
 * Only the host should trigger this function.
 * @param {string} hostId - The ID of the host player.
 */
export async function handleTimeout(hostId: string) {
    // Find the game this host is currently managing that is active.
    const gamesRef = collection(db, 'games');
    const q = query(gamesRef, 
        where('hostId', '==', hostId), 
        where('gameState', 'in', ['role_reveal', 'night', 'discussion', 'tie_breaker_voting', 'voting_results'])
    );

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            console.warn(`No active game found for host ${hostId} to timeout.`);
            return;
        }

        const gameDoc = querySnapshot.docs[0]; // Assume host only has one active game
        const gameRef = gameDoc.ref;
        const gameId = gameDoc.id; // Get the correct gameId here

        await runTransaction(db, async (transaction) => {
            // Re-fetch inside transaction for consistency
            const freshGameDoc = await transaction.get(gameRef);
            if (!freshGameDoc.exists()) return;
            const freshGame = freshGameDoc.data() as Game;

            // Timer check to prevent premature execution
            if (freshGame.discussionEndsAt && Date.now() < freshGame.discussionEndsAt.toMillis()) {
                return; 
            }

            if (freshGame.gameState === 'role_reveal') {
                await progressToNight(gameId, hostId);
            } else if (freshGame.gameState === 'night') {
                await processNight(gameId, transaction);
            } else if (freshGame.gameState === 'discussion' || freshGame.gameState === 'tie_breaker_voting') {
                const updates = _tallyVotesAndGetUpdates(freshGame);
                transaction.update(gameRef, updates);
            } else if (freshGame.gameState === 'voting_results') {
                await progressToNight(gameId, hostId);
            }
        });
    } catch (error) {
        console.error(`Error handling timeout for host ${hostId}:`, error);
    }
}
