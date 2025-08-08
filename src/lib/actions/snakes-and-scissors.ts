

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
} from 'firebase/firestore';
import type { Game, Player, SnakesAndScissorsQuestion, BoardProperty, MonopolyTurnPhase } from '@/types';
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
    
    // Fine squares at specific positions
    const finePositions: Record<number, number> = {
        6: 100, // Position 7 (index 6) has a fine of 100
        18: 200 // Position 19 (index 18) has a fine of 200
    };

    for (let i = 0; i < 24; i++) {
        if (i === 0) {
            board.push({
                id: i,
                type: 'start',
                name: 'خط البداية',
                price: 0,
                rent: 0,
                ownerId: null,
                color: '#16a34a', // Green for start
            });
        }
        else if (i in finePositions) {
            board.push({
                id: i,
                type: 'fine',
                name: `غرامة`,
                price: finePositions[i],
                rent: 0,
                ownerId: null,
                color: '#8B0000', // Dark red for fines
            });
        } else {
            const price = basePrice + (Math.floor(i / 4)) * priceIncrement * 4 + (i % 4) * priceIncrement;
            board.push({
                id: i,
                type: 'property',
                name: `عقار ${i + 1}`,
                price: price,
                rent: Math.floor(price * 0.20), // Rent is 20% of the price
                ownerId: null,
                color: null,
            });
        }
    }
    return board;
};


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

        const updatedPlayers = game.players.map(p => ({
            ...p,
            position: 0,
            balance: 1000,
            properties: []
        }));

        const firstPlayerName = updatedPlayers.find(p => p.id === turnOrder[0])?.name || 'اللاعب الأول';

        const updateData = {
            players: updatedPlayers,
            gameState: 'movement' as MonopolyTurnPhase,
            round: 1,
            playerScores: deleteField(),
            'snakesAndScissorsState.turnOrder': turnOrder,
            'snakesAndScissorsState.currentTurnIndex': 0,
            'snakesAndScissorsState.board': board,
            'snakesAndScissorsState.turnPhase': 'roll' as MonopolyTurnPhase,
            'snakesAndScissorsState.eventLog': arrayUnion(`بدأت اللعبة! دور اللاعب ${firstPlayerName}`),
        };
        transaction.update(gameRef, updateData);
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

const checkBankruptcy = (players: Player[], board: BoardProperty[]): { updatedPlayers: Player[], updatedBoard: BoardProperty[], bankruptPlayerName?: string } => {
    let bankruptPlayerName: string | undefined = undefined;
    const updatedPlayers = players.map(p => {
        if (p.status !== 'bankrupt' && (p.balance || 0) < 0) {
            bankruptPlayerName = p.name;
            return { ...p, status: 'bankrupt', properties: [] };
        }
        return p;
    });

    if (bankruptPlayerName) {
        const bankruptPlayer = players.find(p => p.name === bankruptPlayerName);
        if(bankruptPlayer){
            const updatedBoard = board.map(prop => {
                if (prop.ownerId === bankruptPlayer.id) {
                    return { ...prop, ownerId: null, color: null };
                }
                return prop;
            });
            return { updatedPlayers, updatedBoard, bankruptPlayerName };
        }
    }
    
    return { updatedPlayers, updatedBoard: board, bankruptPlayerName };
}

export async function handleMoveEnd(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        const ssState = game.snakesAndScissorsState!;
        if (ssState.turnOrder[ssState.currentTurnIndex] !== playerId || ssState.turnPhase !== 'moving') {
            return;
        }
        
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found");
        
        const player = game.players[playerIndex];
        const oldPosition = player.position || 0;
        const diceValue = ssState.movementState?.diceValue || 1;
        const newPosition = (oldPosition + diceValue) % ssState.board.length;

        let updatedPlayers = [...game.players];
        const updatedPlayer = { ...updatedPlayers[playerIndex], position: newPosition };
        
        let eventLogMessage = `${player.name} انتقل إلى ${ssState.board[newPosition].name}.`;
        
        // Check for passing GO
        if (newPosition < oldPosition) {
            updatedPlayer.balance = (updatedPlayer.balance || 0) + 100;
             eventLogMessage += ` حصل على 100 دينار للمرور بنقطة البداية.`;
        }
        updatedPlayers[playerIndex] = updatedPlayer;

        const landedOnProperty = ssState.board[newPosition];
        let nextPhase: MonopolyTurnPhase = 'end_turn';
        
        let updateData: any = {};
        
        if (landedOnProperty.type === 'fine') {
            updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) - landedOnProperty.price;
            eventLogMessage += ` ودفع غرامة ${landedOnProperty.price} دينار.`;
            nextPhase = 'end_turn';
        } else if (landedOnProperty.ownerId === null && landedOnProperty.type === 'property') {
            const q = query(collection(db, "snakes_and_scissors_questions"));
            const querySnapshot = await getDocs(q);
            const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<SnakesAndScissorsQuestion, 'id'> }));
            const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
            
            updateData['snakesAndScissorsState.questionState'] = { question: randomQuestion, answeredBy: {} };
            nextPhase = 'buy_or_pass';
        } else if (landedOnProperty.ownerId !== null && landedOnProperty.ownerId !== playerId) {
            nextPhase = 'pay_rent';
            const owner = updatedPlayers.find(p => p.id === landedOnProperty.ownerId)!;
            const ownerIndex = updatedPlayers.findIndex(p => p.id === owner.id);
            
            updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) - landedOnProperty.rent;
            updatedPlayers[ownerIndex].balance = (updatedPlayers[ownerIndex].balance || 0) + landedOnProperty.rent;
            eventLogMessage += ` ودفع إيجارًا بقيمة ${landedOnProperty.rent} إلى ${owner.name}.`;
        } else if (landedOnProperty.ownerId === playerId) {
             eventLogMessage += ' (ملكيته).';
        }

        const bankruptcyCheck = checkBankruptcy(updatedPlayers, ssState.board);
        updatedPlayers = bankruptcyCheck.updatedPlayers;
        if(bankruptcyCheck.bankruptPlayerName){
            eventLogMessage += ` أفلس اللاعب ${bankruptcyCheck.bankruptPlayerName}!`;
            updateData['snakesAndScissorsState.board'] = bankruptcyCheck.updatedBoard;
        }
        
        const activePlayers = updatedPlayers.filter(p => p.status !== 'bankrupt');
        if (activePlayers.length <= 1) {
            updateData.gameState = 'final_results';
            updateData.gameResult = { winner: activePlayers[0]?.id || '', message: 'الفائز الوحيد المتبقي!'};
            nextPhase = 'final_results';
        }

        transaction.update(gameRef, {
            ...updateData,
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
            transaction.update(gameRef, { 
                'snakesAndScissorsState.turnPhase': 'end_turn',
                'snakesAndScissorsState.questionState': deleteField(),
             });
            return;
        }
        
        const player = game.players.find(p => p.id === playerId)!;
        const property = ssState.board[player.position];
        if (property.price > (player.balance || 0)) {
            throw new Error("لا تملك ما يكفي من المال لشراء هذا العقار.");
        }

        transaction.update(gameRef, {
            'snakesAndScissorsState.turnPhase': 'question'
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
        let updatedPlayers = [...game.players];
        const player = updatedPlayers[playerIndex];
        const property = ssState.board[player.position];
        let eventLogMessage = "";

        if (answer === question.correctAnswer) {
            const newBalance = (player.balance || 0) - property.price;
            updatedPlayers[playerIndex] = { ...player, balance: newBalance };
            const updatedBoard = [...ssState.board];
            updatedBoard[player.position].ownerId = playerId;
            updatedBoard[player.position].color = player.team || '#FFFFFF'; 

            transaction.update(gameRef, {
                'snakesAndScissorsState.board': updatedBoard,
            });
            eventLogMessage = `${player.name} أجاب بشكل صحيح وامتلك ${property.name}!`;
        } else {
            const penalty = Math.floor(property.price * 0.75);
            updatedPlayers[playerIndex].balance = (player.balance || 0) - penalty;
            eventLogMessage = `${player.name} أجاب بشكل خاطئ وخسر ${penalty} دينار.`;
        }

        const bankruptcyCheck = checkBankruptcy(updatedPlayers, ssState.board);
        updatedPlayers = bankruptcyCheck.updatedPlayers;
        let updateData: any = {};
        if(bankruptcyCheck.bankruptPlayerName){
            eventLogMessage += ` أفلس اللاعب ${bankruptcyCheck.bankruptPlayerName}!`;
            updateData['snakesAndScissorsState.board'] = bankruptcyCheck.updatedBoard;
        }
        
        transaction.update(gameRef, {
            ...updateData,
            players: updatedPlayers,
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
        
        const activePlayers = game.players.filter(p => p.status !== 'bankrupt');
        if (activePlayers.length <= 1) {
             transaction.update(gameRef, { 
                 gameState: 'final_results', 
                 gameResult: { winner: activePlayers[0]?.id || '', message: 'الفائز الوحيد المتبقي!'}
            });
            return;
        }
        
        let nextTurnIndex = (ssState.currentTurnIndex + 1) % game.players.length;
        // Keep skipping until we find a non-bankrupt player
        while(game.players.find(p => p.id === ssState.turnOrder[nextTurnIndex])?.status === 'bankrupt') {
            nextTurnIndex = (nextTurnIndex + 1) % game.players.length;
        }
        
        const nextPlayer = game.players.find(p => p.id === ssState.turnOrder[nextTurnIndex]);

        transaction.update(gameRef, {
            'snakesAndScissorsState.currentTurnIndex': nextTurnIndex,
            'snakesAndScissorsState.turnPhase': 'roll',
            'snakesAndScissorsState.movementState': deleteField(),
            'snakesAndScissorsState.eventLog': arrayUnion(`حان دور ${nextPlayer?.name}.`),
        });
    });
}
