

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
    arrayUnion,
    updateDoc,
    setDoc,
    increment,
} from 'firebase/firestore';
import type { Game, Player, SnakesAndScissorsQuestion } from '@/types';
import { updateLeagueScoresForGameEnd } from '../user/leagues';
import { getShuffledQuestions } from '../helpers';

const BOARD_SIZE = 100;
const SNAKES_AND_LADDERS: Record<number, number> = {
    // Ladders (go up)
    4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
    // Snakes (go down)
    17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79,
};


async function getQuestionCategories(): Promise<string[]> {
    const questionsCol = collection(db, 'snakes_and_scissors_questions');
    const snapshot = await getDocs(questionsCol);
    const categories = new Set<string>();
    snapshot.forEach(doc => {
        categories.add(doc.data().category);
    });
    return Array.from(categories);
}


export async function startGame(gameId: string, hostId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 1) throw new Error("The game requires at least 1 player.");

        const turnOrder = [...game.players].sort(() => Math.random() - 0.5).map(p => p.id);
        const updatedPlayers = game.players.map(p => ({ ...p, position: 0 }));

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'turn_start',
            round: 1,
            'snakesAndScissorsState.turnOrder': turnOrder,
            'snakesAndScissorsState.currentTurnIndex': 0,
            'snakesAndScissorsState.diceValue': null,
            'snakesAndScissorsState.question': null,
            'snakesAndScissorsState.lastMove': null,
            'snakesAndScissorsState.eventLog': arrayUnion(`بدأت اللعبة! دور اللاعب ${updatedPlayers.find(p => p.id === turnOrder[0])?.name}`),
        });
    });
}

export async function rollDice(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex] !== playerId || game.gameState !== 'turn_start') {
            throw new Error("ليس دورك لرمي النرد.");
        }
        
        const categories = await getQuestionCategories();
        if(categories.length === 0) throw new Error("لا توجد أسئلة متاحة لهذه اللعبة.");
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const questions = await getShuffledQuestions('snakes_and_scissors', randomCategory, 1);
        if (questions.length === 0) throw new Error(`لا توجد أسئلة في قسم "${randomCategory}".`);

        const diceValue = Math.floor(Math.random() * 6) + 1;
        transaction.update(gameRef, {
            gameState: 'question',
            'snakesAndScissorsState.diceValue': diceValue,
            'snakesAndScissorsState.question': questions[0],
        });
    });
}

export async function answerQuestion(gameId: string, playerId: string, answer: string) {
    let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex] !== playerId || game.gameState !== 'question') {
            throw new Error("ليس دورك للإجابة.");
        }
        
        const sasState = game.snakesAndScissorsState!;
        const playerIndex = game.players.findIndex(p => p.id === playerId)!;
        const player = game.players[playerIndex];
        const diceValue = sasState.diceValue!;
        let eventLogMessage = "";
        let newPosition = player.position;

        if (answer === sasState.question?.correctAnswer) {
            eventLogMessage = `${player.name} أجاب بشكل صحيح وتقدم ${diceValue} خطوات.`;
            newPosition += diceValue;
        } else {
            eventLogMessage = `${player.name} أجاب بشكل خاطئ! يبقى في مكانه.`;
        }

        let finalPosition = newPosition;
        let specialMove = null;
        if (SNAKES_AND_LADDERS[newPosition]) {
            finalPosition = SNAKES_AND_LADDERS[newPosition]!;
            if (finalPosition > newPosition) {
                eventLogMessage += ` صعد السلم إلى المربع ${finalPosition}!`;
                specialMove = { type: 'ladder', from: newPosition, to: finalPosition };
            } else {
                eventLogMessage += ` لدغه ثعبان ونزل إلى المربع ${finalPosition}!`;
                specialMove = { type: 'snake', from: newPosition, to: finalPosition };
            }
        }
        
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].position = finalPosition;
        
        let nextTurnIndex = (sasState.currentTurnIndex + 1) % game.players.length;
        const nextPlayer = game.players[nextTurnIndex];
        const newRound = nextTurnIndex === 0 ? (game.round || 1) + 1 : game.round || 1;
        
        const updateData: any = {
            players: updatedPlayers,
            'snakesAndScissorsState.eventLog': arrayUnion(eventLogMessage),
            'snakesAndScissorsState.lastMove': { playerId, from: player.position, to: finalPosition, dice: diceValue, special: specialMove },
            'snakesAndScissorsState.question': null,
            'snakesAndScissorsState.diceValue': null,
            'snakesAndScissorsState.currentTurnIndex': nextTurnIndex,
            round: newRound,
        };

        if (finalPosition >= BOARD_SIZE) {
            updateData.gameState = 'final_results';
            updateData.gameResult = { winner: playerId, message: `${player.name} وصل إلى النهاية!` };
            gameDataForLeagueUpdate = { ...game, ...updateData };
        } else {
            updateData.gameState = 'turn_start';
        }

        transaction.update(gameRef, updateData);
    });
    
    if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}

export async function updateGameSettings(gameId: string, hostId: string, settings: any) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, {
            'snakesAndScissorsState.settings': settings
        });
    });
}
