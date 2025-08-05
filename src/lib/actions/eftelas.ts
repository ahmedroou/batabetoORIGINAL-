
"use server";

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, EftelasPlayerState, BoardProperty } from '@/types';
import { BOARD_LAYOUT } from '@/data/eftelas-board';
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from '@/data/eftelas-cards';


function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}


export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can start the game.");
        }
        if(game.gameState !== 'lobby') return; // Prevent re-starting

        const initialMoney = 1500;
        const playerStates: Record<string, EftelasPlayerState> = {};
        
        const shuffledPlayers = shuffle([...game.players]);

        shuffledPlayers.forEach((player: Player) => {
            playerStates[player.id] = {
                money: initialMoney,
                position: 0,
                properties: [],
                inJail: false,
                jailTurns: 0,
                getOutOfJailCards: 0,
            };
        });

        transaction.update(gameRef, {
            gameState: 'playing',
            players: shuffledPlayers, // Save the shuffled order
            eftelasState: {
                board: BOARD_LAYOUT,
                playerStates,
                communityChestCards: shuffle(COMMUNITY_CHEST_CARDS),
                chanceCards: shuffle(CHANCE_CARDS),
                currentTurnPlayerId: shuffledPlayers[0].id,
                dice: [0, 0],
                lastActivity: `بدأت اللعبة! دور اللاعب ${shuffledPlayers[0].name}.`,
            },
        });
    });
}

export async function rollDiceAndMove(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        const eftelasState = game.eftelasState;
        if (!eftelasState || game.gameState !== 'playing') {
            throw new Error("لا يمكن رمي النرد الآن.");
        }
        if (eftelasState.currentTurnPlayerId !== playerId) {
            throw new Error("ليس دورك.");
        }

        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        const totalMove = die1 + die2;

        const playerState = { ...eftelasState.playerStates[playerId]! };
        const oldPosition = playerState.position;
        const newPosition = (oldPosition + totalMove) % eftelasState.board.length;
        playerState.position = newPosition;
        
        // Handle passing GO
        if (newPosition < oldPosition) {
            playerState.money += 200;
        }

        // Determine next player
        const currentPlayerIndex = game.players.findIndex(p => p.id === playerId);
        const nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
        const nextPlayerId = game.players[nextPlayerIndex].id;

        // Update state
        transaction.update(gameRef, {
            [`eftelasState.playerStates.${playerId}`]: playerState,
            'eftelasState.dice': [die1, die2],
            'eftelasState.currentTurnPlayerId': nextPlayerId,
            'eftelasState.lastActivity': `${game.players[currentPlayerIndex].name} رمى ${totalMove} وانتقل إلى ${eftelasState.board[newPosition].name}`,
        });
    });
}
