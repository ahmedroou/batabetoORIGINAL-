

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
    limit,
    increment,
} from 'firebase/firestore';
import type { Game, Player, SnakesAndScissorsQuestion, BoardProperty, MonopolyTurnPhase } from '@/types';
import { updateLeagueScoresForGameEnd } from './user';
import { generateBankOfLuckBoard, checkBankruptcy } from './helpers/bank-of-luck-helpers';

function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}


export async function updateGameSettings(gameId: string, hostId: string, settings: Partial<Game['bankOfLuckState']['settings']>) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'bankOfLuckState.settings': { ...game.bankOfLuckState?.settings, ...settings } });
    });
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
        const board = generateBankOfLuckBoard();

        const updatedPlayers = game.players.map(p => ({
            ...p,
            position: 0,
            balance: 1000,
            properties: []
        }));

        const firstPlayerName = updatedPlayers.find(p => p.id === turnOrder[0])?.name || 'اللاعب الأول';

        const updateData = {
            players: updatedPlayers,
            gameState: 'roll' as MonopolyTurnPhase,
            round: 1,
            playerScores: {}, // Scores are based on balance in this game
            'bankOfLuckState.turnOrder': turnOrder,
            'bankOfLuckState.currentTurnIndex': 0,
            'bankOfLuckState.board': board,
            'bankOfLuckState.turnPhase': 'roll' as MonopolyTurnPhase,
            'bankOfLuckState.eventLog': arrayUnion(`بدأت اللعبة! دور اللاعب ${firstPlayerName}`),
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
        const bgs = game.bankOfLuckState!;
        const turnOrder = bgs.turnOrder;
        const currentTurnIndex = bgs.currentTurnIndex;

        if (turnOrder[currentTurnIndex] !== playerId || bgs.turnPhase !== 'roll') {
            throw new Error("ليس دورك لرمي النرد.");
        }

        const diceValue = Math.floor(Math.random() * 6) + 1;
        
        transaction.update(gameRef, {
            'bankOfLuckState.turnPhase': 'moving',
            'bankOfLuckState.movementState': {
                isRolling: true,
                diceValue,
                playerId: playerId,
                from: game.players.find(p => p.id === playerId)?.position || 0,
            },
            'bankOfLuckState.eventLog': arrayUnion(`${game.players.find(p=>p.id === playerId)?.name} رمى ${diceValue}.`)
        });
    });
}

export async function handleMoveEnd(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        const bgs = game.bankOfLuckState!;
        if (bgs.turnOrder[bgs.currentTurnIndex] !== playerId || bgs.turnPhase !== 'moving') {
            return;
        }
        
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found");
        
        const player = game.players[playerIndex];
        const oldPosition = player.position || 0;
        const diceValue = bgs.movementState?.diceValue || 1;
        const newPosition = (oldPosition + diceValue) % bgs.board.length;

        let updatedPlayers = [...game.players];
        const updatedPlayer = { ...updatedPlayers[playerIndex], position: newPosition };
        
        let eventLogMessage = `${player.name} انتقل إلى ${bgs.board[newPosition].name}.`;
        
        if (newPosition < oldPosition) {
            updatedPlayer.balance = (updatedPlayer.balance || 0) + 100;
             eventLogMessage += ` حصل على 100 دينار للمرور بنقطة البداية.`;
        }
        updatedPlayers[playerIndex] = updatedPlayer;

        const landedOnProperty = bgs.board[newPosition];
        let nextPhase: MonopolyTurnPhase = 'end_turn';
        let updateData: any = {};
        
        if (landedOnProperty.type === 'fine') {
            updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) - landedOnProperty.price;
            eventLogMessage += ` ودفع غرامة ${landedOnProperty.price} دينار.`;
        } else if (landedOnProperty.type === 'chance') {
             const amount = Math.floor(Math.random() * 200) - 100; // -100 to +100
             updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) + amount;
             eventLogMessage += amount >= 0 ? ` وربح ${amount} دينار.` : ` وخسر ${-amount} دينار.`;
        } else if (landedOnProperty.ownerId === null && landedOnProperty.type === 'property') {
            const categories = ['تاريخ', 'جغرافيا', 'علوم', 'رياضة', 'فن', 'أدب'];
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];
            updateData['bankOfLuckState.questionCategoryForPurchase'] = randomCategory;
            nextPhase = 'buy_or_pass';
        } else if (landedOnProperty.ownerId !== null && landedOnProperty.ownerId !== playerId) {
            nextPhase = 'pay_rent';
            const ownerIndex = updatedPlayers.findIndex(p => p.id === landedOnProperty.ownerId)!;
            updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) - landedOnProperty.rent;
            updatedPlayers[ownerIndex].balance = (updatedPlayers[ownerIndex].balance || 0) + landedOnProperty.rent;
            eventLogMessage += ` ودفع إيجارًا بقيمة ${landedOnProperty.rent} إلى ${updatedPlayers[ownerIndex].name}.`;
        } else if (landedOnProperty.ownerId === playerId) {
             eventLogMessage += ' (ملكيته).';
        }

        const bankruptcyCheck = checkBankruptcy(updatedPlayers, bgs.board);
        updatedPlayers = bankruptcyCheck.updatedPlayers;
        if(bankruptcyCheck.bankruptPlayerName){
            eventLogMessage += ` أفلس اللاعب ${bankruptcyCheck.bankruptPlayerName}!`;
            updateData['bankOfLuckState.board'] = bankruptcyCheck.updatedBoard;
        }
        
        const activePlayers = updatedPlayers.filter(p => p.status !== 'bankrupt');
        if (activePlayers.length <= 1) {
            updateData.gameState = 'final_results';
            updateData.gameResult = { winner: activePlayers[0]?.id || '', message: 'الفائز الوحيد المتبقي!'};
            nextPhase = 'final_results';
        }

        updateData.players = updatedPlayers;
        updateData['bankOfLuckState.turnPhase'] = nextPhase;
        updateData['bankOfLuckState.movementState'] = deleteField();
        updateData['bankOfLuckState.eventLog'] = arrayUnion(eventLogMessage);

        transaction.update(gameRef, updateData);
    });
}


export async function handleBuyDecision(gameId: string, playerId: string, decision: 'buy' | 'pass') {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const bgs = game.bankOfLuckState!;
        if (bgs.turnOrder[bgs.currentTurnIndex] !== playerId || bgs.turnPhase !== 'buy_or_pass') {
            throw new Error("ليس دورك لاتخاذ قرار.");
        }

        if (decision === 'pass') {
            transaction.update(gameRef, { 
                'bankOfLuckState.turnPhase': 'end_turn',
                'bankOfLuckState.questionCategoryForPurchase': deleteField(),
             });
            return;
        }
        
        const player = game.players.find(p => p.id === playerId)!;
        const property = bgs.board[player.position];
        if (property.price > (player.balance || 0)) {
            throw new Error("لا تملك ما يكفي من المال لشراء هذا العقار.");
        }
        
        const category = bgs.questionCategoryForPurchase;
        if (!category) throw new Error("لم يتم تحديد فئة السؤال.");
        
        const q = query(collection(db, "snakes_and_scissors_questions"), where("category", "==", category), limit(50));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) throw new Error(`لا توجد أسئلة في قسم "${category}".`);
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<BankOfLuckQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        transaction.update(gameRef, {
            'bankOfLuckState.turnPhase': 'question',
            'bankOfLuckState.questionState': { question: randomQuestion, answeredBy: {} },
            'bankOfLuckState.timerEndsAt': Timestamp.fromMillis(Date.now() + 20 * 1000)
        });
    });
}

export async function answerQuestion(gameId: string, playerId: string, answer: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;
        const bgs = game.bankOfLuckState!;
        if (bgs.turnOrder[bgs.currentTurnIndex] !== playerId || bgs.turnPhase !== 'question') {
            throw new Error("ليس دورك للإجابة.");
        }

        const question = bgs.questionState?.question;
        if (!question) throw new Error("لم يتم العثور على سؤال.");
        
        const playerIndex = game.players.findIndex(p => p.id === playerId)!;
        let updatedPlayers = [...game.players];
        const player = updatedPlayers[playerIndex];
        const property = bgs.board[player.position];
        let eventLogMessage = "";

        if (answer === question.correctAnswer) {
            const newBalance = (player.balance || 0) - property.price;
            updatedPlayers[playerIndex] = { ...player, balance: newBalance };
            const updatedBoard = [...bgs.board];
            updatedBoard[player.position].ownerId = playerId;
            eventLogMessage = `${player.name} أجاب بشكل صحيح وامتلك ${property.name}!`;
            transaction.update(gameRef, { 'bankOfLuckState.board': updatedBoard });
        } else {
            const penalty = Math.floor(property.price * 0.75);
            updatedPlayers[playerIndex].balance = (player.balance || 0) - penalty;
            eventLogMessage = `${player.name} أجاب بشكل خاطئ وخسر ${penalty} دينار.`;
        }

        const { updatedPlayers: playersAfterBankruptcy, updatedBoard, bankruptPlayerName } = checkBankruptcy(updatedPlayers, game.bankOfLuckState.board);
        updatedPlayers = playersAfterBankruptcy;
        
        let updateData: any = {};
        if(bankruptPlayerName){
            eventLogMessage += ` أفلس اللاعب ${bankruptPlayerName}!`;
            updateData['bankOfLuckState.board'] = updatedBoard;
        }

        updateData.players = updatedPlayers;
        updateData['bankOfLuckState.turnPhase'] = 'end_turn';
        updateData['bankOfLuckState.questionState'] = deleteField();
        updateData['bankOfLuckState.timerEndsAt'] = deleteField();
        updateData['bankOfLuckState.eventLog'] = arrayUnion(eventLogMessage);
        
        transaction.update(gameRef, updateData);
    });
}

export async function handleQuestionTimeout(gameId: string, playerId: string) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        if (game.bankOfLuckState?.turnPhase !== 'question') return;

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return;

        const player = game.players[playerIndex];
        const property = game.bankOfLuckState.board[player.position];
        const penalty = Math.floor(property.price * 0.75);
        
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].balance = (player.balance || 0) - penalty;

        const eventLogMessage = `انتهى وقت ${player.name} للإجابة وخسر ${penalty} دينار.`;

        transaction.update(gameRef, {
            players: updatedPlayers,
            'bankOfLuckState.turnPhase': 'end_turn',
            'bankOfLuckState.questionState': deleteField(),
            'bankOfLuckState.timerEndsAt': deleteField(),
            'bankOfLuckState.eventLog': arrayUnion(eventLogMessage),
        });
     });
}


export async function endTurn(gameId: string, playerId: string) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const bgs = game.bankOfLuckState!;

        if (bgs.turnOrder[bgs.currentTurnIndex] !== playerId) {
            throw new Error("ليس دورك لإنهاء الجولة.");
        }
        
        const activePlayers = game.players.filter(p => p.status !== 'bankrupt');
        if (activePlayers.length <= 1 || (game.round || 0) >= bgs.settings.rounds) {
             const winner = activePlayers.sort((a,b) => (b.balance || 0) - (a.balance || 0))[0];
             transaction.update(gameRef, { 
                 gameState: 'final_results', 
                 gameResult: { winner: winner?.id || '', message: 'انتهت اللعبة!'}
            });
            return;
        }
        
        let nextTurnIndex = (bgs.currentTurnIndex + 1) % game.players.length;
        // Keep skipping until we find a non-bankrupt player
        while(game.players.find(p => p.id === bgs.turnOrder[nextTurnIndex])?.status === 'bankrupt') {
            nextTurnIndex = (nextTurnIndex + 1) % game.players.length;
        }
        
        const isNewRound = nextTurnIndex < bgs.currentTurnIndex;
        
        const nextPlayer = game.players.find(p => p.id === bgs.turnOrder[nextTurnIndex]);

        transaction.update(gameRef, {
            'bankOfLuckState.currentTurnIndex': nextTurnIndex,
            'bankOfLuckState.turnPhase': 'roll',
            'bankOfLuckState.movementState': deleteField(),
            'bankOfLuckState.eventLog': arrayUnion(`حان دور ${nextPlayer?.name}.`),
            'round': isNewRound ? increment(1) : game.round,
        });
    });
}
