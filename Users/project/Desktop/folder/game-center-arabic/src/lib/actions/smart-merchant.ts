

'use server';

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
} from 'firebase/firestore';
import type { Game, Player, BoardProperty, SnakesAndScissorsQuestion } from '@/types';
import { updateLeagueScoresForGameEnd } from './user';
import { getShuffledQuestions } from './snakes-and-scissors';


/**
 * Starts the Smart Merchant game.
 * @param {string} gameId - The ID of the game.
 * @param {string} hostId - The ID of the host player.
 */
export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return; // Prevent re-starting
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const board: BoardProperty[] = [];
        // Generate a 24-tile board
        const totalTiles = 24;
        const fineTiles = new Set<number>();
        while(fineTiles.size < 2) {
            const randomIndex = Math.floor(Math.random() * (totalTiles - 1)) + 1; // Avoid tile 0 (start)
            fineTiles.add(randomIndex);
        }

        for (let i = 0; i < totalTiles; i++) {
            if (i === 0) {
                board.push({ id: i, type: 'start', name: 'البداية', price: 0, rent: 0, ownerId: null, color: '#4caf50' });
            } else if (fineTiles.has(i)) {
                board.push({ id: i, type: 'fine', name: 'غرامة', price: i % 2 === 0 ? 100 : 200, rent: 0, ownerId: null, color: '#f44336' });
            } else {
                 board.push({ id: i, type: 'property', name: `عقار ${i}`, price: (Math.floor(Math.random() * 20) + 5) * 10, rent: (Math.floor(Math.random() * 5) + 1) * 10, ownerId: null, color: '#e0e0e0' });
            }
        }

        const updatedPlayers = game.players.map(p => ({
            ...p,
            balance: 1000,
            position: 0,
            properties: []
        }));

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'roll',
            'smartMerchantState.board': board,
            'smartMerchantState.turnOrder': game.players.map(p => p.id),
            'smartMerchantState.currentTurnIndex': 0,
            'smartMerchantState.turnPhase': 'roll',
        });
    });
}

  