

'use server';

/**
 * @fileoverview Admin-only actions for managing game content.
 */

import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    getDocs,
    writeBatch,
    query,
    where,
    deleteField,
    arrayUnion,
    arrayRemove,
    orderBy,
    limit,
    runTransaction,
    Timestamp,
    addDoc,
    serverTimestamp,
    getCountFromServer,
    collectionGroup,
    aggregate,
    sum,
    count,
} from 'firebase/firestore';
import { isFirebaseError,  getSimilaritySignature } from './helpers';
import type { UserProfile, AvatarPrice, SocialRank, PrisonQuestion, Game, TrapQuestion, Mail, PermissionId, GameKing, Decree } from '@/types';
import { DEFAULT_TRAP_ANSWER_CATEGORIES, DEFAULT_EDUCATED_MERCHANT_CATEGORIES, DEFAULT_SOCIAL_RANKS, GAME_TYPE_NAMES } from '@/types';
import { PUNISHMENT_AVATAR_IDS } from '@/data/punishment-avatars';
import { generateGeniusChallenge as generateGeniusChallengeFlow } from '@/ai/flows/generate-genius-challenge';
import type { GenerateGeniusChallengeInput, GenerateGeniusChallengeOutput } from '@/ai/flows/generate-genius-challenge';

// Import from the central user actions index
import { 
    giveReward, 
    applyPunishment, 
    getTopUsers as queryTopUsers,
    getRanks as queryRanks,
    getUsersByRank as queryUsersByRank,
    getTopPunisher as queryTopPunisher
} from './user';


// Server-side user search for admin actions
export async function adminSearchUsers(searchTerm: string): Promise<UserProfile[]> {
  if (!searchTerm.trim()) {
    return [];
  }
  
  const term = searchTerm.toLowerCase();
  const usersRef = collection(db, 'users');

  const nameQuery = query(usersRef, where('name', '>=', term), where('name', '<=', term + '\uf8ff'));
  const emailQuery = query(usersRef, where('email', '>=', term), where('email', '<=', term + '\uf8ff'));

  const [nameSnapshot, emailSnapshot] = await Promise.all([getDocs(nameQuery), getDocs(emailQuery)]);
    
  const usersMap = new Map<string, UserProfile>();
  const processSnapshot = (snapshot: any) => {
    snapshot.docs.forEach((doc: any) => {
      if (!usersMap.has(doc.id)) {
        usersMap.set(doc.id, { uid: doc.id, ...doc.data() } as UserProfile);
      }
    });
  }

  processSnapshot(nameSnapshot);
  processSnapshot(emailSnapshot);

  return Array.from(usersMap.values());
}


export async function adminSendMail(recipientIds: string[], subject: string, body: string, coins: number): Promise<{ success: boolean; error?: string }> {
  if (!recipientIds || recipientIds.length === 0 || !subject.trim() || !body.trim()) {
    return { success: false, error: "المعلومات غير كافية لإرسال الرسالة." };
  }

  try {
    const senderName = 'Admin';
    const batch = writeBatch(db);
    
    recipientIds.forEach(recipientId => {
        const mailRef = doc(collection(db, `users/${recipientId}/mail`));
        const mailData: Omit<Mail, 'id'> = {
            senderName,
            subject,
            body,
            isRead: false,
            createdAt: serverTimestamp() as any, // Placeholder for server
            expiresAt: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000).toDate(),
            coins: coins > 0 ? coins : undefined,
            coinsClaimed: coins > 0 ? false : undefined,
        };
        batch.set(mailRef, mailData);
    });
    
    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error("Error sending mail:", error);
    return { success: false, error: error.message || "فشل إرسال الرسالة." };
  }
};

export async function uploadEducatedMerchantQuestionsFromJson(questions: { question: string, answer: string, dummyAnswers?: string[] }[], category: string) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }
    if (!category || typeof category !== 'string' || category.trim() === '') {
        return { error: 'يجب تحديد قسم صالح.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'educated_merchant_questions');
        let validQuestionsCount = 0;

        questions.forEach(q => {
            if (q && typeof q.question === 'string' && q.question.trim() !== '' && 
                typeof q.answer === 'string' && q.answer.trim() !== '') {
                
                const hasDummyAnswers = Array.isArray(q.dummyAnswers) && q.dummyAnswers.every(da => typeof da === 'string' && da.trim() !== '');

                const docRef = doc(questionsCol);
                const questionData: Partial<TrapQuestion> = {
                    question: q.question.trim(),
                    answer: q.answer.trim(),
                    category: category.trim(),
                    randomKey: Math.random(),
                    similaritySignature: getSimilaritySignature(q.question),
                    ...(hasDummyAnswers && { dummyAnswers: q.dummyAnswers!.map(da => da.trim()) }),
                };
                
                batch.set(docRef, questionData);
                validQuestionsCount++;
            }
        });

        if (validQuestionsCount === 0) {
            return { error: 'لم يتم العثور على أسئلة صالحة في الملف. تأكد من أن كل سؤال يحتوي على `question` و `answer`.' };
        }

        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading educated merchant questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة التاجر المتعلم.' };
    }
};

export async function uploadTrapAnswerQuestionsFromJson(questions: { question: string, answer: string, dummyAnswers?: string[] }[], category: string) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }
    if (!category || typeof category !== 'string' || category.trim() === '') {
        return { error: 'يجب تحديد قسم صالح.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'trap_answer_questions');
        let validQuestionsCount = 0;

        questions.forEach(q => {
            if (q && typeof q.question === 'string' && q.question.trim() !== '' && 
                typeof q.answer === 'string' && q.answer.trim() !== '') {
                
                const hasDummyAnswers = Array.isArray(q.dummyAnswers) && q.dummyAnswers.every(da => typeof da === 'string' && da.trim() !== '');

                const docRef = doc(questionsCol);
                const questionData: Partial<TrapQuestion> & {similaritySignature: string} = {
                    question: q.question.trim(),
                    answer: q.answer.trim(),
                    category: category.trim(),
                    randomKey: Math.random(),
                    similaritySignature: getSimilaritySignature(q.question),
                    ...(hasDummyAnswers && { dummyAnswers: q.dummyAnswers!.map(da => da.trim()) }),
                };
                
                batch.set(docRef, questionData);
                validQuestionsCount++;
            }
        });

        if (validQuestionsCount === 0) {
            return { error: 'لم يتم العثور على أسئلة صالحة في الملف. تأكد من أن كل سؤال يحتوي على `question` و `answer`.' };
        }

        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading trap answer questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة الجواب المفخخ.' };
    }
};


export async function uploadPrisonQuestionsFromJson(questions: { text: string }[]) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'prison_questions');
        let validQuestionsCount = 0;

        questions.forEach(q => {
            if (q && typeof q.text === 'string' && q.text.trim() !== '') {
                const docRef = doc(questionsCol);
                batch.set(docRef, { 
                    text: q.text.trim(),
                    similaritySignature: getSimilaritySignature(q.text),
                });
                validQuestionsCount++;
            }
        });

        if (validQuestionsCount === 0) {
            return { error: 'لم يتم العثور على أسئلة صالحة في الملف.' };
        }

        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading prison questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة السجن.' };
    }
};

export async function uploadWordWarWordsFromJson(words: string[]) {
    if (!words || !Array.isArray(words) || words.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }

    try {
        const batch = writeBatch(db);
        const wordsCol = collection(db, 'word_war_words');
        let validWordsCount = 0;

        const uniqueWords = Array.from(new Set(words.map(w => w.trim()).filter(Boolean)));

        uniqueWords.forEach(word => {
            const docRef = doc(wordsCol);
            batch.set(docRef, { 
                text: word,
            });
            validWordsCount++;
        });

        if (validWordsCount === 0) {
            return { error: 'لم يتم العثور على كلمات صالحة في الملف.' };
        }

        await batch.commit();
        return { success: true, count: validWordsCount };
    } catch (error) {
        console.error("Error uploading word war words:", error);
        return { error: 'حدث خطأ أثناء رفع كلمات حرب الكلمات.' };
    }
};

export async function countQuestions(criteria: { game: 'trap-answer' | 'prison' | 'word_war' | 'educated-merchant' , category?: string; searchTerm?: string; answerSearchTerm?: string; all?: boolean, duplicates?: { threshold: number } | 'word_war_duplicates' }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all && !criteria.duplicates) {
        return { success: false, error: 'يجب تحديد معيار للعد.' };
    }

    let collectionName: string;
    switch(criteria.game) {
        case 'trap-answer': collectionName = 'trap_answer_questions'; break;
        case 'educated-merchant': collectionName = 'educated_merchant_questions'; break;
        case 'prison': collectionName = 'prison_questions'; break;
        case 'word_war': collectionName = 'word_war_words'; break;
        default: return { success: false, error: "نوع لعبة غير مدعوم." };
    }

    try {
        const itemsCol = collection(db, collectionName);
        let q;
        
        if (criteria.all) {
            const snapshot = await getCountFromServer(itemsCol);
            return { success: true, count: snapshot.data().count };
        }
        
        if (criteria.category && (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant')) {
            q = query(itemsCol, where('category', '==', criteria.category.trim()));
            const snapshot = await getCountFromServer(q);
            return { success: true, count: snapshot.data().count };
        } else {
             // Fallback for non-indexed queries (like search) which are slow and costly.
             // This part should be used sparingly.
            if (criteria.searchTerm) {
                const textFieldName = (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant' || criteria.game === 'prison') ? 'question' : 'text';
                const searchTerm = criteria.searchTerm.trim();
                const snapshot = await getDocs(query(itemsCol, where(textFieldName, '>=', searchTerm), where(textFieldName, '<=', searchTerm + '\uf8ff')));
                return { success: true, count: snapshot.size };
            } else if (criteria.answerSearchTerm && (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant')) {
                const searchTerm = criteria.answerSearchTerm.trim();
                 const snapshot = await getDocs(query(itemsCol, where('answer', '>=', searchTerm), where('answer', '<=', searchTerm + '\uf8ff')));
                return { success: true, count: snapshot.size };
            }
        }
        
        return { success: false, error: "معايير العد غير صالحة." };

    } catch (error) {
        console.error("Error counting items:", error);
        return { success: false, error: 'حدث خطأ أثناء عد العناصر. قد تحتاج إلى إنشاء فهرس في قاعدة البيانات.' };
    }
};

export async function deleteQuestions(criteria: { game: 'trap-answer' | 'prison' | 'word_war' | 'educated-merchant', category?: string; searchTerm?: string; answerSearchTerm?: string; all?: boolean }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all) {
        return { error: 'يجب تحديد معيار للحذف.' };
    }

     let collectionName: string;
    switch(criteria.game) {
        case 'trap-answer': collectionName = 'trap_answer_questions'; break;
        case 'educated-merchant': collectionName = 'educated_merchant_questions'; break;
        case 'prison': collectionName = 'prison_questions'; break;
        case 'word_war': collectionName = 'word_war_words'; break;
        default: return { error: "نوع لعبة غير مدعوم." };
    }

    try {
        const batch = writeBatch(db);
        const itemsCol = collection(db, collectionName);
        let q;

        if (criteria.all) {
            q = query(itemsCol);
        } else if (criteria.category && (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant')) {
            q = query(itemsCol, where('category', '==', criteria.category.trim()));
        } else if (criteria.searchTerm) {
            const textFieldName = (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant' || criteria.game === 'prison') ? 'question' : 'text';
            const searchTerm = criteria.searchTerm.trim();
            q = query(itemsCol, where(textFieldName, '>=', searchTerm), where(textFieldName, '<=', searchTerm + '\uf8ff'));
        } else if (criteria.answerSearchTerm && (criteria.game === 'trap-answer' || criteria.game === 'educated-merchant')) {
            const searchTerm = criteria.answerSearchTerm.trim();
             q = query(itemsCol, where('answer', '>=', searchTerm), where('answer', '<=', searchTerm + '\uf8ff'));
        } else {
            return { error: "معايير الحذف غير صالحة." };
        }

        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return { success: true, count: 0, message: 'لم يتم العثور على عناصر تطابق المعايير المحددة.' };

        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        return { success: true, count: querySnapshot.size };

    } catch (error) {
        console.error("Error deleting items:", error);
        return { error: 'حدث خطأ أثناء حذف العناصر. قد تحتاج إلى إنشاء فهرس في قاعدة البيانات.' };
    }
};

async function findDuplicateQuestionGroups(game: 'trap-answer' | 'educated-merchant' | 'prison', category?: string): Promise<Map<string, { id: string; createdAt: Timestamp }[]>> {
    let collectionName: string;
    switch(game) {
        case 'trap-answer': collectionName = 'trap_answer_questions'; break;
        case 'educated-merchant': collectionName = 'educated_merchant_questions'; break;
        case 'prison': collectionName = 'prison_questions'; break;
    }
    
    let q = query(collection(db, collectionName));
    if (category && (game === 'trap-answer' || game === 'educated-merchant')) {
        q = query(q, where("category", "==", category));
    }
    
    const querySnapshot = await getDocs(q);
    const groups = new Map<string, { id: string; createdAt: Timestamp }[]>();

    querySnapshot.forEach(doc => {
        const data = doc.data();
        const signature = data.similaritySignature;
        if (!signature) return;
        
        const group = groups.get(signature) || [];
        group.push({ id: doc.id, createdAt: doc.data().createdAt || Timestamp.now() });
        groups.set(signature, group);
    });

    return groups;
}


export async function deleteSimilarQuestions(game: 'trap-answer' | 'educated-merchant', category?: string): Promise<{ success: boolean; count?: number; error?: string; message?: string }> {
    try {
        const duplicateGroups = await findDuplicateQuestionGroups(game, category);
        if (duplicateGroups.size === 0) {
            return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة.' };
        }

        const batch = writeBatch(db);
        const collectionName = game === 'trap-answer' ? 'trap_answer_questions' : 'educated_merchant_questions';
        let deletedCount = 0;

        for (const [signature, items] of duplicateGroups.entries()) {
            if (items.length > 1) {
                // Sort by createdAt timestamp descending (newest first)
                items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
                
                // Keep the newest one (at index 0), delete the rest
                const itemsToDelete = items.slice(1);
                
                itemsToDelete.forEach(item => {
                    const docRef = doc(db, collectionName, item.id);
                    batch.delete(docRef);
                    deletedCount++;
                });
            }
        }

        if (deletedCount > 0) {
            await batch.commit();
        }
        
        return { success: true, count: deletedCount };

    } catch (error) {
        console.error("Error deleting similar questions:", error);
        if (isFirebaseError(error)) {
            return { success: false, error: `فشل حذف الأسئلة المكررة: ${error.message}` };
        }
        return { success: false, error: 'حدث خطأ غير متوقع أثناء حذف الأسئلة المكررة.' };
    }
};

export async function deleteSimilarPrisonQuestions(): Promise<{ success: boolean; count?: number; error?: string; message?: string }> {
    try {
        const duplicateGroups = await findDuplicateQuestionGroups('prison');
        if (duplicateGroups.size === 0) {
            return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة في السجن.' };
        }

        const batch = writeBatch(db);
        let deletedCount = 0;

        for (const items of duplicateGroups.values()) {
            if (items.length > 1) {
                items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
                const itemsToDelete = items.slice(1);
                
                itemsToDelete.forEach(item => {
                    const docRef = doc(db, 'prison_questions', item.id);
                    batch.delete(docRef);
                    deletedCount++;
                });
            }
        }

        if (deletedCount > 0) {
            await batch.commit();
        }
        
        return { success: true, count: deletedCount };

    } catch (error: any) {
        console.error("Error deleting similar prison questions:", error);
        return { success: false, error: error.message || 'فشل حذف أسئلة السجن المكررة.' };
    }
}


async function findDuplicateWords() {
    const wordsCol = collection(db, 'word_war_words');
    const querySnapshot = await getDocs(wordsCol);

    const wordsMap = new Map<string, string[]>(); // Map from word text to array of document IDs
    
    querySnapshot.forEach(doc => {
        const text = (doc.data().text as string)?.trim();
        if (text) {
            if (!wordsMap.has(text)) {
                wordsMap.set(text, []);
            }
            wordsMap.get(text)!.push(doc.id);
        }
    });

    const groups: string[][] = [];
    let deletedCount = 0;

    wordsMap.forEach((ids) => {
        if (ids.length > 1) {
            groups.push(ids);
            deletedCount += ids.length - 1; // All but one will be deleted
        }
    });

    return { groups, count: deletedCount };
}


export async function deleteDuplicateWords(): Promise<{ success: boolean; count?: number; error?: string, message?: string }> {
    try {
        const { groups, count: deletedCount } = await findDuplicateWords();

        if (groups.length === 0) {
            return { success: true, count: 0, message: 'لم يتم العثور على كلمات مكررة.' };
        }

        const batch = writeBatch(db);
        
        groups.forEach(groupOfIds => {
            groupOfIds.sort(); // Sort to have a consistent "oldest" one to keep
            groupOfIds.shift(); // Keep the first one (oldest ID), remove it from deletion list

            groupOfIds.forEach(idToDelete => {
                const docRef = doc(db, 'word_war_words', idToDelete);
                batch.delete(docRef);
            });
        });
        
        if (deletedCount > 0) {
            await batch.commit();
        }
        
        return { success: true, count: deletedCount };

    } catch (error) {
        console.error("Error deleting duplicate words:", error);
        if (isFirebaseError(error)) {
            return { error: `فشل حذف الكلمات المكررة: ${error.message}` };
        }
        return { error: 'حدث خطأ غير متوقع أثناء حذف الكلمات المكررة.' };
    }
};

export async function setAnnouncement(text: string) {
    try {
        const settingsRef = doc(db, 'game_settings', 'announcement');
        await setDoc(settingsRef, { text });
        return { success: true };
    } catch (error) {
        console.error("Error setting announcement:", error);
        return { error: "فشل حفظ الإعلان." };
    }
};

export async function getAnnouncement() {
    try {
        const docRef = doc(db, 'game_settings', 'announcement');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, text: docSnap.data().text || '' };
        }
        return { success: true, text: '' };
    } catch (error) {
        console.error("Error getting announcement:", error);
        return { error: "فشل جلب الإعلان." };
    }
}

export async function adminUpdateUser(userId: string, data: Partial<UserProfile>): Promise<{success: boolean, error?: string}> {
    if(!userId) return {success: false, error: "User ID is required."};
    
    const userRef = doc(db, 'users', userId);
    try {
        const sanitizedData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));
        
        await updateDoc(userRef, sanitizedData);
        return {success: true}
    } catch(error) {
        console.error("Error updating user by admin:", error)
        return {success: false, error: "Failed to update user profile."}
    }
};

// --- Trap Answer Categories ---
export async function getTrapAnswerCategories(): Promise<{success: boolean, categories?: string[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'trap_answer_categories');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().list?.length > 0) {
            return { success: true, categories: docSnap.data().list };
        }
        await setDoc(docRef, { list: DEFAULT_TRAP_ANSWER_CATEGORIES });
        return { success: true, categories: DEFAULT_TRAP_ANSWER_CATEGORIES };
    } catch (error) {
        console.error("Error getting trap answer categories:", error);
        return { success: false, error: 'Failed to fetch trap answer categories.' };
    }
}

export async function addTrapAnswerCategory(category: string): Promise<{success: boolean, error?: string}> {
    if (!category || typeof category !== 'string' || category.trim() === '') {
        return { error: 'اسم القسم غير صالح.' };
    }
    try {
        const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
        await updateDoc(settingsRef, {
            list: arrayUnion(category.trim())
        });
        return { success: true };
    } catch (error) {
        if (isFirebaseError(error) && error.code === 'not-found') {
            await setDoc(doc(db, 'game_settings', 'trap_answer_categories'), {
                list: [category.trim()]
            });
            return { success: true };
        }
        console.error("Error adding trap answer category:", error);
        return { success: false, error: 'Failed to add trap answer category.' };
    }
};

export async function editTrapAnswerCategory(oldCategory: string, newCategory: string): Promise<{ success: boolean; error?: string }> {
    if (!oldCategory || !newCategory || oldCategory.trim() === '' || newCategory.trim() === '') {
        return { error: 'الاسم القديم والجديد مطلوبان.' };
    }
    if (oldCategory.trim() === newCategory.trim()) {
        return { error: 'الاسم الجديد للقسم يجب أن يختلف عن الاسم القديم.' };
    }

    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
    
    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
            throw new Error("مستند إعدادات الأقسام غير موجود.");
        }
        
        const categories: string[] = settingsSnap.data().list || [];
        if (!categories.includes(oldCategory)) {
            return { error: 'القسم القديم غير موجود.' };
        }
        if (categories.includes(newCategory.trim())) {
            return { error: 'الاسم الجديد للقسم موجود بالفعل.' };
        }

        const updatedCategories = categories.map(c => c === oldCategory ? newCategory.trim() : c);
        batch.update(settingsRef, { list: updatedCategories });
        
        const questionsQuery = query(collection(db, 'trap_answer_questions'), where("category", "==", oldCategory));
        const questionsSnapshot = await getDocs(questionsQuery);

        questionsSnapshot.forEach(doc => {
            batch.update(doc.ref, { category: newCategory.trim() });
        });
        
        await batch.commit();
        return { success: true };

    } catch (error) {
        console.error("Error editing category:", error);
        return { success: false, error: 'فشل تعديل قسم الجواب المفخخ.' };
    }
};

export async function deleteTrapAnswerCategory(categoryToDelete: string): Promise<{ success: boolean; count?: number; error?: string }> {
    if (!categoryToDelete || categoryToDelete.trim() === '') {
        return { error: 'يجب تحديد قسم للحذف.' };
    }
    
    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');

    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) throw new Error("مستند إعدادات الأقسام غير موجود.");
        
        const categories: string[] = settingsSnap.data().list || [];
        if (categories.length <= 1) {
            return { error: "لا يمكن حذف آخر قسم متبقٍ." };
        }
        if (!categories.includes(categoryToDelete)) {
            return { error: "القسم المحدد للحذف غير موجود." };
        }
        
        batch.update(settingsRef, { list: arrayRemove(categoryToDelete) });

        const questionsQuery = query(collection(db, 'trap_answer_questions'), where("category", "==", categoryToDelete));
        const questionsSnapshot = await getDocs(questionsQuery);

        questionsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return { success: true, count: questionsSnapshot.size };

    } catch (error) {
        console.error("Error deleting category:", error);
        return { success: false, error: 'فشل حذف قسم الجواب المفخخ والأسئلة المرتبطة به.' };
    }
};


// --- Educated Merchant Categories ---
export async function getEducatedMerchantCategories(): Promise<{success: boolean, categories?: string[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'educated_merchant_categories');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().list?.length > 0) {
            return { success: true, categories: docSnap.data().list };
        }
        // If it doesn't exist, create it with default values
        await setDoc(docRef, { list: DEFAULT_EDUCATED_MERCHANT_CATEGORIES });
        return { success: true, categories: DEFAULT_EDUCATED_MERCHANT_CATEGORIES };
    } catch (error) {
        console.error("Error getting educated merchant categories:", error);
        return { success: false, error: 'Failed to fetch educated merchant categories.' };
    }
}

export async function addEducatedMerchantCategory(category: string): Promise<{success: boolean, error?: string}> {
    if (!category || typeof category !== 'string' || category.trim() === '') {
        return { error: 'اسم القسم غير صالح.' };
    }
    try {
        const settingsRef = doc(db, 'game_settings', 'educated_merchant_categories');
        await updateDoc(settingsRef, {
            list: arrayUnion(category.trim())
        });
        return { success: true };
    } catch (error) {
        if (isFirebaseError(error) && error.code === 'not-found') {
            await setDoc(doc(db, 'game_settings', 'educated_merchant_categories'), {
                list: [category.trim()]
            });
            return { success: true };
        }
        console.error("Error adding educated merchant category:", error);
        return { success: false, error: 'Failed to add educated merchant category.' };
    }
};

export async function editEducatedMerchantCategory(oldCategory: string, newCategory: string): Promise<{ success: boolean; error?: string }> {
    if (!oldCategory || !newCategory || oldCategory.trim() === '' || newCategory.trim() === '') {
        return { error: 'الاسم القديم والجديد مطلوبان.' };
    }
    if (oldCategory.trim() === newCategory.trim()) {
        return { error: 'الاسم الجديد للقسم يجب أن يختلف عن الاسم القديم.' };
    }

    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'educated_merchant_categories');
    
    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
            throw new Error("مستند إعدادات الأقسام غير موجود.");
        }
        
        const categories: string[] = settingsSnap.data().list || [];
        if (!categories.includes(oldCategory)) {
            return { error: 'القسم القديم غير موجود.' };
        }
        if (categories.includes(newCategory.trim())) {
            return { error: 'الاسم الجديد للقسم موجود بالفعل.' };
        }

        const updatedCategories = categories.map(c => c === oldCategory ? newCategory.trim() : c);
        batch.update(settingsRef, { list: updatedCategories });
        
        // Note: This does NOT update questions. If questions need to be re-categorized,
        // it must be done manually or with a separate script.
        
        await batch.commit();
        return { success: true };

    } catch (error) {
        console.error("Error editing category:", error);
        return { success: false, error: 'فشل تعديل قسم التاجر المتعلم.' };
    }
};

export async function deleteEducatedMerchantCategory(categoryToDelete: string): Promise<{ success: boolean; count?: number; error?: string }> {
    // This function only deletes the category name, not the questions associated with it.
    if (!categoryToDelete || categoryToDelete.trim() === '') {
        return { error: 'يجب تحديد قسم للحذف.' };
    }
    
    const settingsRef = doc(db, 'game_settings', 'educated_merchant_categories');

    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) throw new Error("مستند إعدادات الأقسام غير موجود.");
        
        const categories: string[] = settingsSnap.data().list || [];
        if (categories.length <= 1) {
            return { error: "لا يمكن حذف آخر قسم متبقٍ." };
        }
        if (!categories.includes(categoryToDelete)) {
            return { error: "القسم المحدد للحذف غير موجود." };
        }
        
        await updateDoc(settingsRef, { list: arrayRemove(categoryToDelete) });
        
        return { success: true, count: 0 }; // count refers to deleted questions, which is 0 here.

    } catch (error: any) {
        console.error("Error deleting category:", error);
        return { success: false, error: 'فشل حذف قسم التاجر المتعلم.' };
    }
};



export async function setAvatarPrices(prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> {
    try {
        const settingsRef = doc(db, 'game_settings', 'avatar_prices');
        await setDoc(settingsRef, { prices });
        return { success: true };
    } catch (error) {
        console.error("Error setting avatar prices:", error);
        return { success: false, error: "Failed to save avatar prices." };
    }
};

export async function getAvatarPrices(): Promise<{success: boolean, prices?: AvatarPrice[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'avatar_prices');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, prices: docSnap.data().prices || [] };
        }
        return { success: true, prices: [] };
    } catch (error) {
        console.error("Error getting avatar prices:", error);
        return { success: false, error: 'Failed to fetch avatar prices.' };
    }
}

export async function setPunishmentAvatarPrices(prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> {
    try {
        const settingsRef = doc(db, 'game_settings', 'punishment_avatar_prices');
        await setDoc(settingsRef, { prices });
        return { success: true };
    } catch (error) {
        console.error("Error setting punishment avatar prices:", error);
        return { success: false, error: "Failed to save punishment avatar prices." };
    }
};

export async function getPunishmentAvatarPrices(): Promise<{success: boolean, prices?: AvatarPrice[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'punishment_avatar_prices');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, prices: docSnap.data().prices || [] };
        }
        return { success: true, prices: [] };
    } catch (error) {
        console.error("Error getting punishment avatar prices:", error);
        return { success: false, error: 'Failed to fetch punishment avatar prices.' };
    }
}


export async function setDefaultAvatar(avatarId: string): Promise<{ success: boolean; error?: string }> {
    if (!avatarId || avatarId.trim() === '') {
        return { success: false, error: "Avatar ID is required." };
    }
    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'default_avatar');
    const pricesRef = doc(db, 'game_settings', 'avatar_prices');
    
    try {
        batch.set(settingsRef, { avatarId: avatarId });
        const pricesDoc = await getDoc(pricesRef);
        if (pricesDoc.exists()) {
            const prices = (pricesDoc.data().prices || []) as AvatarPrice[];
            const priceIndex = prices.findIndex(p => p.avatarId === avatarId);
            if (priceIndex !== -1) {
                prices[priceIndex].price = 0;
            } else {
                prices.push({ avatarId: avatarId, price: 0, currency: 'coins' });
            }
            batch.update(pricesRef, { prices });
        } else {
            batch.set(pricesRef, { prices: [{ avatarId, price: 0, currency: 'coins' }] });
        }
        
        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error setting default avatar:", error);
        return { success: false, error: "Failed to set default avatar." };
    }
};

export async function getDefaultAvatar(): Promise<{ success: boolean; avatarId?: string; error?: string }> {
    try {
        const docRef = doc(db, 'game_settings', 'default_avatar');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, avatarId: docSnap.data().avatarId };
        }
        return { success: true, avatarId: 'Avatar00.png' }; 
    } catch (error) {
        console.error("Error getting default avatar:", error);
        return { success: false, error: 'Failed to fetch default avatar.' };
    }
}

export async function setSocialRanks(ranks: SocialRank[]): Promise<{success: boolean, error?: string}> {
    try {
        const settingsRef = doc(db, 'game_settings', 'social_ranks');
        await setDoc(settingsRef, { list: ranks });
        return { success: true };
    } catch (error) {
        console.error("Error setting social ranks:", error);
        return { success: false, error: 'فشل حفظ الألقاب الاجتماعية.' };
    }
};

export async function addPermissionToRank(rankName: string, permissionId: PermissionId): Promise<{ success: boolean, error?: string }> {
    const settingsRef = doc(db, 'game_settings', 'social_ranks');
    try {
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(settingsRef);
            if (!docSnap.exists()) throw new Error("مستند الألقاب غير موجود.");
            
            const ranks: SocialRank[] = docSnap.data().list || [];
            const rankIndex = ranks.findIndex(r => r.name === rankName);
            if (rankIndex === -1) throw new Error("اللقب غير موجود.");
            
            if (!ranks[rankIndex].permissions?.includes(permissionId)) {
                if(!ranks[rankIndex].permissions) ranks[rankIndex].permissions = [];
                ranks[rankIndex].permissions.push(permissionId);
            }
            
            transaction.update(settingsRef, { list: ranks });
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "فشل إضافة الصلاحية." };
    }
};


export async function removePermissionFromRank(rankName: string, permissionId: PermissionId): Promise<{ success: boolean; error?: string }> {
    const settingsRef = doc(db, 'game_settings', 'social_ranks');
    try {
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(settingsRef);
            if (!docSnap.exists()) throw new Error("مستند الألقاب غير موجود.");
            
            const ranks: SocialRank[] = docSnap.data().list || [];
            const rankIndex = ranks.findIndex(r => r.name === rankName);
            if (rankIndex === -1) throw new Error("اللقب غير موجود.");
            
            if (ranks[rankIndex].permissions) {
                ranks[rankIndex].permissions = ranks[rankIndex].permissions.filter(p => p !== permissionId);
            }
            
            transaction.update(settingsRef, { list: ranks });
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "فشل إزالة الصلاحية." };
    }
};


export async function recalculateGameKings() {
    try {
        const batch = writeBatch(db);
        const gameKingsRef = collection(db, 'game_kings');
        const usersRef = collection(db, 'users');

        // 1. Delete all current game kings to reset
        const currentKingsSnapshot = await getDocs(gameKingsRef);
        currentKingsSnapshot.forEach(doc => batch.delete(doc.ref));

        // 2. Get all users
        const usersSnapshot = await getDocs(usersRef);
        if (usersSnapshot.empty) {
            await batch.commit();
            return { success: true, updatedCount: 0 };
        }

        const users: UserProfile[] = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        
        // 3. Find the new king for each game type
        const newKings: Record<string, GameKing & { kingId: string }> = {};

        users.forEach(user => {
            const winCounts = user.winCounts || {};
            Object.entries(winCounts).forEach(([gameType, count]) => {
                if (!newKings[gameType] || count > newKings[gameType].winCount) {
                    newKings[gameType] = {
                        kingId: user.uid,
                        name: user.name,
                        avatarId: user.avatarId,
                        winCount: count
                    };
                }
            });
        });

        // 4. Set the new kings in the database
        Object.entries(newKings).forEach(([gameType, kingData]) => {
            const kingRef = doc(gameKingsRef, gameType);
            batch.set(kingRef, kingData);
        });

        await batch.commit();

        return { success: true, updatedCount: Object.keys(newKings).length };

    } catch (error: any) {
        console.error("Error recalculating game kings:", error);
        return { success: false, error: error.message || "فشل إعادة حساب ملوك الألعاب." };
    }
};

export async function backfillPunishmentStatus(): Promise<{ success: boolean; count: number; error?: string }> {
    const usersRef = collection(db, 'users');
    try {
        const snapshot = await getDocs(usersRef);
        if (snapshot.empty) {
            return { success: true, count: 0 };
        }
        
        const batch = writeBatch(db);
        let updatedCount = 0;

        snapshot.forEach(userDoc => {
            const userData = userDoc.data() as UserProfile;
            const now = new Date();

            const hasHumiliation = userData.humiliation?.until && (userData.humiliation.until as any)?.toDate() > now;
            const hasAvatarPunishment = userData.originalAvatarToRevert?.until && (userData.originalAvatarToRevert.until as any)?.toDate() > now;
            const hasDecree = (userData.decrees || []).some(d => d.until && (d.until as any)?.toDate() > now);

            const isCurrentlyPunished = !!(hasHumiliation || hasAvatarPunishment || hasDecree);

            if (userData.isPunished !== isCurrentlyPunished) {
                 batch.update(userDoc.ref, { isPunished: isCurrentlyPunished });
                 updatedCount++;
            }
        });

        await batch.commit();

        return { success: true, count: snapshot.size };

    } catch (error: any) {
        console.error("Error backfilling punishment status:", error);
        return { success: false, count: 0, error: "Failed to update user punishment statuses." };
    }
};

export async function backfillUserPermissions(): Promise<{ success: boolean; count: number; error?: string }> {
    const usersRef = collection(db, 'users');
    try {
        const [allRanks, usersSnapshot] = await Promise.all([
            queryRanks(),
            getDocs(usersRef)
        ]);

        if (usersSnapshot.empty) {
            return { success: true, count: 0 };
        }

        const batch = writeBatch(db);

        const getRank = (points: number, ranks: SocialRank[]): SocialRank | null => {
            const sortedRanks = [...ranks].sort((a, b) => b.threshold - a.threshold);
            for (const rank of sortedRanks) {
                if (points >= rank.threshold) return rank;
            }
            return sortedRanks[sortedRanks.length - 1] || null;
        };

        usersSnapshot.forEach(userDoc => {
            const userData = userDoc.data() as UserProfile;
            const currentPoints = userData.leaderboardPoints || 0;
            const currentRank = getRank(currentPoints, allRanks);
            const newPermissions = currentRank?.permissions || [];
            
            // Compare arrays to see if an update is needed
            const currentPermissions = userData.permissions || [];
            const permissionsAreSame = currentPermissions.length === newPermissions.length && currentPermissions.every(p => newPermissions.includes(p));

            if (!permissionsAreSame) {
                batch.update(userDoc.ref, { permissions: newPermissions });
            }
        });

        await batch.commit();
        return { success: true, count: usersSnapshot.size };

    } catch (error: any) {
        console.error("Error backfilling user permissions:", error);
        return { success: false, count: 0, error: "Failed to update user permissions." };
    }
}


export async function adminGiveReward(actorId: string, targetId: string, reward: { points?: number, coins?: number }, reason: string): Promise<{ success: boolean; error?: string }> {
    return giveReward(actorId, targetId, reward, reason);
}

export async function adminApplyPunishment(actorId: string, targetId: string, penalty: { points?: number, coins?: number}, reason: string): Promise<{ success: boolean; error?: string }> {
    return applyPunishment(actorId, targetId, penalty, reason);
}

export async function getTopUsers(field: 'coins' | 'leaderboardPoints', count: number): Promise<UserProfile[]> {
    return queryTopUsers(field, count);
}

export async function generateGeniusChallenge(input: GenerateGeniusChallengeInput): Promise<GenerateGeniusChallengeOutput> {
    return generateGeniusChallengeFlow(input);
}
