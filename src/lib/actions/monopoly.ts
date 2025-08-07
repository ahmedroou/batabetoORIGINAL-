

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
                propertyLevels: {},
                doublesCount: 0,
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
        const isDoubles = die1 === die2;

        const playerData = monopolyState.playerData[playerId];
        let currentDoublesCount = playerData.doublesCount || 0;
        
        const updateData: any = {
            'monopolyState.dice': [die1, die2],
        };

        if (isDoubles) {
            currentDoublesCount++;
            if (currentDoublesCount === 3) {
                updateData[`monopolyState.playerData.${playerId}.position`] = 10;
                updateData[`monopolyState.playerData.${playerId}.inJail`] = true;
                updateData[`monopolyState.playerData.${playerId}.doublesCount`] = 0;
                updateData['monopolyState.lastActivity'] = `${game.players.find(p => p.id === playerId)?.name} حصل على 3 دبل متتالية وذهب إلى السجن!`;
                // End turn after going to jail
                updateData['monopolyState.turnPhase'] = 'end';
                transaction.update(gameRef, updateData);
                return;
            }
             updateData[`monopolyState.playerData.${playerId}.doublesCount`] = currentDoublesCount;
        } else {
            updateData[`monopolyState.playerData.${playerId}.doublesCount`] = 0;
        }
        
        const oldPosition = playerData.position;
        let newPosition = (oldPosition + total) % monopolyState.board.length;

        let activityMessage = `${game.players.find(p => p.id === playerId)?.name} رمى ${total} (${die1}, ${die2})${isDoubles ? ' (دبل!)' : ''}. انتقل إلى `;
        
        if (newPosition < oldPosition && !playerData.inJail) { 
             updateData[`monopolyState.playerData.${playerId}.money`] = increment(200);
             activityMessage = `${game.players.find(p => p.id === playerId)?.name} رمى ${total}, مر بنقطة الانطلاق وحصل على $200. انتقل إلى `;
        }
        
        updateData[`monopolyState.playerData.${playerId}.position`] = newPosition;

        const currentTile = monopolyState.board[newPosition];
        activityMessage += `${currentTile.name}.`;

        if (currentTile.type === 'go_to_jail') {
            newPosition = 10;
            updateData[`monopolyState.playerData.${playerId}.position`] = newPosition;
            updateData[`monopolyState.playerData.${playerId}.inJail`] = true;
            updateData[`monopolyState.playerData.${playerId}.doublesCount`] = 0; // Reset doubles count
            activityMessage += ` اذهب إلى السجن!`;
            updateData['monopolyState.turnPhase'] = 'end'; // Turn ends immediately
        } else if (currentTile.type === 'tax' && currentTile.price) {
            updateData[`monopolyState.playerData.${playerId}.money`] = increment(-currentTile.price);
            activityMessage += ` ودفع ضريبة بقيمة $${currentTile.price}.`;
        } else {
             const ownerEntry = Object.entries(monopolyState.playerData).find(([pid, data]) => data.properties.includes(newPosition));
             if (ownerEntry && ownerEntry[0] !== playerId) {
                const ownerId = ownerEntry[0];
                let rent = 0;
                
                if (currentTile.type === 'property' && currentTile.rent) {
                    const houseCount = ownerEntry[1].propertyLevels?.[newPosition] || 0;
                    rent = currentTile.rent[houseCount] || 0; 
                } else if (currentTile.type === 'railroad') {
                    const ownedRailroads = ownerEntry[1].properties.filter(pIndex => monopolyState.board[pIndex].type === 'railroad').length;
                    rent = [25, 50, 100, 200][ownedRailroads - 1] || 25;
                } else if (currentTile.type === 'utility') {
                     const ownedUtilities = ownerEntry[1].properties.filter(pIndex => monopolyState.board[pIndex].type === 'utility').length;
                     const multiplier = ownedUtilities === 1 ? 4 : 10;
                     rent = total * multiplier;
                }
                
                if(rent > 0) {
                    updateData[`monopolyState.playerData.${playerId}.money`] = increment(-rent);
                    updateData[`monopolyState.playerData.${ownerId}.money`] = increment(rent);
                    activityMessage += ` ودفع إيجار بقيمة $${rent} إلى ${game.players.find(p=>p.id === ownerId)?.name}.`;
                }
            }
        }
        
        if (!isDoubles) {
            updateData['monopolyState.turnPhase'] = 'action';
        } else {
             updateData['monopolyState.turnPhase'] = 'start';
             activityMessage += ' ارم النرد مرة أخرى!';
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
        
        const playerData = monopolyState.playerData[playerId];
        if (playerData.doublesCount > 0 && playerData.doublesCount < 3) {
            transaction.update(gameRef, {
                'monopolyState.turnPhase': 'start',
            });
            return;
        }

        const newTurnIndex = (monopolyState.currentTurnIndex + 1) % monopolyState.turnOrder.length;
        
        transaction.update(gameRef, {
            'monopolyState.currentTurnIndex': newTurnIndex,
            'monopolyState.turnPhase': 'start',
            'monopolyState.dice': [0, 0], 
             'monopolyState.playerData.${playerId}.doublesCount': 0 
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
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const monopolyState = game.monopolyState;
        if (!monopolyState) throw new Error("Monopoly state not found");

        const playerData = monopolyState.playerData[playerId];
        const property = monopolyState.board[propertyIndex];

        if (!property || property.type !== 'property' || !property.color) throw new Error("العقار غير صالح للبناء.");
        if (!playerData.properties.includes(propertyIndex)) throw new Error("أنت لا تملك هذا العقار.");

        const allInGroup = monopolyState.board
            .map((p, i) => ({ ...p, index: i }))
            .filter(p => p.color === property.color);

        const ownsAllInGroup = allInGroup.every(p => playerData.properties.includes(p.index));
        if (!ownsAllInGroup) throw new Error("يجب أن تمتلك كل عقارات المجموعة للبناء.");
        
        const currentLevel = playerData.propertyLevels?.[propertyIndex] || 0;
        if (currentLevel >= 5) throw new Error("وصلت إلى أقصى مستوى تطوير.");
        
        if (!property.houseCost || playerData.money < property.houseCost) {
            throw new Error("ليس لديك ما يكفي من المال لشراء منزل.");
        }

        transaction.update(gameRef, {
            [`monopolyState.playerData.${playerId}.money`]: increment(-property.houseCost),
            [`monopolyState.playerData.${playerId}.propertyLevels.${propertyIndex}`]: (currentLevel || 0) + 1,
        });
    });
}

export async function declareBankruptcy(gameId: string, playerId: string): Promise<void> {
    // Logic for a player to declare bankruptcy
}
