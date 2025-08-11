
'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  collection,
  getDocs,
  query,
  arrayUnion,
  increment,
  deleteField,
  where,
  limit,
  getDoc,
} from 'firebase/firestore';
import type {
  Game,
  Player,
  Property,
  EducatedMerchantQuestion,
  UserProfile,
} from '@/types';
import { shuffle } from './helpers';

const BOARD_SIZE = 28;
const STARTING_BALANCE = 1000;
const BASE_PROPERTY_PRICE = 100;
const MAX_PROPERTY_PRICE = 500;
const PRICE_INCREMENT = 25;
const PASS_START_BONUS = 200;
const QUESTION_TIME_SECONDS = 25;

async function fetchQuestionsForBoard(categories: string[]): Promise<Record<string, EducatedMerchantQuestion[]>> {
    const questionsByCategory: Record<string, EducatedMerchantQuestion[]> = {};
    const questionsCol = collection(db, 'trap_answer_questions');

    for (const category of categories) {
        const q = query(questionsCol, where("category", "==", category));
        const querySnapshot = await getDocs(q);
        const questions = querySnapshot.docs.map(doc => {
            const data = doc.data();
            const correctAnswer = data.answer as string;
            // Ensure dummyAnswers is an array of strings, provide fallback if missing/invalid
            const dummyAnswers = Array.isArray(data.dummyAnswers) && data.dummyAnswers.length > 0 
                ? data.dummyAnswers 
                : ['بديل ١', 'بديل ٢', 'بديل ٣']; 

            const options = shuffle([correctAnswer, ...dummyAnswers.slice(0, 3)]);
            return {
                id: doc.id,
                question: data.question,
                options,
                correctAnswer,
                category: data.category,
            } as EducatedMerchantQuestion;
        });
        questionsByCategory[category] = questions;
    }
    return questionsByCategory;
}

function generateBoard(categories: string[]): Property[] {
    const board: Property[] = [];
    if (categories.length === 0) return [];

    const priceCount = Math.floor((MAX_PROPERTY_PRICE - BASE_PROPERTY_PRICE) / PRICE_INCREMENT) + 1;
    const propertyPrices = Array.from({ length: priceCount }, (_, i) => BASE_PROPERTY_PRICE + i * PRICE_INCREMENT);
    const shuffledPrices = shuffle(propertyPrices);

    for (let i = 0; i < BOARD_SIZE; i++) {
        if (i === 0) {
            board.push({ id: i, type: 'start', name: 'نقطة البداية', category: 'special', price: 0, rent: 0, ownerId: null });
        } else if (i === 7) {
             board.push({ id: i, type: 'fine', name: 'غرامة', category: 'special', price: 0, rent: 0, ownerId: null, fineAmount: 50});
        } else if (i === 21) {
             board.push({ id: i, type: 'fine', name: 'غرامة كبيرة', category: 'special', price: 0, rent: 0, ownerId: null, fineAmount: 100});
        } else {
            const category = categories[i % categories.length] || 'عام';
            const price = shuffledPrices[i % shuffledPrices.length] || BASE_PROPERTY_PRICE;
            board.push({
                id: i,
                type: 'property',
                name: `عقار ${i}`,
                category,
                price: price,
                rent: Math.floor(price * 0.25),
                ownerId: null,
            });
        }
    }
    return board;
}

export async function startGame(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists()) throw new Error('Game not found.');
        const game = gameSnap.data() as Game;

        if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
        if (game.gameState !== 'lobby') return;
        if (!Array.isArray(game.players) || game.players.length < 2) throw new Error('The game requires at least 2 players.');
        
        const categoriesDoc = await getDoc(doc(db, 'game_settings', 'educated_merchant_categories'));
        const availableCategories = categoriesDoc.exists() ? categoriesDoc.data().list : [];
        if(availableCategories.length === 0) throw new Error('لا توجد فئات أسئلة متاحة لهذه اللعبة.');
        
        const board = generateBoard(availableCategories);
        const questionsByCategory = await fetchQuestionsForBoard(availableCategories);
        const turnOrder = shuffle(game.players.map(p => p.id));
        const initialBalances = game.players.reduce((acc: Record<string, number>, p) => {
            acc[p.id] = STARTING_BALANCE;
            return acc;
        }, {});
        
        const palette = ['#8B5CF6','#06B6D4','#F97316','#10B981','#EF4444','#F59E0B'];
        const playersWithColors = game.players.map((p, i) => ({ ...p, position: 0, bankruptAt: null, status: 'alive', color: p.color || palette[i % palette.length] }));


        transaction.update(gameRef, {
            gameState: 'rolling',
            'educatedMerchantState.board': board,
            'educatedMerchantState.questionsByCategory': questionsByCategory,
            'educatedMerchantState.turnOrder': turnOrder,
            'educatedMerchantState.currentTurnIndex': 0,
            'educatedMerchantState.activityLog': ['بدأت اللعبة!'],
            playerScores: initialBalances,
            players: playersWithColors,
            round: 1,
        });
    });
}
