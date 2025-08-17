
      
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, DrawAndDeceiveState } from '@/types';
import { shuffle } from './helpers';

// --- Constants ---
const DEFAULT_SETTINGS = {
    drawingTime: 120,
    trappingTime: 45,
    guessingTime: 60,
    resultsTime: 20,
    rounds: 3,
};

// --- Utilities ---
const now = () => Timestamp.now();
const inSec = (s: number) => Timestamp.fromMillis(Date.now() + s * 1000);
const ensure = (condition: any, message: string): asserts condition => {
    if (!condition) throw new Error(message);
};

// --- Game Logic Actions ---

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        ensure(gameDoc.exists(), 'Game not found.');
        const game = gameDoc.data() as Game;

        ensure(game.hostId === hostId, 'Only the host can start the game.');
        ensure(game.players.length >= 2, 'The game requires at least 2 players.');

        const turnOrder = shuffle(game.players.map(p => p.id));
        const rounds = Math.min(10, Math.max(1, game.drawAndDeceiveState?.settings?.rounds ?? DEFAULT_SETTINGS.rounds));

        const initialState: DrawAndDeceiveState = {
            settings: { ...DEFAULT_SETTINGS, ...game.drawAndDeceiveState?.settings, rounds },
            turnOrder,
            currentTurnIndex: 0,
            round: 1,
            phase: 'drawing',
            artistId: turnOrder[0],
            playerTraps: {},
            playerGuesses: {},
            timerEndsAt: inSec(game.drawAndDeceiveState?.settings?.drawingTime ?? DEFAULT_SETTINGS.drawingTime),
        };

        tx.update(gameRef, {
            gameState: 'drawing',
            drawAndDeceiveState: initialState,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
        });
    });
}

    