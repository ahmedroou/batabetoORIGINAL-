'use server';

/**
 * @fileoverview This file contains helper functions related to fetching questions.
 */

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import type { EducatedMerchantQuestion, TrapQuestion } from '@/types';
import { shuffle } from '../helpers';

type GameQuestionType = EducatedMerchantQuestion | TrapQuestion;

/**
 * Fetches a single random question for a given game type and category from Firestore.
 * This function uses a common pattern with a `randomKey` field to efficiently
 * fetch a random document without reading the entire collection.
 * 
 * Note: Your question collections ('educated_merchant_questions', 'trap_answer_questions')
 * must have a 'randomKey' field (a random number between 0 and 1) and a composite index
 * on `(category, randomKey)`.
 * 
 * @param gameType The type of game ('educated-merchant' or 'trap-answer').
 * @param category The category to fetch the question from.
 * @returns A promise that resolves to the question object or null if not found.
 */
export async function fetchRandomQuestionForCategory(
    gameType: 'educated-merchant' | 'trap-answer',
    category: string
): Promise<GameQuestionType | null> {
    const collectionName = gameType === 'educated-merchant' 
        ? 'educated_merchant_questions' 
        : 'trap_answer_questions';

    try {
        const questionsCol = collection(db, collectionName);
        const randomKey = Math.random();
        
        let q = query(questionsCol, where('category', '==', category), where('randomKey', '>=', randomKey), limit(1));
        let querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            q = query(questionsCol, where('category', '==', category), where('randomKey', '<', randomKey), limit(1));
            querySnapshot = await getDocs(q);
        }

        if (querySnapshot.empty) {
            console.warn(`No questions found for category: "${category}" in collection "${collectionName}".`);
            return null;
        }

        const questionDoc = querySnapshot.docs[0];
        const questionData = { id: questionDoc.id, ...questionDoc.data() } as GameQuestionType;

        // Shuffle options if it's an Educated Merchant question
        if (gameType === 'educated-merchant' && 'answer' in questionData) {
            const options = shuffle([...(questionData.dummyAnswers || []), questionData.answer]);
            questionData.options = options;
        }

        return questionData;
    } catch (e) {
        console.error(`Error fetching random question for category "${category}" from "${collectionName}":`, e);
        return null;
    }
}
