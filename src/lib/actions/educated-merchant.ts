

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
    arrayUnion,
    limit,
    setDoc,
    updateDoc
} from 'firebase/firestore';
import type { Game, Player, Property, EducatedMerchantQuestion, UserProfile } from '@/types';
import { shuffle } from './helpers';
import { PROPERTY_NAMES } from '@/data/properties';
import { getEducatedMerchantCategories } from './admin';
import { updateLeagueScoresForGameEnd } from './user';

const BOARD_SIZE = 28;
const START_MONEY = 1500;
const PASS_GO_REWARD = 200;
const QUESTION_TIME_SECONDS = 25;

async function generateBoard(categories: string[]): Promise<Property[]> {
    const board: Property[] = new Array(BOARD_SIZE);

    board[0] = { id: 0, type: 'start', name: 'نقطة البداية', category: '', price: 0, rent: 0, ownerId: null };

    const finePositions = new Set<number>();
    while(finePositions.size < 3) {
        const pos = Math.floor(Math.random() * (BOARD_SIZE - 2)) + 1; // Avoid position 0 and ensure it's not the last tile
        finePositions.add(pos);
    }
    
    let fineAmount = 100;
    finePositions.forEach(pos => {
        board[pos] = { id: pos, type: 'fine', name: 'غرامة', category: '', price: 0, rent: 0, ownerId: null, fineAmount: fineAmount };
        fineAmount += 50;
    });

    const availablePropertyNames = shuffle([...PROPERTY_NAMES]);

    for (let i = 1; i < BOARD_SIZE; i++) {
        if (!board[i]) {
            const name = availablePropertyNames.pop() || `عقار ${i}`;
            const price = (Math.floor(Math.random() * ( (500 - 100) / 10 + 1)) + (100 / 10) ) * 10;
            const category = categories[Math.floor(Math.random() * categories.length)];
            board[i] = {
                id: i,
                type: 'property',
                name: name,
                category: category,
                price: price,
                rent: Math.round(price / 4),
                ownerId: null,
            };
        }
    }
    
    return board;
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
        
        const colors = shuffle(['#F44336', '#2196F3', '#4CAF50', '#FFC107', '#9C27B0', '#009688', '#E91E63', '#607D8B']);

        const updatedPlayers = game.players.map((p, index) => ({
            ...p,
            money: START_MONEY,
            position: 0,
            status: 'alive' as const,
            color: colors[index % colors.length]
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
        let activityMessage = `${updatedPlayers[playerIndex].name} رمى ${diceRoll} وانتقل إلى "${game.educatedMerchantState!.board[newPosition].name}".`;

        if (newPosition < oldPosition) { 
            moneyUpdate = PASS_GO_REWARD;
            updatedPlayers[playerIndex].money! += moneyUpdate;
            activityMessage += ` وحصل على ${PASS_GO_REWARD} دينار للمرور بنقطة البداية.`;
        }
        
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
        let updates: any = { gameState: 'turn_end' };

        if (property.type === 'property') {
            if (!property.ownerId) { 
                updates.gameState = 'property_action';
            } else if (property.ownerId !== playerId) {
                const owner = game.players.find(p => p.id === property.ownerId);
                if (owner) {
                    const rent = property.rent;
                    const payerIndex = game.players.findIndex(p => p.id === playerId);
                    const ownerIndex = game.players.findIndex(p => p.id === property.ownerId);
                    
                    const updatedPlayers = [...game.players];
                    
                    if ((updatedPlayers[payerIndex].money || 0) < rent) {
                        updatedPlayers[ownerIndex].money! += updatedPlayers[payerIndex].money || 0;
                        updatedPlayers[payerIndex].money = 0;
                        updatedPlayers[payerIndex].status = 'bankrupt';
                        updatedPlayers[payerIndex].bankruptAt = Timestamp.now();
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
             if ((updatedPlayers[playerIndex].money || 0) < fine) {
                updatedPlayers[playerIndex].money = 0;
                updatedPlayers[playerIndex].status = 'bankrupt';
                updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
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
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const player = game.players.find(p => p.id === playerId);
        if (!player) return;

        const property = game.educatedMerchantState!.board[player.position];
        if (property.ownerId || (player.money || 0) < property.price) {
            throw new Error("لا يمكنك شراء هذا العقار.");
        }

        const questionsCol = collection(db, "trap_answer_questions");
        const q = query(questionsCol, where("category", "==", property.category), limit(1));
        let questionSnapshot = await getDocs(q);

        if (questionSnapshot.empty) {
            const randomKeyQuery = query(questionsCol, where("category", "==", property.category), where("randomKey", ">=", Math.random()), limit(1));
            questionSnapshot = await getDocs(randomKeyQuery);
            if(questionSnapshot.empty) {
                 const wrapAroundQuery = query(questionsCol, where("category", "==", property.category), limit(1));
                 questionSnapshot = await getDocs(wrapAroundQuery);
                 if(questionSnapshot.empty) throw new Error(`لا توجد أسئلة متاحة في قسم "${property.category}".`);
            }
        }
        
        const questionDoc = questionSnapshot.docs[0];
        const questionData = { id: questionDoc.id, ...questionDoc.data() } as EducatedMerchantQuestion;
        
        const options = shuffle([...(questionData.dummyAnswers || []), questionData.answer]);
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
        const isCorrect = answer === question.answer;
        const propertyIndex = game.educatedMerchantState!.board.findIndex(p => p.id === pendingPurchase.propertyId);
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        
        const updatedBoard = [...game.educatedMerchantState!.board];
        const updatedPlayers = [...game.players];
        let activityMessage = '';

        if (isCorrect) {
            updatedBoard[propertyIndex].ownerId = playerId;
            updatedBoard[propertyIndex].color = updatedPlayers[playerIndex].color;
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
            'educatedMerchantState.newlyBoughtPropertyId': isCorrect ? pendingPurchase.propertyId : deleteField(),
            gameState: 'turn_end'
        });
    });
}

export async function handleTimeout(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.gameState === 'question' && game.educatedMerchantState?.pendingPurchase?.playerId === playerId) {
             const pendingPurchase = game.educatedMerchantState!.pendingPurchase!;
             const playerIndex = game.players.findIndex(p => p.id === playerId);
             const updatedPlayers = [...game.players];
             const refund = Math.round(pendingPurchase.price / 4);
             updatedPlayers[playerIndex].money! += refund;
             const activityMessage = `${updatedPlayers[playerIndex].name} لم يجب في الوقت واسترد ${refund} دينار.`;

             transaction.update(gameRef, {
                players: updatedPlayers,
                'educatedMerchantState.pendingPurchase': deleteField(),
                'educatedMerchantState.currentQuestion': deleteField(),
                'educatedMerchantState.timerEndsAt': deleteField(),
                'educatedMerchantState.activityLog': arrayUnion({ message: activityMessage, timestamp: new Date() }),
                gameState: 'turn_end'
             });
        }
     });
}


export async function endTurn(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const turnOrder = game.educatedMerchantState!.turnOrder;
        const currentTurnIndex = game.educatedMerchantState!.currentTurnIndex;
        if (turnOrder[currentTurnIndex] !== playerId && game.hostId !== playerId) {
             throw new Error("ليس دورك لإنهاء الجولة.");
        }
        
        const updatedBoard = game.educatedMerchantState!.board.map(prop => {
            const owner = game.players.find(p => p.id === prop.ownerId);
            if (owner && owner.status === 'bankrupt') {
                return { ...prop, ownerId: null, color: undefined };
            }
            return prop;
        });
        
        const updatedPlayers = game.players.map(p => {
             if(p.status === 'bankrupt' && p.money! > 0) {
                 return {...p, money: 0};
             }
             return p;
        });

        const activePlayers = updatedPlayers.filter(p => p.status === 'alive');
        if (activePlayers.length <= 1) {
            const winner = activePlayers[0];
            const finalGameData = { ...game, players: updatedPlayers, gameState: 'final_results' as const, gameResult: { winner: winner?.id || 'none', message: `اللاعب ${winner?.name || ''} هو الناجي الأخير!` } };
            gameDataForLeagueUpdate = finalGameData;
            transaction.update(gameRef, finalGameData);
            return;
        }

        let nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
        let loopCount = 0;
        while(updatedPlayers.find(p => p.id === turnOrder[nextTurnIndex])?.status === 'bankrupt' && loopCount < turnOrder.length) {
            nextTurnIndex = (nextTurnIndex + 1) % turnOrder.length;
            loopCount++;
        }
        
        const newRound = nextTurnIndex < currentTurnIndex ? (game.round || 1) + 1 : game.round || 1;
        
        const maxRounds = game.educatedMerchantState?.settings?.maxRounds || 20;
        if (newRound > maxRounds) {
            const winner = updatedPlayers.filter(p=>p.status !== 'bankrupt').reduce((prev, current) => ((prev.money || 0) > (current.money || 0)) ? prev : current);
            const finalGameData = { ...game, players: updatedPlayers, gameState: 'final_results' as const, gameResult: { winner: winner?.id || 'none', message: `انتهت الجولات! الفائز هو ${winner?.name || ''} بأعلى رصيد.` } };
            gameDataForLeagueUpdate = finalGameData;
            transaction.update(gameRef, finalGameData);
        } else {
             transaction.update(gameRef, {
                gameState: 'rolling',
                'educatedMerchantState.board': updatedBoard,
                'educatedMerchantState.currentTurnIndex': nextTurnIndex,
                'educatedMerchantState.lastDiceRoll': deleteField(),
                'educatedMerchantState.newlyBoughtPropertyId': deleteField(),
                round: newRound,
                players: updatedPlayers,
            });
        }
    });

     if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}
