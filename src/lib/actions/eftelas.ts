
"use server";

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, type Transaction } from 'firebase/firestore';
import type { Game, Player, EftelasPlayerState, BoardProperty, EftelasCard } from '@/types';
import { BOARD_LAYOUT } from '@/data/eftelas-board';
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from '@/data/eftelas-cards';


function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}


export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can start the game.");
        }
        if(game.gameState !== 'lobby') return; // Prevent re-starting

        const initialMoney = 1500;
        const playerStates: Record<string, EftelasPlayerState> = {};
        
        const shuffledPlayers = shuffle([...game.players]);

        shuffledPlayers.forEach((player: Player) => {
            playerStates[player.id] = {
                money: initialMoney,
                position: 0,
                properties: [],
                inJail: false,
                jailTurns: 0,
                getOutOfJailCards: 0,
            };
        });

        transaction.update(gameRef, {
            gameState: 'playing',
            players: shuffledPlayers, // Save the shuffled order
            eftelasState: {
                board: BOARD_LAYOUT,
                playerStates,
                communityChestCards: shuffle(COMMUNITY_CHEST_CARDS),
                chanceCards: shuffle(CHANCE_CARDS),
                currentTurnPlayerId: shuffledPlayers[0].id,
                dice: [0, 0],
                hasRolled: false,
                lastActivity: `بدأت اللعبة! دور اللاعب ${shuffledPlayers[0].name}.`,
            },
        });
    });
}

async function payRent(transaction: Transaction, gameRef: any, game: Game, playerId: string, ownerId: string, tile: BoardProperty) {
    const rentAmount = tile.rent?.[0] || 0; // Simple rent for now
    const playerState = game.eftelasState!.playerStates[playerId]!;
    const ownerState = game.eftelasState!.playerStates[ownerId]!;

    if (playerState.money < rentAmount) {
        // Handle bankruptcy later
        ownerState.money += playerState.money;
        playerState.money = 0;
        // Mark player as bankrupt in future
    } else {
        playerState.money -= rentAmount;
        ownerState.money += rentAmount;
    }
    
    transaction.update(gameRef, {
        [`eftelasState.playerStates.${playerId}.money`]: playerState.money,
        [`eftelasState.playerStates.${ownerId}.money`]: ownerState.money,
    });

    return `دفع ${game.players.find(p => p.id === playerId)?.name} مبلغ ${rentAmount} ريال كإيجار لـ ${game.players.find(p => p.id === ownerId)?.name}.`;
}

async function handleCardAction(transaction: Transaction, game: Game, playerId: string, cardType: 'chance' | 'community-chest') {
    const eftelasState = game.eftelasState!;
    const playerState = eftelasState.playerStates[playerId]!;
    
    const deck = cardType === 'chance' ? [...(eftelasState.chanceCards || [])] : [...(eftelasState.communityChestCards || [])];
    if (deck.length === 0) return { activity: "لا توجد بطاقات متبقية.", playerState };

    const card = deck.shift()!; // Draw the top card
    deck.push(card); // Put it at the bottom of the deck

    let activity = `سحب بطاقة ${cardType === 'chance' ? 'حظ' : 'فرص'}: "${card.text}"`;

    switch (card.type) {
        case 'money':
            playerState.money += card.amount!;
            break;
        case 'move':
            playerState.position = (playerState.position + card.amount!) % eftelasState.board.length;
            break;
        case 'moveTo':
            if (card.targetPosition !== undefined) {
                 if (card.targetPosition < playerState.position) {
                    playerState.money += 200; // Passed Go
                    activity += " (وربح 200 ريال للمرور بنقطة البداية)";
                }
                playerState.position = card.targetPosition;
            }
            break;
        case 'goToJail':
            playerState.position = 10;
            playerState.inJail = true;
            playerState.jailTurns = 0;
            break;
        case 'getOutOfJail':
            playerState.getOutOfJailCards += 1;
            break;
        // Add more card types logic (payPlayers, repairs etc.) later
    }
    
    // Update the deck in the game state
    if (cardType === 'chance') {
        transaction.update(doc(db, 'games', game.id), { 'eftelasState.chanceCards': deck });
    } else {
        transaction.update(doc(db, 'games', game.id), { 'eftelasState.communityChestCards': deck });
    }

    return { activity, playerState };
}

export async function rollDiceAndMove(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        const eftelasState = game.eftelasState;
        if (!eftelasState || game.gameState !== 'playing') throw new Error("لا يمكن رمي النرد الآن.");
        if (eftelasState.currentTurnPlayerId !== playerId) throw new Error("ليس دورك.");
        if (eftelasState.hasRolled) throw new Error("لقد قمت برمي النرد بالفعل.");

        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        const isDouble = die1 === die2;
        const totalMove = die1 + die2;

        let playerState = { ...eftelasState.playerStates[playerId]! };
        const oldPosition = playerState.position;
        const newPosition = (oldPosition + totalMove) % eftelasState.board.length;
        playerState.position = newPosition;
        
        let lastActivity = `${game.players.find(p => p.id === playerId)?.name} رمى ${totalMove} وانتقل إلى ${eftelasState.board[newPosition].name}.`;

        if (newPosition < oldPosition) {
            playerState.money += 200;
            lastActivity += " وربح 200 ريال للمرور بنقطة البداية.";
        }
        
        // Handle landing on tile
        const landedTile = eftelasState.board[newPosition];
        if (landedTile.type === 'property' && landedTile.ownerId && landedTile.ownerId !== playerId) {
            lastActivity = await payRent(transaction, gameRef, game, playerId, landedTile.ownerId, landedTile);
        } else if (landedTile.type === 'chance' || landedTile.type === 'community-chest') {
             const cardResult = await handleCardAction(transaction, game, playerId, landedTile.type);
             playerState = cardResult.playerState;
             lastActivity = cardResult.activity;
        }
        
        let nextPlayerId = eftelasState.currentTurnPlayerId;
        if (!isDouble) {
            const currentPlayerIndex = game.players.findIndex(p => p.id === playerId);
            const nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
            nextPlayerId = game.players[nextPlayerIndex].id;
        } else {
             lastActivity += " حصل على دور إضافي!";
        }

        transaction.update(gameRef, {
            [`eftelasState.playerStates.${playerId}`]: playerState,
            'eftelasState.dice': [die1, die2],
            'eftelasState.currentTurnPlayerId': nextPlayerId,
            'eftelasState.hasRolled': isDouble ? false : true,
            'eftelasState.lastActivity': lastActivity,
        });

        if (isDouble) {
            transaction.update(gameRef, { 'eftelasState.hasRolled': false });
        } else {
             transaction.update(gameRef, {
                'eftelasState.currentTurnPlayerId': nextPlayerId,
                'eftelasState.hasRolled': false,
            });
        }
    });
}

export async function purchaseProperty(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const eftelasState = game.eftelasState;
        if (!eftelasState || eftelasState.currentTurnPlayerId !== playerId) {
            throw new Error("ليس دورك للشراء.");
        }

        const playerState = eftelasState.playerStates[playerId]!;
        const propertyIndex = playerState.position;
        const property = { ...eftelasState.board[propertyIndex] };

        if (property.type !== 'property' && property.type !== 'station' && property.type !== 'utility') {
            throw new Error("لا يمكنك شراء هذه الخانة.");
        }
        if (property.ownerId) {
            throw new Error("هذا العقار مملوك بالفعل.");
        }
        if (playerState.money < (property.price || 0)) {
            throw new Error("ليس لديك ما يكفي من المال.");
        }

        // Update player state
        playerState.money -= property.price!;
        playerState.properties.push(property.id);

        // Update property state
        property.ownerId = playerId;
        
        const updatedBoard = [...eftelasState.board];
        updatedBoard[propertyIndex] = property;
        
        const nextPlayerId = game.players[(game.players.findIndex(p => p.id === playerId) + 1) % game.players.length].id;

        transaction.update(gameRef, {
            'eftelasState.board': updatedBoard,
            [`eftelasState.playerStates.${playerId}`]: playerState,
            'eftelasState.lastActivity': `قام ${game.players.find(p=>p.id===playerId)?.name} بشراء ${property.name}.`,
            'eftelasState.hasRolled': false,
            'eftelasState.currentTurnPlayerId': nextPlayerId,
        });
    });
}

    