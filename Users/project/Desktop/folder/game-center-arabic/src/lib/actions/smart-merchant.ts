

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
    increment,
} from 'firebase/firestore';
import type { Game, Player, SnakesAndScissorsQuestion, BoardProperty, SmartMerchantTurnPhase } from '@/types';
import { updateLeagueScoresForGameEnd } from '../user/leagues';
import { generateMonopolyBoard, checkBankruptcy, getMonopolyQuestionCategories } from '../helpers/monopoly-helpers';
import { getShuffledQuestions } from '../helpers';


export async function startGame(gameId: string, hostId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const turnOrder = [...game.players].sort(() => Math.random() - 0.5).map(p => p.id);
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
            gameState: 'roll' as SmartMerchantTurnPhase,
            round: 1,
            playerScores: deleteField(),
            'smartMerchantState.turnOrder': turnOrder,
            'smartMerchantState.currentTurnIndex': 0,
            'smartMerchantState.board': board,
            'smartMerchantState.turnPhase': 'roll' as SmartMerchantTurnPhase,
            'smartMerchantState.eventLog': arrayUnion(`بدأت اللعبة! دور اللاعب ${firstPlayerName}`),
            'smartMerchantState.movementState': deleteField(),
            'smartMerchantState.questionState': deleteField(),
            'smartMerchantState.settings': game.smartMerchantState?.settings || { rounds: 15 }
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
        const smartMerchantState = game.smartMerchantState!;
        const turnOrder = smartMerchantState.turnOrder;
        const currentTurnIndex = smartMerchantState.currentTurnIndex;

        if (turnOrder[currentTurnIndex] !== playerId || smartMerchantState.turnPhase !== 'roll') {
            throw new Error("ليس دورك لرمي النرد.");
        }

        const diceValue = Math.floor(Math.random() * 6) + 1;
        
        transaction.update(gameRef, {
            'smartMerchantState.turnPhase': 'moving',
            'smartMerchantState.movementState': {
                isRolling: true,
                diceValue,
                playerId: playerId,
                from: game.players.find(p => p.id === playerId)?.position || 0,
                to: 0,
            },
            'smartMerchantState.eventLog': arrayUnion(`${game.players.find(p=>p.id === playerId)?.name} رمى ${diceValue}.`)
        });
    });
}


export async function handleMoveEnd(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        let game = gameDoc.data() as Game;

        const smartMerchantState = game.smartMerchantState!;
        if (smartMerchantState.turnOrder[smartMerchantState.currentTurnIndex] !== playerId || smartMerchantState.turnPhase !== 'moving') {
            return;
        }
        
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found");
        
        const player = game.players[playerIndex];
        const oldPosition = player.position || 0;
        const diceValue = smartMerchantState.movementState?.diceValue || 1;
        const newPosition = (oldPosition + diceValue) % smartMerchantState.board.length;

        let updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].position = newPosition;
        
        let eventLogMessage = `${player.name} انتقل إلى ${smartMerchantState.board[newPosition].name}.`;
        
        if (newPosition < oldPosition) {
            updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) + 100;
             eventLogMessage += ` حصل على 100 دينار للمرور بنقطة البداية.`;
        }
        
        const landedOnProperty = smartMerchantState.board[newPosition];
        let nextPhase: SmartMerchantTurnPhase = 'end_turn';
        let updateData: any = {};
        
        if (landedOnProperty.type === 'fine') {
            updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) - landedOnProperty.price;
            eventLogMessage += ` ودفع غرامة ${landedOnProperty.price} دينار.`;
        } else if (landedOnProperty.type === 'chance') {
            const isGoodLuck = Math.random() > 0.5;
            const amount = Math.floor(Math.random() * 50) + 50;
            if (isGoodLuck) {
                updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) + amount;
                eventLogMessage += ` بطاقة حظ! ربحت ${amount} دينار.`;
            } else {
                updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) - amount;
                eventLogMessage += ` بطاقة حظ! خسرت ${amount} دينار.`;
            }
        } else if (landedOnProperty.ownerId === null && landedOnProperty.type === 'property') {
            const categories = await getMonopolyQuestionCategories();
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];

            updateData['smartMerchantState.questionState'] = { category: randomCategory };
            nextPhase = 'buy_or_pass';
        } else if (landedOnProperty.ownerId !== null && landedOnProperty.ownerId !== playerId) {
            const ownerIndex = updatedPlayers.findIndex(p => p.id === landedOnProperty.ownerId)!;
            updatedPlayers[playerIndex].balance = (updatedPlayers[playerIndex].balance || 0) - landedOnProperty.rent;
            updatedPlayers[ownerIndex].balance = (updatedPlayers[ownerIndex].balance || 0) + landedOnProperty.rent;
            eventLogMessage += ` ودفع إيجارًا بقيمة ${landedOnProperty.rent} إلى ${updatedPlayers[ownerIndex].name}.`;
            nextPhase = 'pay_rent';
        } else if (landedOnProperty.ownerId === playerId) {
             eventLogMessage += ' (ملكيته).';
        }

        const bankruptcyCheck = checkBankruptcy(updatedPlayers, smartMerchantState.board);
        updatedPlayers = bankruptcyCheck.updatedPlayers;
        if(bankruptcyCheck.bankruptPlayerName){
            eventLogMessage += ` أفلس اللاعب ${bankruptcyCheck.bankruptPlayerName}!`;
            updateData['smartMerchantState.board'] = bankruptcyCheck.updatedBoard;
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
            'smartMerchantState.turnPhase': nextPhase,
            'smartMerchantState.movementState.isRolling': false,
            'smartMerchantState.eventLog': arrayUnion(eventLogMessage)
        });
    });
}


export async function handleBuyDecision(gameId: string, playerId: string, decision: 'buy' | 'pass') {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const smartMerchantState = game.smartMerchantState!;
        if (smartMerchantState.turnOrder[smartMerchantState.currentTurnIndex] !== playerId || smartMerchantState.turnPhase !== 'buy_or_pass') {
            throw new Error("ليس دورك لاتخاذ قرار.");
        }

        if (decision === 'pass') {
            transaction.update(gameRef, { 
                'smartMerchantState.turnPhase': 'end_turn',
                'smartMerchantState.questionState': deleteField(),
             });
            return;
        }
        
        const player = game.players.find(p => p.id === playerId)!;
        const property = smartMerchantState.board[player.position];
        if (property.price > (player.balance || 0)) {
            throw new Error("لا تملك ما يكفي من المال لشراء هذا العقار.");
        }
        
        const category = smartMerchantState.questionState?.category;
        if (!category) {
            throw new Error("لم يتم تحديد قسم السؤال. خطأ في اللعبة.");
        }
        
        const questions = await getShuffledQuestions('smart-merchant', category, 1);
        if (questions.length === 0) {
            throw new Error(`لا توجد أسئلة في قسم "${category}"`);
        }
        
        transaction.update(gameRef, {
            'smartMerchantState.turnPhase': 'question',
            'smartMerchantState.questionState.question': questions[0],
        });
    });
}

export async function answerQuestion(gameId: string, playerId: string, answer: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const smartMerchantState = game.smartMerchantState!;
        if (smartMerchantState.turnOrder[smartMerchantState.currentTurnIndex] !== playerId || smartMerchantState.turnPhase !== 'question') {
            throw new Error("ليس دورك للإجابة.");
        }

        const question = smartMerchantState.questionState?.question;
        if (!question) throw new Error("لم يتم العثور على سؤال.");
        
        const playerIndex = game.players.findIndex(p => p.id === playerId)!;
        let updatedPlayers = [...game.players];
        const player = updatedPlayers[playerIndex];
        const property = smartMerchantState.board[player.position];
        let eventLogMessage = "";
        let updatedBoard = [...smartMerchantState.board];

        if (answer === question.correctAnswer) {
            const newBalance = (player.balance || 0) - property.price;
            updatedPlayers[playerIndex] = { ...player, balance: newBalance };
            updatedBoard[player.position].ownerId = playerId;
            updatedBoard[player.position].color = player.team || '#FFFFFF'; 

            eventLogMessage = `${player.name} أجاب بشكل صحيح وامتلك ${property.name}!`;
        } else {
            const penalty = Math.floor(property.price * 0.75);
            updatedPlayers[playerIndex].balance = (player.balance || 0) - penalty;
            eventLogMessage = `${player.name} أجاب بشكل خاطئ وخسر ${penalty} دينار.`;
        }

        const bankruptcyCheck = checkBankruptcy(updatedPlayers, updatedBoard);
        updatedPlayers = bankruptcyCheck.updatedPlayers;
        let updateData: any = {};
        if(bankruptcyCheck.bankruptPlayerName){
            eventLogMessage += ` أفلس اللاعب ${bankruptcyCheck.bankruptPlayerName}!`;
            updateData['smartMerchantState.board'] = bankruptcyCheck.updatedBoard;
        }
        
        transaction.update(gameRef, {
            ...updateData,
            players: updatedPlayers,
            'smartMerchantState.board': updatedBoard,
            'smartMerchantState.turnPhase': 'end_turn',
            'smartMerchantState.questionState': deleteField(),
            'smartMerchantState.eventLog': arrayUnion(eventLogMessage),
        });
    });
}

export async function endTurn(gameId: string, playerId: string) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const smartMerchantState = game.smartMerchantState!;

        if (smartMerchantState.turnOrder[smartMerchantState.currentTurnIndex] !== playerId) {
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
        
        let nextTurnIndex = (smartMerchantState.currentTurnIndex + 1) % game.players.length;
        
        let isNewRound = false;
        if(nextTurnIndex === 0) {
            isNewRound = true;
        }

        let attempts = 0;
        while(game.players.find(p => p.id === smartMerchantState.turnOrder[nextTurnIndex])?.status === 'bankrupt' && attempts < game.players.length) {
            nextTurnIndex = (nextTurnIndex + 1) % game.players.length;
            if(nextTurnIndex === 0) isNewRound = true;
            attempts++;
        }
        
        const nextPlayer = game.players.find(p => p.id === smartMerchantState.turnOrder[nextTurnIndex]);

        const updateData: any = {
            'smartMerchantState.currentTurnIndex': nextTurnIndex,
            'smartMerchantState.turnPhase': 'roll',
            'smartMerchantState.movementState': deleteField(),
            'smartMerchantState.eventLog': arrayUnion(`حان دور ${nextPlayer?.name}.`),
        };

        const newRoundNumber = (game.round || 1) + (isNewRound ? 1 : 0);
        
        if (newRoundNumber > (smartMerchantState.settings.rounds || 15)) {
            const winner = activePlayers.sort((a,b) => (b.balance || 0) - (a.balance || 0))[0];
            updateData.gameState = 'final_results';
            updateData.gameResult = { winner: winner?.id || '', message: `انتهت اللعبة! الفائز هو الأعلى رصيدًا.`};
        } else if (isNewRound) {
            updateData.round = newRoundNumber;
        }

        transaction.update(gameRef, updateData);
    });
}

export async function updateGameSettings(gameId: string, hostId: string, settings: { rounds: number }) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, {
            'smartMerchantState.settings': settings
        });
    });
}

    