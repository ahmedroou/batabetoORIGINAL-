
'use server';

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
    deleteField,
    arrayUnion,
    collection,
    query,
    getDocs,
    where,
    writeBatch,
    updateDoc
} from 'firebase/firestore';
import type { Game, DrawingData, GuessStatus, PlayerGuess, DrawAndGuessPrompt, DrawingLine, DrawingShape } from '@/types';
import { updateLeagueScoresForGameEnd } from './user';


function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

async function getPromptsForCategory(category: string): Promise<DrawAndGuessPrompt[]> {
    const q = query(collection(db, "draw_and_guess_prompts"), where("category", "==", category));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        throw new Error(`لا توجد كلمات في قسم "${category}".`);
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DrawAndGuessPrompt));
}


export async function updateGameSettings(gameId: string, hostId: string, settings: Partial<Game['drawAndGuessState']['settings']>) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, {
            'drawAndGuessState.settings': { ...game.drawAndGuessState?.settings, ...settings }
        });
    });
}

export async function startDrawAndGuessGame(gameId: string, hostId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const turnOrder = shuffle(game.players.map(p => p.id));
        const categories = game.drawAndGuessState?.categories || [];
        const fiveRandomCategories = shuffle([...categories]).slice(0, 5);

        transaction.update(gameRef, {
            gameState: 'category_selection',
            round: 1,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            'drawAndGuessState.turnOrder': turnOrder,
            'drawAndGuessState.drawerTurnCounts': game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            'drawAndGuessState.currentDrawerId': turnOrder[0],
            'drawAndGuessState.fiveRandomCategories': fiveRandomCategories,
            'drawAndGuessState.timerEndsAt': Timestamp.fromMillis(Date.now() + 30 * 1000), // 30s to choose category
        });
    });
}

export async function selectCategory(gameId: string, playerId: string, category: string) {
    const prompts = await getPromptsForCategory(category);
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'category_selection') return;
        if (game.drawAndGuessState?.currentDrawerId !== playerId) throw new Error("ليس دورك لاختيار فئة.");
        
        const drawingTime = game.drawAndGuessState?.settings?.drawingTime || 120;

        transaction.update(gameRef, {
            gameState: 'drawing',
            'drawAndGuessState.prompt': randomPrompt,
            'drawAndGuessState.timerEndsAt': Timestamp.fromMillis(Date.now() + drawingTime * 1000),
        });
    });
}

export async function updateDrawing(gameId: string, playerId: string, drawingData: DrawingData) {
    // This is a non-critical, frequent update. We don't use a transaction for performance.
    // If it fails, the next update will likely succeed.
    // We use a timeout to avoid spamming Firestore.
    try {
        const gameRef = doc(db, 'games', gameId);
        await updateDoc(gameRef, { 'drawAndGuessState.drawing': drawingData });
    } catch(error) {
        console.warn(`Could not update drawing for game ${gameId}:`, error);
    }
}


export async function submitDrawing(gameId: string, playerId: string, drawing: DrawingData) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'drawing' || game.drawAndGuessState?.currentDrawerId !== playerId) return;

        const guessingTime = game.drawAndGuessState?.settings?.guessingTime || 120;

        transaction.update(gameRef, {
            gameState: 'guessing',
            'drawAndGuessState.drawing': drawing,
            'drawAndGuessState.timerEndsAt': Timestamp.fromMillis(Date.now() + guessingTime * 1000),
            'drawAndGuessState.guesses': [],
        });
    });
}

export async function submitGuess(gameId: string, playerId: string, guess: string) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.gameState !== 'guessing') return;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player) throw new Error("Player not found.");
        
        const existingGuesses = game.drawAndGuessState?.guesses || [];
        if (existingGuesses.filter(g => g.playerId === playerId).length >= 5) {
            throw new Error("لقد استنفدت جميع محاولاتك.");
        }

        const newGuess: PlayerGuess = { playerId, playerName: player.name, guess, status: 'incorrect' };
        transaction.update(gameRef, {
            'drawAndGuessState.guesses': arrayUnion(newGuess)
        });
    });
}

export async function setGuessStatus(gameId: string, drawerId: string, guesserId: string, guessText: string, status: GuessStatus) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.drawAndGuessState?.currentDrawerId !== drawerId) throw new Error("لست الرسام.");
        
        const guesses = game.drawAndGuessState?.guesses || [];
        const guessIndex = guesses.findIndex(g => g.playerId === guesserId && g.guess === guessText);
        if (guessIndex === -1) return;

        guesses[guessIndex].status = status;
        
        const updateData: any = { 'drawAndGuessState.guesses': guesses };

        if (status === 'correct') {
            const guessingTime = game.drawAndGuessState.settings.guessingTime;
            const timeLeft = Math.max(0, (game.drawAndGuessState.timerEndsAt?.toMillis() || Date.now()) - Date.now()) / 1000;
            const timeBonus = Math.floor(timeLeft / guessingTime * 5); // Max 5 bonus points for speed

            const drawerScoreUpdate = { points: 2, reason: "رسمة صحيحة" };
            const guesserScoreUpdate = { points: 3 + timeBonus, reason: "تخمين صحيح" };

            updateData['playerScores'] = {
                ...(game.playerScores || {}),
                [drawerId]: (game.playerScores?.[drawerId] || 0) + drawerScoreUpdate.points,
                [guesserId]: (game.playerScores?.[guesserId] || 0) + guesserScoreUpdate.points
            };
            
            // Immediately transition to results
            updateData.gameState = 'round_results';
            updateData['drawAndGuessState.timerEndsAt'] = deleteField();
        }

        transaction.update(gameRef, updateData);
    });
}

export async function continueDrawing(gameId: string, drawerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.drawAndGuessState?.currentDrawerId !== drawerId) throw new Error("لست الرسام.");
        if (game.drawAndGuessState?.retries !== 0) throw new Error("لا يمكنك طلب وقت إضافي مرة أخرى.");

        transaction.update(gameRef, {
            gameState: 'drawing',
            'drawAndGuessState.timerEndsAt': Timestamp.fromMillis(Date.now() + 30 * 1000), // 30s for second chance
            'drawAndGuessState.retries': 1,
        });
    });
}

export async function submitRating(gameId: string, raterId: string, rating: number) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, { [`drawAndGuessState.ratings.${raterId}`]: rating });
}

export async function nextRound(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only the host can start the next round.");

        const dgs = game.drawAndGuessState!;
        const turnOrder = dgs.turnOrder!;
        const currentDrawerId = dgs.currentDrawerId!;
        const drawerTurnCounts = { ...dgs.drawerTurnCounts!, [currentDrawerId]: (dgs.drawerTurnCounts![currentDrawerId] || 0) + 1 };
        
        let nextDrawerId = currentDrawerId;
        let nextDrawerIndex = turnOrder.indexOf(currentDrawerId);
        let attempts = 0;
        
        do {
            nextDrawerIndex = (nextDrawerIndex + 1) % turnOrder.length;
            nextDrawerId = turnOrder[nextDrawerIndex];
            attempts++;
        } while (drawerTurnCounts[nextDrawerId] >= dgs.settings.roundsPerPlayer && attempts < turnOrder.length);
        
        const isGameOver = attempts >= turnOrder.length;

        if (isGameOver) {
            transaction.update(gameRef, { gameState: 'final_results' });
            await updateLeagueScoresForGameEnd(game, transaction);
            return;
        }

        const categories = dgs.categories || [];
        const fiveRandomCategories = shuffle([...categories]).slice(0, 5);
        
        transaction.update(gameRef, {
            gameState: 'category_selection',
            round: (game.round || 1) + 1,
            'drawAndGuessState.currentDrawerId': nextDrawerId,
            'drawAndGuessState.drawerTurnCounts': drawerTurnCounts,
            'drawAndGuessState.fiveRandomCategories': fiveRandomCategories,
            'drawAndGuessState.prompt': deleteField(),
            'drawAndGuessState.drawing': deleteField(),
            'drawAndGuessState.guesses': [],
            'drawAndGuessState.ratings': {},
            'drawAndGuessState.retries': 0,
            'drawAndGuessState.timerEndsAt': Timestamp.fromMillis(Date.now() + 30 * 1000),
        });
    });
}

export async function handleTimeout(gameId: string, callerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        const dgs = game.drawAndGuessState;
        if (!dgs || !dgs.timerEndsAt || Date.now() < dgs.timerEndsAt.toMillis()) return;

        // Only the host can trigger a timeout action
        if (game.hostId !== callerId) return;

        if (game.gameState === 'category_selection') {
            const randomCategory = dgs.fiveRandomCategories?.[0] || 'أمثال عامية';
            const prompts = await getPromptsForCategory(randomCategory);
            const randomPrompt = prompts[0];

            transaction.update(gameRef, {
                gameState: 'drawing',
                'drawAndGuessState.prompt': randomPrompt,
                'drawAndGuessState.timerEndsAt': Timestamp.fromMillis(Date.now() + dgs.settings.drawingTime * 1000),
            });
        } else if (game.gameState === 'drawing') {
            transaction.update(gameRef, {
                gameState: 'guessing',
                'drawAndGuessState.timerEndsAt': Timestamp.fromMillis(Date.now() + dgs.settings.guessingTime * 1000),
            });
        } else if (game.gameState === 'guessing') {
            transaction.update(gameRef, {
                gameState: 'round_results',
                'drawAndGuessState.timerEndsAt': deleteField(),
            });
        }
    });
}
