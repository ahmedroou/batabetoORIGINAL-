

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
} from 'firebase/firestore';
import type { Game, Player, SnakesAndScissorsQuestion, BoardProperty } from '@/types';
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

const generateMonopolyBoard = (): BoardProperty[] => {
    const board: BoardProperty[] = [];
    const basePrice = 50;
    const priceIncrement = 15;
    for (let i = 0; i < 24; i++) {
        const price = basePrice + (Math.floor(i / 6)) * priceIncrement * 5 + (i % 6) * priceIncrement;
        board.push({
            id: i,
            name: `عقار ${i + 1}`,
            price: price,
            rent: Math.floor(price / 2),
            ownerId: null,
            color: null,
        });
    }
    return board;
}


export async function updateGameSettings(gameId: string, hostId: string, settings: Partial<Game['snakesAndScissorsState']['settings']>) {
    // This function is now deprecated for this game type but kept for API consistency.
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
        const board = generateMonopolyBoard();

        transaction.update(gameRef, {
            gameState: 'movement', // Start directly with movement
            round: 1,
            playerScores: undefined, // Not used in this game mode
            players: game.players.map(p => ({ ...p, position: 0, balance: 1000, properties: [] })),
            'snakesAndScissorsState.turnOrder': turnOrder,
            'snakesAndScissorsState.currentTurnIndex': 0,
            'snakesAndScissorsState.board': board,
            'snakesAndScissorsState.turnPhase': 'roll',
            'snakesAndScissorsState.eventLog': arrayUnion(`بدأت اللعبة! دور اللاعب ${game.players.find(p => p.id === turnOrder[0])?.name}`),
        });
    });
}

export async function rollDiceAndMove(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const ssState = game.snakesAndScissorsState!;
        const turnOrder = ssState.turnOrder;
        const currentTurnIndex = ssState.currentTurnIndex;

        if (turnOrder[currentTurnIndex] !== playerId || ssState.turnPhase !== 'roll') {
            throw new Error("ليس دورك لرمي النرد.");
        }

        const diceValue = Math.floor(Math.random() * 6) + 1;
        
        transaction.update(gameRef, {
            'snakesAndScissorsState.turnPhase': 'moving',
            'snakesAndScissorsState.movementState': {
                isRolling: true,
                diceValue,
                playerId: playerId,
                from: game.players.find(p => p.id === playerId)?.position || 0,
                to: 0, // 'to' will be calculated after rolling animation
            },
            'snakesAndScissorsState.eventLog': arrayUnion(`${game.players.find(p=>p.id === playerId)?.name} رمى ${diceValue}.`)
        });
    });
}


export async function handleMoveEnd(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const ssState = game.snakesAndScissorsState!;
        if (ssState.turnOrder[ssState.currentTurnIndex] !== playerId || ssState.turnPhase !== 'moving') {
            return; // Not this player's turn to finalize move
        }
        
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found");
        
        const player = game.players[playerIndex];
        const oldPosition = player.position || 0;
        const diceValue = ssState.movementState?.diceValue || 1;
        const newPosition = (oldPosition + diceValue) % ssState.board.length;

        const updatedPlayers = [...game.players];
        const updatedPlayer = { ...updatedPlayers[playerIndex], position: newPosition };
        
        let newBalance = updatedPlayer.balance || 0;
        if (newPosition < oldPosition) {
            newBalance += 100; // Passed start
            updatedPlayer.balance = newBalance;
        }
        updatedPlayers[playerIndex] = updatedPlayer;

        const landedOnProperty = ssState.board[newPosition];
        let nextPhase = 'end_turn';
        let eventLogMessage = `${player.name} انتقل إلى ${landedOnProperty.name}.`;
        
        if (landedOnProperty.ownerId === null) {
            nextPhase = 'buy_or_pass';
        } else if (landedOnProperty.ownerId !== playerId) {
            nextPhase = 'pay_rent';
            const owner = game.players.find(p => p.id === landedOnProperty.ownerId)!;
            const rent = landedOnProperty.rent;
            const ownerIndex = game.players.findIndex(p => p.id === owner.id);
            
            updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) - rent;
            updatedPlayers[ownerIndex].balance = (updatedPlayers[ownerIndex].balance || 0) + rent;
            eventLogMessage += ` ودفع إيجارًا بقيمة ${rent} إلى ${owner.name}.`;
        } else {
             eventLogMessage += ' (ملكيته).';
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            'snakesAndScissorsState.turnPhase': nextPhase,
            'snakesAndScissorsState.movementState.isRolling': false,
            'snakesAndScissorsState.eventLog': arrayUnion(eventLogMessage)
        });
    });
}


export async function handleBuyDecision(gameId: string, playerId: string, decision: 'buy' | 'pass') {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const ssState = game.snakesAndScissorsState!;
        if (ssState.turnOrder[ssState.currentTurnIndex] !== playerId || ssState.turnPhase !== 'buy_or_pass') {
            throw new Error("ليس دورك لاتخاذ قرار.");
        }

        if (decision === 'pass') {
            transaction.update(gameRef, { 'snakesAndScissorsState.turnPhase': 'end_turn' });
            return;
        }

        const player = game.players.find(p => p.id === playerId)!;
        const property = ssState.board[player.position];
        if (property.price > (player.balance || 0)) {
            throw new Error("لا تملك ما يكفي من المال لشراء هذا العقار.");
        }

        const q = query(collection(db, "snakes_and_scissors_questions"));
        const querySnapshot = await getDocs(q);
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<SnakesAndScissorsQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        transaction.update(gameRef, {
            'snakesAndScissorsState.turnPhase': 'question',
            'snakesAndScissorsState.questionState': {
                question: randomQuestion,
                answeredBy: {},
            }
        });
    });
}

export async function answerQuestion(gameId: string, playerId: string, answer: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const ssState = game.snakesAndScissorsState!;
        if (ssState.turnOrder[ssState.currentTurnIndex] !== playerId || ssState.turnPhase !== 'question') {
            throw new Error("ليس دورك للإجابة.");
        }

        const question = ssState.questionState?.question;
        if (!question) throw new Error("لم يتم العثور على سؤال.");
        
        const playerIndex = game.players.findIndex(p => p.id === playerId)!;
        const player = game.players[playerIndex];
        const property = ssState.board[player.position];
        const updatedPlayers = [...game.players];
        let eventLogMessage = "";

        if (answer === question.correctAnswer) {
            const newBalance = (player.balance || 0) - property.price;
            updatedPlayers[playerIndex] = { ...player, balance: newBalance };
            const updatedBoard = [...ssState.board];
            updatedBoard[player.position].ownerId = playerId;
            updatedBoard[player.position].color = player.team || '#FFFFFF'; 

            transaction.update(gameRef, {
                players: updatedPlayers,
                'snakesAndScissorsState.board': updatedBoard,
            });
            eventLogMessage = `${player.name} أجاب بشكل صحيح وامتلك ${property.name}!`;
        } else {
            const penalty = Math.floor(property.price * 0.75);
            const newBalance = (player.balance || 0) - penalty;
            updatedPlayers[playerIndex] = { ...player, balance: newBalance };
            transaction.update(gameRef, { players: updatedPlayers });
            eventLogMessage = `${player.name} أجاب بشكل خاطئ وخسر ${penalty} دينار.`;
        }
        
        transaction.update(gameRef, {
            'snakesAndScissorsState.turnPhase': 'end_turn',
            'snakesAndScissorsState.questionState': deleteField(),
            'snakesAndScissorsState.eventLog': arrayUnion(eventLogMessage),
        });
    });
}

export async function endTurn(gameId: string, playerId: string) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const ssState = game.snakesAndScissorsState!;

        if (ssState.turnOrder[ssState.currentTurnIndex] !== playerId) {
            throw new Error("ليس دورك لإنهاء الجولة.");
        }

        const newTurnIndex = (ssState.currentTurnIndex + 1) % ssState.turnOrder.length;
        const nextPlayer = game.players.find(p => p.id === ssState.turnOrder[newTurnIndex]);

        transaction.update(gameRef, {
            'snakesAndScissorsState.currentTurnIndex': newTurnIndex,
            'snakesAndScissorsState.turnPhase': 'roll',
            'snakesAndScissorsState.movementState': deleteField(),
            'snakesAndScissorsState.eventLog': arrayUnion(`حان دور ${nextPlayer?.name}.`),
        });
    });
}
