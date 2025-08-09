

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
} from 'firebase/firestore';
import { isFirebaseError, withAdminAuth } from './helpers';
import type { UserProfile, AvatarPrice, SocialRank, PrisonQuestion, Game, TrapQuestion, Mail, PermissionId, GameKing, SnakesAndScissorsQuestion, Decree } from '@/types';
import { DEFAULT_TRAP_ANSWER_CATEGORIES, DEFAULT_SOCIAL_RANKS, GAME_TYPE_NAMES } from '@/types';
import { PUNISHMENT_AVATAR_IDS } from '@/data/punishment-avatars';
import { safeCompareStrings } from './helpers';
import { sendSystemMail } from './user/mail';
import { giveReward, applyPunishment } from './user/social';
import { searchUsers, getRanks as getUserRanks, getUsersByRank } from './user/queries';


export async function setSocialRanks(adminId: string, ranks: SocialRank[]): Promise<{success: boolean, error?: string}> {
    try {
        if (!adminId) {
          throw new Error("User is not authenticated.");
        }
        const adminRef = doc(db, 'users', adminId);
        const adminDoc = await getDoc(adminRef);

        if (!adminDoc.exists() || !adminDoc.data()?.isAdmin) {
          throw new Error("Unauthorized: You do not have permission to perform this action.");
        }

        const settingsRef = doc(db, 'game_settings', 'social_ranks');
        await setDoc(settingsRef, { list: ranks });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting social ranks:", error);
        return { success: false, error: error.message || 'فشل حفظ الألقاب الاجتماعية.' };
    }
};


export const adminSendMail = withAdminAuth(async (adminId: string, recipientIds: string[], subject: string, body: string, coins: number): Promise<{ success: boolean; error?: string }> => {
  if (!recipientIds || recipientIds.length === 0 || !subject.trim() || !body.trim()) {
    return { success: false, error: "المعلومات غير كافية لإرسال الرسالة." };
  }

  try {
    const adminDoc = await getDoc(doc(db, 'users', adminId));
    if (!adminDoc.exists() || !adminDoc.data()?.isAdmin) {
      return { success: false, error: "ليس لديك صلاحية لإرسال الرسائل." };
    }
    
    const senderName = adminDoc.data()?.name || 'Admin';
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
});


export const uploadQuestionsFromJson = withAdminAuth(async (adminId: string, questions: { text: string; category: string }[]) => {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'questions');
        let validQuestionsCount = 0;

        questions.forEach(question => {
            if (question && typeof question.text === 'string' && question.text.trim() !== '' && typeof question.category === 'string' && question.category.trim() !== '') {
                const docRef = doc(questionsCol);
                batch.set(docRef, { 
                    text: question.text.trim(),
                    category: question.category.trim()
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
        console.error("Error uploading questions:", error);
        return { error: 'حدث خطأ أثناء رفع الأسئلة.' };
    }
});

export const uploadTrapAnswerQuestionsFromJson = withAdminAuth(async (adminId: string, questions: { question: string, answer: string, dummyAnswers: string[] }[], category: string) => {
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
            if (
                q && typeof q.question === 'string' && q.question.trim() !== '' && 
                typeof q.answer === 'string' && q.answer.trim() !== '' &&
                Array.isArray(q.dummyAnswers) && q.dummyAnswers.length >= 2 && q.dummyAnswers.every(da => typeof da === 'string' && da.trim() !== '')
            ) {
                const docRef = doc(questionsCol);
                batch.set(docRef, {
                    question: q.question.trim(),
                    answer: q.answer.trim(),
                    dummyAnswers: q.dummyAnswers.map(da => da.trim()),
                    category: category.trim(),
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
        console.error("Error uploading trap answer questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة الجواب المفخخ.' };
    }
});

export const uploadSnakesAndScissorsQuestionsFromJson = withAdminAuth(async (adminId: string, questions: { text: string; options: string[]; correctAnswer: string; }[], category: string) => {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }
    if (!category || typeof category !== 'string' || category.trim() === '') {
        return { error: 'يجب تحديد قسم صالح.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'snakes_and_scissors_questions');
        let validQuestionsCount = 0;

        questions.forEach(q => {
            if (
                q && typeof q.text === 'string' && q.text.trim() !== '' &&
                Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === 'string' && o.trim() !== '') &&
                typeof q.correctAnswer === 'string' && q.correctAnswer.trim() !== '' &&
                q.options.includes(q.correctAnswer)
            ) {
                const docRef = doc(questionsCol);
                batch.set(docRef, {
                    text: q.text.trim(),
                    options: q.options.map(o => o.trim()),
                    correctAnswer: q.correctAnswer.trim(),
                    category: category.trim(),
                });
                validQuestionsCount++;
            }
        });

        if (validQuestionsCount === 0) {
            return { error: 'لم يتم العثور على أسئلة صالحة في الملف. تأكد من أن كل سؤال له 4 خيارات وأن الجواب الصحيح واحد منهم.' };
        }

        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading Snakes and Scissors questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة السلم والمقص.' };
    }
});


export const uploadPrisonQuestionsFromJson = withAdminAuth(async (adminId: string, questions: { text: string }[]) => {
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
                    text: q.text.trim()
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
});

export const uploadWordWarWordsFromJson = withAdminAuth(async (adminId: string, words: string[]) => {
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
});

export const countQuestions = withAdminAuth(async (adminId: string, criteria: { game: 'trap-answer' | 'prison' | 'word_war' | 'snakes_and_scissors', category?: string; all?: boolean, duplicates?: { threshold: number } | 'word_war_duplicates' }) => {
    if (!criteria.category && !criteria.all && !criteria.duplicates) {
        return { error: 'يجب تحديد معيار للعد.' };
    }
    
    let collectionName = '';
    switch(criteria.game) {
        case 'trap-answer': collectionName = 'trap_answer_questions'; break;
        case 'prison': collectionName = 'prison_questions'; break;
        case 'word_war': collectionName = 'word_war_words'; break;
        case 'snakes_and_scissors': collectionName = 'snakes_and_scissors_questions'; break;
        default: return { error: 'نوع لعبة غير صالح.' };
    }


    try {
        const itemsCol = collection(db, collectionName);
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(itemsCol);
            count = querySnapshot.size;
        } else if (criteria.category && criteria.duplicates && typeof criteria.duplicates === 'object' && criteria.game === 'trap-answer') {
            const { count: duplicateCount } = await findSimilarQuestions(criteria.game, criteria.duplicates.threshold, criteria.category);
            count = duplicateCount;
        } else if (criteria.duplicates === 'word_war_duplicates' && criteria.game === 'word_war') {
            const { count: duplicateCount } = await findDuplicateWords();
            count = duplicateCount;
        } else if (criteria.category) { // Works for trap-answer and snakes_and_scissors
            const q = query(itemsCol, where('category', '==', criteria.category.trim()));
            const querySnapshot = await getDocs(q);
            count = querySnapshot.size;
        }
        
        return { success: true, count };
    } catch (error) {
        console.error("Error counting items:", error);
        return { error: 'حدث خطأ أثناء عد العناصر.' };
    }
});

export const deleteQuestions = withAdminAuth(async (adminId: string, criteria: { game: 'trap-answer' | 'prison' | 'word_war' | 'snakes_and_scissors', category?: string; all?: boolean }) => {
    if (!criteria.category && !criteria.all) {
        return { error: 'يجب تحديد معيار للحذف.' };
    }

     let collectionName = '';
    switch(criteria.game) {
        case 'trap-answer': collectionName = 'trap_answer_questions'; break;
        case 'prison': collectionName = 'prison_questions'; break;
        case 'word_war': collectionName = 'word_war_words'; break;
        case 'snakes_and_scissors': collectionName = 'snakes_and_scissors_questions'; break;
        default: return { error: 'نوع لعبة غير صالح.' };
    }

    try {
        const batch = writeBatch(db);
        const itemsCol = collection(db, collectionName);
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(itemsCol);
            if (querySnapshot.empty) return { success: true, count: 0, message: 'قاعدة البيانات فارغة بالفعل.' };
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });
        } else if (criteria.category && (criteria.game === 'trap-answer' || criteria.game === 'snakes_and_scissors')) {
            const q = query(itemsCol, where("category", "==", criteria.category.trim()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                return { success: true, count: 0, message: 'لم يتم العثور على أسئلة في هذا القسم.' };
            }
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });
        }

        await batch.commit();
        return { success: true, count };
    } catch (error) {
        console.error("Error deleting items:", error);
        return { error: 'حدث خطأ أثناء حذف العناصر.' };
    }
});

async function findSimilarQuestions(game: 'trap-answer', similarityThreshold: number, category?: string) {
    if (!category) {
        throw new Error("يجب تحديد قسم للبحث عن التكرارات.");
    }
    const collectionName = 'trap_answer_questions';
    const textFieldName = 'question';

    const q = query(collection(db, collectionName), where("category", "==", category));
    const querySnapshot = await getDocs(q);

    const questions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        text: doc.data()[textFieldName] as string,
        docRef: doc.ref
    }));

    if (questions.length < 2) {
        return { groups: [], count: 0 };
    }

    const groups: string[][] = [];
    const processedIds = new Set<string>();
    let deletedCount = 0;

    for (let i = 0; i < questions.length; i++) {
        if (processedIds.has(questions[i].id)) {
            continue;
        }

        const currentGroup = [questions[i].id];
        processedIds.add(questions[i].id);

        const mainString = questions[i].text;
        
        for (let j = i + 1; j < questions.length; j++) {
            if (processedIds.has(questions[j].id)) {
                continue;
            }

            const similarity = safeCompareStrings(mainString, questions[j].text);
            if (similarity >= similarityThreshold) {
                currentGroup.push(questions[j].id);
                processedIds.add(questions[j].id);
            }
        }

        if (currentGroup.length > 1) {
            groups.push(currentGroup);
            currentGroup.sort();
            deletedCount += currentGroup.length - 1;
        }
    }
    return { groups, count: deletedCount };
}


export const deleteSimilarQuestions = withAdminAuth(async (adminId: string, game: 'trap-answer', similarityThreshold: number, category?: string) => {
    try {
        const { groups, count: deletedCount } = await findSimilarQuestions(game, similarityThreshold, category);

        if (groups.length === 0) {
            return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة.' };
        }

        const batch = writeBatch(db);
        
        groups.forEach(group => {
            group.sort();
            group.pop();

            group.forEach(idToDelete => {
                const docRef = doc(db, 'trap_answer_questions', idToDelete);
                batch.delete(docRef);
            });
        });

        if (deletedCount > 0) {
            await batch.commit();
        }
        
        return { success: true, count: deletedCount };

    } catch (error) {
        console.error("Error deleting similar questions:", error);
        return { error: 'حدث خطأ غير متوقع أثناء حذف الأسئلة المكررة.' };
    }
});

async function findDuplicateWords() {
    const wordsCol = collection(db, 'word_war_words');
    const querySnapshot = await getDocs(wordsCol);

    const wordsMap = new Map<string, string[]>();
    
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
            deletedCount += ids.length - 1;
        }
    });

    return { groups, count: deletedCount };
}


export const deleteDuplicateWords = withAdminAuth(async (adminId: string): Promise<{ success: boolean; count?: number; error?: string, message?: string }> => {
    try {
        const { groups, count: deletedCount } = await findDuplicateWords();

        if (groups.length === 0) {
            return { success: true, count: 0, message: 'لم يتم العثور على كلمات مكررة.' };
        }

        const batch = writeBatch(db);
        
        groups.forEach(groupOfIds => {
            groupOfIds.sort();
            groupOfIds.shift();

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
        return { error: 'حدث خطأ غير متوقع أثناء حذف الكلمات المكررة.' };
    }
});

export const setAnnouncement = withAdminAuth(async (adminId: string, text: string) => {
    try {
        const settingsRef = doc(db, 'game_settings', 'announcement');
        await setDoc(settingsRef, { text });
        return { success: true };
    } catch (error) {
        console.error("Error setting announcement:", error);
        return { error: "فشل حفظ الإعلان." };
    }
});

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

export const adminUpdateUser = withAdminAuth(async (adminId: string, userId: string, data: Partial<UserProfile>): Promise<{success: boolean, error?: string}> => {
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
});

/**
 * Public-facing function to get categories. Does not require admin auth.
 */
export async function getPublicTrapAnswerCategories(): Promise<{success: boolean, categories?: string[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'trap_answer_categories');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, categories: docSnap.data().list || [] };
        }
        // If it doesn't exist, create it with default values (should ideally be done once)
        await setDoc(docRef, { list: DEFAULT_TRAP_ANSWER_CATEGORIES });
        return { success: true, categories: DEFAULT_TRAP_ANSWER_CATEGORIES };
    } catch (error) {
        console.error("Error getting trap answer categories:", error);
        return { success: false, error: 'Failed to fetch categories.' };
    }
}

export const getTrapAnswerCategories = withAdminAuth(getPublicTrapAnswerCategories);


export const addTrapAnswerCategory = withAdminAuth(async (adminId: string, category: string): Promise<{success: boolean, error?: string}> => {
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
        return { success: false, error: 'Failed to add category.' };
    }
});

export const editTrapAnswerCategory = withAdminAuth(async (adminId: string, oldCategory: string, newCategory: string): Promise<{ success: boolean; error?: string }> => {
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
        return { success: false, error: 'فشل تعديل القسم.' };
    }
});

export const deleteTrapAnswerCategory = withAdminAuth(async (adminId: string, categoryToDelete: string): Promise<{ success: boolean; count?: number; error?: string }> => {
    if (!categoryToDelete || categoryToDelete.trim() === '') {
        return { error: 'يجب تحديد قسم للحذف.' };
    }
    
    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');

    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
            throw new Error("مستند إعدادات الأقسام غير موجود.");
        }
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
        return { success: false, error: 'فشل حذف القسم والأسئلة المرتبطة به.' };
    }
});

export const setAvatarPrices = withAdminAuth(async (adminId: string, prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> => {
    try {
        const settingsRef = doc(db, 'game_settings', 'avatar_prices');
        await setDoc(settingsRef, { prices });
        return { success: true };
    } catch (error) {
        console.error("Error setting avatar prices:", error);
        return { success: false, error: "Failed to save avatar prices." };
    }
});

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

export const setPunishmentAvatarPrices = withAdminAuth(async (adminId: string, prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> => {
    try {
        const settingsRef = doc(db, 'game_settings', 'punishment_avatar_prices');
        await setDoc(settingsRef, { prices });
        return { success: true };
    } catch (error) {
        console.error("Error setting punishment avatar prices:", error);
        return { success: false, error: "Failed to save punishment avatar prices." };
    }
});

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


export const setDefaultAvatar = withAdminAuth(async (adminId: string, avatarId: string): Promise<{ success: boolean; error?: string }> => {
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
});

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

export const addPermissionToRank = withAdminAuth(async (adminId: string, rankName: string, permissionId: PermissionId): Promise<{ success: boolean, error?: string }> => {
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
});


export const removePermissionFromRank = withAdminAuth(async (adminId: string, rankName: string, permissionId: PermissionId): Promise<{ success: boolean, error?: string }> => {
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
});


export const recalculateGameKings = withAdminAuth(async (adminId: string) => {
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
});

export const getTopUsers = withAdminAuth(async (adminId: string, field: 'coins' | 'leaderboardPoints', count: number): Promise<UserProfile[]> => {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy(field, 'desc'), limit(count));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    } catch (error) {
        console.error(`Error getting top users by ${field}:`, error);
        return [];
    }
});

/**
 * A one-time utility to go through all users and set their `isPunished` flag
 * based on their current active punishments.
 */
export const backfillPunishmentStatus = withAdminAuth(async (adminId: string): Promise<{ success: boolean; count: number; error?: string }> => {
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

            // Update only if the state is different from the one stored
            // or if the field doesn't exist.
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
});


export { searchUsers, giveReward, applyPunishment, getRanks, getUsersByRank };

    