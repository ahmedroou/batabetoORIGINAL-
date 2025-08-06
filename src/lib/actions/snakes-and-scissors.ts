

'use server';

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
    collection,
    query,
    getDocs,
    where,
} from 'firebase/firestore';
import type { Game, Player, SnakesAndScissorsQuestion } from '@/types';


function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function updateGameSettings(gameId: string, hostId: string, settings: Partial<Game['snakesAndScissorsState']['settings']>) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, {
            'snakesAndScissorsState.settings': { ...game.snakesAndScissorsState?.settings, ...settings }
        });
    });
}


export async function startGame(gameId: string, hostId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const turnOrder = shuffle(game.players.map(p => p.id));
        
        // TODO: Generate board based on settings
        const board = []; // Placeholder

        transaction.update(gameRef, {
            gameState: 'category_selection',
            round: 1,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            players: game.players.map(p => ({ ...p, position: 0 })),
            'snakesAndScissorsState.turnOrder': turnOrder,
            'snakesAndScissorsState.currentTurnIndex': 0,
            'snakesAndScissorsState.board': board, 
            'snakesAndScissorsState.turnPhase': 'category_selection',
        });
    });
}


export async function selectCategory(gameId: string, playerId: string, category: string): Promise<void> {
    const q = query(collection(db, "snakes_and_scissors_questions"), where("category", "==", category));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        throw new Error(`لا توجد أسئلة في قسم "${category}".`);
    }
    const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<SnakesAndScissorsQuestion, 'id'> }));
    const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const turnOrder = game.snakesAndScissorsState?.turnOrder || [];
        const currentTurnIndex = game.snakesAndScissorsState?.currentTurnIndex || 0;
        if (turnOrder[currentTurnIndex] !== playerId) {
            throw new Error("ليس دورك لاختيار الفئة.");
        }
        
        const opponents = game.players.filter(p => p.id !== playerId && p.status === 'alive');
        if (opponents.length === 0) { // Single player or last one standing
            // Skip RPS and go directly to question
             transaction.update(gameRef, {
                'snakesAndScissorsState.turnPhase': 'question',
                'snakesAndScissorsState.questionState': {
                    question: randomQuestion,
                    questionAskerId: playerId
                },
                'snakesAndScissorsState.timerEndsAt': Timestamp.fromMillis(Date.now() + 20 * 1000), 
            });
            return;
        }

        const opponent = opponents[Math.floor(Math.random() * opponents.length)];

        transaction.update(gameRef, {
            'snakesAndScissorsState.turnPhase': 'rps_round',
            'snakesAndScissorsState.questionState': {
                question: randomQuestion,
                // The winner of RPS will be the asker
            },
            'snakesAndScissorsState.rpsState': {
                challengerId: playerId,
                opponentId: opponent.id,
                choices: {},
                result: null,
            },
            'snakesAndScissorsState.timerEndsAt': Timestamp.fromMillis(Date.now() + 15 * 1000), 
        });
    });
}

export async function playRPS(gameId: string, playerId: string, choice: 'rock' | 'paper' | 'scissors'): Promise<void> {
    // Logic for the Rock, Paper, Scissors round
}

export async function answerQuestion(gameId: string, playerId: string, answer: any): Promise<void> {
    // Logic to handle answering the trivia question
}

export async function rollDice(gameId: string, playerId: string): Promise<void> {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");

        const diceValue = Math.floor(Math.random() * 6) + 1;

        transaction.update(gameRef, {
            'snakesAndScissorsState.movementState.isRolling': true,
            'snakesAndScissorsState.movementState.diceValue': diceValue,
        });
    });
}
