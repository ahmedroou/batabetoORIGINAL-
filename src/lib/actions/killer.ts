/**
 * @fileoverview Actions specific to the "Killer" (Mafia) game.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  arrayUnion,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import type { Player, Game, GameState, PlayerRole, NightAction, NightResult } from '@/types';
import { updateLeagueScoresForGameEnd } from './user';

/**
 * Updates the settings for the Killer game.
 * Only the host can perform this action and only when the game is in the 'lobby' state.
 * @param gameId The ID of the game to update.
 * @param hostId The ID of the user attempting to change the settings.
 * @param settings The new settings object for the Killer game.
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
 * Starts the Killer game, assigns roles to players, and moves the game to the 'role_reveal' state.
 * This action can only be performed by the host.
 * @param gameId The ID of the game to start.
 * @param userId The ID of the user starting the game (must be the host).
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
        if (game.gameState !== 'lobby') return; // Idempotent: if game already started, do nothing.

        // --- Role Assignment Logic ---
        const playersForRoles = [...game.players].sort(() => Math.random() - 0.5);
        const playerCount = playersForRoles.length;
        
        // Define the base roles that are always present
        const rolesToAssign: PlayerRole[] = ['killer', 'detective', 'doctor', 'soldier'];
        
        // Add optional roles based on player count
        if (playerCount >= 5) rolesToAssign.push('spy');
        if (playerCount >= 6) rolesToAssign.push('impersonator');
        if (playerCount >= 6) rolesToAssign.push('suicide_bomber');
        
        // Fill the rest of the slots with 'civilian'
        while (rolesToAssign.length < playerCount) {
            rolesToAssign.push('civilian');
        }
        
        const shuffledRoles = rolesToAssign.sort(() => Math.random() - 0.5);

        // Assign the shuffled roles to players
        playersForRoles.forEach((player, index) => {
            player.role = shuffledRoles[index];
            player.status = 'alive';
            player.isProtected = false; // Reset protection status
        });

        // Update the game document in the database
        transaction.update(gameRef, { 
            players: playersForRoles.sort((a,b) => a.name.localeCompare(b.name)), // Sort players alphabetically for consistent display
            gameState: 'role_reveal',
            turn: 1,
            messages: [],
            votes: {},
            nightActions: {},
            nightResults: {},
            gameResult: deleteField(), // Ensure any previous game result is cleared
        });
    });
}

/**
 * Progresses the game from the role reveal or voting results phase to the night phase.
 * Resets actions, votes, and sets the timer for the night phase.
 * @param gameId The ID of the game.
 * @param hostId The ID of the host initiating the action.
 */
export async function progressToNight(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can proceed.");

        // This function is called after role reveal and after voting results
        if (game.gameState === 'role_reveal' || game.gameState === 'voting_results') {
             const nightTime = game.killerSettings?.nightTime || 70; // Use custom or default time
            transaction.update(gameRef, { 
                gameState: 'night',
                nightActions: {}, // Reset night actions
                nightResults: {}, // Clear previous night results
                votes: {}, // Clear votes from the previous day
                lastVoteResult: deleteField(), // Clear the result of the last vote
                discussionEndsAt: Timestamp.fromMillis(Date.now() + nightTime * 1000), 
             });
        }
    });
}

/**
 * Submits a player's action for the night phase.
 * If all players with abilities have submitted their actions, the night is automatically processed.
 * @param gameId The ID of the game.
 * @param playerId The ID of the player submitting the action.
 * @param action The night action object.
 */
export async function submitNightAction(gameId: string, playerId: string, action: NightAction) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') throw new Error("لا يمكنك استخدام قدرتك الآن.");

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.status !== 'alive') throw new Error("لا يمكنك القيام بهذا الإجراء.");

        const newNightActions = { ...(game.nightActions || {}), [playerId]: action };

        transaction.update(gameRef, { nightActions: newNightActions });

        // Check if all players with powers have acted
        const alivePlayersWithPowers = game.players.filter(p => 
            p.status === 'alive' && 
            p.role && ['killer', 'detective', 'doctor', 'spy', 'impersonator', 'suicide_bomber'].includes(p.role)
        );

        if (Object.keys(newNightActions).length >= alivePlayersWithPowers.length) {
            processNight(game, newNightActions, transaction);
        }
    });
}

/**
 * Processes all night actions in a specific order of priority.
 * This function is called either when all players have acted or when the host ends the night manually.
 * @param game The current game object.
 * @param nightActions The record of all submitted night actions.
 * @param transaction The Firestore transaction object.
 */
function processNight(game: Game, nightActions: Record<string, NightAction>, transaction: any) {
    let updatedPlayers = JSON.parse(JSON.stringify(game.players)) as Player[];
    const nightResults: NightResult = {};
    
    // Reset protection status at the beginning of the night
    updatedPlayers.forEach(p => p.isProtected = false);

    // --- Night Action Priority Order ---

    // 1. Doctor's protection is applied first.
    const doctorId = updatedPlayers.find(p => p.role === 'doctor' && p.status === 'alive')?.id;
    const doctorAction = doctorId ? nightActions[doctorId] : undefined;
    if (doctorAction?.protectTarget) {
        const protectedPlayerIndex = updatedPlayers.findIndex(p => p.id === doctorAction.protectTarget);
        if (protectedPlayerIndex !== -1) {
            updatedPlayers[protectedPlayerIndex].isProtected = true;
        }
    }

    // 2. Impersonator chooses their apparent role.
    const impersonatorId = updatedPlayers.find(p => p.role === 'impersonator' && p.status === 'alive')?.id;
    const impersonatorAction = impersonatorId ? nightActions[impersonatorId] : undefined;
    if(impersonatorAction?.impersonateRole){
        const impersonatorIndex = updatedPlayers.findIndex(p => p.id === impersonatorId);
        if(impersonatorIndex !== -1) {
            updatedPlayers[impersonatorIndex].apparentRole = impersonatorAction.impersonateRole;
        }
    }
    
    // 3. Suicide Bomber sets their curse target for the night.
    const suicideBomberId = updatedPlayers.find(p => p.role === 'suicide_bomber' && p.status === 'alive')?.id;
    const suicideBomberAction = suicideBomberId ? nightActions[suicideBomberId] : undefined;

    // 4. Killer attempts to kill their target.
    const killerId = updatedPlayers.find(p => p.role === 'killer' && p.status === 'alive')?.id;
    const killerAction = killerId ? nightActions[killerId] : undefined;
    if (killerAction?.killTarget) {
        const victimIndex = updatedPlayers.findIndex(p => p.id === killerAction.killTarget);
        if (victimIndex !== -1) {
            const victim = updatedPlayers[victimIndex];
            if (!victim.isProtected) {
                victim.status = 'killed';
                nightResults.killedPlayerId = victim.id;
                nightResults.killedPlayerName = victim.name;

                // Check for Suicide Bomber's revenge
                if (victim.role === 'suicide_bomber' && suicideBomberAction?.setCurseTarget === killerId) {
                    const killerIndex = updatedPlayers.findIndex(p => p.id === killerId);
                    if (killerIndex !== -1) {
                        updatedPlayers[killerIndex].status = 'killed';
                        nightResults.suicideBomberTakesKillerWithThem = true;
                    }
                }
            } else {
                nightResults.wasSaved = true; // The kill was blocked by the doctor
            }
        }
    }
    
    // 5. Detective gets their investigation result.
    const detectiveId = updatedPlayers.find(p => p.role === 'detective' && p.status === 'alive')?.id;
    const detectiveAction = detectiveId ? nightActions[detectiveId] : undefined;
    if (detectiveAction?.checkTarget) {
        const target = updatedPlayers.find(p => p.id === detectiveAction.checkTarget);
        if (target) {
            // Detective sees the role, or 'impersonator' if that's their true role. They are not fooled by the apparentRole.
            nightResults.detectiveCheckResult = { targetName: target.name, role: target.role! };
        }
    }

    // 6. Spy gets their investigation result.
    const spyId = updatedPlayers.find(p => p.role === 'spy' && p.status === 'alive')?.id;
    const spyAction = spyId ? nightActions[spyId] : undefined;
    if (spyAction?.checkTarget) {
        const targetIndex = updatedPlayers.findIndex(p => p.id === spyAction.checkTarget);
        if (targetIndex !== -1) {
            const target = updatedPlayers[targetIndex];
            if (target.role === 'soldier') {
                nightResults.spyWasSpotted = true; // The spy was caught by the soldier
            } else {
                // The spy sees the target's apparent role if they are an impersonator, otherwise their true role.
                 nightResults.spyCheckResult = { targetName: target.name, role: target.apparentRole || target.role! };
            }
        }
    }

    const gameRef = doc(db, 'games', game.id);

    // Check for win conditions after all actions are resolved. If a winner is found, end the game.
    if (checkWinConditions(updatedPlayers, gameRef, transaction)) {
        return; // Stop processing as the game has ended.
    }
    
    // If the game has not ended, proceed to the discussion phase.
    const discussionTime = game.killerSettings?.discussionTime || 120;
    
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
 * If all eligible players have voted, the votes are tallied.
 * @param gameId The ID of the game.
 * @param voterId The ID of the player voting.
 * @param votedForId The ID of the player being voted for.
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
        
        // --- Tie-breaker Logic ---
        // During a tie-breaker, players who were part of the initial tie cannot vote.
        if (game.gameState === 'tie_breaker_voting' && game.lastVoteResult?.tiedPlayers) {
            const lastVoteTiedPlayers = game.lastVoteResult.tiedPlayers;
            if (lastVoteTiedPlayers.includes(voterId)) {
                throw new Error("لا يمكنك التصويت في جولة كسر التعادل.");
            }
        }
        
        const newVotes = { ...(game.votes || {}), [voterId]: votedForId };
        
        // Determine who is eligible to vote in this round
        let eligibleVoters = game.players.filter(p => p.status === 'alive');
        if (game.gameState === 'tie_breaker_voting' && game.lastVoteResult?.tiedPlayers) {
            eligibleVoters = eligibleVoters.filter(p => !game.lastVoteResult?.tiedPlayers?.includes(p.id));
        }
        
        const allVotesIn = Object.keys(newVotes).length >= eligibleVoters.length;

        if (allVotesIn) {
            const updates = _tallyVotesAndGetUpdates(game, newVotes);
            transaction.update(gameRef, updates);
        } else {
             transaction.update(gameRef, { votes: newVotes });
        }
    });
}

/**
 * Tallies the final votes and determines the outcome (elimination, tie, or tie-breaker).
 * This is an internal helper function called by `submitVote`.
 * @param game The current game object.
 * @param finalVotes The record of all votes.
 * @returns A partial Game object with the necessary updates for the transaction.
 */
function _tallyVotesAndGetUpdates(game: Game, finalVotes: Record<string, string>): Partial<Game> {
    const voteCounts: Record<string, number> = {};
    
    // Count votes for each player
    for (const votedFor of Object.values(finalVotes)) {
        voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1;
    }

    let maxVotes = 0;
    let playersWithMaxVotes: string[] = [];
    // Find the player(s) with the most votes
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
    let gameEndResult: Game['gameResult'] | undefined = undefined;

    if (playersWithMaxVotes.length > 1) {
        // If there's a tie in the main discussion, go to a tie-breaker round
        if (game.gameState === 'discussion') {
            nextGameState = 'tie_breaker_voting';
            lastVoteResult = { wasTie: true, message: `تعادل بين ${playersWithMaxVotes.length} لاعبين! جولة تصويت جديدة بينهم فقط.`, tiedPlayers: playersWithMaxVotes };
        } else { // If there's a tie in the tie-breaker, no one is eliminated
            lastVoteResult = { wasTie: true, message: 'حدث تعادل مرة أخرى! لا أحد سيغادر هذه الجولة.' };
        }
    } else if (playersWithMaxVotes.length === 1) {
        // A single player was voted out
        const eliminatedPlayerId = playersWithMaxVotes[0];
        const eliminatedPlayerIndex = updatedPlayers.findIndex(p => p.id === eliminatedPlayerId);
        const eliminatedPlayer = updatedPlayers[eliminatedPlayerIndex];

        if (eliminatedPlayer) {
            updatedPlayers[eliminatedPlayerIndex].status = 'voted_out';
            lastVoteResult = { 
                wasTie: false, 
                message: `تم التصويت لإقصاء ${eliminatedPlayer.name}.`,
                eliminatedPlayerName: eliminatedPlayer.name,
                eliminatedPlayerRole: eliminatedPlayer.role,
            };

            // After elimination, check for win conditions
            gameEndResult = checkWinConditions(updatedPlayers);
            if(gameEndResult) {
                 nextGameState = 'ended';
            }
        }
    } else {
        // No votes were cast or no majority
        lastVoteResult = { wasTie: true, message: 'لم يتم التصويت لإقصاء أي لاعب في هذه الجولة.' };
    }

    const updates: Partial<Game> & { [key:string]: any } = {
        players: updatedPlayers,
        gameState: nextGameState,
        lastVoteResult: lastVoteResult,
        discussionEndsAt: deleteField(),
        // Clear votes unless moving to a tie-breaker, where original votes are needed to determine who can vote next
        votes: nextGameState === 'tie_breaker_voting' ? game.votes : {}, 
    };
    if(gameEndResult) {
        updates.gameResult = gameEndResult;
    }
    
    return updates;
}

/**
 * Checks if a win condition has been met after an action (kill or vote).
 * @param players The current list of all players and their statuses.
 * @returns A gameResult object if the game has ended, otherwise null.
 */
function checkWinConditions(players: Player[]) {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const townTeam = alivePlayers.filter(p => ['detective', 'doctor', 'soldier', 'impersonator', 'civilian', 'suicide_bomber'].includes(p.role!));
    const mafiaTeam = alivePlayers.filter(p => ['killer', 'spy'].includes(p.role!));
    const killer = players.find(p => p.role === 'killer');

    let gameResult: Game['gameResult'] | null = null;
    
    // Condition 1: Mafia wins if their numbers are equal to or greater than the Town's.
    if (mafiaTeam.length >= townTeam.length && mafiaTeam.length > 0) {
        gameResult = { winner: 'mafia', message: 'سيطرت المافيا على المدينة! فريق المافيا ينتصر!' };
    } 
    // Condition 2: Town wins if the Killer is no longer alive.
    else if (killer?.status !== 'alive') {
        gameResult = { winner: 'town', message: `تم القضاء على القاتل! فريق الخير ينتصر!` };
    }

    // If a result is determined, return it to be applied in the transaction
    if (gameResult) {
        const gameEndUpdates: Partial<Game> = { 
            players: players,
            gameState: 'ended', 
            gameResult: gameResult
        };
        // The update is handled by the calling function within the transaction
        return gameEndUpdates;
    }
    
    return null; // No win condition met
}

/**
 * Submits a chat message from a player.
 * @param gameId The ID of the game.
 * @param playerId The ID of the player sending the message.
 * @param text The content of the message.
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
 * Manually progresses the game from night to discussion.
 * This is triggered by the host if the night timer runs out.
 * @param gameId The ID of the game.
 * @param hostId The ID of the host.
 */
export async function progressToDiscussion(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can proceed.");
        if (game.gameState !== 'night') return;

        // Process night actions with whatever actions have been submitted so far.
        processNight(game, game.nightActions || {}, transaction);
    });
}
