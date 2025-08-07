
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, increment } from 'firebase/firestore';
import type { Game, Player, MonopolyState } from '@/types';
import { classicBoard } from '@/data/boards';

function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function updateMonopolySettings(gameId: string, hostId: string, settings: Partial<Game['monopolyState']>) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'monopolyState.settings': { ...game.monopolyState, ...settings } });
    });
}

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return;
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const turnOrder = shuffle(game.players.map(p => p.id));
        
        const playerData: MonopolyState['playerData'] = {};
        game.players.forEach(p => {
            playerData[p.id] = {
                money: 1500,
                properties: [],
                inJail: false,
                jailTurns: 0,
                position: 0,
            };
        });

        transaction.update(gameRef, {
            gameState: 'game_play',
            'monopolyState.board': classicBoard,
            'monopolyState.playerData': playerData,
            'monopolyState.turnOrder': turnOrder,
            'monopolyState.currentTurnIndex': 0,
            'monopolyState.dice': [0, 0],
            'monopolyState.lastActivity': "بدأت اللعبة!",
            'monopolyState.turnPhase': 'start',
        });
    });
}

export async function rollDice(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const monopolyState = game.monopolyState;
        if (!monopolyState) throw new Error("Monopoly state not found");

        if (monopolyState.turnOrder[monopolyState.currentTurnIndex] !== playerId) {
            throw new Error("ليس دورك.");
        }
        if (monopolyState.turnPhase !== 'start') {
            throw new Error("لا يمكنك رمي النرد الآن.");
        }

        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        const total = die1 + die2;

        const playerData = monopolyState.playerData[playerId];
        const oldPosition = playerData.position;
        const newPosition = (oldPosition + total) % monopolyState.board.length;

        let newMoney = playerData.money;
        if (newPosition < oldPosition) {
            newMoney += 200; // Passed GO
        }

        const updateData: any = {
            'monopolyState.dice': [die1, die2],
            [`monopolyState.playerData.${playerId}.position`]: newPosition,
            [`monopolyState.playerData.${playerId}.money`]: newMoney,
            'monopolyState.lastActivity': `${game.players.find(p => p.id === playerId)?.name} رمى ${total}`,
            'monopolyState.turnPhase': 'dice_rolled',
        };

        transaction.update(gameRef, updateData);
    });
}

export async function endTurn(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const monopolyState = game.monopolyState;
        if (!monopolyState) throw new Error("Monopoly state not found");

        if (monopolyState.turnOrder[monopolyState.currentTurnIndex] !== playerId) {
            throw new Error("ليس دورك.");
        }

        const newTurnIndex = (monopolyState.currentTurnIndex + 1) % monopolyState.turnOrder.length;
        
        transaction.update(gameRef, {
            'monopolyState.currentTurnIndex': newTurnIndex,
            'monopolyState.turnPhase': 'start',
        });
    });
}
