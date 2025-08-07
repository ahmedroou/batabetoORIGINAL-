
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, increment } from 'firebase/firestore';
import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
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

        const updateData: any = {
            'monopolyState.dice': [die1, die2],
            [`monopolyState.playerData.${playerId}.position`]: newPosition,
            'monopolyState.turnPhase': 'action',
        };

        let activityMessage = `${game.players.find(p => p.id === playerId)?.name} رمى ${total}.`;

        if (newPosition < oldPosition && newPosition !== 0) { // Passed GO
            updateData[`monopolyState.playerData.${playerId}.money`] = increment(200);
             activityMessage += ` ومر بنقطة الانطلاق.`;
        }
        
        const currentTile = monopolyState.board[newPosition];
        const ownerEntry = Object.entries(monopolyState.playerData).find(([pid, data]) => data.properties.includes(newPosition));

        if (currentTile && currentTile.type === 'property' && ownerEntry && ownerEntry[0] !== playerId) {
            const ownerId = ownerEntry[0];
            const rent = currentTile.rent?.[0] || 0; 
            
            updateData[`monopolyState.playerData.${playerId}.money`] = increment(-rent);
            updateData[`monopolyState.playerData.${ownerId}.money`] = increment(rent);
            activityMessage += ` ودفع إيجار بقيمة $${rent} إلى ${game.players.find(p=>p.id === ownerId)?.name}.`;
        }

        updateData['monopolyState.lastActivity'] = activityMessage;

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
            'monopolyState.dice': [0, 0], // Reset dice for next player
        });
    });
}

export async function buyProperty(gameId: string, playerId: string): Promise<void> {
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
        
        const playerData = monopolyState.playerData[playerId];
        const currentTile = monopolyState.board[playerData.position];
        
        if (!currentTile || (currentTile.type !== 'property' && currentTile.type !== 'railroad' && currentTile.type !== 'utility')) {
            throw new Error("لا يمكنك شراء هذا المربع.");
        }
        
        if (!currentTile.price || playerData.money < currentTile.price) {
            throw new Error("لا تملك ما يكفي من المال.");
        }
        
        const isOwned = Object.values(monopolyState.playerData).some(data => data.properties.includes(playerData.position));
        if (isOwned) {
            throw new Error("هذا العقار مملوك بالفعل.");
        }

        transaction.update(gameRef, {
            [`monopolyState.playerData.${playerId}.money`]: increment(-currentTile.price),
            [`monopolyState.playerData.${playerId}.properties`]: [...playerData.properties, playerData.position]
        });
    });
}

export async function improveProperty(gameId: string, playerId: string, propertyIndex: number): Promise<void> {
    // Logic to add houses/hotels
}

export async function declareBankruptcy(gameId: string, playerId: string): Promise<void> {
    // Logic for a player to declare bankruptcy
}
