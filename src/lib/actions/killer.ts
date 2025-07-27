

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
                discussionEndsAt: deleteField(),
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
            (p.role === 'killer' || p.role === 'detective' || p.role === 'doctor' || p.role === 'spy' || p.role === 'impersonator')
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

    // 3. Killer's action
    const killerAction = Object.values(nightActions).find(a => a.killTarget);
    if (killerAction?.killTarget) {
        const victimIndex = updatedPlayers.findIndex(p => p.id === killerAction.killTarget);
        if (victimIndex !== -1) {
            const victim = updatedPlayers[victimIndex];
            if (!victim.isProtected) {
                victim.status = 'killed';
                nightResults.killedPlayerId = victim.id;
                nightResults.killedPlayerName = victim.name;
            } else {
                nightResults.wasSaved = true;
            }
        }
    }
    
    // 4. Detective's action
    const detectiveAction = Object.values(nightActions).find(a => a.checkTarget && game.players.find(p => p.id === Object.keys(nightActions).find(k => nightActions[k] === a))?.role === 'detective');
    if (detectiveAction?.checkTarget) {
        const target = updatedPlayers.find(p => p.id === detectiveAction.checkTarget);
        if (target) {
            nightResults.detectiveCheckResult = { targetName: target.name, role: target.role === 'impersonator' ? 'impersonator' : target.apparentRole || target.role! };
        }
    }

    // 5. Spy's action
    const spyAction = Object.values(nightActions).find(a => a.checkTarget && game.players.find(p => p.id === Object.keys(nightActions).find(k => nightActions[k] === a))?.role === 'spy');
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

    // Check win conditions
    const alivePlayers = updatedPlayers.filter(p => p.status === 'alive');
    const townTeam = alivePlayers.filter(p => ['detective', 'doctor', 'soldier', 'impersonator', 'civilian'].includes(p.role!));
    const mafiaTeam = alivePlayers.filter(p => ['killer', 'spy'].includes(p.role!));
    
    if (mafiaTeam.length === 0) {
        transaction.update(gameRef, { 
            players: updatedPlayers,
            gameState: 'ended', 
            gameResult: { winner: 'town', message: 'لقد تم القضاء على المافيا! فريق الخير ينتصر!' }
        });
        return;
    }
    
    if (mafiaTeam.length >= townTeam.length) {
        transaction.update(gameRef, { 
            players: updatedPlayers,
            gameState: 'ended', 
            gameResult: { winner: 'mafia', message: 'سيطرت المافيا على المدينة! فريق المافيا ينتصر!' }
        });
        return;
    }

    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'discussion',
        turn: (game.turn || 0) + 1,
        nightResults: nightResults,
        discussionEndsAt: Timestamp.fromMillis(Date.now() + 4 * 60 * 1000)
    });
}


export async function submitVote(gameId: string, voterId: string, votedForId: string) {
    if (!votedForId) throw new Error("يجب عليك اختيار لاعب للتصويت عليه.");

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        
        const game = gameDoc.data() as Game;
        if (game.gameState !== 'discussion') throw new Error("ليس وقت التصويت الآن.");

        const voter = game.players.find(p => p.id === voterId);
        if (!voter || (voter.status !== 'alive')) {
            throw new Error("لا يمكنك التصويت.");
        }
        
        const newVotes = { ...(game.votes || {}), [voterId]: votedForId };
        
        const eligibleVoters = game.players.filter(p => p.status === 'alive');
        
        if (Object.keys(newVotes).length < eligibleVoters.length) {
            transaction.update(gameRef, { votes: newVotes });
            return;
        }

        const updates = _tallyVotesAndGetUpdates(game, newVotes);
        transaction.update(gameRef, updates);
    });
}

function _tallyVotesAndGetUpdates(game: Game, finalVotes: Record<string, string>): Partial<Game> {
    const voteCounts: Record<string, number> = {};
    for (const vote of Object.values(finalVotes)) {
        voteCounts[vote] = (voteCounts[vote] || 0) + 1;
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
        lastVoteResult = { wasTie: true, message: 'حدث تعادل في الأصوات! لا أحد سيغادر هذه الجولة.' };
    } else if (winningOptions.length === 1) {
        const electedOption = winningOptions[0];

        if (electedOption === '__SKIP_VOTE__') {
            lastVoteResult = { wasTie: true, message: 'اختار أغلبية اللاعبين عدم التصويت. التحقيق مستمر.' };
        } else {
            const eliminatedPlayerId = electedOption;
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

                const alivePlayers = updatedPlayers.filter(p => p.status === 'alive');
                const townTeam = alivePlayers.filter(p => ['detective', 'doctor', 'soldier', 'impersonator', 'civilian'].includes(p.role!));
                const mafiaTeam = alivePlayers.filter(p => ['killer', 'spy'].includes(p.role!));

                if (mafiaTeam.length === 0) {
                    nextGameState = 'ended';
                    gameEndResult = { winner: 'town', message: `تم إقصاء آخر عضو في المافيا (${eliminatedPlayer.name})! فريق الخير ينتصر!` };
                } else if (mafiaTeam.length >= townTeam.length) {
                    nextGameState = 'ended';
                    gameEndResult = { winner: 'mafia', message: `أصبح عدد فريق المافيا مساوياً للأخيار! فريق المافيا ينتصر!` };
                }
            }
        }
    } else {
        lastVoteResult = { wasTie: true, message: 'لم يتم التصويت لإقصاء أي لاعب في هذه الجولة.' };
    }

    return {
        players: updatedPlayers,
        gameState: nextGameState,
        lastVoteResult: lastVoteResult,
        gameResult: gameEndResult || (deleteField() as any),
        discussionEndsAt: deleteField() as any,
    };
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
