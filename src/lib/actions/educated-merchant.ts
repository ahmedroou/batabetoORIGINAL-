
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, collection, getDocs, query, updateDoc } from 'firebase/firestore';
import type { Game, Player, Property, EducatedMerchantQuestion } from '@/types';
import { shuffle } from './helpers';

const BOARD_SIZE = 28;
const STARTING_BALANCE = 1000;
const BASE_PROPERTY_PRICE = 100;
const MAX_PROPERTY_PRICE = 500;
const PRICE_INCREMENT = 25;
const PASS_START_BONUS = 200;

async function fetchAllQuestions(): Promise<EducatedMerchantQuestion[]> {
    const questionsCol = collection(db, "trap_answer_questions");
    const q = query(questionsCol);
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
        console.warn("No questions found in 'trap_answer_questions' collection. Educated Merchant may not work correctly.");
        return [];
    }
    
    return snapshot.docs.map(doc => {
        const data = doc.data();
        const correctAnswer = data.answer;
        const dummyAnswers = data.dummyAnswers || ['بديل ١', 'بديل ٢', 'بديل ٣'];
        const options = shuffle([correctAnswer, ...dummyAnswers.slice(0, 3)]);
        
        return {
            id: doc.id,
            question: data.question,
            options: options,
            correctAnswer: correctAnswer,
            category: data.category
        } as EducatedMerchantQuestion;
    });
}

function generateBoard(questionsByCategory: Record<string, EducatedMerchantQuestion[]>): Property[] {
    const board: Property[] = [];
    const categories = Object.keys(questionsByCategory);
    if(categories.length === 0) return [];
    
    const propertyPrices = Array.from({ length: (MAX_PROPERTY_PRICE - BASE_PROPERTY_PRICE) / PRICE_INCREMENT + 1 }, (_, i) => BASE_PROPERTY_PRICE + i * PRICE_INCREMENT);
    const shuffledPrices = shuffle(propertyPrices);

    for (let i = 0; i < BOARD_SIZE; i++) {
        if (i === 0) {
            board.push({ id: i, type: 'start', name: 'نقطة البداية', category: 'special', price: 0, rent: 0, ownerId: null });
        } else if (i % Math.floor(BOARD_SIZE / 4) === 0) {
            board.push({ id: i, type: 'chance', name: 'فرصة', category: 'special', price: 0, rent: 0, ownerId: null });
        } else {
             const category = categories[i % categories.length];
             const price = shuffledPrices[i % shuffledPrices.length] || BASE_PROPERTY_PRICE;
             board.push({ id: i, type: 'property', name: `عقار ${i}`, category, price, rent: Math.floor(price / 4), ownerId: null });
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

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return;
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const allQuestions = await fetchAllQuestions();
        const questionsByCategory = allQuestions.reduce((acc, q) => {
            if (!acc[q.category]) {
                acc[q.category] = [];
            }
            acc[q.category].push(q);
            return acc;
        }, {} as Record<string, EducatedMerchantQuestion[]>);
        
        const board = generateBoard(questionsByCategory);
        const turnOrder = shuffle(game.players.map(p => p.id));
        const initialBalances = game.players.reduce((acc, p) => ({ ...acc, [p.id]: STARTING_BALANCE }), {});

        transaction.update(gameRef, {
            gameState: 'rolling',
            'educatedMerchantState.board': board,
            'educatedMerchantState.turnOrder': turnOrder,
            'educatedMerchantState.currentTurnIndex': 0,
            'educatedMerchantState.questionsByCategory': questionsByCategory,
            playerScores: initialBalances,
            'players': game.players.map(p => ({ ...p, position: 0, bankruptAt: null })),
        });
    });
}

export async function rollDice(gameId: string, playerId: string): Promise<{ success: boolean; diceResult?: number; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    let diceResult = 0;
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            const es = game.educatedMerchantState;
            if (game.gameState !== 'rolling' || es?.turnOrder[es.currentTurnIndex] !== playerId) {
                throw new Error("ليس دورك لرمي النرد.");
            }

            diceResult = Math.floor(Math.random() * 5) + 1;
            
            const playerIndex = game.players.findIndex(p => p.id === playerId);
            if(playerIndex === -1) throw new Error("Player not found");
            
            const oldPosition = game.players[playerIndex].position;
            const newPosition = (oldPosition + diceResult) % BOARD_SIZE;

            const updatedPlayers = [...game.players];
            updatedPlayers[playerIndex].position = newPosition;
            
            let updatedBalances = { ...game.playerScores };
            if (newPosition < oldPosition) { // Passed start
                updatedBalances[playerId] = (updatedBalances[playerId] || 0) + PASS_START_BONUS;
            }

            transaction.update(gameRef, {
                players: updatedPlayers,
                playerScores: updatedBalances,
                'educatedMerchantState.lastDiceRoll': diceResult,
            });
        });
        
        await handlePropertyAction(gameId, playerId);

        return { success: true, diceResult };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function handlePropertyAction(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if(!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const player = game.players.find(p => p.id === playerId);
        const property = game.educatedMerchantState?.board.find(p => p.id === player?.position);

        if (!property || property.type !== 'property') {
            // Landed on Start or Chance, just end the turn for now
            await endTurn(gameId, playerId);
            return;
        }

        if (property.ownerId && property.ownerId !== playerId) {
            // Pay rent
            let playerBalance = game.playerScores?.[playerId] || 0;
            const rent = property.rent;

            if (playerBalance < rent) {
                // Bankrupt logic here in the future
                playerBalance = 0;
            } else {
                playerBalance -= rent;
            }
            
            transaction.update(gameRef, {
                [`playerScores.${playerId}`]: playerBalance,
                [`playerScores.${property.ownerId}`]: (game.playerScores?.[property.ownerId] || 0) + rent
            });
            
            await endTurn(gameId, playerId);
        } else {
            // Property is unowned or owned by the player, transition state
            transaction.update(gameRef, { gameState: 'property_action' });
        }
    });
}

export async function buyPropertyAttempt(gameId: string, playerId: string): Promise<{success: boolean, error?: string}> {
     const gameRef = doc(db, 'games', gameId);
     try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;
            const player = game.players.find(p => p.id === playerId);
            const property = game.educatedMerchantState?.board.find(p => p.id === player?.position);
            
            if (!property || property.ownerId) throw new Error("This property cannot be bought.");
            if ((game.playerScores?.[playerId] || 0) < property.price) throw new Error("You cannot afford this property.");
            
            const questionsForCategory = game.educatedMerchantState?.questionsByCategory?.[property.category];
            if (!questionsForCategory || questionsForCategory.length === 0) {
                 throw new Error("No questions available for this category.");
            }
            
            const randomQuestion = shuffle(questionsForCategory)[0];

            transaction.update(gameRef, {
                gameState: 'question',
                'educatedMerchantState.currentQuestion': randomQuestion
            });
        });
        return { success: true };
     } catch (error: any) {
        return { success: false, error: error.message };
     }
}

export async function answerQuestion(gameId: string, playerId: string, answer: string | null): Promise<{success: boolean, error?: string}> {
    const gameRef = doc(db, 'games', gameId);
    try {
         await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            const question = game.educatedMerchantState?.currentQuestion;
            if (!question) throw new Error("No active question.");
            
            const player = game.players.find(p => p.id === playerId);
            const property = game.educatedMerchantState?.board.find(p => p.id === player?.position);
            if(!property) throw new Error("Player not on a property.");

            const isCorrect = answer === question.correctAnswer;
            let updatedBalances = { ...game.playerScores };

            if (isCorrect) {
                updatedBalances[playerId] -= property.price;
                const propertyIndex = game.educatedMerchantState!.board.findIndex(p => p.id === property.id);
                transaction.update(gameRef, {
                    [`educatedMerchantState.board.${propertyIndex}.ownerId`]: playerId
                });
            } else {
                const refund = Math.floor(property.price / 4);
                updatedBalances[playerId] = (updatedBalances[playerId] || 0) + refund - property.price;
            }

            transaction.update(gameRef, {
                playerScores: updatedBalances,
                'educatedMerchantState.currentQuestion': null, // Clear question
            });
         });
         await endTurn(gameId, playerId);
         return { success: true };

    } catch (error: any) {
         return { success: false, error: error.message };
    }
}

export async function endTurn(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;
            const es = game.educatedMerchantState;

            if (es?.turnOrder[es.currentTurnIndex] !== playerId) {
                throw new Error("ليس دورك لإنهاء الدور.");
            }

            let nextIndex = (es.currentTurnIndex + 1) % es.turnOrder.length;
            let loopGuard = 0;
            while(game.players.find(p => p.id === es.turnOrder[nextIndex])?.status === 'bankrupt' && loopGuard < es.turnOrder.length) {
                nextIndex = (nextIndex + 1) % es.turnOrder.length;
                loopGuard++;
            }

            let nextGameState: Game['gameState'] = 'rolling';
            let newRound = game.round || 1;
            
            if(nextIndex < es.currentTurnIndex) {
                newRound++;
            }
            
            const maxRounds = es.settings?.maxRounds || 20;
            const nonBankruptPlayers = game.players.filter(p => p.status !== 'bankrupt');
            
            if (newRound > maxRounds || nonBankruptPlayers.length <= 1) {
                 nextGameState = 'final_results';
            }

            transaction.update(gameRef, {
                gameState: nextGameState,
                round: newRound,
                'educatedMerchantState.currentTurnIndex': nextIndex,
            });
        });
        return { success: true };
    } catch (error: any) {
         return { success: false, error: error.message };
    }
}
