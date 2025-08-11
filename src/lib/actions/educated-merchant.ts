

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, collection, getDocs, query } from 'firebase/firestore';
import type { Game, Player, Property, EducatedMerchantQuestion } from '@/types';
import { shuffle } from './helpers';

const BOARD_SIZE = 28; // 8x8 board, corners are special, so 28 properties
const STARTING_BALANCE = 1000;
const BASE_PROPERTY_PRICE = 100;
const MAX_PROPERTY_PRICE = 500;
const PRICE_INCREMENT = 25;

async function fetchAllQuestions(): Promise<EducatedMerchantQuestion[]> {
    const questionsCol = collection(db, "trap_answer_questions");
    const q = query(questionsCol);
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
        console.warn("No questions found in 'trap_answer_questions' collection. Educated Merchant may not work correctly.");
        return [];
    }
    
    // Map Firestore docs to EducatedMerchantQuestion, creating dummy options for now
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
        // Simple logic for corners/special tiles
        if (i === 0) {
            board.push({ id: i, type: 'start', name: 'نقطة البداية', category: 'special', price: 0, rent: 0, ownerId: null });
        } else if (i === 7 || i === 14 || i === 21) {
            board.push({ id: i, type: 'chance', name: 'فرصة', category: 'special', price: 0, rent: 0, ownerId: null });
        } else {
             const category = categories[i % categories.length];
             const price = shuffledPrices[i % shuffledPrices.length] || BASE_PROPERTY_PRICE;
             board.push({ id: i, type: 'property', name: `عقار ${i}`, category, price, rent: price / 4, ownerId: null });
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
            playerScores: initialBalances, // Use playerScores for balance
            'players': game.players.map(p => ({ ...p, position: 0, balance: STARTING_BALANCE, bankruptAt: null })),
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
            
            const newPosition = (game.players[playerIndex].position + diceResult) % BOARD_SIZE;

            const updatedPlayers = [...game.players];
            updatedPlayers[playerIndex].position = newPosition;
            
            transaction.update(gameRef, {
                players: updatedPlayers,
                gameState: 'property_action',
                'educatedMerchantState.lastDiceRoll': diceResult,
            });
        });
        return { success: true, diceResult };
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

            // Find next non-bankrupt player
            let nextIndex = (es.currentTurnIndex + 1) % es.turnOrder.length;
            let loopGuard = 0;
            while(game.players.find(p => p.id === es.turnOrder[nextIndex])?.status === 'bankrupt' && loopGuard < es.turnOrder.length) {
                nextIndex = (nextIndex + 1) % es.turnOrder.length;
                loopGuard++;
            }

            let nextGameState: Game['gameState'] = 'rolling';
            let newRound = game.round || 1;
            
            // If we've looped back to the start player, it's a new round.
            if(nextIndex < es.currentTurnIndex) {
                newRound++;
            }
            
            const maxRounds = es.settings?.maxRounds || 20;
            const nonBankruptPlayers = game.players.filter(p => p.status !== 'bankrupt');
            
            if (newRound > maxRounds || nonBankruptPlayers.length <= 1) {
                 nextGameState = 'final_results';
                 // TODO: Set game result
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
