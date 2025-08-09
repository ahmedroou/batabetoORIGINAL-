'use server';

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
    deleteField,
    increment,
    collection,
    query,
    where,
    getDocs,
} from 'firebase/firestore';
import type { Game, Player, BoardProperty, SnakesAndScissorsQuestion } from '@/types';
import { updateLeagueScoresForGameEnd } from './user';
import { getShuffledQuestions as getSnakesAndScissorsQuestions } from './snakes-and-scissors';


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
        const totalTiles = 24;
        const fineTiles = new Set<number>();
        while(fineTiles.size < 2) {
            const randomIndex = Math.floor(Math.random() * (totalTiles - 2)) + 1; // Avoid tile 0 (start) and ensure it's not the last tile
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
            'smartMerchantState.eventLog': [`بدأت اللعبة! دور اللاعب ${updatedPlayers[0].name}.`]
        });
    });
}

export async function rollDiceAndMove(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const smState = game.smartMerchantState!;
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found.");
        if (smState.turnOrder[smState.currentTurnIndex] !== playerId) throw new Error("ليس دورك.");
        if (smState.turnPhase !== 'roll') throw new Error("لا يمكنك رمي النرد الآن.");

        const diceRoll = Math.floor(Math.random() * 4) + 1;
        const player = game.players[playerIndex];
        const oldPosition = player.position;
        const newPosition = (oldPosition + diceRoll) % smState.board.length;

        let newBalance = player.balance || 0;
        let eventLog = [...(smState.eventLog || []), `${player.name} رمى النرد وحصل على ${diceRoll}, وانتقل إلى المربع ${newPosition}`];

        if (newPosition < oldPosition) {
            newBalance += 200; // Passed start
            eventLog.push(`${player.name} مر بنقطة البداية وحصل على 200 دينار.`);
        }

        const landingTile = smState.board[newPosition];
        let nextPhase: Game['smartMerchantState']['turnPhase'] = 'end_turn';

        if (landingTile.type === 'property') {
            if (!landingTile.ownerId) {
                nextPhase = 'buy_or_pass';
            } else if (landingTile.ownerId !== playerId) {
                nextPhase = 'pay_rent';
                const owner = game.players.find(p => p.id === landingTile.ownerId);
                if (owner) {
                    newBalance -= landingTile.rent;
                    // We need another transaction or a way to update the owner's balance
                    eventLog.push(`${player.name} دفع إيجارًا بقيمة ${landingTile.rent} إلى ${owner.name}.`);
                }
            }
        } else if (landingTile.type === 'fine') {
            newBalance -= landingTile.price;
            eventLog.push(`${player.name} دفع غرامة قدرها ${landingTile.price}.`);
        }
        
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex] = { ...player, position: newPosition, balance: newBalance };
        
        // Update owner's balance if rent was paid
        if(landingTile.type === 'property' && landingTile.ownerId && landingTile.ownerId !== playerId) {
            const ownerIndex = updatedPlayers.findIndex(p => p.id === landingTile.ownerId);
            if(ownerIndex !== -1) {
                updatedPlayers[ownerIndex].balance = (updatedPlayers[ownerIndex].balance || 0) + landingTile.rent;
            }
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            'smartMerchantState.turnPhase': nextPhase,
            'smartMerchantState.eventLog': eventLog,
            'smartMerchantState.movementState': { isRolling: false, diceValue: diceRoll, playerId, from: oldPosition, to: newPosition }
        });
    });
}

export async function handleBuyDecision(gameId: string, playerId: string, decision: 'buy' | 'pass') {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const player = game.players.find(p => p.id === playerId)!;
        const property = game.smartMerchantState!.board[player.position];

        if (decision === 'pass') {
            transaction.update(gameRef, { 'smartMerchantState.turnPhase': 'end_turn' });
            return;
        }

        if ((player.balance || 0) < property.price) {
            throw new Error("ليس لديك ما يكفي من المال لشراء هذا العقار.");
        }
        
        // Deduct money first, then ask question.
        const newBalance = (player.balance || 0) - property.price;
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].balance = newBalance;
        
        const questionCategories = ['تاريخ', 'رياضة', 'علوم', 'جغرافيا']; // Example categories
        const randomCategory = questionCategories[Math.floor(Math.random() * questionCategories.length)];
        const questions = await getSnakesAndScissorsQuestions(randomCategory, 1);
        if (questions.length === 0) throw new Error("لا توجد أسئلة متاحة في هذا القسم.");
        const question = questions[0];

        transaction.update(gameRef, {
            players: updatedPlayers,
            'smartMerchantState.turnPhase': 'question',
            'smartMerchantState.questionState': { question, answeredBy: {} }
        });
    });
}


export async function answerQuestion(gameId: string, playerId: string, answer: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const player = game.players.find(p => p.id === playerId)!;
        const question = game.smartMerchantState!.questionState!.question;
        const property = game.smartMerchantState!.board[player.position];
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        
        let newLog = game.smartMerchantState!.eventLog || [];
        const updatedPlayers = [...game.players];
        const updatedBoard = [...game.smartMerchantState!.board];
        
        if (answer === question.correctAnswer) {
            newLog.push(`${player.name} أجاب بشكل صحيح واشترى ${property.name}!`);
            updatedBoard[player.position] = { ...property, ownerId: playerId };
            updatedPlayers[playerIndex].properties = [...(player.properties || []), property.id];
        } else {
            const fine = 50;
            newLog.push(`${player.name} أجاب بشكل خاطئ، وخسر ثمن العقار بالإضافة إلى غرامة ${fine} دينار.`);
            updatedPlayers[playerIndex].balance = (player.balance || 0) - fine;
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            'smartMerchantState.board': updatedBoard,
            'smartMerchantState.turnPhase': 'end_turn',
            'smartMerchantState.questionState': deleteField(),
            'smartMerchantState.eventLog': newLog
        });
    });
}


export async function endTurn(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.smartMerchantState!.turnOrder[game.smartMerchantState!.currentTurnIndex] !== playerId) {
            return; // Not this player's turn to end.
        }
        
        let nextTurnIndex = (game.smartMerchantState!.currentTurnIndex + 1) % game.players.length;
        
        // Simple game over condition
        if (game.round && game.round >= (game.smartMerchantState?.settings.rounds || 15) * game.players.length) {
             const winner = game.players.reduce((a, b) => (a.balance || 0) > (b.balance || 0) ? a : b);
             transaction.update(gameRef, { 
                gameState: 'final_results',
                gameResult: { winner: winner.id, message: `فاز ${winner.name} بأكبر ثروة!` }
            });
            return;
        }

        transaction.update(gameRef, {
            'smartMerchantState.currentTurnIndex': nextTurnIndex,
            'smartMerchantState.turnPhase': 'roll',
            round: increment(1)
        });
    });
}


export async function updateGameSettings(gameId: string, hostId: string, settings: Game['smartMerchantState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("Game not found.");
        }
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can change settings.");
        }
        if (game.gameState !== 'lobby') {
            throw new Error("Settings can only be changed in the lobby.");
        }

        transaction.update(gameRef, { 'smartMerchantState.settings': settings });
    });
}
