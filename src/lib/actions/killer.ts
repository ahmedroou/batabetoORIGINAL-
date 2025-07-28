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
import type { Player, Game, GameState, PlayerRole, NightAction, NightResult, ChatMessage } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';

/**
 * Creates a mock game object for testing purposes.
 * This function is not transactional and should only be used for testing.
 * @returns A fully formed Game object.
 */
export async function createTestGame(): Promise<Game | null> {
    const players: Player[] = [];
    const playerIds: string[] = [];
    const roles: PlayerRole[] = ['killer', 'doctor', 'detective', 'spy', 'soldier', 'suicide_bomber'];

    for (let i = 0; i < 6; i++) {
        const playerId = `PLAYER_${i + 1}`;
        playerIds.push(playerId);
        players.push({
            id: playerId,
            name: `لاعب ${i + 1}`,
            avatarId: AVATAR_IDS[i + 1] || 'Avatar01.png',
            status: 'alive',
            role: roles[i],
            leaderboardPoints: Math.floor(Math.random() * 200),
        });
    }

    const testGame: Game = {
        id: 'KILLER_TEST',
        hostId: 'PLAYER_1',
        gameType: 'killer',
        gameState: 'role_reveal',
        players: players,
        playerUids: playerIds,
        createdAt: Timestamp.now(),
        turn: 1,
        killerSettings: {
            discussionTime: 120,
            nightTime: 70,
        }
    };
    return testGame;
}

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
        if (game.gameState !== 'lobby') return; 

        // --- Role Assignment Logic ---
        const playersForRoles = [...game.players].sort(() => Math.random() - 0.5);
        const playerCount = playersForRoles.length;
        
        const rolesToAssign: PlayerRole[] = ['killer', 'detective', 'doctor', 'soldier'];
        
        if (playerCount >= 5) rolesToAssign.push('spy');
        if (playerCount >= 6) rolesToAssign.push('suicide_bomber');
        if (playerCount >= 7) rolesToAssign.push('impersonator');
        
        while (rolesToAssign.length < playerCount) {
            rolesToAssign.push('civilian');
        }
        
        const shuffledRoles = rolesToAssign.sort(() => Math.random() - 0.5);

        playersForRoles.forEach((player, index) => {
            player.role = shuffledRoles[index];
            player.status = 'alive';
            player.isProtected = false;
        });

        transaction.update(gameRef, { 
            players: playersForRoles.sort((a,b) => a.name.localeCompare(b.name)),
            gameState: 'role_reveal',
            turn: 1,
            messages: [],
            votes: {},
            nightActions: {},
            nightResults: {},
            gameResult: deleteField(),
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

        if (game.gameState === 'role_reveal' || game.gameState === 'voting_results') {
             const nightTime = game.killerSettings?.nightTime || 70;
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
    
    updatedPlayers.forEach(p => p.isProtected = false);

    // 1. Doctor's protection
    const doctorAction = nightActions[updatedPlayers.find(p => p.role === 'doctor' && p.status === 'alive')?.id || ''];
    if (doctorAction?.protectTarget) {
        const protectedPlayerIndex = updatedPlayers.findIndex(p => p.id === doctorAction.protectTarget);
        if (protectedPlayerIndex !== -1) updatedPlayers[protectedPlayerIndex].isProtected = true;
    }

    // 2. Impersonator's disguise
    const impersonatorAction = nightActions[updatedPlayers.find(p => p.role === 'impersonator' && p.status === 'alive')?.id || ''];
    if(impersonatorAction?.impersonateRole){
        const impersonatorIndex = updatedPlayers.findIndex(p => p.role === 'impersonator');
        if(impersonatorIndex !== -1) updatedPlayers[impersonatorIndex].apparentRole = impersonatorAction.impersonateRole;
    }
    
    // 3. Suicide Bomber's curse
    const suicideBomberId = updatedPlayers.find(p => p.role === 'suicide_bomber' && p.status === 'alive')?.id;
    const suicideBomberAction = suicideBomberId ? nightActions[suicideBomberId] : undefined;

    // 4. Killer's attack
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

                if (victim.role === 'suicide_bomber' && suicideBomberAction?.setCurseTarget === killerId) {
                    const killerIndex = updatedPlayers.findIndex(p => p.id === killerId);
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
    
    // 5. Detective's investigation
    const detectiveAction = nightActions[updatedPlayers.find(p => p.role === 'detective' && p.status === 'alive')?.id || ''];
    if (detectiveAction?.checkTarget) {
        const target = updatedPlayers.find(p => p.id === detectiveAction.checkTarget);
        if (target) {
            nightResults.detectiveCheckResult = { targetName: target.name, role: target.role! };
        }
    }

    // 6. Spy's investigation
    const spyAction = nightActions[updatedPlayers.find(p => p.role === 'spy' && p.status === 'alive')?.id || ''];
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

    const gameRef = doc(db, 'games', game.id);
    const gameEndResult = checkWinConditions(updatedPlayers);
    if (gameEndResult) {
        transaction.update(gameRef, gameEndResult);
        return;
    }
    
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
        
        if (game.gameState === 'tie_breaker_voting') {
            const lastVoteTiedPlayers = game.lastVoteResult?.tiedPlayers || [];
            if (lastVoteTiedPlayers.includes(voterId)) {
                throw new Error("لا يمكنك التصويت في جولة كسر التعادل.");
            }
        }
        
        const newVotes = { ...(game.votes || {}), [voterId]: votedForId };
        
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
    let gameEndResult: Game['gameResult'] | undefined = undefined;

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
        const eliminatedPlayer = updatedPlayers[eliminatedPlayerIndex];

        if (eliminatedPlayer) {
            updatedPlayers[eliminatedPlayerIndex].status = 'voted_out';
            lastVoteResult = { 
                wasTie: false, 
                message: `تم التصويت لإقصاء ${eliminatedPlayer.name}.`,
                eliminatedPlayerName: eliminatedPlayer.name,
                eliminatedPlayerRole: eliminatedPlayer.role,
            };

            gameEndResult = checkWinConditions(updatedPlayers);
            if(gameEndResult) {
                 nextGameState = 'ended';
            }
        }
    } else {
        lastVoteResult = { wasTie: true, message: 'لم يتم التصويت لإقصاء أي لاعب في هذه الجولة.' };
    }

    const updates: Partial<Game> & { [key:string]: any } = {
        players: updatedPlayers,
        gameState: nextGameState,
        lastVoteResult: lastVoteResult,
        discussionEndsAt: deleteField(),
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
    
    if (mafiaTeam.length >= townTeam.length && mafiaTeam.length > 0) {
        gameResult = { winner: 'mafia', message: 'سيطرت المافيا على المدينة! فريق المافيا ينتصر!' };
    } 
    else if (killer?.status !== 'alive') {
        gameResult = { winner: 'town', message: `تم القضاء على القاتل! فريق الخير ينتصر!` };
    }

    if (gameResult) {
        return { 
            players: players,
            gameState: 'ended', 
            gameResult: gameResult
        };
    }
    
    return null;
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

        processNight(game, game.nightActions || {}, transaction);
    });
}
