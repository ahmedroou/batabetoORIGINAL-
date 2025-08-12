

'use server';

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    collection,
    query,
    where,
    getDocs,
    Timestamp,
    deleteField,
    increment,
    type Transaction,
} from 'firebase/firestore';
import type { Game, Player, Property, EducatedMerchantQuestion, UserProfile } from '@/types';
import { shuffle } from './helpers';
import { PROPERTY_NAMES } from '@/data/properties';
import { getEducatedMerchantCategories } from './admin';

const BOARD_SIZE = 28;
const START_MONEY = 1000;
const PASS_GO_REWARD = 150;
const QUESTION_TIME_SECONDS = 25;

async function generateBoard(categories: string[]): Promise<Property[]> {
    const board: Property[] = [];
    const shuffledPropertyNames = shuffle([...PROPERTY_NAMES]);

    // Add Start tile
    board.push({ id: 0, type: 'start', name: 'نقطة البداية', category: '', price: 0, rent: 0, ownerId: null });

    // Add properties
    for (let i = 1; i < BOARD_SIZE - 3; i++) { // Leave space for fines
        const name = shuffledPropertyNames[i-1] || `عقار ${i}`;
        const price = Math.round((100 + Math.random() * 400) / 10) * 10; // 100 to 500, in steps of 10
        const category = categories[Math.floor(Math.random() * categories.length)];
        board.push({
            id: i,
            type: 'property',
            name: name,
            category: category,
            price: price,
            rent: Math.round(price / 4), // Rent is 1/4th of price
            ownerId: null,
        });
    }

    // Add Fine tiles
    board.push({ id: board.length, type: 'fine', name: 'غرامة', category: '', price: 0, rent: 0, ownerId: null, fineAmount: 100 });
    board.push({ id: board.length, type: 'fine', name: 'غرامة', category: '', price: 0, rent: 0, ownerId: null, fineAmount: 150 });
    board.push({ id: board.length, type: 'fine', name: 'غرامة', category: '', price: 0, rent: 0, ownerId: null, fineAmount: 200 });
    
    return shuffle(board.slice(1)).reduce((acc, val, i) => {
        acc[i+1] = {...val, id: i+1};
        return acc;
    }, [board[0]] as Property[]);
}

export async function startGame(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start.");
        
        const categoriesResult = await getEducatedMerchantCategories();
        if(!categoriesResult.success || !categoriesResult.categories || categoriesResult.categories.length === 0) {
            throw new Error("Failed to load question categories for the game.");
        }

        const board = await generateBoard(categoriesResult.categories);
        const turnOrder = shuffle(game.players.map(p => p.id));

        const updatedPlayers = game.players.map(p => ({
            ...p,
            money: START_MONEY,
            position: 0,
            status: 'alive' as const,
        }));
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'rolling',
            round: 1,
            'educatedMerchantState.board': board,
            'educatedMerchantState.turnOrder': turnOrder,
            'educatedMerchantState.currentTurnIndex': 0,
            'educatedMerchantState.activityLog': [{ message: "بدأت اللعبة!", timestamp: new Date() }],
        });
    });
}

export async function rollDice(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'rolling') throw new Error("ليس وقت رمي النرد.");
        const turnOrder = game.educatedMerchantState!.turnOrder;
        const currentTurnIndex = game.educatedMerchantState!.currentTurnIndex;
        if (turnOrder[currentTurnIndex] !== playerId) throw new Error("ليس دورك.");

        const diceRoll = Math.floor(Math.random() * 5) + 1;
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        const oldPosition = game.players[playerIndex].position;
        const newPosition = (oldPosition + diceRoll) % BOARD_SIZE;

        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].position = newPosition;
        
        let moneyUpdate = 0;
        if (newPosition < oldPosition) { // Player passed GO
            moneyUpdate = PASS_GO_REWARD;
            updatedPlayers[playerIndex].money! += moneyUpdate;
        }

        const activityMessage = `${updatedPlayers[playerIndex].name} رمى ${diceRoll} وانتقل إلى "${game.educatedMerchantState!.board[newPosition].name}".` + (moneyUpdate > 0 ? ` وحصل على ${moneyUpdate} دينار.` : '');
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'movement',
            'educatedMerchantState.lastDiceRoll': diceRoll,
            'educatedMerchantState.activityLog': arrayUnion({ message: activityMessage, timestamp: new Date() }),
        });
    });
}

export async function handlePropertyLanding(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const player = game.players.find(p => p.id === playerId);
        if (!player) return;

        const property = game.educatedMerchantState!.board[player.position];
        let activityMessage = '';
        let updates: any = { gameState: 'turn_end' }; // Default to ending turn

        if (property.type === 'property') {
            if (!property.ownerId) { // Property is unowned
                updates.gameState = 'property_action';
            } else if (property.ownerId !== playerId) { // Pay rent
                const owner = game.players.find(p => p.id === property.ownerId);
                if (owner) {
                    const rent = property.rent;
                    const payerIndex = game.players.findIndex(p => p.id === playerId);
                    const ownerIndex = game.players.findIndex(p => p.id === property.ownerId);
                    
                    const updatedPlayers = [...game.players];
                    
                    if (updatedPlayers[payerIndex].money! < rent) { // Bankruptcy
                        updatedPlayers[payerIndex].status = 'bankrupt';
                        activityMessage = `${player.name} أفلس لأنه لم يستطع دفع الإيجار لـ ${owner.name}.`;
                    } else {
                        updatedPlayers[payerIndex].money! -= rent;
                        updatedPlayers[ownerIndex].money! += rent;
                        activityMessage = `${player.name} دفع ${rent} دينار إيجار لـ ${owner.name}.`;
                    }
                    updates.players = updatedPlayers;
                }
            }
        } else if (property.type === 'fine') {
            const fine = property.fineAmount || 100;
            const playerIndex = game.players.findIndex(p => p.id === playerId);
            const updatedPlayers = [...game.players];
             if (updatedPlayers[playerIndex].money! < fine) {
                updatedPlayers[playerIndex].status = 'bankrupt';
                activityMessage = `${player.name} أفلس لأنه لم يستطع دفع الغرامة.`;
            } else {
                updatedPlayers[playerIndex].money! -= fine;
                activityMessage = `${player.name} دفع غرامة قدرها ${fine} دينار.`;
            }
            updates.players = updatedPlayers;
        }

        if(activityMessage) {
            updates['educatedMerchantState.activityLog'] = arrayUnion({ message: activityMessage, timestamp: new Date() });
        }
        transaction.update(gameRef, updates);
    });
}

export async function purchaseProperty(gameId: string, playerId: string): Promise<void> {
    // This action will now only deduct money and set up the question phase
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const player = game.players.find(p => p.id === playerId);
        if (!player) return;

        const property = game.educatedMerchantState!.board[player.position];
        if (property.ownerId || player.money! < property.price) {
            throw new Error("لا يمكنك شراء هذا العقار.");
        }

        const questionsCol = collection(db, "trap_answer_questions");
        const q = query(questionsCol, where("category", "==", property.category), limit(1));
        const questionSnapshot = await getDocs(q);
        if (questionSnapshot.empty) {
            throw new Error(`لا توجد أسئلة متاحة في قسم "${property.category}".`);
        }
        const questionDoc = questionSnapshot.docs[0];
        const questionData = { id: questionDoc.id, ...questionDoc.data() } as EducatedMerchantQuestion;

        const options = shuffle([...(questionData.dummyAnswers || []), questionData.correctAnswer]);
        questionData.options = options;

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].money! -= property.price;

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'question',
            'educatedMerchantState.currentQuestion': questionData,
            'educatedMerchantState.timerEndsAt': Timestamp.fromMillis(Date.now() + QUESTION_TIME_SECONDS * 1000),
            'educatedMerchantState.pendingPurchase': {
                playerId: playerId,
                propertyId: property.id,
                price: property.price,
                questionId: questionData.id,
            }
        });
    });
}


export async function answerQuestion(gameId: string, playerId: string, answer: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const pendingPurchase = game.educatedMerchantState?.pendingPurchase;

        if (game.gameState !== 'question' || !pendingPurchase || pendingPurchase.playerId !== playerId) {
            return;
        }

        const question = game.educatedMerchantState!.currentQuestion!;
        const isCorrect = answer === question.correctAnswer;
        const propertyIndex = game.educatedMerchantState!.board.findIndex(p => p.id === pendingPurchase.propertyId);
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        
        const updatedBoard = [...game.educatedMerchantState!.board];
        const updatedPlayers = [...game.players];
        let activityMessage = '';

        if (isCorrect) {
            updatedBoard[propertyIndex].ownerId = playerId;
            activityMessage = `${updatedPlayers[playerIndex].name} أجاب بشكل صحيح وامتلك "${updatedBoard[propertyIndex].name}"!`;
        } else {
            const refund = Math.round(pendingPurchase.price / 4);
            updatedPlayers[playerIndex].money! += refund;
            activityMessage = `${updatedPlayers[playerIndex].name} أجاب بشكل خاطئ واسترد ${refund} دينار.`;
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            'educatedMerchantState.board': updatedBoard,
            'educatedMerchantState.pendingPurchase': deleteField(),
            'educatedMerchantState.currentQuestion': deleteField(),
            'educatedMerchantState.timerEndsAt': deleteField(),
            'educatedMerchantState.activityLog': arrayUnion({ message: activityMessage, timestamp: new Date() }),
            gameState: 'turn_end'
        });
    });
}


export async function endTurn(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const turnOrder = game.educatedMerchantState!.turnOrder;
        const currentTurnIndex = game.educatedMerchantState!.currentTurnIndex;
        if (turnOrder[currentTurnIndex] !== playerId && game.hostId !== playerId) { // Allow host to force end turn
             throw new Error("ليس دورك لإنهاء الجولة.");
        }

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (activePlayers.length <= 1) {
            // End the game
            const winner = activePlayers[0];
            transaction.update(gameRef, {
                gameState: 'final_results',
                gameResult: { winner: winner?.id || 'none', message: `اللاعب ${winner?.name} هو الناجي الأخير!` }
            });
            return;
        }

        let nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
        // Skip bankrupt players
        while(game.players.find(p => p.id === turnOrder[nextTurnIndex])?.status === 'bankrupt') {
            nextTurnIndex = (nextTurnIndex + 1) % turnOrder.length;
        }
        
        const newRound = nextTurnIndex < currentTurnIndex ? (game.round || 1) + 1 : game.round || 1;
        
        if (newRound > game.educatedMerchantState!.settings.maxRounds) {
             // End the game by rounds
             const winner = game.players.reduce((prev, current) => ((prev.money || 0) > (current.money || 0)) ? prev : current);
             transaction.update(gameRef, {
                gameState: 'final_results',
                gameResult: { winner: winner?.id || 'none', message: `انتهت الجولات! الفائز هو ${winner?.name} بأعلى رصيد.` }
            });
        } else {
             transaction.update(gameRef, {
                gameState: 'rolling',
                'educatedMerchantState.currentTurnIndex': nextTurnIndex,
                round: newRound
            });
        }
    });
}
