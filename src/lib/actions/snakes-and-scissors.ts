

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
    deleteField,
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
        // For now, simplify and always go to question
        transaction.update(gameRef, {
            'snakesAndScissorsState.turnPhase': 'question',
            'snakesAndScissorsState.questionState': {
                question: randomQuestion,
                questionAskerId: playerId,
                // In a future version, you might select an opponent here
                // opponentId: opponents[Math.floor(Math.random() * opponents.length)].id,
            },
            'snakesAndScissorsState.timerEndsAt': Timestamp.fromMillis(Date.now() + 20 * 1000), 
        });
    });
}

export async function playRPS(gameId: string, playerId: string, choice: 'rock' | 'paper' | 'scissors'): Promise<void> {
    // Logic for the Rock, Paper, Scissors round
}

export async function answerQuestion(gameId: string, playerId: string, answer: string): Promise<{ success: boolean; error?: string }> {
    return runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const ssState = game.snakesAndScissorsState;
        if (ssState?.turnPhase !== 'question' || ssState.questionState?.answerResult) return { success: false, error: 'لقد أجبت بالفعل أو انتهى وقت الإجابة.' };

        const question = ssState.questionState?.question;
        if (!question) throw new Error("Question not found.");

        const isCorrect = question.correctAnswer === answer;
        
        let updatedPlayers = [...game.players];
        const playerIndex = updatedPlayers.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found.");

        const updateData: any = {
            'snakesAndScissorsState.questionState.answerResult': {
                playerId: playerId,
                answer: answer,
                isCorrect: isCorrect,
            },
            'snakesAndScissorsState.timerEndsAt': deleteField(),
        };

        if (isCorrect) {
            // Correct answer, move to movement phase
            updateData['snakesAndScissorsState.turnPhase'] = 'movement';
        } else {
            // Incorrect answer, move back and switch turn
            const player = updatedPlayers[playerIndex];
            const newPosition = Math.max(0, (player.position || 0) - 2);
            updatedPlayers[playerIndex].position = newPosition;
            updateData.players = updatedPlayers;
            
            // End turn and move to next player
            const newTurnIndex = (ssState.currentTurnIndex + 1) % ssState.turnOrder.length;
            updateData['snakesAndScissorsState.currentTurnIndex'] = newTurnIndex;
            updateData['snakesAndScissorsState.turnPhase'] = 'category_selection';
            updateData['snakesAndScissorsState.questionState'] = deleteField();
        }

        transaction.update(gameRef, updateData);
        return { success: true };
    }).catch(e => ({ success: false, error: e.message }));
}


export async function rollDice(gameId: string, playerId: string): Promise<void> {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");

        const game = gameDoc.data() as Game;
        const turnPhase = game.snakesAndScissorsState?.turnPhase;
        if (turnPhase !== 'movement') return;

        // Prevent re-rolling if dice value already exists for this turn
        if (game.snakesAndScissorsState?.movementState?.diceValue) return;

        const diceValue = Math.floor(Math.random() * 6) + 1;

        transaction.update(gameRef, {
            'snakesAndScissorsState.movementState.isRolling': true,
            'snakesAndScissorsState.movementState.diceValue': diceValue,
        });

        // Use a timeout to simulate roll and then process movement
        setTimeout(() => {
            movePlayer(gameId, playerId, diceValue);
        }, 2500); // Corresponds to dice animation
    });
}

async function movePlayer(gameId: string, playerId: string, steps: number) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const ssState = game.snakesAndScissorsState!;

        let updatedPlayers = [...game.players];
        const playerIndex = updatedPlayers.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return;

        const player = updatedPlayers[playerIndex];
        let newPosition = (player.position || 0) + steps;
        
        // TODO: Handle snakes and ladders
        // Example: const boardSquare = ssState.board[newPosition]; if (boardSquare.to) newPosition = boardSquare.to;
        
        const boardSize = ssState.settings.boardSize;
        if (newPosition >= boardSize) {
            newPosition = boardSize;
            // TODO: Handle game win logic
        }

        updatedPlayers[playerIndex].position = newPosition;

        // Move to next player's turn
        const newTurnIndex = (ssState.currentTurnIndex + 1) % ssState.turnOrder.length;

        transaction.update(gameRef, {
            players: updatedPlayers,
            'snakesAndScissorsState.currentTurnIndex': newTurnIndex,
            'snakesAndScissorsState.turnPhase': 'category_selection',
            'snakesAndScissorsState.questionState': deleteField(),
            'snakesAndScissorsState.movementState': deleteField(),
        });
    });
}
