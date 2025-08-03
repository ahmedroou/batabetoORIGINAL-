
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, CastlePlayerState, Wall } from '@/types';

function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[currentIndex], array[currentIndex]];
    }
    return array;
}

export async function startGame(gameId: string, hostId: string): Promise<void> {
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
        const mapSize = { width: 15, height: 9 }; // Example size

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
                specialMoves: 1,
            };
            return { ...player, team };
        });
        
        const firstPlayerTurn = updatedPlayers[0].id;

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
                turnOrder: players.map(p => p.id), // Store the initial shuffled order
                turnIndex: 0,
                turn: firstPlayerTurn,
                turnEndsAt: Timestamp.fromMillis(Date.now() + 60 * 1000), // 60-second turns
            }
        });
    });
}


export async function movePlayer(gameId: string, playerId: string, targetPosition: { x: number, y: number }) {
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

        const currentPos = playerState.position;
        const distance = Math.abs(targetPosition.x - currentPos.x) + Math.abs(targetPosition.y - currentPos.y);

        if (distance === 0) return;
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

        const newPlayerState = {
            ...playerState,
            position: targetPosition,
            movesLeft: playerState.movesLeft - distance,
        };
        
        const playerTeam = game.players.find(p => p.id === playerId)?.team;
        const targetBaseX = playerTeam === 'blue' ? castleState.settings.mapSize.width - 1 : 0;
        
        if (targetPosition.x === targetBaseX) {
            // Player reached the base, game ends!
            transaction.update(gameRef, {
                gameState: 'ended',
                gameResult: {
                    winner: playerTeam,
                    message: `الفريق ${playerTeam === 'blue' ? 'الأزرق' : 'الأحمر'} فاز بالوصول إلى القلعة!`,
                },
                'theCastleState.turn': null,
            });
        } else {
            transaction.update(gameRef, {
                [`theCastleState.playersState.${playerId}`]: newPlayerState,
            });
        }
    });
}


export async function buildWall(gameId: string, playerId: string, wallPosition: { x: number, y: number }) {
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
        if (playerState.movesLeft < 1) throw new Error("لا تملك حركات كافية لبناء جدار.");

        const currentPos = playerState.position;
        const distance = Math.abs(wallPosition.x - currentPos.x) + Math.abs(wallPosition.y - currentPos.y);
        if(distance !== 1) throw new Error("يمكنك بناء الجدران في المربعات المجاورة لك فقط.");

        if(castleState.walls?.some(w => w.x === wallPosition.x && w.y === wallPosition.y)) throw new Error("يوجد جدار بالفعل في هذا المكان.");
        if(Object.values(castleState.playersState).some(p => p.position.x === wallPosition.x && p.position.y === wallPosition.y)) throw new Error("لا يمكنك البناء فوق لاعب آخر.");
        
        const newWalls = [...(castleState.walls || []), wallPosition];
        const newPlayerState = {
            ...playerState,
            movesLeft: playerState.movesLeft - 1,
        };

        transaction.update(gameRef, {
            'theCastleState.walls': newWalls,
            [`theCastleState.playersState.${playerId}`]: newPlayerState,
        });
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
        
        const currentTurnIndex = castleState.turnIndex || 0;
        const turnOrder = castleState.turnOrder || [];
        const nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
        const nextPlayerId = turnOrder[nextTurnIndex];
        
        const nextPlayerState = {
            ...castleState.playersState[nextPlayerId],
            movesLeft: castleState.settings.movesPerTurn, // Reset moves for the next player
        };

        transaction.update(gameRef, {
            'theCastleState.turn': nextPlayerId,
            'theCastleState.turnIndex': nextTurnIndex,
            [`theCastleState.playersState.${nextPlayerId}`]: nextPlayerState,
            'theCastleState.turnEndsAt': Timestamp.fromMillis(Date.now() + 60 * 1000),
        });
     });
}
