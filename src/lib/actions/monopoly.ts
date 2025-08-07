
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, MonopolyState } from '@/types';
import { classicBoard } from '@/data/boards';

function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function updateGameSettings(gameId: string, hostId: string, settings: Partial<Game['monopolyState']>) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'monopolyState.settings': { ...game.monopolyState, ...settings } });
    });
}

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return;
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const turnOrder = shuffle(game.players.map(p => p.id));
        
        const playerData: MonopolyState['playerData'] = {};
        game.players.forEach(p => {
            playerData[p.id] = {
                money: 1500,
                properties: [],
                inJail: false,
                jailTurns: 0,
                position: 0,
            };
        });

        transaction.update(gameRef, {
            gameState: 'game_play',
            monopolyState: {
                board: classicBoard,
                playerData,
                turnOrder,
                currentTurnIndex: 0,
                dice: [0, 0],
                lastActivity: "بدأت اللعبة!",
                turnPhase: 'start',
            },
        });
    });
}

// Additional actions like rollDice, buyProperty, endTurn will go here.
