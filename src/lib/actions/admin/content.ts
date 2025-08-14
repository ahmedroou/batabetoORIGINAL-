
'use server';

/**
 * @fileoverview Admin actions related to game content management (questions, words).
 */

import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    getDocs,
    writeBatch,
    query,
    where,
    getCountFromServer,
    serverTimestamp,
} from 'firebase/firestore';
import type { TrapQuestion } from '@/types';
import { isFirebaseError, getSimilaritySignature } from '../helpers';

const BATCH_LIMIT_SAFE = 450;

const normalize = (s: any) => (typeof s === 'string' ? s : String(s ?? '')).trim().replace(/\s+/g, ' ');
const stringNonEmpty = (s: any) => typeof s === 'string' && normalize(s).length > 0;

function chunkArray<T>(arr: T[], size = BATCH_LIMIT_SAFE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function commitChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  if (ops.length === 0) return;
  const batches = chunkArray(ops, BATCH_LIMIT_SAFE).map((opsChunk) => {
    const b = writeBatch(db);
    opsChunk.forEach((op) => op(b));
    return b.commit();
  });
  await Promise.all(batches);
}

function dedupeLocal<T>(arr: T[], keyer: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyer(item);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

type QAJson = { question: string; answer: string; dummyAnswers?: string[] };
type PrisonJson = { text: string };

export async function uploadEducatedMerchantQuestionsFromJson(questions: QAJson[], category: string) {
    if (!Array.isArray(questions) || questions.length === 0) return { error: 'ملف JSON غير صالح أو فارغ.' };
    if (!stringNonEmpty(category)) return { error: 'يجب تحديد قسم صالح.' };

    try {
        const questionsCol = collection(db, 'educated_merchant_questions');
        let valid = 0;
        const cleaned = dedupeLocal(questions.filter(q => stringNonEmpty(q.question) && stringNonEmpty(q.answer)), q => getSimilaritySignature(normalize(q.question)));
        const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

        for (const q of cleaned) {
            const docRef = doc(questionsCol);
            const hasDummy = Array.isArray(q.dummyAnswers) && q.dummyAnswers.every(d => stringNonEmpty(d));
            const data: Partial<TrapQuestion> & { similaritySignature: string } = {
                question: normalize(q.question),
                answer: normalize(q.answer),
                category: normalize(category),
                randomKey: Math.random(),
                similaritySignature: getSimilaritySignature(normalize(q.question)),
                ...(hasDummy && { dummyAnswers: q.dummyAnswers!.map(d => normalize(d)) }),
                createdAt: serverTimestamp(),
            };
            ops.push(b => b.set(docRef, data));
            valid++;
        }

        await commitChunks(ops);
        if (valid === 0) return { error: 'لم يتم العثور على أسئلة صالحة.' };
        return { success: true, count: valid };
    } catch (e) {
        console.error("Error uploading educated merchant questions:", e);
        return { error: 'حدث خطأ أثناء رفع أسئلة التاجر المتعلم.' };
    }
}

export async function uploadTrapAnswerQuestionsFromJson(questions: QAJson[], category: string) {
    if (!Array.isArray(questions) || questions.length === 0) return { error: 'ملف JSON غير صالح أو فارغ.' };
    if (!stringNonEmpty(category)) return { error: 'يجب تحديد قسم صالح.' };

    try {
        const questionsCol = collection(db, 'trap_answer_questions');
        let valid = 0;
        const cleaned = dedupeLocal(questions.filter(q => stringNonEmpty(q.question) && stringNonEmpty(q.answer)), q => getSimilaritySignature(normalize(q.question)));
        const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

        for (const q of cleaned) {
            const docRef = doc(questionsCol);
            const hasDummy = Array.isArray(q.dummyAnswers) && q.dummyAnswers.every(d => stringNonEmpty(d));
            const data: Partial<TrapQuestion> & { similaritySignature: string } = {
                question: normalize(q.question),
                answer: normalize(q.answer),
                category: normalize(category),
                randomKey: Math.random(),
                similaritySignature: getSimilaritySignature(normalize(q.question)),
                ...(hasDummy && { dummyAnswers: q.dummyAnswers!.map(d => normalize(d)) }),
                createdAt: serverTimestamp(),
            };
            ops.push(b => b.set(docRef, data));
            valid++;
        }

        await commitChunks(ops);
        if (valid === 0) return { error: 'لم يتم العثور على أسئلة صالحة.' };
        return { success: true, count: valid };
    } catch (e) {
        console.error("Error uploading trap answer questions:", e);
        return { error: 'حدث خطأ أثناء رفع أسئلة الجواب المفخخ.' };
    }
}

export async function uploadPrisonQuestionsFromJson(questions: PrisonJson[]) {
    // This is a new implementation based on the structure of other upload functions.
    if (!Array.isArray(questions) || questions.length === 0) return { error: 'ملف JSON غير صالح أو فارغ.' };
    
    try {
        const questionsCol = collection(db, 'prison_questions');
        let valid = 0;
        const cleaned = dedupeLocal(questions.filter(q => stringNonEmpty(q.text)), q => getSimilaritySignature(normalize(q.text)));
        const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
        for (const q of cleaned) {
            const docRef = doc(questionsCol);
            ops.push(b => b.set(docRef, { 
                text: normalize(q.text), 
                similaritySignature: getSimilaritySignature(normalize(q.text)),
                createdAt: serverTimestamp(),
            }));
            valid++;
        }
        await commitChunks(ops);
        if (valid === 0) return { error: 'لم يتم العثور على أسئلة صالحة في الملف.' };
        return { success: true, count: valid };
    } catch (e) {
        console.error('Error uploading prison questions:', e);
        return { error: 'حدث خطأ أثناء رفع أسئلة السجن.' };
    }
}


export async function uploadWordWarWordsFromJson(words: string[]) {
    if (!Array.isArray(words) || words.length === 0) return { error: 'ملف JSON غير صالح أو فارغ.' };
    try {
        const wordsCol = collection(db, 'word_war_words');
        const unique = Array.from(new Set(words.map(w => normalize(w)).filter(Boolean)));
        if (unique.length === 0) return { error: 'لا توجد كلمات صالحة.' };

        const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
        for (const word of unique) {
            const ref = doc(wordsCol);
            ops.push(b => b.set(ref, { text: word, createdAt: serverTimestamp() }));
        }
        await commitChunks(ops);
        return { success: true, count: unique.length };
    } catch (e) {
        console.error("Error uploading word war words:", e);
        return { error: 'حدث خطأ أثناء رفع كلمات حرب الكلمات.' };
    }
}

// ... rest of the content-related functions ...
type CountCriteria = {
  game: 'trap-answer' | 'prison' | 'word_war' | 'educated-merchant';
  category?: string;
  searchTerm?: string;
  answerSearchTerm?: string;
  all?: boolean;
};

export async function countQuestions(criteria: CountCriteria) {
  const { game, category, searchTerm, answerSearchTerm, all } = criteria;
  
  const getCollectionInfo = () => {
    switch (game) {
      case 'trap-answer': return { name: 'trap_answer_questions', field: 'question' as const };
      case 'educated-merchant': return { name: 'educated_merchant_questions', field: 'question' as const };
      case 'prison': return { name: 'prison_questions', field: 'text' as const };
      case 'word_war': return { name: 'word_war_words', field: 'text' as const };
      default: throw new Error('نوع لعبة غير مدعوم.');
    }
  };

  try {
    const { name, field } = getCollectionInfo();
    const itemsCol = collection(db, name);

    let q = query(itemsCol);
    if (category) {
      q = query(q, where('category', '==', normalize(category)));
    }
    if (searchTerm) {
      const s = normalize(searchTerm);
      q = query(q, where(field, '>=', s), where(field, '<=', s + '\uf8ff'));
    }
    if (answerSearchTerm && (game === 'trap-answer' || game === 'educated-merchant')) {
      const s = normalize(answerSearchTerm);
      q = query(q, where('answer', '>=', s), where('answer', '<=', s + '\uf8ff'));
    }

    const snapshot = await getCountFromServer(q);
    return { success: true, count: snapshot.data().count };
  } catch (error) {
    console.error('Error counting items:', error);
    return { success: false, error: 'حدث خطأ أثناء عد العناصر.' };
  }
}

type DeleteCriteria = {
  game: 'trap-answer' | 'prison' | 'word_war' | 'educated-merchant';
  category?: string;
  searchTerm?: string;
  answerSearchTerm?: string;
  all?: boolean;
};

export async function deleteQuestions(criteria: DeleteCriteria) {
    const { game, category, searchTerm, answerSearchTerm, all } = criteria;
    
    const getCollectionInfo = () => {
        switch (game) {
          case 'trap-answer': return { name: 'trap_answer_questions', field: 'question' as const };
          case 'educated-merchant': return { name: 'educated_merchant_questions', field: 'question' as const };
          case 'prison': return { name: 'prison_questions', field: 'text' as const };
          case 'word_war': return { name: 'word_war_words', field: 'text' as const };
          default: throw new Error('نوع لعبة غير مدعوم.');
        }
    };
    
    try {
        const { name, field } = getCollectionInfo();
        const itemsCol = collection(db, name);
        let q;

        if (all) {
            q = query(itemsCol);
        } else if (category) {
            q = query(itemsCol, where('category', '==', normalize(category)));
        } else if (searchTerm) {
            const s = normalize(searchTerm);
            q = query(itemsCol, where(field, '>=', s), where(field, '<=', s + '\uf8ff'));
        } else if (answerSearchTerm && (game === 'trap-answer' || game === 'educated-merchant')) {
            const s = normalize(answerSearchTerm);
            q = query(itemsCol, where('answer', '>=', s), where('answer', '<=', s + '\uf8ff'));
        } else {
             return { error: 'معايير الحذف غير صالحة.' };
        }

        const snapshot = await getDocs(q);
        if (snapshot.empty) return { success: true, count: 0, message: 'لا عناصر مطابقة.' };
        
        let deleted = 0;
        const chunks = chunkArray(snapshot.docs);
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            deleted += chunk.length;
        }
        return { success: true, count: deleted };

    } catch (error) {
        console.error("Error deleting questions:", error);
        return { error: 'فشل حذف العناصر.' };
    }
}

    