

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
import { searchUsers, getUsersByRank } from './user/queries';


export const setSocialRanks = withAdminAuth(async (adminId: string, ranks: SocialRank[]): Promise<{success: boolean, error?: string}> => {
    try {
        const settingsRef = doc(db, 'game_settings', 'social_ranks');
        await setDoc(settingsRef, { list: ranks });
        return { success: true };
    } catch (error: any) {
        console.error("Error setting social ranks:", error);
        return { success: false, error: error.message || 'فشل حفظ الألقاب الاجتماعية.' };
    }
});

export const getRanks = withAdminAuth(async (adminId: string): Promise<{success: boolean, ranks?: SocialRank[], error?: string}> => {
     try {
        const docRef = doc(db, 'game_settings', 'social_ranks');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().list?.length > 0) {
            const storedRanks: SocialRank[] = docSnap.data().list.map((rank: any) => ({
                permissions: rank.permissions || [],
                ...rank,
            }));
            return { success: true, ranks: storedRanks };
        }
        return { success: true, ranks: DEFAULT_SOCIAL_RANKS };
    } catch (error) {
        console.error("Error getting social ranks:", error);
        return { success: false, error: 'Failed to fetch social ranks.' };
    }
});


export const adminSendMail = withAdminAuth(async (adminId: string, recipientIds: string[], subject: string, body: string, coins: number): Promise<{ success: boolean; error?: string }> => {
  if (!recipientIds || recipientIds.length === 0 || !subject.trim() || !body.trim()) {
    return { success: false, error: "المعلومات غير كافية لإرسال الرسالة." };
  }

  try {
    const senderName = (await getDoc(doc(db, 'users', adminId))).data()?.name || 'Admin';
    const batch = writeBatch(db);
    
    recipientIds.forEach(recipientId => {
        const mailRef = doc(collection(db, `users/${recipientId}/mail`));
        const mailData: Omit<Mail, 'id'> = {
            senderName,
            subject,
            body,
            isRead: false,
            createdAt: serverTimestamp() as any,
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
                batch.set(docRef, { text: question.text.trim(), category: question.category.trim() });
                validQuestionsCount++;
            }
        });
        if (validQuestionsCount === 0) return { error: 'لم يتم العثور على أسئلة صالحة في الملف.' };
        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading questions:", error);
        return { error: 'حدث خطأ أثناء رفع الأسئلة.' };
    }
});

export const uploadTrapAnswerQuestionsFromJson = withAdminAuth(async (adminId: string, questions: { question: string, answer: string, dummyAnswers: string[] }[], category: string) => {
    if (!questions || !Array.isArray(questions) || questions.length === 0) return { error: 'ملف JSON غير صالح أو فارغ.' };
    if (!category || typeof category !== 'string' || category.trim() === '') return { error: 'يجب تحديد قسم صالح.' };
    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'trap_answer_questions');
        let validQuestionsCount = 0;
        questions.forEach(q => {
            if (q && typeof q.question === 'string' && q.question.trim() !== '' && typeof q.answer === 'string' && q.answer.trim() !== '' && Array.isArray(q.dummyAnswers) && q.dummyAnswers.length >= 2 && q.dummyAnswers.every(da => typeof da === 'string' && da.trim() !== '')) {
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
        if (validQuestionsCount === 0) return { error: 'لم يتم العثور على أسئلة صالحة في الملف.' };
        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading trap answer questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة الجواب المفخخ.' };
    }
});

export const uploadSnakesAndScissorsQuestionsFromJson = withAdminAuth(async (adminId: string, questions: { text: string, options: string[], correctAnswer: string }[], category: string) => {
    if (!questions || !Array.isArray(questions) || questions.length === 0) return { error: 'ملف JSON غير صالح أو فارغ.' };
    if (!category || typeof category !== 'string' || category.trim() === '') return { error: 'يجب تحديد قسم صالح.' };
    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'snakes_and_scissors_questions');
        let validQuestionsCount = 0;
        questions.forEach(q => {
            if (q && typeof q.text === 'string' && q.text.trim() !== '' && Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === 'string' && o.trim() !== '') && typeof q.correctAnswer === 'string' && q.correctAnswer.trim() !== '' && q.options.includes(q.correctAnswer)) {
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
        if (validQuestionsCount === 0) return { error: 'لم يتم العثور على أسئلة صالحة في الملف. تأكد من أن كل سؤال له 4 خيارات وأن الجواب الصحيح واحد منهم.' };
        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading Snakes and Scissors questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة السلم والمقص.' };
    }
});


export const uploadPrisonQuestionsFromJson = withAdminAuth(async (adminId: string, questions: { text: string }[]) => {
    if (!questions || !Array.isArray(questions) || questions.length === 0) return { error: 'ملف JSON غير صالح أو فارغ.' };
    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'prison_questions');
        let validQuestionsCount = 0;
        questions.forEach(q => {
            if (q && typeof q.text === 'string' && q.text.trim() !== '') {
                const docRef = doc(questionsCol);
                batch.set(docRef, { text: q.text.trim() });
                validQuestionsCount++;
            }
        });
        if (validQuestionsCount === 0) return { error: 'لم يتم العثور على أسئلة صالحة في الملف.' };
        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading prison questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة السجن.' };
    }
});

export const uploadWordWarWordsFromJson = withAdminAuth(async (adminId: string, words: string[]) => {
    if (!words || !Array.isArray(words) || words.length === 0) return { error: 'ملف JSON غير صالح أو فارغ.' };
    try {
        const batch = writeBatch(db);
        const wordsCol = collection(db, 'word_war_words');
        const uniqueWords = Array.from(new Set(words.map(w => w.trim()).filter(Boolean)));
        uniqueWords.forEach(word => {
            const docRef = doc(wordsCol);
            batch.set(docRef, { text: word });
        });
        if (uniqueWords.length === 0) return { error: 'لم يتم العثور على كلمات صالحة في الملف.' };
        await batch.commit();
        return { success: true, count: uniqueWords.length };
    } catch (error) {
        console.error("Error uploading word war words:", error);
        return { error: 'حدث خطأ أثناء رفع كلمات حرب الكلمات.' };
    }
});

export const countQuestions = withAdminAuth(async (adminId: string, criteria: { game: 'trap-answer' | 'prison' | 'word_war' | 'snakes_and_scissors', category?: string; all?: boolean, duplicates?: { threshold: number } | 'word_war_duplicates' }) => {
    if (!criteria.category && !criteria.all && !criteria.duplicates) return { error: 'يجب تحديد معيار للعد.' };
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
            count = (await getDocs(itemsCol)).size;
        } else if (criteria.category && criteria.duplicates && typeof criteria.duplicates === 'object' && criteria.game === 'trap-answer') {
            const { count: duplicateCount } = await findSimilarQuestions(criteria.game, criteria.duplicates.threshold, criteria.category);
            count = duplicateCount;
        } else if (criteria.duplicates === 'word_war_duplicates' && criteria.game === 'word_war') {
            const { count: duplicateCount } = await findDuplicateWords();
            count = duplicateCount;
        } else if (criteria.category) {
            const q = query(itemsCol, where('category', '==', criteria.category.trim()));
            count = (await getDocs(q)).size;
        }
        return { success: true, count };
    } catch (error) {
        console.error("Error counting items:", error);
        return { error: 'حدث خطأ أثناء عد العناصر.' };
    }
});

export const deleteQuestions = withAdminAuth(async (adminId: string, criteria: { game: 'trap-answer' | 'prison' | 'word_war' | 'snakes_and_scissors', category?: string; all?: boolean }) => {
    if (!criteria.category && !criteria.all) return { error: 'يجب تحديد معيار للحذف.' };
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
        const querySnapshot = await getDocs(criteria.all ? itemsCol : query(itemsCol, where("category", "==", criteria.category!.trim())));
        if (querySnapshot.empty) return { success: true, count: 0, message: criteria.all ? 'قاعدة البيانات فارغة بالفعل.' : 'لم يتم العثور على أسئلة في هذا القسم.' };
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
            count++;
        });
        await batch.commit();
        return { success: true, count };
    } catch (error) {
        console.error("Error deleting items:", error);
        return { error: 'حدث خطأ أثناء حذف العناصر.' };
    }
});

async function findSimilarQuestions(game: 'trap-answer', similarityThreshold: number, category?: string) {
    if (!category) throw new Error("يجب تحديد قسم للبحث عن التكرارات.");
    const q = query(collection(db, 'trap_answer_questions'), where("category", "==", category));
    const querySnapshot = await getDocs(q);
    const questions = querySnapshot.docs.map(doc => ({ id: doc.id, text: doc.data()['question'] as string }));
    if (questions.length < 2) return { groups: [], count: 0 };
    const groups: string[][] = [];
    const processedIds = new Set<string>();
    let deletedCount = 0;
    for (let i = 0; i < questions.length; i++) {
        if (processedIds.has(questions[i].id)) continue;
        const currentGroup = [questions[i].id];
        processedIds.add(questions[i].id);
        for (let j = i + 1; j < questions.length; j++) {
            if (processedIds.has(questions[j].id)) continue;
            if (safeCompareStrings(questions[i].text, questions[j].text) >= similarityThreshold) {
                currentGroup.push(questions[j].id);
                processedIds.add(questions[j].id);
            }
        }
        if (currentGroup.length > 1) {
            groups.push(currentGroup.sort());
            deletedCount += currentGroup.length - 1;
        }
    }
    return { groups, count: deletedCount };
}


export const deleteSimilarQuestions = withAdminAuth(async (adminId: string, game: 'trap-answer', similarityThreshold: number, category?: string) => {
    try {
        const { groups, count: deletedCount } = await findSimilarQuestions(game, similarityThreshold, category);
        if (groups.length === 0) return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة.' };
        const batch = writeBatch(db);
        groups.forEach(group => {
            group.pop(); // Keep one
            group.forEach(idToDelete => batch.delete(doc(db, 'trap_answer_questions', idToDelete)));
        });
        if (deletedCount > 0) await batch.commit();
        return { success: true, count: deletedCount };
    } catch (error) {
        console.error("Error deleting similar questions:", error);
        return { error: 'حدث خطأ غير متوقع أثناء حذف الأسئلة المكررة.' };
    }
});

async function findDuplicateWords() {
    const querySnapshot = await getDocs(collection(db, 'word_war_words'));
    const wordsMap = new Map<string, string[]>();
    querySnapshot.forEach(doc => {
        const text = (doc.data().text as string)?.trim();
        if (text) {
            wordsMap.set(text, [...(wordsMap.get(text) || []), doc.id]);
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
        if (groups.length === 0) return { success: true, count: 0, message: 'لم يتم العثور على كلمات مكررة.' };
        const batch = writeBatch(db);
        groups.forEach(groupOfIds => {
            groupOfIds.sort().shift(); // Keep one
            groupOfIds.forEach(idToDelete => batch.delete(doc(db, 'word_war_words', idToDelete)));
        });
        if (deletedCount > 0) await batch.commit();
        return { success: true, count: deletedCount };
    } catch (error) {
        console.error("Error deleting duplicate words:", error);
        return { error: 'حدث خطأ غير متوقع أثناء حذف الكلمات المكررة.' };
    }
});

export const setAnnouncement = withAdminAuth(async (adminId: string, text: string) => {
    try {
        await setDoc(doc(db, 'game_settings', 'announcement'), { text });
        return { success: true };
    } catch (error) {
        console.error("Error setting announcement:", error);
        return { error: "فشل حفظ الإعلان." };
    }
});

export async function getAnnouncement() {
    try {
        const docSnap = await getDoc(doc(db, 'game_settings', 'announcement'));
        return { success: true, text: docSnap.exists() ? docSnap.data().text || '' : '' };
    } catch (error) {
        console.error("Error getting announcement:", error);
        return { error: "فشل جلب الإعلان." };
    }
}

export const adminUpdateUser = withAdminAuth(async (adminId: string, userId: string, data: Partial<UserProfile>): Promise<{success: boolean, error?: string}> => {
    if(!userId) return {success: false, error: "User ID is required."};
    try {
        await updateDoc(doc(db, 'users', userId), Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined)));
        return {success: true}
    } catch(error) {
        console.error("Error updating user by admin:", error)
        return {success: false, error: "Failed to update user profile."}
    }
});

async function getPublicTrapAnswerCategoriesUnwrapped(): Promise<{success: boolean, categories?: string[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'trap_answer_categories');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return { success: true, categories: docSnap.data().list || [] };
        await setDoc(docRef, { list: DEFAULT_TRAP_ANSWER_CATEGORIES });
        return { success: true, categories: DEFAULT_TRAP_ANSWER_CATEGORIES };
    } catch (error) {
        console.error("Error getting trap answer categories:", error);
        return { success: false, error: 'Failed to fetch categories.' };
    }
}

export const getTrapAnswerCategories = withAdminAuth(async (adminId: string) => {
    return getPublicTrapAnswerCategoriesUnwrapped();
});

export const getPublicTrapAnswerCategories = getPublicTrapAnswerCategoriesUnwrapped;


export const addTrapAnswerCategory = withAdminAuth(async (adminId: string, category: string): Promise<{success: boolean, error?: string}> => {
    if (!category || typeof category !== 'string' || category.trim() === '') return { error: 'اسم القسم غير صالح.' };
    try {
        const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
        await updateDoc(settingsRef, { list: arrayUnion(category.trim()) });
        return { success: true };
    } catch (error) {
        if (isFirebaseError(error) && error.code === 'not-found') {
            await setDoc(doc(db, 'game_settings', 'trap_answer_categories'), { list: [category.trim()] });
            return { success: true };
        }
        console.error("Error adding trap answer category:", error);
        return { success: false, error: 'Failed to add category.' };
    }
});

export const editTrapAnswerCategory = withAdminAuth(async (adminId: string, oldCategory: string, newCategory: string): Promise<{ success: boolean; error?: string }> => {
    if (!oldCategory || !newCategory || oldCategory.trim() === '' || newCategory.trim() === '') return { error: 'الاسم القديم والجديد مطلوبان.' };
    if (oldCategory.trim() === newCategory.trim()) return { error: 'الاسم الجديد للقسم يجب أن يختلف عن الاسم القديم.' };
    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) throw new Error("مستند إعدادات الأقسام غير موجود.");
        const categories: string[] = settingsSnap.data().list || [];
        if (!categories.includes(oldCategory)) return { error: 'القسم القديم غير موجود.' };
        if (categories.includes(newCategory.trim())) return { error: 'الاسم الجديد للقسم موجود بالفعل.' };
        batch.update(settingsRef, { list: categories.map(c => c === oldCategory ? newCategory.trim() : c) });
        const questionsQuery = query(collection(db, 'trap_answer_questions'), where("category", "==", oldCategory));
        const questionsSnapshot = await getDocs(questionsQuery);
        questionsSnapshot.forEach(doc => batch.update(doc.ref, { category: newCategory.trim() }));
        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error editing category:", error);
        return { success: false, error: 'فشل تعديل القسم.' };
    }
});

export const deleteTrapAnswerCategory = withAdminAuth(async (adminId: string, categoryToDelete: string): Promise<{ success: boolean; count?: number; error?: string }> => {
    if (!categoryToDelete || categoryToDelete.trim() === '') return { error: 'يجب تحديد قسم للحذف.' };
    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) throw new Error("مستند إعدادات الأقسام غير موجود.");
        const categories: string[] = settingsSnap.data().list || [];
        if (categories.length <= 1) return { error: "لا يمكن حذف آخر قسم متبقٍ." };
        if (!categories.includes(categoryToDelete)) return { error: "القسم المحدد للحذف غير موجود." };
        batch.update(settingsRef, { list: arrayRemove(categoryToDelete) });
        const questionsQuery = query(collection(db, 'trap_answer_questions'), where("category", "==", categoryToDelete));
        const questionsSnapshot = await getDocs(questionsQuery);
        questionsSnapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        return { success: true, count: questionsSnapshot.size };
    } catch (error) {
        console.error("Error deleting category:", error);
        return { success: false, error: 'فشل حذف القسم والأسئلة المرتبطة به.' };
    }
});

export const setAvatarPrices = withAdminAuth(async (adminId: string, prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> => {
    try {
        await setDoc(doc(db, 'game_settings', 'avatar_prices'), { prices });
        return { success: true };
    } catch (error) {
        console.error("Error setting avatar prices:", error);
        return { success: false, error: "Failed to save avatar prices." };
    }
});

export async function getAvatarPrices(): Promise<{success: boolean, prices?: AvatarPrice[], error?: string}> {
    try {
        const docSnap = await getDoc(doc(db, 'game_settings', 'avatar_prices'));
        return { success: true, prices: docSnap.exists() ? docSnap.data().prices || [] : [] };
    } catch (error) {
        console.error("Error getting avatar prices:", error);
        return { success: false, error: 'Failed to fetch avatar prices.' };
    }
}

export const setPunishmentAvatarPrices = withAdminAuth(async (adminId: string, prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> => {
    try {
        await setDoc(doc(db, 'game_settings', 'punishment_avatar_prices'), { prices });
        return { success: true };
    } catch (error) {
        console.error("Error setting punishment avatar prices:", error);
        return { success: false, error: "Failed to save punishment avatar prices." };
    }
});

export async function getPunishmentAvatarPrices(): Promise<{success: boolean, prices?: AvatarPrice[], error?: string}> {
    try {
        const docSnap = await getDoc(doc(db, 'game_settings', 'punishment_avatar_prices'));
        return { success: true, prices: docSnap.exists() ? docSnap.data().prices || [] : [] };
    } catch (error) {
        console.error("Error getting punishment avatar prices:", error);
        return { success: false, error: 'Failed to fetch punishment avatar prices.' };
    }
}


export const setDefaultAvatar = withAdminAuth(async (adminId: string, avatarId: string): Promise<{ success: boolean; error?: string }> => {
    if (!avatarId || avatarId.trim() === '') return { success: false, error: "Avatar ID is required." };
    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'default_avatar');
    const pricesRef = doc(db, 'game_settings', 'avatar_prices');
    try {
        batch.set(settingsRef, { avatarId: avatarId });
        const pricesDoc = await getDoc(pricesRef);
        const prices = (pricesDoc.exists() ? pricesDoc.data().prices : []) as AvatarPrice[];
        const priceIndex = prices.findIndex(p => p.avatarId === avatarId);
        if (priceIndex !== -1) {
            prices[priceIndex].price = 0;
        } else {
            prices.push({ avatarId: avatarId, price: 0, currency: 'coins' });
        }
        batch.set(pricesRef, { prices });
        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error setting default avatar:", error);
        return { success: false, error: "Failed to set default avatar." };
    }
});

export async function getDefaultAvatar(): Promise<{ success: boolean; avatarId?: string; error?: string }> {
    try {
        const docSnap = await getDoc(doc(db, 'game_settings', 'default_avatar'));
        return { success: true, avatarId: docSnap.exists() ? docSnap.data().avatarId : 'Avatar00.png' }; 
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
            if (!ranks[rankIndex].permissions) ranks[rankIndex].permissions = [];
            if (!ranks[rankIndex].permissions!.includes(permissionId)) {
                ranks[rankIndex].permissions!.push(permissionId);
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
                ranks[rankIndex].permissions = ranks[rankIndex].permissions!.filter(p => p !== permissionId);
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
        const usersSnapshot = await getDocs(collection(db, 'users'));
        if (usersSnapshot.empty) return { success: true, updatedCount: 0 };
        const users: UserProfile[] = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        const newKings: Record<string, GameKing & { kingId: string }> = {};
        users.forEach(user => {
            Object.entries(user.winCounts || {}).forEach(([gameType, count]) => {
                if (!newKings[gameType] || count > newKings[gameType].winCount) {
                    newKings[gameType] = { kingId: user.uid, name: user.name, avatarId: user.avatarId, winCount: count };
                }
            });
        });
        const currentKingsSnapshot = await getDocs(collection(db, 'game_kings'));
        currentKingsSnapshot.forEach(doc => batch.delete(doc.ref));
        Object.entries(newKings).forEach(([gameType, kingData]) => batch.set(doc(db, 'game_kings', gameType), kingData));
        await batch.commit();
        return { success: true, updatedCount: Object.keys(newKings).length };
    } catch (error: any) {
        console.error("Error recalculating game kings:", error);
        return { success: false, error: error.message || "فشل إعادة حساب ملوك الألعاب." };
    }
});

export const getTopUsers = withAdminAuth(async (adminId: string, field: 'coins' | 'leaderboardPoints', count: number): Promise<UserProfile[]> => {
    try {
        const q = query(collection(db, 'users'), orderBy(field, 'desc'), limit(count));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    } catch (error) {
        console.error(`Error getting top users by ${field}:`, error);
        return [];
    }
});

export const backfillPunishmentStatus = withAdminAuth(async (adminId: string): Promise<{ success: boolean; count: number; error?: string }> => {
    const usersRef = collection(db, 'users');
    try {
        const snapshot = await getDocs(usersRef);
        if (snapshot.empty) return { success: true, count: 0 };
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
        if (updatedCount > 0) await batch.commit();
        return { success: true, count: updatedCount };
    } catch (error: any) {
        console.error("Error backfilling punishment status:", error);
        return { success: false, count: 0, error: "Failed to update user punishment statuses." };
    }
});


export { searchUsers, giveReward, applyPunishment, getUsersByRank };
