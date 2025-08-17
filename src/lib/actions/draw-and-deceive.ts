
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, DrawAndDeceiveState, DrawAndDeceiveRoundResult } from '@/types';
import { shuffle } from './helpers';
import { WORD_WAR_WORDS } from '@/data/word-war-words';
import { distributeEndOfGameAwards } from './admin/users';

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

const calculateRoundResults = (game: Game, playerGuesses: Record<string, string>): { resultsState: any, updatedScores: any } => {
    const state = game.drawAndDeceiveState!;
    const scores: Record<string, { points: number; breakdown: { reason: string; points: number }[] }> = {};
    const answersResult: DrawAndDeceiveRoundResult[] = [];
    const updatedPlayerScores = { ...game.playerScores };
    
    const getPlayer = (id: string) => game.players.find(p => p.id === id);
    const addScore = (playerId: string, points: number, reason: string) => {
        if (!scores[playerId]) scores[playerId] = { points: 0, breakdown: [] };
        scores[playerId]!.points += points;
        scores[playerId]!.breakdown.push({ reason, points });
        updatedPlayerScores[playerId] = (updatedPlayerScores[playerId] || 0) + points;
    };

    const correctAnswer = state.correctAnswer!;
    const allAnswers = [correctAnswer, ...Object.values(state.playerTraps)].filter((a): a is string => !!a);
    
    for (const answer of allAnswers) {
        const isCorrect = answer === correctAnswer;
        const authorIds = isCorrect ? [state.artistId!] : Object.entries(state.playerTraps).filter(([, trap]) => trap === answer).map(([id]) => id);
        const guesserIds = Object.entries(playerGuesses).filter(([, guess]) => guess === answer).map(([id]) => id);
        
        answersResult.push({ answer, isCorrect, authorIds, guesserIds });

        if (isCorrect) {
            guesserIds.forEach(guesserId => {
                if(guesserId !== state.artistId) {
                    addScore(guesserId, 2, 'إجابة صحيحة');
                    addScore(state.artistId!, 1, `تخمين صحيح من ${getPlayer(guesserId)?.name || 'لاعب'}`);
                }
            });
        } else {
             guesserIds.forEach(guesserId => {
                 authorIds.forEach(authorId => {
                    if (guesserId !== authorId) {
                        addScore(authorId, 1, `خدع ${getPlayer(guesserId)?.name || 'لاعب'}`);
                    }
                 });
            });
        }
    }
    
    return { 
        resultsState: { scores, answers: answersResult }, 
        updatedScores 
    };
};

// --- Game Logic: Start ---
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
        
        const wordToDraw = WORD_WAR_WORDS[Math.floor(Math.random() * WORD_WAR_WORDS.length)]!;

        const initialState: DrawAndDeceiveState = {
            settings: { ...DEFAULT_SETTINGS, ...game.drawAndDeceiveState?.settings, rounds },
            turnOrder,
            currentTurnIndex: 0,
            round: 1,
            phase: 'drawing',
            artistId: turnOrder[0]!,
            wordToDraw,
            playerTraps: {},
            playerGuesses: {},
            shuffledAnswers: [],
            timerEndsAt: inSec(drawingTime),
        };

        tx.update(gameRef, {
            gameState: 'drawing',
            drawAndDeceiveState: initialState,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
        });
    });
}

// --- Game Logic: Drawing Phase ---
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

// --- Game Logic: Trapping Phase ---
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
        
        const activePlayers = game.players.filter(p => p.status !== 'left');
        const nonArtists = activePlayers.filter(p => p.id !== state.artistId);
        
        if (Object.keys(updatedTraps).length === nonArtists.length) {
            const allAnswers = [state.correctAnswer, ...Object.values(updatedTraps)].filter((a): a is string => !!a);
            const shuffledAnswers = shuffle(allAnswers);

            const guessingTime = state.settings?.guessingTime ?? DEFAULT_SETTINGS.guessingTime;
             tx.update(gameRef, {
                'drawAndDeceiveState.phase': 'guessing',
                'drawAndDeceiveState.shuffledAnswers': shuffledAnswers,
                'drawAndDeceiveState.timerEndsAt': inSec(guessingTime),
            });
        }
    });
}

// --- Game Logic: Guessing Phase ---
export async function submitGuess(gameId: string, playerId: string, guess: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        ensure(gameDoc.exists(), 'Game not found.');
        const game = gameDoc.data() as Game;

        const state = game.drawAndDeceiveState;
        ensure(state, 'Game state not initialized.');
        ensure(state.phase === 'guessing', 'Not in guessing phase.');

        const updatedGuesses = { ...state.playerGuesses, [playerId]: guess };
        tx.update(gameRef, {
            'drawAndDeceiveState.playerGuesses': updatedGuesses
        });

        const activePlayers = game.players.filter(p => p.status !== 'left');
        if (Object.keys(updatedGuesses).length === activePlayers.length) {
            const { resultsState, updatedScores } = calculateRoundResults(game, updatedGuesses);
            const resultsTime = state.settings?.resultsTime ?? DEFAULT_SETTINGS.resultsTime;
            tx.update(gameRef, {
                'drawAndDeceiveState.phase': 'results',
                'drawAndDeceiveState.lastRoundResults': resultsState,
                playerScores: updatedScores,
                'drawAndDeceiveState.timerEndsAt': inSec(resultsTime),
            });
        }
    });
}

// --- Game Logic: Results & Next Round ---
export async function handleTimeout(gameId: string, hostId: string) {
    let finalGameData: Game | null = null;
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (tx) => {
        const gameDoc = await tx.get(gameRef);
        ensure(gameDoc.exists(), 'Game not found.');
        const game = gameDoc.data() as Game;
        const state = game.drawAndDeceiveState;

        ensure(game.hostId === hostId, 'Only host can advance the game.');
        ensure(state && state.timerEndsAt && state.timerEndsAt.toMillis() <= Date.now(), 'Timer has not expired yet.');
        
        if (state.phase === 'results') {
            const nextRound = (state.round || 0) + 1;
            if (nextRound > state.settings.rounds) {
                const winnerId = Object.entries(game.playerScores || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
                const gameResult = { winner: winnerId, message: `The winner is determined!` };
                tx.update(gameRef, {
                    gameState: 'final_results',
                    'drawAndDeceiveState.phase': 'final_results',
                    gameResult: gameResult,
                });
                finalGameData = { ...game, gameState: 'final_results', gameResult };
            } else {
                const nextTurnIndex = (state.currentTurnIndex + 1) % game.players.length;
                const nextArtistId = state.turnOrder[nextTurnIndex];
                const newWord = WORD_WAR_WORDS[Math.floor(Math.random() * WORD_WAR_WORDS.length)]!;
                
                tx.update(gameRef, {
                    gameState: 'drawing',
                    'drawAndDeceiveState.phase': 'drawing',
                    'drawAndDeceiveState.round': nextRound,
                    'drawAndDeceiveState.currentTurnIndex': nextTurnIndex,
                    'drawAndDeceiveState.artistId': nextArtistId,
                    'drawAndDeceiveState.wordToDraw': newWord,
                    'drawAndDeceiveState.drawingDataUrl': null,
                    'drawAndDeceiveState.correctAnswer': null,
                    'drawAndDeceiveState.playerTraps': {},
                    'drawAndDeceiveState.playerGuesses': {},
                    'drawAndDeceiveState.shuffledAnswers': [],
                    'drawAndDeceiveState.lastRoundResults': null,
                    'drawAndDeceiveState.timerEndsAt': inSec(state.settings.drawingTime),
                });
            }
        }
        // Handle timeouts for other phases
        else if (state.phase === 'drawing') {
            // Artist didn't draw, skip turn? For now, we move to trapping with no drawing.
             tx.update(gameRef, {
                'drawAndDeceiveState.phase': 'trapping',
                'drawAndDeceiveState.timerEndsAt': inSec(state.settings.trappingTime),
            });
        }
        else if (state.phase === 'trapping') {
            // Not all players submitted traps, move on with available traps
            const allAnswers = [state.correctAnswer, ...Object.values(state.playerTraps)].filter((a): a is string => !!a);
            const shuffledAnswers = shuffle(allAnswers);
            tx.update(gameRef, {
                'drawAndDeceiveState.phase': 'guessing',
                'drawAndDeceiveState.shuffledAnswers': shuffledAnswers,
                'drawAndDeceiveState.timerEndsAt': inSec(state.settings.guessingTime),
            });
        }
        else if (state.phase === 'guessing') {
            // Not all players guessed, calculate results with available guesses.
            const { resultsState, updatedScores } = calculateRoundResults(game, state.playerGuesses);
            tx.update(gameRef, {
                'drawAndDeceiveState.phase': 'results',
                'drawAndDeceiveState.lastRoundResults': resultsState,
                playerScores: updatedScores,
                'drawAndDeceiveState.timerEndsAt': inSec(state.settings.resultsTime),
            });
        }
    });

    if (finalGameData) {
        await distributeEndOfGameAwards(finalGameData.id);
    }
}
