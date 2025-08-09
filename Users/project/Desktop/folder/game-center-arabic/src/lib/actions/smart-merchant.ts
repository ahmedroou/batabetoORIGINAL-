
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
import type { Game, Player, BoardProperty, SnakesAndScissorsQuestion, GameState } from '@/types';
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
                 const price = (Math.floor(Math.random() * 18) + 2) * 20; // Prices from 40 to 400, divisible by 20
                 const rent = price / 2;
                 board.push({ id: i, type: 'property', name: `عقار ${i}`, price, rent, ownerId: null, color: '#e0e0e0' });
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

function handleBankruptcy(playerToBankrupt: Player, board: BoardProperty[]): BoardProperty[] {
    playerToBankrupt.status = 'bankrupt';
    const updatedBoard = board.map(tile => {
        if (tile.ownerId === playerToBankrupt.id) {
            return { ...tile, ownerId: null };
        }
        return tile;
    });
    return updatedBoard;
}

function checkForWinner(players: Player[]): Game['gameResult'] | null {
    const activePlayers = players.filter(p => p.status !== 'bankrupt');
    if (activePlayers.length <= 1) {
        const winner = activePlayers[0];
        return {
            winner: winner ? winner.id : 'draw',
            message: winner ? `فاز ${winner.name} باللعبة!` : 'انتهت اللعبة بالتعادل!'
        };
    }
    return null;
}

export async function rollDiceAndMove(gameId: string, playerId: string) {
    let gameDataForLeagueUpdate: Game | null = null;
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
        let updatedPlayers = [...game.players];
        let updatedBoard = [...smState.board];
        let player = updatedPlayers[playerIndex];
        
        const oldPosition = player.position;
        const newPosition = (oldPosition + diceRoll) % updatedBoard.length;

        let eventLog = [...(smState.eventLog || []), `${player.name} رمى النرد وحصل على ${diceRoll}, وانتقل إلى المربع ${newPosition}`];

        if (newPosition < oldPosition) {
            player.balance = (player.balance || 0) + 200; 
            eventLog.push(`${player.name} مر بنقطة البداية وحصل على 200 دينار.`);
        }

        player.position = newPosition;
        const landingTile = updatedBoard[newPosition];
        let nextPhase: Game['smartMerchantState']['turnPhase'] = 'end_turn';

        if (landingTile.type === 'property') {
            if (!landingTile.ownerId) {
                nextPhase = 'buy_or_pass';
            } else if (landingTile.ownerId !== playerId) {
                nextPhase = 'pay_rent';
                const ownerIndex = updatedPlayers.findIndex(p => p.id === landingTile.ownerId);
                if (ownerIndex !== -1) {
                    const rent = landingTile.rent;
                    if (player.balance < rent) {
                        updatedPlayers[ownerIndex].balance! += player.balance;
                        eventLog.push(`${player.name} لم يتمكن من دفع الإيجار كاملاً لـ${updatedPlayers[ownerIndex].name} وأفلس!`);
                        player.balance = 0;
                        updatedBoard = handleBankruptcy(player, updatedBoard);
                    } else {
                        player.balance -= rent;
                        updatedPlayers[ownerIndex].balance! += rent;
                        eventLog.push(`${player.name} دفع إيجارًا بقيمة ${rent} إلى ${updatedPlayers[ownerIndex].name}.`);
                    }
                }
            }
        } else if (landingTile.type === 'fine') {
            player.balance = (player.balance || 0) - landingTile.price;
            eventLog.push(`${player.name} دفع غرامة قدرها ${landingTile.price}.`);
            if (player.balance <= 0) {
                 eventLog.push(`${player.name} أفلس بسبب الغرامة!`);
                 updatedBoard = handleBankruptcy(player, updatedBoard);
            }
        }
        
        const gameResult = checkForWinner(updatedPlayers);
        let gameState: GameState = gameResult ? 'final_results' : 'roll';
        if (!gameResult) {
            gameState = nextPhase as GameState;
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            'smartMerchantState.board': updatedBoard,
            'smartMerchantState.turnPhase': nextPhase,
            'smartMerchantState.eventLog': eventLog,
            'smartMerchantState.movementState': { isRolling: false, diceValue: diceRoll, playerId, from: oldPosition, to: newPosition },
            gameState: gameState,
            gameResult: gameResult || deleteField(),
        });
        
        if (gameResult) {
            gameDataForLeagueUpdate = { ...game, players: updatedPlayers, gameState, gameResult };
        }
    });

     if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
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
        
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].balance! -= property.price;
        
        const questionCategories = ['تاريخ', 'رياضة', 'علوم', 'جغرافيا']; 
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
     let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        let updatedPlayers = [...game.players];
        let player = updatedPlayers[playerIndex];

        const question = game.smartMerchantState!.questionState!.question;
        const property = game.smartMerchantState!.board[player.position];
        
        let newLog = game.smartMerchantState!.eventLog || [];
        let updatedBoard = [...game.smartMerchantState!.board];
        
        if (answer === question.correctAnswer) {
            newLog.push(`${player.name} أجاب بشكل صحيح واشترى ${property.name}!`);
            updatedBoard[player.position] = { ...property, ownerId: playerId };
            player.properties = [...(player.properties || []), property.id];
        } else {
            const refundAmount = property.price / 4;
            newLog.push(`${player.name} أجاب بشكل خاطئ، واسترجع ربع المبلغ: ${refundAmount} دينار.`);
            player.balance! += refundAmount;
             if (player.balance <= 0) {
                 newLog.push(`${player.name} أفلس!`);
                 updatedBoard = handleBankruptcy(player, updatedBoard);
            }
        }
        
        const gameResult = checkForWinner(updatedPlayers);
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            'smartMerchantState.board': updatedBoard,
            'smartMerchantState.turnPhase': 'end_turn',
            'smartMerchantState.questionState': deleteField(),
            'smartMerchantState.eventLog': newLog,
            gameState: gameResult ? 'final_results' : 'roll',
            gameResult: gameResult || deleteField(),
        });

        if (gameResult) {
            gameDataForLeagueUpdate = { ...game, players: updatedPlayers, gameState: 'final_results', gameResult };
        }
    });

     if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}


export async function endTurn(gameId: string, playerId: string) {
    let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.smartMerchantState!.turnOrder[game.smartMerchantState!.currentTurnIndex] !== playerId) {
            return;
        }

        const activePlayers = game.players.filter(p => p.status !== 'bankrupt');
        if (activePlayers.length <= 1) {
             const gameResult = checkForWinner(game.players);
             if (gameResult) {
                gameDataForLeagueUpdate = { ...game, gameResult };
                transaction.update(gameRef, {
                    gameState: 'final_results',
                    gameResult: gameResult
                });
             }
             return;
        }
        
        let nextTurnIndex = game.smartMerchantState!.currentTurnIndex;
        let nextPlayer;
        do {
             nextTurnIndex = (nextTurnIndex + 1) % game.players.length;
             nextPlayer = game.players[nextTurnIndex];
        } while (nextPlayer.status === 'bankrupt');
        
        const isNewRound = nextTurnIndex < game.smartMerchantState!.currentTurnIndex;
        const currentRound = (game.round || 0) + (isNewRound ? 1 : 0);
        
        if (currentRound > (game.smartMerchantState?.settings.rounds || 15)) {
             const finalPlayers = game.players.map(p => ({
                ...p,
                totalWealth: (p.balance || 0) + (p.properties?.reduce((sum, propId) => sum + game.smartMerchantState!.board[propId].price, 0) || 0)
             }));
             const winner = finalPlayers.reduce((a, b) => a.totalWealth > b.totalWealth ? a : b);
             const gameResult = { winner: winner.id, message: `فاز ${winner.name} بأكبر ثروة!` };
             gameDataForLeagueUpdate = { ...game, gameResult, players: finalPlayers };
             transaction.update(gameRef, { 
                gameState: 'final_results',
                gameResult: gameResult
            });
            return;
        }

        transaction.update(gameRef, {
            'smartMerchantState.currentTurnIndex': nextTurnIndex,
            'smartMerchantState.turnPhase': 'roll',
            round: currentRound
        });
    });
     if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
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
