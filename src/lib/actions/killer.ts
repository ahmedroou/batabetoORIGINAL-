

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
import { AVATAR_IDS } from '@/data/avatars';
import { updateLeagueScoresForGameEnd } from './user';

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

        // Assign roles
        let playersForRoles = [...game.players].sort(() => Math.random() - 0.5);
        const playerCount = playersForRoles.length;
        
        const rolesToAssign: PlayerRole[] = ['killer', 'detective', 'doctor', 'soldier'];
        
        if (playerCount >= 5) {
            rolesToAssign.push('spy');
        }
        if (playerCount >= 6) {
            rolesToAssign.push('impersonator');
        }
        if (playerCount >= 6) { // Re-check for suicide bomber
            rolesToAssign.push('suicide_bomber');
        }
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

export async function progressToNight(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can proceed.");
        }

        if (game.gameState === 'role_reveal' || game.gameState === 'voting_results') {
            transaction.update(gameRef, { 
                gameState: 'night',
                nightActions: {},
                nightResults: {}, // Clear previous night results
                votes: {},
                lastVoteResult: deleteField(),
                discussionEndsAt: Timestamp.fromMillis(Date.now() + 70 * 1000), // 70-second timer for the night
             });
        }
    });
}


export async function submitNightAction(gameId: string, playerId: string, action: NightAction) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') {
            throw new Error("لا يمكنك استخدام قدرتك الآن.");
        }

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.status !== 'alive') {
            throw new Error("لا يمكنك القيام بهذا الإجراء.");
        }

        const newNightActions = { ...(game.nightActions || {}), [playerId]: action };

        transaction.update(gameRef, {
            nightActions: newNightActions
        });

        // If everyone has submitted their action, process the night
        const alivePlayersWithPowers = game.players.filter(p => 
            p.status === 'alive' && 
            (p.role === 'killer' || p.role === 'detective' || p.role === 'doctor' || p.role === 'spy' || p.role === 'impersonator' || p.role === 'suicide_bomber')
        );

        if (Object.keys(newNightActions).length >= alivePlayersWithPowers.length) {
            processNight(game, newNightActions, transaction);
        }
    });
}


function processNight(game: Game, nightActions: Record<string, NightAction>, transaction: any) {
    let updatedPlayers = JSON.parse(JSON.stringify(game.players)) as Player[];
    const nightResults: NightResult = {};
    
    // Reset protection status
    updatedPlayers.forEach(p => p.isProtected = false);

    // 1. Doctor's action
    const doctorAction = Object.values(nightActions).find(a => a.protectTarget);
    if (doctorAction?.protectTarget) {
        const protectedPlayerIndex = updatedPlayers.findIndex(p => p.id === doctorAction.protectTarget);
        if (protectedPlayerIndex !== -1) {
            updatedPlayers[protectedPlayerIndex].isProtected = true;
        }
    }

    // 2. Impersonator's action
    const impersonatorAction = Object.values(nightActions).find(a => a.impersonateRole);
    if(impersonatorAction?.impersonateRole){
        const impersonatorIndex = updatedPlayers.findIndex(p => p.role === 'impersonator');
        if(impersonatorIndex !== -1) {
            updatedPlayers[impersonatorIndex].apparentRole = impersonatorAction.impersonateRole;
        }
    }
    
    // 3. Suicide Bomber's curse target
    const suicideBomberId = updatedPlayers.find(p => p.role === 'suicide_bomber')?.id;
    const suicideBomberAction = suicideBomberId ? nightActions[suicideBomberId] : undefined;

    // 4. Killer's action
    const killerAction = Object.values(nightActions).find(a => a.killTarget);
    if (killerAction?.killTarget) {
        const victimIndex = updatedPlayers.findIndex(p => p.id === killerAction.killTarget);
        if (victimIndex !== -1) {
            const victim = updatedPlayers[victimIndex];
            if (!victim.isProtected) {
                victim.status = 'killed';
                nightResults.killedPlayerId = victim.id;
                nightResults.killedPlayerName = victim.name;

                // Check if the victim was the suicide bomber and if the killer was the cursed target
                const killerId = updatedPlayers.find(p => p.role === 'killer')?.id;
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
    
    // 5. Detective's action
    const detectivePlayerId = Object.keys(nightActions).find(id => game.players.find(p => p.id === id)?.role === 'detective');
    const detectiveAction = detectivePlayerId ? nightActions[detectivePlayerId] : undefined;
    if (detectiveAction?.checkTarget) {
        const target = updatedPlayers.find(p => p.id === detectiveAction.checkTarget);
        if (target) {
            nightResults.detectiveCheckResult = { targetName: target.name, role: target.role === 'impersonator' ? 'impersonator' : target.apparentRole || target.role! };
        }
    }

    // 6. Spy's action
    const spyPlayerId = Object.keys(nightActions).find(id => game.players.find(p => p.id === id)?.role === 'spy');
    const spyAction = spyPlayerId ? nightActions[spyPlayerId] : undefined;

    if (spyAction?.checkTarget) {
        const targetIndex = updatedPlayers.findIndex(p => p.id === spyAction.checkTarget);
        if (targetIndex !== -1) {
            const target = updatedPlayers[targetIndex];
            if (target.role === 'soldier') {
                nightResults.spyWasSpotted = true;
            } else {
                 nightResults.spyCheckResult = { targetName: target.name, role: target.role!, apparentRole: target.apparentRole };
            }
        }
    }

    const gameRef = doc(db, 'games', game.id);

    // Check win conditions after all actions
    if (checkWinConditions(updatedPlayers, gameRef, transaction, nightResults.suicideBomberTakesKillerWithThem)) {
        return; // Stop processing if game has ended
    }

    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'discussion',
        turn: (game.turn || 0) + 1,
        nightResults: nightResults,
        discussionEndsAt: deleteField(),
    });
}


export async function submitVote(gameId: string, voterId: string, votedForId: string) {
    if (!votedForId) throw new Error("يجب عليك اختيار لاعب للتصويت عليه.");

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        
        const game = gameDoc.data() as Game;
        if (game.gameState !== 'discussion' && game.gameState !== 'tie_breaker_voting') throw new Error("ليس وقت التصويت الآن.");

        const voter = game.players.find(p => p.id === voterId);
        if (!voter || (voter.status !== 'alive')) {
            throw new Error("لا يمكنك التصويت.");
        }
        
        // Tie-breaker logic
        if (game.gameState === 'tie_breaker_voting' && game.lastVoteResult?.tiedPlayers) {
            const lastVoteTiedPlayers = game.lastVoteResult.tiedPlayers;
            const lastRoundVotes = game.votes || {};
            // Check if voter is eligible for tie-breaker
            if (lastVoteTiedPlayers.includes(lastRoundVotes[voterId])) {
                throw new Error("لا يمكنك التصويت في جولة كسر التعادل.");
            }
        }
        
        const newVotes = { ...(game.votes || {}), [voterId]: votedForId };
        
        let eligibleVoters = game.players.filter(p => p.status === 'alive');
        if (game.gameState === 'tie_breaker_voting' && game.lastVoteResult?.tiedPlayers) {
            const lastVoteTiedPlayers = game.lastVoteResult.tiedPlayers;
            const lastRoundVotes = game.votes || {};
            eligibleVoters = eligibleVoters.filter(p => !lastVoteTiedPlayers.includes(lastRoundVotes[p.id]));
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

function _tallyVotesAndGetUpdates(game: Game, finalVotes: Record<string, string>): Partial<Game> {
    const voteCounts: Record<string, number> = {};
    
    // In a tie-breaker, we only count votes for the tied players.
    const candidates = game.gameState === 'tie_breaker_voting' ? game.lastVoteResult?.tiedPlayers : Object.keys(finalVotes).map(voterId => finalVotes[voterId]);

    for (const votedFor of Object.values(finalVotes)) {
        if(candidates?.includes(votedFor)) {
             voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1;
        }
    }

    let maxVotes = 0;
    let winningOptions: string[] = [];
    for (const option in voteCounts) {
        if (voteCounts[option] > maxVotes) {
            maxVotes = voteCounts[option];
            winningOptions = [option];
        } else if (voteCounts[option] === maxVotes && maxVotes > 0) {
            winningOptions.push(option);
        }
    }

    let updatedPlayers = [...game.players];
    let nextGameState: GameState = 'voting_results';
    let lastVoteResult: Game['lastVoteResult'] = { wasTie: false };
    let gameEndResult: Game['gameResult'] | undefined = undefined;

    if (winningOptions.length > 1) {
        if (game.gameState === 'discussion') {
            nextGameState = 'tie_breaker_voting';
            lastVoteResult = { wasTie: true, message: `تعادل بين ${winningOptions.length} لاعبين! جولة تصويت جديدة بينهم فقط.`, tiedPlayers: winningOptions };
        } else { // Tie in tie-breaker
            lastVoteResult = { wasTie: true, message: 'حدث تعادل مرة أخرى! لا أحد سيغادر هذه الجولة.' };
        }
    } else if (winningOptions.length === 1) {
        const eliminatedPlayerId = winningOptions[0];
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

            if(checkWinConditions(updatedPlayers, doc(db, 'games', game.id), null, false, eliminatedPlayer.name, eliminatedPlayer.role!)) {
                 gameEndResult = checkWinConditions(updatedPlayers, doc(db, 'games', game.id), null, false, eliminatedPlayer.name, eliminatedPlayer.role!);
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
        votes: nextGameState === 'tie_breaker_voting' ? game.votes : {}, // Keep original votes for tie-breaker eligibility check
    };
    if(gameEndResult) {
        updates.gameResult = gameEndResult;
    }
    
    return updates;
}


function checkWinConditions(players: Player[], gameRef: any, transaction: any, suicideBomberTakesKillerWithThem: boolean, votedOutPlayerName?: string, votedOutPlayerRole?: PlayerRole) {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const townTeam = alivePlayers.filter(p => ['detective', 'doctor', 'soldier', 'impersonator', 'civilian', 'suicide_bomber'].includes(p.role!));
    const mafiaTeam = alivePlayers.filter(p => ['killer', 'spy'].includes(p.role!));
    const killer = players.find(p => p.role === 'killer');

    let gameResult: Game['gameResult'] | null = null;
    
    if (killer?.status !== 'alive') {
        if (suicideBomberTakesKillerWithThem) {
            gameResult = { winner: 'town', message: 'الانتحاري يضحي بنفسه ويقضي على القاتل! فريق الخير ينتصر!' };
        } else {
            gameResult = { winner: 'town', message: `تم القضاء على القاتل ${votedOutPlayerName || killer.name}! فريق الخير ينتصر!` };
        }
    } else if (mafiaTeam.length >= townTeam.length) {
        gameResult = { winner: 'mafia', message: 'سيطرت المافيا على المدينة! فريق المافيا ينتصر!' };
    }

    if (gameResult && transaction) {
        transaction.update(gameRef, { 
            players: players,
            gameState: 'ended', 
            gameResult: gameResult
        });
        updateLeagueScoresForGameEnd({ players, playerScores: {} } as Game, transaction);
        return true;
    } else if (gameResult) {
        return gameResult; // Return result for non-transaction context
    }
    return false;
}


export async function submitMessage(gameId: string, playerId: string, text: string) {
    if (!text.trim()) throw new Error("الرسالة لا يمكن أن تكون فارغة.");
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player) throw new Error("لم يتم العثور على اللاعب.");
        if (player.status !== 'alive') throw new Error("لا يمكنك إرسال رسائل.");

        const message = {
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

export async function progressToDiscussion(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can proceed.");
        }
        if (game.gameState !== 'night') return;

        // Process night actions with the actions submitted so far.
        processNight(game, game.nightActions || {}, transaction);
    });
}
