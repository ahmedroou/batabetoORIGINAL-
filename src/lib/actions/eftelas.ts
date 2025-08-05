
'use server';

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

// Function to check if a player owns all properties of a specific color
function ownsAllInColorSet(playerState: EftelasPlayerState, tile: BoardProperty, board: BoardProperty[]): boolean {
    if (!tile.color) return false;
    const colorGroup = board.filter(t => t.color === tile.color);
    return colorGroup.every(t => playerState.properties.includes(t.id));
}

async function payRent(transaction: Transaction, gameRef: any, game: Game, playerId: string, ownerId: string, tile: BoardProperty) {
    const board = game.eftelasState!.board;
    const playerState = game.eftelasState!.playerStates[playerId]!;
    const ownerState = game.eftelasState!.playerStates[ownerId]!;
    
    let rentAmount = tile.rent?.[0] || 0; // Simple rent for now
    
    // Double rent for properties if the owner has all of the same color and there are no houses.
    if (tile.type === 'property' && ownsAllInColorSet(ownerState, tile, board) && !tile.houses) {
        rentAmount *= 2;
    }
    
    // Future logic for houses/hotels will go here.
    
    if (playerState.money < rentAmount) {
        // Handle bankruptcy
        ownerState.money += playerState.money;
        playerState.money = 0;
        game.players.find(p => p.id === playerId)!.status = 'bankrupt'; // Mark as bankrupt
        // TODO: Return properties to the bank or owner
        transaction.update(gameRef, { 'players': game.players });
    } else {
        playerState.money -= rentAmount;
        ownerState.money += rentAmount;
    }
    
    transaction.update(gameRef, {
        [`eftelasState.playerStates.${playerId}`]: playerState,
        [`eftelasState.playerStates.${ownerId}`]: ownerState,
    });

    return `دفع ${game.players.find(p => p.id === playerId)?.name} مبلغ ${rentAmount} ريال كإيجار لـ ${game.players.find(p => p.id === ownerId)?.name}.`;
}

async function handleCardAction(transaction: Transaction, game: Game, playerId: string, cardType: 'chance' | 'community-chest') {
    const eftelasState = game.eftelasState!;
    let playerState = eftelasState.playerStates[playerId]!;
    let allPlayerStates = eftelasState.playerStates;
    
    const deck = cardType === 'chance' ? [...(eftelasState.chanceCards || [])] : [...(eftelasState.communityChestCards || [])];
    if (deck.length === 0) return { activity: "لا توجد بطاقات متبقية.", playerState };

    const card = deck.shift()!; // Draw the top card
    if (card.type !== 'getOutOfJail') {
        deck.push(card); // Put it at the bottom of the deck, unless it's a "Get Out of Jail" card
    }

    let activity = `سحب بطاقة ${cardType === 'chance' ? 'حظ' : 'فرص'}: "${card.text}"`;

    switch (card.type) {
        case 'money':
            playerState.money += card.amount!;
            break;
        case 'move':
            playerState.position = (playerState.position + card.amount! + eftelasState.board.length) % eftelasState.board.length;
            break;
        case 'moveTo':
            if (card.targetPosition !== undefined) {
                 if (card.targetPosition < playerState.position && card.targetPosition !== 10) { // Don't collect money for going to jail
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
        case 'payPlayers':
            game.players.forEach(p => {
                if(p.id !== playerId && p.status !== 'left' && p.status !== 'bankrupt') {
                    playerState.money -= card.amount!;
                    allPlayerStates[p.id]!.money += card.amount!;
                }
            });
            break;
        case 'collectFromPlayers':
            game.players.forEach(p => {
                if(p.id !== playerId && p.status !== 'left' && p.status !== 'bankrupt') {
                    playerState.money += card.amount!;
                    allPlayerStates[p.id]!.money -= card.amount!;
                }
            });
            break;
        case 'repairs':
            // This logic is simplified. A full implementation would count houses/hotels on properties.
            let repairCost = 0;
            // Example: repairCost = (playerState.properties.houses * card.housesModifier) + (playerState.properties.hotels * card.hotelsModifier)
            playerState.money -= repairCost;
            activity += ` ودفع ${repairCost} ريال للإصلاحات.`;
            break;
    }
    
    // Update the deck and all affected player states
    const updateData: any = {
        'eftelasState.playerStates': allPlayerStates
    };
    if (cardType === 'chance') {
        updateData['eftelasState.chanceCards'] = deck;
    } else {
        updateData['eftelasState.communityChestCards'] = deck;
    }
    transaction.update(doc(db, 'games', game.id), updateData);

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
        if ((landedTile.type === 'property' || landedTile.type === 'station' || landedTile.type === 'utility') && landedTile.ownerId && landedTile.ownerId !== playerId) {
            lastActivity = await payRent(transaction, gameRef, game, playerId, landedTile.ownerId, landedTile);
        } else if (landedTile.type === 'chance' || landedTile.type === 'community-chest') {
             const cardResult = await handleCardAction(transaction, game, playerId, landedTile.type);
             playerState = cardResult.playerState;
             lastActivity = cardResult.activity;
        } else if (landedTile.type === 'go-to-jail') {
            playerState.position = 10;
            playerState.inJail = true;
            playerState.jailTurns = 0;
            lastActivity += " وانتقل مباشرة إلى السجن!";
        } else if (landedTile.type === 'tax' && landedTile.price) {
            playerState.money -= landedTile.price;
            lastActivity += ` ودفع ضريبة ${landedTile.price} ريال.`;
        }
        
        let nextPlayerId = eftelasState.currentTurnPlayerId;
        if (!isDouble) {
            const activePlayers = game.players.filter(p => p.status !== 'left' && p.status !== 'bankrupt');
            const currentPlayerIndex = activePlayers.findIndex(p => p.id === playerId);
            const nextPlayerIndex = (currentPlayerIndex + 1) % activePlayers.length;
            nextPlayerId = activePlayers[nextPlayerIndex].id;
        } else {
             lastActivity += " حصل على دور إضافي!";
        }
        
        const hasRolledValue = isDouble ? false : true;

        transaction.update(gameRef, {
            [`eftelasState.playerStates.${playerId}`]: playerState,
            'eftelasState.dice': [die1, die2],
            'eftelasState.currentTurnPlayerId': nextPlayerId,
            'eftelasState.hasRolled': hasRolledValue,
            'eftelasState.lastActivity': lastActivity,
        });

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
        
        transaction.update(gameRef, {
            'eftelasState.board': updatedBoard,
            [`eftelasState.playerStates.${playerId}`]: playerState,
            'eftelasState.lastActivity': `قام ${game.players.find(p=>p.id===playerId)?.name} بشراء ${property.name}.`,
            'eftelasState.hasRolled': false, // Allow next player to roll
        });
    });
}

export async function attemptToLeaveJail(gameId: string, playerId: string, method: 'pay' | 'card' | 'roll') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const eftelasState = game.eftelasState;
        if (!eftelasState || eftelasState.currentTurnPlayerId !== playerId) throw new Error("ليس دورك.");
        
        const playerState = eftelasState.playerStates[playerId]!;
        if (!playerState.inJail) throw new Error("لست في السجن.");

        let isFree = false;
        let activity = "";

        if (method === 'pay') {
            if (playerState.money < 50) throw new Error("ليس لديك ما يكفي من المال لدفع الكفالة.");
            playerState.money -= 50;
            isFree = true;
            activity = `دفع ${game.players.find(p => p.id === playerId)?.name} كفالة وخرج من السجن.`;
        } else if (method === 'card') {
            if (playerState.getOutOfJailCards < 1) throw new Error("ليس لديك بطاقة خروج من السجن.");
            playerState.getOutOfJailCards -= 1;
            isFree = true;
            activity = `استخدم ${game.players.find(p => p.id === playerId)?.name} بطاقة للخروج من السجن.`;
        } else if (method === 'roll') {
            const die1 = Math.floor(Math.random() * 6) + 1;
            const die2 = Math.floor(Math.random() * 6) + 1;
            transaction.update(gameRef, { 'eftelasState.dice': [die1, die2] });
            if (die1 === die2) {
                isFree = true;
                activity = `رمى ${game.players.find(p => p.id === playerId)?.name} دبل وخرج من السجن!`;
            } else {
                playerState.jailTurns += 1;
                activity = `فشل ${game.players.find(p => p.id === playerId)?.name} في رمي دبل.`;
                if (playerState.jailTurns >= 3) {
                     if (playerState.money < 50) throw new Error("يجب عليك دفع الكفالة ولا تملك ما يكفي من المال!");
                     playerState.money -= 50;
                     isFree = true;
                     activity += " واضطر لدفع الكفالة.";
                }
            }
        }
        
        let nextPlayerId = playerId;
        if(isFree) {
            playerState.inJail = false;
            playerState.jailTurns = 0;
        } else {
             const activePlayers = game.players.filter(p => p.status !== 'left' && p.status !== 'bankrupt');
             const currentPlayerIndex = activePlayers.findIndex(p => p.id === playerId);
             const nextPlayerIndex = (currentPlayerIndex + 1) % activePlayers.length;
             nextPlayerId = activePlayers[nextPlayerIndex].id;
        }
        
        transaction.update(gameRef, {
            [`eftelasState.playerStates.${playerId}`]: playerState,
            'eftelasState.lastActivity': activity,
            'eftelasState.currentTurnPlayerId': nextPlayerId,
            'eftelasState.hasRolled': true, // Prevent rolling again this turn unless free and it's a double
        });

    });
}
