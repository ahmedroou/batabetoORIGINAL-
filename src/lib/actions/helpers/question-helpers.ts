
'use server';

/**
 * @fileoverview Helper functions related to fetching questions (improved gpt5 version).
 */

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import type { EducatedMerchantQuestion, TrapQuestion, PrisonQuestion } from '@/types';
import { shuffle } from '../helpers';

// Keep the same union alias locally (no API change)
type GameQuestionType = EducatedMerchantQuestion | TrapQuestion | PrisonQuestion;

// ------------------------------------
// Internal utils (no external API change)
// ------------------------------------
const COLLECTIONS = {
  'educated-merchant': 'educated_merchant_questions',
  'trap-answer': 'trap_answer_questions',
  'prison': 'prison_questions',
} as const;

type GameType = keyof typeof COLLECTIONS;

const normalizeCategory = (category: string): string => (category ?? '').trim();

const isEducatedMerchant = (q: any): q is EducatedMerchantQuestion =>
  q && typeof q === 'object' && typeof (q as any).answer === 'string';

const buildOptions = (q: EducatedMerchantQuestion): string[] => {
  // Ensure the correct answer is included exactly once; dedupe dummy answers
  const set = new Set<string>([...(q.dummyAnswers ?? []), q.answer]);
  const arr = Array.from(set);
  return shuffle(arr);
};

// ------------------------------------
// Public API (kept same name and signature)
// ------------------------------------
/**
 * Fetches a single random question for a given game type and category from Firestore.
 * Uses a common "randomKey" pattern with ordered range queries for efficiency.
 *
 * Index requirements (Firestore composite indexes):
 *  - For each collection: composite index on (category ASC, randomKey ASC)
 *
 * @param gameType The type of game ('educated-merchant' or 'trap-answer').
 * @param category The category to fetch the question from.
 * @returns A promise that resolves to the question object or null if not found.
 */
export async function fetchRandomQuestionForCategory(
  gameType: 'educated-merchant' | 'trap-answer' | 'prison',
  category?: string
): Promise<GameQuestionType | null> {
  const collectionName = COLLECTIONS[gameType as GameType];
  if (!collectionName) {
    console.error(`Unsupported gameType: ${gameType}`);
    return null;
  }
  
  if (gameType !== 'prison' && (!category || !normalizeCategory(category))) {
    console.warn('fetchRandomQuestionForCategory: empty category string.');
    return null;
  }

  try {
    const questionsCol = collection(db, collectionName);
    const randomKey = Math.random();
    
    let baseQuery = query(questionsCol, where('randomKey', '>=', randomKey), orderBy('randomKey'), limit(1));
    if (category && gameType !== 'prison') {
        baseQuery = query(questionsCol, where('category', '==', normalizeCategory(category)), where('randomKey', '>=', randomKey), orderBy('randomKey'), limit(1));
    }
    
    let snap = await getDocs(baseQuery);

    if (snap.empty) {
        let fallbackQuery = query(questionsCol, where('randomKey', '<', randomKey), orderBy('randomKey', 'desc'), limit(1));
         if (category && gameType !== 'prison') {
            fallbackQuery = query(questionsCol, where('category', '==', normalizeCategory(category)), where('randomKey', '<', randomKey), orderBy('randomKey', 'desc'), limit(1));
        }
      snap = await getDocs(fallbackQuery);
    }

    if (snap.empty) {
      console.warn(
        `No questions found for category: "${category}" in collection "${collectionName}".`
      );
      return null;
    }

    const docSnap = snap.docs[0];
    const raw = { id: docSnap.id, ...docSnap.data() } as any;

    if (isEducatedMerchant(raw)) {
      const options = buildOptions(raw);
      const question: EducatedMerchantQuestion = {
        ...raw,
        options, // ensure UI consumers have shuffled options ready
      };
      return question as GameQuestionType;
    }

    // For TrapQuestion, PrisonQuestion (or any other), just return as-is
    return raw as GameQuestionType;
  } catch (e) {
    console.error(
      `Error fetching random question for category "${category}" from "${collectionName}":`,
      e
    );
    return null;
  }
}
