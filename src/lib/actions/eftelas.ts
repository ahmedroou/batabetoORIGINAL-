
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
