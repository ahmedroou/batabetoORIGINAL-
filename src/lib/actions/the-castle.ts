'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, type Transaction, collection, where, query, getDocs, updateDoc, deleteField } from 'firebase/firestore';
import type { Game, Player, CastlePlayerState, Wall, Trap, Bomb, UserProfile, League, Key, PowerUp } from '@/types';
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
    const currentTurnTeam = castleState.turn;
    const nextTurnTeam = currentTurnTeam === 'red' ? 'blue' : 'red';
    
    // Decrement bomb timers for all bombs
    const updatedBombs = (castleState.bombs || []).map(bomb => ({
        ...bomb,
        timer: bomb.timer - 1,
    }));
    
    const explodedBombs = updatedBombs.filter(b => b.timer <= 0);
    let finalBombs = updatedBombs.filter(b => b.timer > 0);
    let finalWalls = [...(castleState.walls || [])];
    const newEvents = [];

    // Handle explosions
    for (const bomb of explodedBombs) {
        newEvents.push({ type: 'bomb', position: bomb.position });
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue; // Don't destroy the bomb's own tile
                const wallX = bomb.position.x + dx;
                const wallY = bomb.position.y + dy;
                finalWalls = finalWalls.filter(wall => !(wall.x === wallX && wall.y === wallY));
            }
        }
    }
    
    // Reset moves for the next team and unfreeze players of the current team
    let updatedPlayersState = { ...castleState.playersState };

    game.players.forEach(p => {
        if (p.team === nextTurnTeam) {
            // Reset moves for the next team
            const powerUpMoves = updatedPlayersState[p.id]?.powerUpMoves || 0;
            updatedPlayersState[p.id] = {
                ...updatedPlayersState[p.id],
                movesLeft: castleState.settings.movesPerTurn + powerUpMoves,
                powerUpMoves: 0, // Reset power-up moves after applying them
            };
        } else if (p.team === currentTurnTeam) {
            // Unfreeze players of the current team for their next turn
            if(updatedPlayersState[p.id]?.frozenForNextTurn) {
                updatedPlayersState[p.id] = {
                    ...updatedPlayersState[p.id],
                    frozenForNextTurn: false,
                };
            }
        }
    });


    transaction.update(gameRef, {
        'theCastleState.turn': nextTurnTeam,
        'theCastleState.playersState': updatedPlayersState,
        'theCastleState.turnEndsAt': Timestamp.fromMillis(Date.now() + 60 * 1000),
        'theCastleState.bombs': finalBombs,
        'theCastleState.walls': finalWalls,
        'theCastleState.lastEvent': newEvents.length > 0 ? newEvents[0] : deleteField(),
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
        const mapSize = { width: 15, height: 13 };
        
        const occupiedPositions = new Set<string>();

        const updatedPlayers = players.map((player, index) => {
            const team = index < midPoint ? 'blue' : 'red';
            const teamSize = team === 'blue' ? midPoint : players.length - midPoint;
            
            let startX, startY;
            let attempts = 0;
            do {
                startX = team === 'blue' ? 1 : mapSize.width - 2;
                const yOffset = Math.floor(mapSize.height / 2) - Math.floor(teamSize / 2);
                startY = yOffset + (index % midPoint);
                // Simple collision avoidance
                if (occupiedPositions.has(`${startX},${startY}`)) {
                     startY = (startY + attempts) % mapSize.height;
                }
                attempts++;
            } while (occupiedPositions.has(`${startX},${startY}`) && attempts < 10);


            const posKey = `${startX},${startY}`;
            occupiedPositions.add(posKey);
            
            playersState[player.id] = {
                position: { x: startX, y: startY },
                movesLeft: 3,
                trapsLeft: 1, 
                hasRedKey: false,
                hasBlueKey: false,
                powerUpMoves: 0,
            };
            return { ...player, team };
        });

        const getRandomPos = () => {
             let pos, key;
             do {
                pos = {
                    x: Math.floor(Math.random() * (mapSize.width - 6)) + 3, // Avoid bases
                    y: Math.floor(Math.random() * mapSize.height)
                };
                key = `${pos.x},${pos.y}`;
             } while(occupiedPositions.has(key));
             occupiedPositions.add(key);
             return pos;
        }
        
        const keys: Key[] = [
            { position: getRandomPos(), team: 'red' },
            { position: getRandomPos(), team: 'blue' },
        ];
        
        const powerUps: PowerUp[] = Array.from({ length: 4 }).map(() => ({
            position: getRandomPos(),
            moves: Math.floor(Math.random() * 3) + 1,
        }));
        
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
                keys,
                powerUps,
                turn: 'blue',
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

        const player = game.players.find(p => p.id === playerId);
        if (!player || player.team !== castleState.turn) throw new Error("ليس دور فريقك.");

        const playerState = castleState.playersState[playerId];
        if (!playerState) throw new Error("لم يتم العثور على بيانات اللاعب.");
        
        if(playerState.frozenForNextTurn) throw new Error("أنت متجمد ولا يمكنك التحرك.");

        const currentPos = playerState.position;
        const distance = Math.abs(targetPosition.x - currentPos.x) + Math.abs(targetPosition.y - currentPos.y);

        if (distance === 0) return;
        
        // Pathfinding check (simple version for now)
        const pathIsClear = () => {
             const queue = [{ pos: currentPos, dist: 0 }];
             const visited = new Set([`${currentPos.x},${currentPos.y}`]);
             while(queue.length > 0) {
                 const current = queue.shift()!;
                 if (current.pos.x === targetPosition.x && current.pos.y === targetPosition.y) return true;
                 if (current.dist >= playerState.movesLeft) continue;

                 const directions = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
                 for (const dir of directions) {
                    const newX = current.pos.x + dir.dx;
                    const newY = current.pos.y + dir.dy;
                    const newKey = `${newX},${newY}`;
                     if (newX >= 0 && newX < castleState.settings.mapSize.width && newY >= 0 && newY < castleState.settings.mapSize.height && !visited.has(newKey) && !castleState.walls?.some(w => w.x === newX && w.y === newY) && !Object.values(castleState.playersState).some(p => p.position.x === newX && p.position.y === newY)) {
                        visited.add(newKey);
                        queue.push({ pos: { x: newX, y: newY }, dist: current.dist + 1 });
                    }
                 }
             }
             return false;
        }

        if (!pathIsClear()) {
             throw new Error("الطريق مسدود أو لا يمكن الوصول إليه.");
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

        let newPlayerState: CastlePlayerState = {
            ...playerState,
            position: targetPosition,
            movesLeft: playerState.movesLeft - distance,
        };
        
        const playerTeam = game.players.find(p => p.id === playerId)?.team;
        let updatedKeys = [...(castleState.keys || [])];
        let updatedPowerUps = [...(castleState.powerUps || [])];
        let event = null;

        // Key pickup logic
        const keyIndex = updatedKeys.findIndex(k => k.position.x === targetPosition.x && k.position.y === targetPosition.y);
        if (keyIndex !== -1) {
            const key = updatedKeys[keyIndex];
            if (key.team !== playerTeam) {
                if(key.team === 'red') newPlayerState.hasRedKey = true;
                if(key.team === 'blue') newPlayerState.hasBlueKey = true;
                updatedKeys.splice(keyIndex, 1);
            }
        }
        
        // Power-up pickup logic
        const powerUpIndex = updatedPowerUps.findIndex(p => p.position.x === targetPosition.x && p.position.y === targetPosition.y);
        if (powerUpIndex !== -1) {
            const powerUp = updatedPowerUps[powerUpIndex];
            newPlayerState.powerUpMoves = (newPlayerState.powerUpMoves || 0) + powerUp.moves;
            updatedPowerUps.splice(powerUpIndex, 1);
        }
        
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
                event = { type: 'trap', position: targetPosition };
            }
        }
        
        const updatedPlayersState = {
            ...castleState.playersState,
            [playerId]: newPlayerState,
        };

        transaction.update(gameRef, {
            'theCastleState.playersState': updatedPlayersState,
            'theCastleState.keys': updatedKeys,
            'theCastleState.powerUps': updatedPowerUps,
            'theCastleState.lastEvent': event || deleteField(),
        });
        
        const targetBaseX = playerTeam === 'blue' ? castleState.settings.mapSize.width - 1 : 0;
        const requiredKey = playerTeam === 'blue' ? 'hasRedKey' : 'hasBlueKey';
        
        const targetBaseYStart = Math.floor(castleState.settings.mapSize.height / 2) - 1;
        const targetBaseYEnd = Math.floor(castleState.settings.mapSize.height / 2) + 1;

        if (targetPosition.x === targetBaseX && targetPosition.y >= targetBaseYStart && targetPosition.y <= targetBaseYEnd && newPlayerState[requiredKey]) {
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
            return; // End transaction early if game is over
        }
        
        // Check if all players on the current team have 0 moves left
        const currentTeamPlayers = game.players.filter(p => p.team === castleState.turn);
        const allMovesUsed = currentTeamPlayers.every(p => (updatedPlayersState[p.id]?.movesLeft ?? 0) === 0);
        
        if (allMovesUsed) {
            await endTurnAction(transaction, gameRef, { ...game, theCastleState: { ...castleState, playersState: updatedPlayersState, keys: updatedKeys, powerUps: updatedPowerUps } });
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
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.team !== castleState.turn) throw new Error("ليس دور فريقك.");

        const playerState = castleState.playersState[playerId];
        if (!playerState) throw new Error("لم يتم العثور على بيانات اللاعب.");
        
        if(playerState.frozenForNextTurn) throw new Error("أنت متجمد ولا يمكنك البناء.");

        const cost = isLongRange ? 3 : 1;
        if (playerState.movesLeft < cost) throw new Error("لا تملك حركات كافية.");

        if(!isLongRange) {
             const currentPos = playerState.position;
             const distance = Math.abs(wallPosition.x - currentPos.x) + Math.abs(wallPosition.y - currentPos.y);
             if(distance > 1 && !(wallPosition.x === currentPos.x && wallPosition.y === currentPos.y)) { 
                 throw new Error("يمكنك بناء الجدران في المربعات المجاورة لك فقط أو على مربعك الحالي.");
             }
        }

        if(castleState.walls?.some(w => w.x === wallPosition.x && w.y === wallPosition.y)) throw new Error("يوجد جدار بالفعل في هذا المكان.");
        if(Object.values(castleState.playersState).some(p => p.position.x === wallPosition.x && p.position.y === wallPosition.y)) throw new Error("لا يمكنك البناء فوق لاعب آخر.");
        
        const newWalls: Wall[] = [...(castleState.walls || []), wallPosition];
        const newPlayerState = {
            ...playerState,
            movesLeft: playerState.movesLeft - cost,
        };
        const updatedPlayersState = {
            ...castleState.playersState,
            [playerId]: newPlayerState,
        };

        transaction.update(gameRef, {
            'theCastleState.walls': newWalls,
            'theCastleState.playersState': updatedPlayersState,
        });
        
        const currentTeamPlayers = game.players.filter(p => p.team === castleState.turn);
        const allMovesUsed = currentTeamPlayers.every(p => (updatedPlayersState[p.id]?.movesLeft ?? 0) === 0);
        
        if (allMovesUsed) {
            await endTurnAction(transaction, gameRef, { ...game, theCastleState: { ...castleState, walls: newWalls, playersState: updatedPlayersState } });
        }
     });
}

export async function placeTrap(gameId: string, playerId: string, targetPosition: { x: number, y: number }) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const castleState = game.theCastleState!;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.team !== castleState.turn) throw new Error("ليس دور فريقك.");

        const playerState = castleState.playersState[playerId];
        if (!playerState) throw new Error("Player state not found.");
        
        if(playerState.frozenForNextTurn) throw new Error("أنت متجمد ولا يمكنك وضع فخ.");
        
        if ((playerState.trapsLeft || 0) < 1) throw new Error("ليس لديك فخاخ متبقية.");
        if (playerState.movesLeft < 1) throw new Error("لا تملك حركات كافية.");
        
        const currentPos = playerState.position;
        const distance = Math.abs(targetPosition.x - currentPos.x) + Math.abs(targetPosition.y - currentPos.y);
        if(distance > 1) throw new Error("يمكنك وضع الفخ في مربع مجاور لك فقط.");

        if (castleState.traps?.some(t => t.position.x === targetPosition.x && t.position.y === targetPosition.y)) {
            throw new Error("يوجد فخ بالفعل في هذا المكان.");
        }
        if (Object.values(castleState.playersState).some(p => p.position.x === targetPosition.x && p.position.y === targetPosition.y)) {
             throw new Error("لا يمكنك وضع فخ على لاعب آخر.");
        }


        const newTrap: Trap = { position: targetPosition, ownerId: playerId };
        const newTraps = [...(castleState.traps || []), newTrap];
        const newPlayerState = {
            ...playerState,
            movesLeft: playerState.movesLeft - 1,
            trapsLeft: (playerState.trapsLeft || 1) - 1,
        };
        const updatedPlayersState = {
            ...castleState.playersState,
            [playerId]: newPlayerState,
        };
        
        transaction.update(gameRef, {
            'theCastleState.traps': newTraps,
            'theCastleState.playersState': updatedPlayersState,
        });

        const currentTeamPlayers = game.players.filter(p => p.team === castleState.turn);
        const allMovesUsed = currentTeamPlayers.every(p => (updatedPlayersState[p.id]?.movesLeft ?? 0) === 0);
        
        if (allMovesUsed) {
            await endTurnAction(transaction, gameRef, { ...game, theCastleState: { ...castleState, traps: newTraps, playersState: updatedPlayersState } });
        }
    });
}

export async function placeBomb(gameId: string, playerId: string, targetPosition: { x: number, y: number }) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const castleState = game.theCastleState!;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.team !== castleState.turn) throw new Error("ليس دور فريقك.");

        const playerState = castleState.playersState[playerId];
        if (!playerState) throw new Error("Player state not found.");
        
        if(playerState.frozenForNextTurn) throw new Error("أنت متجمد ولا يمكنك زرع قنبلة.");
        
        if (playerState.movesLeft < 3) throw new Error("تحتاج 3 حركات على الأقل لزرع قنبلة.");
        
        const currentPos = playerState.position;
        const distance = Math.abs(targetPosition.x - currentPos.x) + Math.abs(targetPosition.y - currentPos.y);
        if(distance > 1) throw new Error("يمكنك وضع القنبلة في مربع مجاور لك فقط.");

        if (castleState.bombs?.some(b => b.position.x === targetPosition.x && b.position.y === targetPosition.y)) {
             throw new Error("يوجد قنبلة بالفعل في هذا المكان.");
        }
        if (Object.values(castleState.playersState).some(p => p.position.x === targetPosition.x && p.position.y === targetPosition.y)) {
             throw new Error("لا يمكنك وضع قنبلة على لاعب آخر.");
        }
        
        const newBomb: Bomb = { position: targetPosition, ownerId: playerId, timer: 4 }; // Timer is now 4
        const newBombs = [...(castleState.bombs || []), newBomb];
        const newPlayerState = {
            ...playerState,
            movesLeft: playerState.movesLeft - 3,
        };
        const updatedPlayersState = {
            ...castleState.playersState,
            [playerId]: newPlayerState,
        };
        
        transaction.update(gameRef, {
            'theCastleState.bombs': newBombs,
            'theCastleState.playersState': updatedPlayersState,
        });

        const currentTeamPlayers = game.players.filter(p => p.team === castleState.turn);
        const allMovesUsed = currentTeamPlayers.every(p => (updatedPlayersState[p.id]?.movesLeft ?? 0) === 0);
        
        if (allMovesUsed) {
            await endTurnAction(transaction, gameRef, { ...game, theCastleState: { ...castleState, bombs: newBombs, playersState: updatedPlayersState } });
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
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.team !== castleState.turn) throw new Error("ليس دور فريقك لإنهاء الجولة.");
        
        await endTurnAction(transaction, gameRef, game);
     });
}

export async function acknowledgeEvent(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await updateDoc(gameRef, { 'theCastleState.lastEvent': deleteField() });
    } catch (error) {
        console.error("Failed to acknowledge event", error);
    }
}
