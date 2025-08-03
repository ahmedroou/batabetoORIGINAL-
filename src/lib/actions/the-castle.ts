

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, type Transaction, collection, where, query, getDocs } from 'firebase/firestore';
import type { Game, Player, CastlePlayerState, Wall, Trap, Bomb, UserProfile, League } from '@/types';
import { updateLeagueScoresForGameEnd as generalUpdateLeagueScores } from './user';


function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

async function endTurnAction(transaction: Transaction, gameRef: any, game: Game) {
    const castleState = game.theCastleState!;
    const currentTurnIndex = castleState.turnIndex;
    const turnOrder = castleState.turnOrder;
    let nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
    
    // Skip frozen players
    let nextPlayerId = turnOrder[nextTurnIndex];
    let nextPlayerState = castleState.playersState[nextPlayerId];
    let frozenTurnsSkipped = 0;
    while(nextPlayerState?.frozenForNextTurn && frozenTurnsSkipped < turnOrder.length) {
        // Unfreeze the player for their *next* turn after this one is skipped.
        transaction.update(gameRef, {[`theCastleState.playersState.${nextPlayerId}.frozenForNextTurn`]: false });
        nextTurnIndex = (nextTurnIndex + 1) % turnOrder.length;
        nextPlayerId = turnOrder[nextTurnIndex];
        nextPlayerState = castleState.playersState[nextPlayerId];
        frozenTurnsSkipped++;
    }

    if(frozenTurnsSkipped >= turnOrder.length) {
        // All players are frozen, something is wrong, end game to prevent infinite loop.
        transaction.update(gameRef, { gameState: 'ended', gameResult: { winner: 'draw', message: 'انتهت اللعبة بالتعادل بسبب تجمد جميع اللاعبين.' }});
        return;
    }

    const updatedPlayersState: Record<string, CastlePlayerState> = {};
    
    // Decrement bomb timers for all bombs
    const updatedBombs = (castleState.bombs || []).map(bomb => ({
        ...bomb,
        timer: bomb.timer - 1,
    }));
    
    const explodedBombs = updatedBombs.filter(b => b.timer <= 0);
    let finalBombs = updatedBombs.filter(b => b.timer > 0);
    let finalWalls = [...(castleState.walls || [])];

    // Handle explosions
    explodedBombs.forEach(bomb => {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue; // Don't destroy the bomb's own tile
                const wallX = bomb.position.x + dx;
                const wallY = bomb.position.y + dy;
                finalWalls = finalWalls.filter(wall => !(wall.x === wallX && wall.y === wallY));
            }
        }
    });


    transaction.update(gameRef, {
        'theCastleState.turn': nextPlayerId,
        'theCastleState.turnIndex': nextTurnIndex,
        [`theCastleState.playersState.${nextPlayerId}.movesLeft`]: castleState.settings.movesPerTurn,
        'theCastleState.turnEndsAt': Timestamp.fromMillis(Date.now() + 60 * 1000),
        'theCastleState.bombs': finalBombs,
        'theCastleState.walls': finalWalls,
    });
}


export async function startTheCastleGame(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return;

        const players = shuffle([...game.players]);
        const midPoint = Math.ceil(players.length / 2);
        const playersState: Record<string, CastlePlayerState> = {};
        const mapSize = { width: 17, height: 11 };

        const updatedPlayers = players.map((player, index) => {
            const team = index < midPoint ? 'blue' : 'red';
            const startX = team === 'blue' ? 1 : mapSize.width - 2;
            const teamSize = team === 'blue' ? midPoint : players.length - midPoint;
            const teamIndex = team === 'blue' ? index : index - midPoint;
            const yOffset = Math.floor(mapSize.height / 2) - Math.floor(teamSize / 2);
            const startY = yOffset + teamIndex;
            
            playersState[player.id] = {
                position: { x: startX, y: startY },
                movesLeft: 3,
                trapsLeft: 1, 
            };
            return { ...player, team };
        });
        
        const firstPlayerTurn = updatedPlayers[0]?.id;

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'playing',
            theCastleState: {
                settings: {
                    mapSize,
                    movesPerTurn: 3,
                },
                playersState,
                walls: [],
                traps: [],
                bombs: [],
                turnOrder: players.map(p => p.id),
                turnIndex: 0,
                turn: firstPlayerTurn,
                turnEndsAt: Timestamp.fromMillis(Date.now() + 60 * 1000),
            }
        });
    });
}


export async function movePlayer(gameId: string, playerId: string, targetPosition: { x: number, y: number }) {
    const gameRef = doc(db, 'games', gameId);
    let gameDataForLeagueUpdate: Game | null = null;
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const castleState = game.theCastleState;
        if (!castleState || game.gameState !== 'playing') throw new Error("Game is not active.");
        if (castleState.turn !== playerId) throw new Error("ليس دورك.");

        const playerState = castleState.playersState[playerId];
        if (!playerState) throw new Error("لم يتم العثور على بيانات اللاعب.");

        const currentPos = playerState.position;
        const distance = Math.abs(targetPosition.x - currentPos.x) + Math.abs(targetPosition.y - currentPos.y);

        if (distance === 0) return;
        
        // Pathfinding check (simple version)
        const pathIsClear = (start: {x:number, y:number}, end: {x:number, y:number}) => {
             const dx = Math.sign(end.x - start.x);
             const dy = Math.sign(end.y - start.y);
             let x = start.x;
             let y = start.y;
             while(x !== end.x || y !== end.y) {
                 if (x !== end.x) x += dx;
                 if (castleState.walls?.some(w => w.x === x && w.y === y)) return false;
                 if (y !== end.y) y += dy;
                 if (castleState.walls?.some(w => w.x === x && w.y === y)) return false;
             }
             return true;
        }

        if (!pathIsClear(currentPos, targetPosition)) {
             throw new Error("الطريق مسدود بالجدران.");
        }


        if (distance > playerState.movesLeft) {
            throw new Error("لا تملك حركات كافية.");
        }
        
        if (castleState.walls?.some(w => w.x === targetPosition.x && w.y === targetPosition.y)) {
             throw new Error("لا يمكنك التحرك إلى مربع يحتوي على جدار.");
        }
        
        const isOccupied = Object.values(castleState.playersState).some(p => p.position.x === targetPosition.x && p.position.y === targetPosition.y);
        if(isOccupied) {
            throw new Error("هذا المربع مشغول بلاعب آخر.");
        }

        let newPlayerState = {
            ...playerState,
            position: targetPosition,
            movesLeft: playerState.movesLeft - distance,
        };
        
        const playerTeam = game.players.find(p => p.id === playerId)?.team;
        
        // Trap check
        const trapIndex = castleState.traps?.findIndex(t => t.position.x === targetPosition.x && t.position.y === targetPosition.y);
        if (trapIndex !== undefined && trapIndex !== -1) {
            const trap = castleState.traps[trapIndex];
            const trapOwnerTeam = game.players.find(p => p.id === trap.ownerId)?.team;
            if (trapOwnerTeam && trapOwnerTeam !== playerTeam) { 
                newPlayerState.frozenForNextTurn = true;
                const updatedTraps = [...castleState.traps];
                updatedTraps.splice(trapIndex, 1);
                transaction.update(gameRef, { 'theCastleState.traps': updatedTraps });
            }
        }
        
        transaction.update(gameRef, {
            [`theCastleState.playersState.${playerId}`]: newPlayerState,
        });
        
        const targetBaseX = playerTeam === 'blue' ? castleState.settings.mapSize.width - 1 : 0;
        
        if (targetPosition.x === targetBaseX) {
            const finalGameData = {
                ...game,
                gameState: 'ended' as 'ended',
                gameResult: {
                    winner: playerTeam,
                    message: `الفريق ${playerTeam === 'blue' ? 'الأزرق' : 'الأحمر'} فاز بالوصول إلى القلعة!`,
                },
            };
            gameDataForLeagueUpdate = finalGameData;
            transaction.update(gameRef, {
                gameState: 'ended',
                gameResult: finalGameData.gameResult,
                'theCastleState.turn': null,
            });
        } else if (newPlayerState.movesLeft <= 0) {
            await endTurnAction(transaction, gameRef, {
                ...game,
                theCastleState: {
                    ...castleState,
                    playersState: {
                        ...castleState.playersState,
                        [playerId]: newPlayerState
                    }
                }
            });
        }
    });

     if (gameDataForLeagueUpdate) {
        await generalUpdateLeagueScores(gameDataForLeagueUpdate);
    }
}


export async function buildWall(gameId: string, playerId: string, wallPosition: { x: number, y: number }, isLongRange: boolean = false) {
     const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const castleState = game.theCastleState;
        if (!castleState || game.gameState !== 'playing') throw new Error("Game is not active.");
        if (castleState.turn !== playerId) throw new Error("ليس دورك.");
        const playerState = castleState.playersState[playerId];
        if (!playerState) throw new Error("لم يتم العثور على بيانات اللاعب.");

        const cost = isLongRange ? 3 : 1;
        if (playerState.movesLeft < cost) throw new Error("لا تملك حركات كافية.");

        if(!isLongRange) {
             const currentPos = playerState.position;
             const distance = Math.abs(wallPosition.x - currentPos.x) + Math.abs(wallPosition.y - currentPos.y);
             if(distance !== 1) throw new Error("يمكنك بناء الجدران في المربعات المجاورة لك فقط.");
        }

        if(castleState.walls?.some(w => w.x === wallPosition.x && w.y === wallPosition.y)) throw new Error("يوجد جدار بالفعل في هذا المكان.");
        if(Object.values(castleState.playersState).some(p => p.position.x === wallPosition.x && p.position.y === wallPosition.y)) throw new Error("لا يمكنك البناء فوق لاعب آخر.");
        
        const newWalls: Wall[] = [...(castleState.walls || []), wallPosition];
        const newPlayerState = {
            ...playerState,
            movesLeft: playerState.movesLeft - cost,
        };

        transaction.update(gameRef, {
            'theCastleState.walls': newWalls,
            [`theCastleState.playersState.${playerId}`]: newPlayerState,
        });

        if (newPlayerState.movesLeft <= 0) {
             await endTurnAction(transaction, gameRef, {
                ...game,
                theCastleState: {
                    ...castleState,
                    walls: newWalls,
                    playersState: {
                        ...castleState.playersState,
                        [playerId]: newPlayerState
                    }
                }
            });
        }
     });
}

export async function placeTrap(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const castleState = game.theCastleState!;
        if (castleState.turn !== playerId) throw new Error("ليس دورك.");
        const playerState = castleState.playersState[playerId];
        if (!playerState) throw new Error("Player state not found.");
        if ((playerState.trapsLeft || 0) < 1) throw new Error("ليس لديك فخاخ متبقية.");
        if (playerState.movesLeft < 1) throw new Error("لا تملك حركات كافية.");

        const trapPosition = playerState.position;
        if (castleState.traps?.some(t => t.position.x === trapPosition.x && t.position.y === trapPosition.y)) {
            throw new Error("يوجد فخ بالفعل في هذا المكان.");
        }

        const newTrap: Trap = { position: trapPosition, ownerId: playerId };
        const newTraps = [...(castleState.traps || []), newTrap];
        const newPlayerState = {
            ...playerState,
            movesLeft: playerState.movesLeft - 1,
            trapsLeft: (playerState.trapsLeft || 1) - 1,
        };
        
        transaction.update(gameRef, {
            'theCastleState.traps': newTraps,
            [`theCastleState.playersState.${playerId}`]: newPlayerState,
        });

        if (newPlayerState.movesLeft <= 0) {
            await endTurnAction(transaction, gameRef, {
                ...game,
                theCastleState: {
                    ...castleState,
                    traps: newTraps,
                    playersState: {
                        ...castleState.playersState,
                        [playerId]: newPlayerState
                    }
                }
            });
        }
    });
}

export async function placeBomb(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const castleState = game.theCastleState!;
        if (castleState.turn !== playerId) throw new Error("ليس دورك.");
        const playerState = castleState.playersState[playerId];
        if (!playerState) throw new Error("Player state not found.");
        if (playerState.movesLeft < 2) throw new Error("تحتاج حركتين على الأقل لزرع قنبلة.");

        const bombPosition = playerState.position;
        if (castleState.bombs?.some(b => b.position.x === bombPosition.x && b.position.y === bombPosition.y)) {
             throw new Error("يوجد قنبلة بالفعل في هذا المكان.");
        }
        
        const newBomb: Bomb = { position: bombPosition, ownerId: playerId, timer: 3 };
        const newBombs = [...(castleState.bombs || []), newBomb];
        const newPlayerState = {
            ...playerState,
            movesLeft: playerState.movesLeft - 2,
        };
        
        transaction.update(gameRef, {
            'theCastleState.bombs': newBombs,
            [`theCastleState.playersState.${playerId}`]: newPlayerState,
        });

        if (newPlayerState.movesLeft <= 0) {
            await endTurnAction(transaction, gameRef, {
                ...game,
                theCastleState: {
                    ...castleState,
                    bombs: newBombs,
                    playersState: {
                        ...castleState.playersState,
                        [playerId]: newPlayerState
                    }
                }
            });
        }
    });
}

export async function endTurn(gameId: string, playerId: string) {
     const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const castleState = game.theCastleState;
        if (!castleState || game.gameState !== 'playing') throw new Error("Game is not active.");
        if (castleState.turn !== playerId) throw new Error("ليس دورك لإنهاء الجولة.");
        
        await endTurnAction(transaction, gameRef, game);
     });
}
