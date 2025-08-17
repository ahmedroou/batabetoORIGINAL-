
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, DrawAndDeceiveState } from '@/types';
import { shuffle } from './helpers';
import { WORD_WAR_WORDS } from '@/data/word-war-words';

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
        const drawingTime = game.drawAndDeceiveState?.settings?.drawingTime ?? DEFAULT_SETTINGS.drawingTime;
        
        const wordToDraw = WORD_WAR_WORDS[Math.floor(Math.random() * WORD_WAR_WORDS.length)];

        const initialState: DrawAndDeceiveState = {
            settings: { ...DEFAULT_SETTINGS, ...game.drawAndDeceiveState?.settings, rounds },
            turnOrder,
            currentTurnIndex: 0,
            round: 1,
            phase: 'drawing',
            artistId: turnOrder[0],
            wordToDraw,
            playerTraps: {},
            playerGuesses: {},
            timerEndsAt: inSec(drawingTime),
        };

        tx.update(gameRef, {
            gameState: 'drawing',
            drawAndDeceiveState: initialState,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
        });
    });
}


export async function submitDrawing(gameId: string, playerId: string, drawingDataUrl: string, correctAnswer: string) {
    const gameRef = doc(db, 'games', gameId);

    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        ensure(gameDoc.exists(), 'Game not found.');
        const game = gameDoc.data() as Game;
        
        const state = game.drawAndDeceiveState;
        ensure(state, 'Game state not initialized for Draw and Deceive.');
        ensure(state.phase === 'drawing', 'Not in the drawing phase.');
        ensure(state.artistId === playerId, 'Only the artist can submit a drawing.');
        ensure(drawingDataUrl, 'Drawing data is missing.');
        ensure(correctAnswer && correctAnswer.trim().length > 0, 'The correct answer/title is required.');

        const trappingTime = state.settings?.trappingTime ?? DEFAULT_SETTINGS.trappingTime;

        tx.update(gameRef, {
            'drawAndDeceiveState.phase': 'trapping',
            'drawAndDeceiveState.drawingDataUrl': drawingDataUrl,
            'drawAndDeceiveState.correctAnswer': correctAnswer.trim(),
            'drawAndDeceiveState.timerEndsAt': inSec(trappingTime),
        });
    });
}

export async function submitTrap(gameId: string, playerId: string, trap: string) {
    const gameRef = doc(db, 'games', gameId);

    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        ensure(gameDoc.exists(), 'Game not found.');
        const game = gameDoc.data() as Game;
        
        const state = game.drawAndDeceiveState;
        ensure(state, 'Game state not initialized.');
        ensure(state.phase === 'trapping', 'Not in the trapping phase.');
        ensure(state.artistId !== playerId, 'The artist cannot submit a trap.');
        ensure(trap && trap.trim().length > 0, 'Trap answer cannot be empty.');

        const updatedTraps = { ...state.playerTraps, [playerId]: trap.trim() };

        tx.update(gameRef, {
            'drawAndDeceiveState.playerTraps': updatedTraps
        });
        
        // Check if all non-artists have submitted a trap
        const activePlayers = game.players.filter(p => p.status !== 'left');
        const nonArtists = activePlayers.filter(p => p.id !== state.artistId);
        
        if (Object.keys(updatedTraps).length === nonArtists.length) {
            // All traps are in, move to guessing phase
            const guessingTime = state.settings?.guessingTime ?? DEFAULT_SETTINGS.guessingTime;
             tx.update(gameRef, {
                'drawAndDeceiveState.phase': 'guessing',
                'drawAndDeceiveState.timerEndsAt': inSec(guessingTime),
            });
        }
    });
}
    
