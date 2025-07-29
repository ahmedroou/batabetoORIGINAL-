
/**
 * @fileoverview Actions specific to the "Mafia" game.
 */

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
    deleteField,
} from 'firebase/firestore';
import type { Game, Player, NightAction, NightResult, Role, MafiaRole } from '@/types';
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
                timerEndsAt: Timestamp.fromMillis(Date.now() + 10 * 1000), // 10 seconds for role reveal
            }
        });
    });
}

export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            const game = gameDoc.data() as Game;

            if (game.hostId !== hostId) return;
            if (!game.mafiaState?.timerEndsAt || Date.now() < game.mafiaState.timerEndsAt.toMillis()) return;

            if (game.gameState === 'role_reveal') {
                await progressToNight(game.id, hostId);
            } else if (game.gameState === 'night') {
                await processNight(game.id, hostId);
            } else if (game.gameState === 'discussion') {
                 transaction.update(gameRef, {
                    gameState: 'voting',
                    'mafiaState.phase': 'voting',
                    'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + (game.mafiaState?.settings?.votingDuration || 60) * 1000)
                });
            } else if (game.gameState === 'voting') {
                 await processVotes(game.id, hostId);
            } else if (game.gameState === 'voting_results') {
                await progressToNight(game.id, hostId);
            }
        });
    } catch (error) {
        console.error(`Error handling timeout for game ${gameId}:`, error);
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

export async function progressToNight(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can progress the game.");

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
            'mafiaState.night': (game.mafiaState?.night || 1) + 1,
            'mafiaState.nightActions': {},
            'mafiaState.events': [],
            'mafiaState.killedPlayer': null,
            'mafiaState.savedPlayer': null,
            'mafiaState.investigationResult': null,
            'mafiaState.spyResult': null,
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + nightDuration * 1000)
        });
    });
}

export async function processNight(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only the host can process the night.");

        let updatedPlayers = [...game.players];
        const nightActions = game.mafiaState?.nightActions || {};
        const nightResults: NightResult[] = [];

        // --- Role Actions ---
        const killer = updatedPlayers.find(p => p.role === 'killer' && p.status === 'alive');
        const doctor = updatedPlayers.find(p => p.role === 'doctor' && p.status === 'alive');
        const detective = updatedPlayers.find(p => p.role === 'detective' && p.status === 'alive');
        const spy = updatedPlayers.find(p => p.role === 'spy' && p.status === 'alive');
        const shf = updatedPlayers.find(p => p.role === 'shifter' && p.status === 'alive');
        const exp = updatedPlayers.find(p => p.role === 'explosive' && p.status === 'alive');

        let killedPlayerId: string | null = null;
        let savedPlayerId: string | null = null;
        let investigationResult: { playerId: string, role: MafiaRole, team: 'good' | 'mafia' } | null = null;
        let spyResult: { playerId: string, role: MafiaRole, isShifter: boolean, isSoldier: boolean } | null = null;

        // Doctor's action
        if (doctor && nightActions[doctor.id]?.targetId) {
            savedPlayerId = nightActions[doctor.id]!.targetId!;
            nightResults.push({ type: 'save_attempt', targetId: savedPlayerId, message: `The Doctor attempted to save someone.` });
        }

        // Killer's action
        if (killer && nightActions[killer.id]?.killTarget) {
            const targetId = nightActions[killer.id]!.killTarget!;
            if (targetId !== savedPlayerId) {
                killedPlayerId = targetId;
                const explosiveTarget = exp && nightActions[exp.id]?.targetId === targetId;
                if (explosiveTarget) {
                     // Killer dies trying to kill the explosive's target
                    const killerIndex = updatedPlayers.findIndex(p => p.id === killer!.id);
                    if (killerIndex !== -1) {
                        updatedPlayers[killerIndex].status = 'killed';
                        nightResults.push({ type: 'death', playerId: killer!.id, message: `${killer!.name} was killed by the Explosive's trap!` });
                        killedPlayerId = null; // The original target is saved
                    }
                }
            } else {
                 nightResults.push({ type: 'save_success', targetId: savedPlayerId, message: `The Doctor successfully saved someone!` });
            }
        }
        
        // Handle explosive's death if targeted
        if (killedPlayerId && killedPlayerId === exp?.id && nightActions[exp.id]?.targetId) {
             const finalTargetId = nightActions[exp.id]!.targetId!;
             const finalTargetIndex = updatedPlayers.findIndex(p => p.id === finalTargetId);
             if (finalTargetIndex !== -1) {
                 updatedPlayers[finalTargetIndex].status = 'killed';
                 nightResults.push({ type: 'death', playerId: finalTargetId, message: `${updatedPlayers[finalTargetIndex].name} was taken down by the Explosive!` });
             }
        }
        
        // Update player status for the main killed player
        if (killedPlayerId) {
             const killedPlayerIndex = updatedPlayers.findIndex(p => p.id === killedPlayerId);
             if (killedPlayerIndex !== -1) {
                 updatedPlayers[killedPlayerIndex].status = 'killed';
                 nightResults.push({ type: 'death', playerId: killedPlayerId, message: `${updatedPlayers[killedPlayerIndex].name} was killed.` });
             }
        }

        // Detective's action
        if (detective && nightActions[detective.id]?.targetId) {
            const targetId = nightActions[detective.id]!.targetId!;
            const targetPlayer = updatedPlayers.find(p => p.id === targetId);
            if (targetPlayer) {
                 const roleInfo = MAFIA_ROLES.find(r => r.id === targetPlayer.role)!;
                 investigationResult = { playerId: targetId, role: targetPlayer.role!, team: roleInfo.team };
            }
        }

        // Spy's action
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
        
        // Shifter's action - changes their apparent role for the next night
        if (shf && nightActions[shf.id]?.disguiseAs) {
            const shfIndex = updatedPlayers.findIndex(p => p.id === shf.id);
            if(shfIndex !== -1) {
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

        const alivePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(updatedVotes).length >= alivePlayers.length) {
            await processVotes(gameId, game.hostId);
        }
    });
}


export async function processVotes(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only the host can process votes.");
        
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
        if (playersWithMaxVotes.length === 1 && maxVotes > 0) {
            playerVotedOutId = playersWithMaxVotes[0];
            const updatedPlayers = game.players.map(p => {
                if (p.id === playerVotedOutId) {
                    return { ...p, status: 'voted_out' };
                }
                return p;
            });
            transaction.update(gameRef, { players: updatedPlayers });
        }

        transaction.update(gameRef, {
            gameState: 'voting_results',
            'mafiaState.phase': 'voting_results',
            'mafiaState.lastVotedOut': {
                playerId: playerVotedOutId,
                tie: playersWithMaxVotes.length > 1,
            },
            'mafiaState.timerEndsAt': Timestamp.fromMillis(Date.now() + 10 * 1000) // 10 seconds for results
        });
    });
}

function checkWinConditions(game: Game): { isGameOver: boolean; winner?: 'good' | 'mafia'; message?: string } {
    const alivePlayers = game.players.filter(p => p.status === 'alive');
    const killer = alivePlayers.find(p => p.role === 'killer');

    if (!killer) {
        return { isGameOver: true, winner: 'good', message: 'The Town has successfully eliminated the Killer!' };
    }
    
    const mafiaTeam = alivePlayers.filter(p => p.team === 'mafia');
    const goodTeam = alivePlayers.filter(p => p.team === 'good');
    
    if (mafiaTeam.length > goodTeam.length) {
        return { isGameOver: true, winner: 'mafia', message: 'The Mafia has taken over the town!' };
    }
    
    return { isGameOver: false };
}
