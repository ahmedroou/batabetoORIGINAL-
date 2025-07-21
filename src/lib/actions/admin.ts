

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
} from 'firebase/firestore';
import { isFirebaseError } from './helpers';
import { findBestMatch } from 'string-similarity';
import type { UserProfile, AvatarPrice, SocialRank, PrisonQuestion, Game } from '@/types';
import { DEFAULT_TRAP_ANSWER_CATEGORIES, DEFAULT_SOCIAL_RANKS } from '@/types';

export async function uploadQuestionsFromJson(questions: { text: string; category: string }[]) {
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

        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading questions:", error);
        return { error: 'حدث خطأ أثناء رفع الأسئلة.' };
    }
}

export async function uploadTrapAnswerQuestionsFromJson(questions: { question: string, answer: string, dummyAnswers: string[] }[], category: string) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }
     if (!category || typeof category !== 'string') {
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

        await batch.commit();
        return { success: true, count: validQuestionsCount };
    } catch (error) {
        console.error("Error uploading trap answer questions:", error);
        return { error: 'حدث خطأ أثناء رفع أسئلة الجواب المفخخ.' };
    }
}

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
}


export async function countQuestions(criteria: { game: 'trap-answer' | 'prison', category?: string; searchTerm?: string; answerSearchTerm?: string; all?: boolean, duplicates?: { threshold: number } }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all && !criteria.duplicates) {
        return { error: 'يجب تحديد معيار للعد.' };
    }

    const collectionName = criteria.game === 'trap-answer' ? 'trap_answer_questions' : 'prison_questions';

    try {
        const questionsCol = collection(db, collectionName);
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(questionsCol);
            count = querySnapshot.size;
        } else if (criteria.category && !criteria.duplicates && criteria.game === 'trap-answer') {
            const q = query(questionsCol, where('category', '==', criteria.category.trim()));
            const querySnapshot = await getDocs(q);
            count = querySnapshot.size;
        } else if (criteria.searchTerm) {
            const textFieldName = criteria.game === 'trap-answer' ? 'question' : 'text';
            const searchTerm = criteria.searchTerm.trim();
            const querySnapshot = await getDocs(questionsCol);
            querySnapshot.forEach(doc => {
                const text = doc.data()[textFieldName] as string;
                if (text && text.includes(searchTerm)) {
                    count++;
                }
            });
        } else if (criteria.answerSearchTerm && criteria.game === 'trap-answer') {
            const searchTerm = criteria.answerSearchTerm.trim();
            const querySnapshot = await getDocs(questionsCol);
            querySnapshot.forEach(doc => {
                const text = doc.data()['answer'] as string;
                if (text && text.includes(searchTerm)) {
                    count++;
                }
            });
        } else if (criteria.duplicates && criteria.category && criteria.game === 'trap-answer') {
            const { count: duplicateCount } = await findSimilarQuestions(criteria.game, criteria.duplicates.threshold, criteria.category);
            count = duplicateCount;
        }
        
        return { success: true, count };
    } catch (error) {
        console.error("Error counting questions:", error);
        return { error: 'حدث خطأ أثناء عد الأسئلة.' };
    }
}

export async function deleteQuestions(criteria: { game: 'trap-answer' | 'prison', category?: string; searchTerm?: string; answerSearchTerm?: string; all?: boolean }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all) {
        return { error: 'يجب تحديد معيار للحذف.' };
    }

    const collectionName = criteria.game === 'trap-answer' ? 'trap_answer_questions' : 'prison_questions';

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, collectionName);
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(questionsCol);
            if (querySnapshot.empty) return { success: true, count: 0, message: 'قاعدة البيانات فارغة بالفعل.' };
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });
        } else if (criteria.category && criteria.game === 'trap-answer') {
            const q = query(questionsCol, where('category', '==', criteria.category.trim()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                return { success: true, count: 0, message: 'لم يتم العثور على أسئلة في هذا القسم.' };
            }
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });
        } else if (criteria.searchTerm) {
            const textFieldName = criteria.game === 'trap-answer' ? 'question' : 'text';
            const searchTerm = criteria.searchTerm.trim();
            const querySnapshot = await getDocs(questionsCol);
            querySnapshot.forEach(doc => {
                const text = doc.data()[textFieldName] as string;
                if (text && text.includes(searchTerm)) {
                    batch.delete(doc.ref);
                    count++;
                }
            });
             if (count === 0) {
                return { success: true, count: 0, message: 'لم يتم العثور على أسئلة تحتوي على هذا النص.' };
            }
        } else if (criteria.answerSearchTerm && criteria.game === 'trap-answer') {
            const searchTerm = criteria.answerSearchTerm.trim();
            const querySnapshot = await getDocs(questionsCol);
            querySnapshot.forEach(doc => {
                const text = doc.data()['answer'] as string;
                if (text && text.includes(searchTerm)) {
                    batch.delete(doc.ref);
                    count++;
                }
            });
            if (count === 0) {
                return { success: true, count: 0, message: 'لم يتم العثور على أسئلة تحتوي على هذا الجواب.' };
            }
        }

        await batch.commit();
        return { success: true, count };
    } catch (error) {
        console.error("Error deleting questions:", error);
        return { error: 'حدث خطأ أثناء حذف الأسئلة.' };
    }
}

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
        const otherStrings = questions.slice(i + 1).map(q => q.text).filter(Boolean);
        const otherIds = questions.slice(i + 1).filter(q => q.text).map(q => q.id);

        if (otherStrings.length > 0) {
            const { ratings } = findBestMatch(mainString, otherStrings);

            ratings.forEach((rating, index) => {
                const duplicateId = otherIds[index];
                if (rating.rating >= similarityThreshold && !processedIds.has(duplicateId)) {
                    currentGroup.push(duplicateId);
                    processedIds.add(duplicateId);
                }
            });
        }

        if (currentGroup.length > 1) {
            groups.push(currentGroup);
            // Sort alphabetically to determine which is "newer".
            // Firestore IDs are time-ordered.
            currentGroup.sort();
            deletedCount += currentGroup.length - 1; // All but one will be deleted.
        }
    }
    return { groups, count: deletedCount };
}


export async function deleteSimilarQuestions(game: 'trap-answer', similarityThreshold: number, category?: string) {
    try {
        const { groups, count: deletedCount } = await findSimilarQuestions(game, similarityThreshold, category);

        if (groups.length === 0) {
            return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة.' };
        }

        const batch = writeBatch(db);
        
        groups.forEach(group => {
            group.sort(); // Sort by ID (time-ordered)
            group.pop(); // Keep the newest one, remove it from deletion list

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
        if (isFirebaseError(error)) {
            return { error: `فشل حذف الأسئلة المكررة: ${error.message}` };
        }
        return { error: 'حدث خطأ غير متوقع أثناء حذف الأسئلة المكررة.' };
    }
}


export async function setFailedDetectiveAnimation(videoDataUri: string) {
    try {
        if (!videoDataUri.startsWith('data:video')) {
            return { error: 'ملف غير صالح. الرجاء رفع ملف فيديو.' };
        }
        const MAX_DOC_SIZE = 1048576;
        if (videoDataUri.length > MAX_DOC_SIZE) {
            return { error: 'فشل الرفع. حجم الفيديو كبير جدًا بعد تحويله (يتجاوز 1 ميجابايت). حاول استخدام فيديو أصغر حجمًا.' };
        }

        const settingsRef = doc(db, 'game_settings', 'animations');
        await setDoc(settingsRef, { failedDetectiveVideoUrl: videoDataUri }, { merge: true });
        return { success: true };
    } catch (error) {
        console.error("Error setting custom animation:", error);
        if (isFirebaseError(error)) {
            if (error.code === 'invalid-argument') {
                return { error: 'فشل الرفع. تجاوز حجم الفيديو الحد الأقصى المسموح به في قاعدة البيانات (1 ميجابايت) بعد المعالجة. الرجاء استخدام فيديو أصغر.' };
            }
            if (error.code === 'permission-denied') {
                return { error: 'فشل الرفع: ليس لديك الصلاحية للكتابة. تحقق من قواعد أمان Firestore.' };
            }
            return { error: `فشل الرفع بسبب خطأ في Firebase: ${error.message} (Code: ${error.code})` };
        }
        return { error: 'حدث خطأ غير متوقع أثناء حفظ الفيديو.' };
    }
}

export async function removeFailedDetectiveAnimation() {
    try {
        const settingsRef = doc(db, 'game_settings', 'animations');
        await updateDoc(settingsRef, {
            failedDetectiveVideoUrl: deleteField()
        });
        return { success: true };
    } catch (error) {
        console.error("Error removing custom animation:", error);
        if (isFirebaseError(error)) {
            if (error.code === 'permission-denied') {
                return { error: 'فشل الحذف: ليس لديك الصلاحية للكتابة. تحقق من قواعد أمان Firestore.' };
            }
            return { error: `فشل الحذف بسبب خطأ في Firebase: ${error.message} (Code: ${error.code})` };
        }
        return { error: 'حدث خطأ غير متوقع أثناء حذف الفيديو.' };
    }
}

export async function getFailedDetectiveAnimation() {
    try {
        const docRef = doc(db, 'game_settings', 'animations');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, url: docSnap.data().failedDetectiveVideoUrl || null };
        }
        return { success: true, url: null };
    } catch (error) {
        console.error("Error getting custom animation:", error);
        return { error: 'حدث خطأ أثناء جلب الفيديو.' };
    }
}

export async function setAnnouncement(text: string) {
    try {
        const settingsRef = doc(db, 'game_settings', 'announcement');
        await setDoc(settingsRef, { text });
        return { success: true };
    } catch (error) {
        console.error("Error setting announcement:", error);
        return { error: "فشل حفظ الإعلان." };
    }
}

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


export async function searchUsers(searchTerm: string): Promise<UserProfile[]> {
  if (!searchTerm.trim()) {
    return [];
  }
  const lowerCaseSearchTerm = searchTerm.toLowerCase();

  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    const users = querySnapshot.docs
      .map((doc) => {
        const data = doc.data();
        // Remove the problematic createdAt field before returning
        const { createdAt, ...rest } = data;
        return { uid: doc.id, ...rest } as UserProfile;
      })
      .filter(
        (user) =>
          user.name.toLowerCase().includes(lowerCaseSearchTerm) ||
          user.email?.toLowerCase().includes(lowerCaseSearchTerm)
      );
    return users;
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

export async function adminUpdateUser(userId: string, data: Partial<UserProfile>): Promise<{success: boolean, error?: string}> {
    if(!userId) return {success: false, error: "User ID is required."};
    
    const userRef = doc(db, 'users', userId);
    try {
        await updateDoc(userRef, data);
        return {success: true}
    } catch(error) {
        console.error("Error updating user by admin:", error)
        return {success: false, error: "Failed to update user profile."}
    }
}

export async function getTrapAnswerCategories(): Promise<{success: boolean, categories?: string[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'trap_answer_categories');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, categories: docSnap.data().list || [] };
        }
        // If it doesn't exist, create it with default values
        await setDoc(docRef, { list: DEFAULT_TRAP_ANSWER_CATEGORIES });
        return { success: true, categories: DEFAULT_TRAP_ANSWER_CATEGORIES };
    } catch (error) {
        console.error("Error getting trap answer categories:", error);
        return { success: false, error: 'Failed to fetch categories.' };
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
            // If the document doesn't exist, create it.
            await setDoc(doc(db, 'game_settings', 'trap_answer_categories'), {
                list: [category.trim()]
            });
            return { success: true };
        }
        console.error("Error adding trap answer category:", error);
        return { success: false, error: 'Failed to add category.' };
    }
}

export async function editTrapAnswerCategory(oldCategory: string, newCategory: string): Promise<{ success: boolean; error?: string }> {
    if (!oldCategory || !newCategory || oldCategory.trim() === newCategory.trim()) {
        return { error: 'الاسم القديم والجديد مطلوبان ويجب أن يكونا مختلفين.' };
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
        if (categories.includes(newCategory)) {
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
}

export async function deleteTrapAnswerCategory(categoryToDelete: string): Promise<{ success: boolean; count?: number; error?: string }> {
    if (!categoryToDelete) {
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
}

export async function resetAllUserAvatars(): Promise<{ success: boolean; error?: string; count?: number, message?: string }> {
    try {
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);
        
        if (querySnapshot.empty) {
            return { success: true, count: 0, message: "لم يتم العثور على مستخدمين لإعادة تعيينهم." };
        }

        const batch = writeBatch(db);
        const { avatarId: defaultAvatar } = await getDefaultAvatar();

        querySnapshot.forEach(doc => {
            batch.update(doc.ref, {
                avatarId: defaultAvatar || 'Avatar00.png',
                unlockedAvatars: [defaultAvatar || 'Avatar00.png']
            });
        });

        await batch.commit();
        
        return { success: true, count: querySnapshot.size };
    } catch (error) {
        console.error("Error resetting all user avatars:", error);
        return { success: false, error: 'فشل إعادة ضبط شخصيات المستخدمين.' };
    }
}

export async function getTopUsers(field: 'coins' | 'leaderboardPoints', count: number): Promise<UserProfile[]> {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy(field, 'desc'), limit(count));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    } catch (error) {
        console.error(`Error getting top users by ${field}:`, error);
        return [];
    }
}

// Social Ranks
export async function setSocialRanks(ranks: SocialRank[]): Promise<{success: boolean, error?: string}> {
    try {
        const settingsRef = doc(db, 'game_settings', 'social_ranks');
        // We always overwrite the whole array.
        await setDoc(settingsRef, { list: ranks });
        return { success: true };
    } catch (error) {
        console.error("Error setting social ranks:", error);
        return { success: false, error: 'فشل حفظ الألقاب الاجتماعية.' };
    }
}

export async function getSocialRanks(): Promise<{success: boolean, ranks?: SocialRank[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'social_ranks');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, ranks: docSnap.data().list || [] };
        }
        // If it doesn't exist, create it with default values
        await setDoc(docRef, { list: DEFAULT_SOCIAL_RANKS });
        return { success: true, ranks: DEFAULT_SOCIAL_RANKS };
    } catch (error) {
        console.error("Error getting social ranks:", error);
        return { success: false, error: 'فشل جلب الألقاب الاجتماعية.' };
    }
}

// Avatar Prices
export async function setAvatarPrices(prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> {
     try {
        const settingsRef = doc(db, 'game_settings', 'avatar_prices');
        // Overwrite the document with the new prices array
        await setDoc(settingsRef, { prices });
        return { success: true };
    } catch (error) {
        console.error("Error setting avatar prices:", error);
        return { success: false, error: "Failed to save avatar prices." };
    }
}

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

export async function setDefaultAvatar(avatarId: string): Promise<{ success: boolean; error?: string }> {
    if (!avatarId) {
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
                prices.push({ avatarId: avatarId, price: 0 });
            }
            batch.update(pricesRef, { prices });
        } else {
            batch.set(pricesRef, { prices: [{ avatarId, price: 0 }] });
        }
        
        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error setting default avatar:", error);
        return { success: false, error: "Failed to set default avatar." };
    }
}

export async function getDefaultAvatar(): Promise<{ success: boolean; avatarId?: string; error?: string }> {
    try {
        const docRef = doc(db, 'game_settings', 'default_avatar');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, avatarId: docSnap.data().avatarId };
        }
        // Return hardcoded default if not set
        return { success: true, avatarId: 'Avatar00.png' };
    } catch (error) {
        console.error("Error getting default avatar:", error);
        return { success: false, error: 'Failed to fetch default avatar.' };
    }
}

// Judge Powers
export async function getLiveGameStats(gameId: string): Promise<{ gameData?: { players: any[], gameState: string, round: number }; error?: string }> {
    try {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await getDoc(gameRef);

        if (!gameDoc.exists()) {
            return { error: "لم يتم العثور على لعبة بهذا المعرف." };
        }

        const game = gameDoc.data() as Game;
        if (game.gameType !== 'prison') {
            return { error: "هذه الصلاحيات مخصصة للعبة السجن فقط." };
        }
        
        const playersWithStats = game.players.map(p => {
            const highestBid = Object.values(game.prisonState?.bids || {}).find(([id]) => id === p.id)?.[1] || 0;
            const roundsInPrison = game.prisonState?.prisonLog?.find(log => log.playerId === p.id)?.roundsInPrison || 0;
            
            let activity = "ينتظر";
            if (game.prisonState?.withdrawnBidders?.includes(p.id)) {
                activity = "منسحب";
            } else if (game.prisonState?.bids?.[p.id]) {
                activity = `زايد بـ ${game.prisonState.bids[p.id]}`;
            } else if (game.gameState === 'open_auction_answering') {
                activity = game.prisonState.openAuctionSubmissions?.[p.id] ? "أرسل إجاباته" : "يكتب...";
            }

            return {
                id: p.id,
                name: p.name,
                avatarId: p.avatarId,
                status: p.status,
                activity,
                highestBid,
                roundsInPrison,
            };
        });

        return {
            gameData: {
                players: playersWithStats,
                gameState: game.gameState,
                round: game.round || 0,
            }
        };

    } catch (error) {
        console.error("Error getting live game stats:", error);
        return { error: "حدث خطأ أثناء جلب بيانات اللعبة." };
    }
}

export async function kickPlayerFromAnyGame(gameId: string, adminId: string, playerIdToKick: string): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");

            const game = gameDoc.data() as Game;
            const playerIndex = game.players.findIndex(p => p.id === playerIdToKick);
            if (playerIndex === -1) throw new Error("Player not found in this game.");
            
            const updatedPlayers = game.players.filter(p => p.id !== playerIdToKick);
            const updatedPlayerUids = game.playerUids.filter(uid => uid !== playerIdToKick);
            
            if (updatedPlayers.length === 0) {
                 transaction.delete(gameRef); 
            } else {
                 let newHostId = game.hostId;
                 if (game.hostId === playerIdToKick) {
                     newHostId = updatedPlayers[0]?.id || '';
                 }
                 transaction.update(gameRef, { 
                    players: updatedPlayers,
                    playerUids: updatedPlayerUids,
                    hostId: newHostId 
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error kicking player from game:", error);
        return { error: error.message || 'An unexpected error occurred while kicking the player.' };
    }
}

    
