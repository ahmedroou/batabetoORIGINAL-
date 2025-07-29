

/**
 * @fileoverview Actions specific to the "Mafia" game.
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
} from 'firebase/firestore';
import type { Game, Player, NightAction, NightResult, Role, MafiaRole, Team } from '@/types';
import { getPlayerFromUserId } from './helpers';
import { MAFIA_ROLES, getRoleDistribution } from '@/data/mafia-roles';

function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function updateGameSettings(gameId: string, hostId: string, settings: { nightDuration: number, discussionDuration: number, votingDuration: number }) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'mafiaState.settings': settings });
    });
}

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 4) throw new Error("The game requires at least 4 players.");

        const rolesToDistribute = getRoleDistribution(game.players.length);
        const shuffledRoles = shuffle(rolesToDistribute);
        const shuffledPlayers = shuffle([...game.players]);

        const updatedPlayers = shuffledPlayers.map((player, index) => {
            const roleId = shuffledRoles[index];
            const roleInfo = MAFIA_ROLES.find(r => r.id === roleId) as Role;
            return {
                ...player,
                role: roleId,
                status: 'alive',
                isProtected: false,
                apparentRole: roleId,
                team: roleInfo.team,
            };
        });

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'role_reveal',
            round: 1,
            playerScores: {}, // Reset scores
            mafiaState: {
                ...game.mafiaState,
                phase: 'night',
                night: 1,
                events: [],
                nightActions: {},
                killedPlayer: null,
                savedPlayer: null,
                investigationResult: null,
                spyResult: null,
                lastVotedOut: null,
                timerEndsAt: Timestamp.fromMillis(Date.now() + 15 * 1000), // 15 seconds for role reveal
            }
        });
    });
}

export async function hostProgressNextPhase(hostId: string) {
    const q = query(
        collection(db, 'games'),
        where('hostId', '==', hostId),
        where('gameState', 'in', ['role_reveal', 'night', 'discussion', 'voting', 'voting_results'])
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        return; // No active game for this host.
    }

    const gameDocRef = querySnapshot.docs[0];
    const gameId = gameDocRef.id;
    const gameRef = doc(db, 'games', gameId);

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            const game = gameDoc.data() as Game;
            const alivePlayers = game.players.filter(p => p.status === 'alive');

            if (game.hostId !== hostId) return;

            const timerExpired = !game.mafiaState?.timerEndsAt || Date.now() >= game.mafiaState.timerEndsAt.toMillis();
            
            // Progression logic based on current state
            switch (game.gameState) {
                case 'role_reveal':
                    await progressToNight(game.id, transaction);
                    break;
                case 'night':
                    const nightActionsDone = alivePlayers.every(p => {
                        const role = MAFIA_ROLES.find(r => r.id === p.role);
                        const canAct = role && role.id !== 'civilian' && role.id !== 'soldier';
                        return !canAct || (game.mafiaState?.nightActions?.[p.id]);
                    });
                    if (timerExpired || nightActionsDone) {
                        await processNight(game.id, transaction);
                    }
                    break;
                case 'discussion':
                    if (timerExpired) {
                        transaction.update(gameRef, {
                            gameState: 'voting',
                            'mafiaState.phase': 'voting',
                            'mafiaState.votes': {},
                            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + (game.mafiaState?.settings?.votingDuration || 60) * 1000)
                        });
                    }
                    break;
                case 'voting':
                    const votingDone = alivePlayers.every(p => game.mafiaState?.votes?.[p.id] !== undefined);
                    if (timerExpired || votingDone) {
                        await processVotes(game.id, transaction);
                    }
                    break;
                case 'voting_results':
                     if (timerExpired) {
                        await progressToNight(game.id, transaction);
                     }
                    break;
            }
        });
    } catch (error) {
        console.error(`Error progressing phase for game ${gameId}:`, error);
        throw error;
    }
}


export async function submitNightAction(gameId: string, playerId: string, action: NightAction) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') return;

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.status !== 'alive') throw new Error("You cannot perform an action.");

        transaction.update(gameRef, {
            [`mafiaState.nightActions.${playerId}`]: action
        });
    });
}

async function progressToNight(gameId: string, transaction: any) {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for progressing to night");
    const game = gameDoc.data() as Game;
    
    const winCondition = checkWinConditions(game);
    if (winCondition.isGameOver) {
        transaction.update(gameRef, {
            gameState: 'final_results',
            gameResult: { winner: winCondition.winner, message: winCondition.message }
        });
        return;
    }
    
    const nightDuration = game.mafiaState?.settings?.nightDuration || 40;

    transaction.update(gameRef, {
        gameState: 'night',
        'mafiaState.phase': 'night',
        'mafiaState.night': (game.mafiaState?.night || 0) + 1,
        'mafiaState.nightActions': {},
        'mafiaState.events': [],
        'mafiaState.killedPlayer': null,
        'mafiaState.savedPlayer': null,
        'mafiaState.investigationResult': null,
        'mafiaState.spyResult': null,
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + nightDuration * 1000)
    });
}

async function processNight(gameId: string, transaction: any) {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for processing night.");
    const game = gameDoc.data() as Game;

    let updatedPlayers = [...game.players];
    const nightActions = game.mafiaState?.nightActions || {};
    const nightResults: NightResult[] = [];

    const killer = updatedPlayers.find(p => p.role === 'killer' && p.status === 'alive');
    const doctor = updatedPlayers.find(p => p.role === 'doctor' && p.status === 'alive');
    const detective = updatedPlayers.find(p => p.role === 'detective' && p.status === 'alive');
    const spy = updatedPlayers.find(p => p.role === 'spy' && p.status === 'alive');
    const exp = updatedPlayers.find(p => p.role === 'explosive' && p.status === 'alive');

    let killedPlayerId: string | null = null;
    let savedPlayerId: string | null = null;
    let investigationResult: { playerId: string; role: MafiaRole; team: 'good' | 'mafia' } | null = null;
    let spyResult: { playerId: string; role: MafiaRole; isShifter: boolean; isSoldier: boolean } | null = null;

    if (doctor && nightActions[doctor.id]?.targetId) {
        savedPlayerId = nightActions[doctor.id]!.targetId!;
        nightResults.push({ type: 'save_attempt', targetId: savedPlayerId, message: `The Doctor attempted to save someone.` });
    }

    if (killer && nightActions[killer.id]?.killTarget) {
        const targetId = nightActions[killer.id]!.killTarget!;
        if (targetId !== savedPlayerId) {
            killedPlayerId = targetId;
            const explosiveTarget = exp && nightActions[exp.id]?.targetId === targetId;
            if (explosiveTarget) {
                const killerIndex = updatedPlayers.findIndex(p => p.id === killer!.id);
                if (killerIndex !== -1) {
                    updatedPlayers[killerIndex].status = 'killed';
                    nightResults.push({ type: 'death', playerId: killer!.id, message: `${killer!.name} was killed by the Explosive's trap!` });
                    killedPlayerId = null; 
                }
            }
        } else {
             nightResults.push({ type: 'save_success', targetId: savedPlayerId, message: `The Doctor successfully saved someone!` });
        }
    }
    
    if (killedPlayerId && exp && killedPlayerId === exp.id && nightActions[exp.id]?.targetId) {
         const finalTargetId = nightActions[exp.id]!.targetId!;
         const finalTargetIndex = updatedPlayers.findIndex(p => p.id === finalTargetId);
         if (finalTargetIndex !== -1) {
             updatedPlayers[finalTargetIndex].status = 'killed';
             nightResults.push({ type: 'death', playerId: finalTargetId, message: `${updatedPlayers[finalTargetIndex].name} was taken down by the Explosive!` });
         }
    }
    
    if (killedPlayerId) {
         const killedPlayerIndex = updatedPlayers.findIndex(p => p.id === killedPlayerId);
         if (killedPlayerIndex !== -1) {
             updatedPlayers[killedPlayerIndex].status = 'killed';
             nightResults.push({ type: 'death', playerId: killedPlayerId, message: `${updatedPlayers[killedPlayerIndex].name} was killed.` });
         }
    }

    if (detective && nightActions[detective.id]?.targetId) {
        const targetId = nightActions[detective.id]!.targetId!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);
        if (targetPlayer) {
             const roleInfo = MAFIA_ROLES.find(r => r.id === targetPlayer.role)!;
             investigationResult = { playerId: targetId, role: targetPlayer.role!, team: roleInfo.team };
        }
    }

    if (spy && nightActions[spy.id]?.targetId) {
        const targetId = nightActions[spy.id]!.targetId!;
        const targetPlayer = updatedPlayers.find(p => p.id === targetId);
         if (targetPlayer) {
            if (targetPlayer.role === 'soldier') {
                spyResult = { playerId: targetId, role: 'soldier', isShifter: false, isSoldier: true };
            } else {
                const apparentRole = targetPlayer.apparentRole || targetPlayer.role;
                spyResult = { playerId: targetId, role: apparentRole!, isShifter: targetPlayer.role === 'shifter', isSoldier: false };
            }
        }
    }
    
    const shfIndex = updatedPlayers.findIndex(p => p.role === 'shifter' && p.status === 'alive');
    if (shfIndex !== -1) {
        const shf = updatedPlayers[shfIndex];
        if (shf && nightActions[shf.id]?.disguiseAs) {
            updatedPlayers[shfIndex].apparentRole = nightActions[shf.id]!.disguiseAs;
        }
    }


    const discussionDuration = game.mafiaState?.settings?.discussionDuration || 180;

    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'discussion',
        'mafiaState.phase': 'discussion',
        'mafiaState.events': nightResults,
        'mafiaState.killedPlayer': killedPlayerId,
        'mafiaState.savedPlayer': savedPlayerId,
        'mafiaState.investigationResult': investigationResult,
        'mafiaState.spyResult': spyResult,
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + discussionDuration * 1000),
    });
}

export async function submitVote(gameId: string, voterId: string, targetId: string | null) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        if (game.gameState !== 'voting') return;

        const updatedVotes = { ...(game.mafiaState?.votes || {}), [voterId]: targetId };
        transaction.update(gameRef, { 'mafiaState.votes': updatedVotes });
    });
}


async function processVotes(gameId: string, transaction: any) {
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found for processing votes.");
    const game = gameDoc.data() as Game;

    const votes = game.mafiaState?.votes || {};
    const voteCounts: Record<string, number> = {};
    
    Object.values(votes).forEach(targetId => {
        if (targetId) {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });

    const maxVotes = Math.max(0, ...Object.values(voteCounts));
    const playersWithMaxVotes = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);
    
    let playerVotedOutId: string | null = null;
    let updatedPlayers = [...game.players];

    if (playersWithMaxVotes.length === 1 && maxVotes > 0) {
        playerVotedOutId = playersWithMaxVotes[0];
        const votedPlayerIndex = updatedPlayers.findIndex(p => p.id === playerVotedOutId);
        if (votedPlayerIndex !== -1) {
            updatedPlayers[votedPlayerIndex].status = 'voted_out';
        }
    }
    
    const freshGameData = { ...game, players: updatedPlayers };
    const winCondition = checkWinConditions(freshGameData);

    if (winCondition.isGameOver) {
        transaction.update(gameRef, { 
            players: updatedPlayers,
            gameState: 'final_results',
            gameResult: { winner: winCondition.winner, message: winCondition.message }
        });
        return;
    }

    transaction.update(gameRef, {
        players: updatedPlayers,
        gameState: 'voting_results',
        'mafiaState.phase': 'voting_results',
        'mafiaState.votes': {}, 
        'mafiaState.lastVotedOut': {
            playerId: playerVotedOutId,
            tie: playersWithMaxVotes.length > 1,
        },
        'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + 10 * 1000)
    });
}


function checkWinConditions(game: Game): { isGameOver: boolean; winner?: 'good' | 'mafia'; message?: string } {
    const alivePlayers = game.players.filter(p => p.status === 'alive');
    const killer = alivePlayers.find(p => p.role === 'killer');

    if (!killer) {
        return { isGameOver: true, winner: 'good', message: 'لقد نجح فريق الخير في القضاء على القاتل!' };
    }
    
    const mafiaTeam = alivePlayers.filter(p => p.team === 'mafia');
    const goodTeam = alivePlayers.filter(p => p.team === 'good');
    
    if (mafiaTeam.length >= goodTeam.length) {
        return { isGameOver: true, winner: 'mafia', message: 'لقد سيطرت المافيا على المدينة!' };
    }
    
    return { isGameOver: false };
}
