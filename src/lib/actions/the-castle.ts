
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, CastlePlayerState } from '@/types';

function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
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
            // Distribute players vertically
            const yPositions = Array.from({ length: Math.ceil(players.length / 2) }, (_, i) => Math.floor(mapSize.height / 2) - Math.floor(Math.ceil(players.length / 2) / 2) + i + 1);
            const startY = yPositions[team === 'blue' ? index : index - midPoint];
            
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

        if (distance === 0) return; // No move
        if (distance > playerState.movesLeft) {
            throw new Error("لا تملك حركات كافية.");
        }
        
        // Basic wall collision check
        if (castleState.walls?.some(w => w.position.x === targetPosition.x && w.position.y === targetPosition.y)) {
             throw new Error("لا يمكنك التحرك إلى مربع يحتوي على جدار.");
        }
        
        // Check if another player is in the target position
        const isOccupied = Object.values(castleState.playersState).some(p => p.position.x === targetPosition.x && p.position.y === targetPosition.y);
        if(isOccupied) {
            throw new Error("هذا المربع مشغول بلاعب آخر.");
        }

        const newPlayerState = {
            ...playerState,
            position: targetPosition,
            movesLeft: playerState.movesLeft - distance,
        };

        transaction.update(gameRef, {
            [`theCastleState.playersState.${playerId}`]: newPlayerState,
        });
    });
}
