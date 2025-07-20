

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
} from 'firebase/firestore';
import { isFirebaseError } from './helpers';
import { findBestMatch } from 'string-similarity';
import type { UserProfile, AvatarPrice, SocialRank } from '@/types';
import { DEFAULT_TRAP_ANSWER_CATEGORIES } from '@/types';

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

export async function countQuestions(criteria: { game: 'trap-answer', category?: string; searchTerm?: string; answerSearchTerm?: string; all?: boolean, duplicates?: { threshold: number } }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all && !criteria.duplicates) {
        return { error: 'يجب تحديد معيار للعد.' };
    }

    const collectionName = criteria.game === 'trap-answer' ? 'trap_answer_questions' : 'questions';

    try {
        const questionsCol = collection(db, collectionName);
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(questionsCol);
            count = querySnapshot.size;
        } else if (criteria.category && !criteria.duplicates) {
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
        } else if (criteria.duplicates && criteria.category) {
            const { count: duplicateCount } = await findSimilarQuestions(criteria.game, criteria.duplicates.threshold, criteria.category);
            count = duplicateCount;
        }
        
        return { success: true, count };
    } catch (error) {
        console.error("Error counting questions:", error);
        return { error: 'حدث خطأ أثناء عد الأسئلة.' };
    }
}

export async function deleteQuestions(criteria: { game: 'trap-answer', category?: string; searchTerm?: string; answerSearchTerm?: string; all?: boolean }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all) {
        return { error: 'يجب تحديد معيار للحذف.' };
    }

    const collectionName = criteria.game === 'trap-answer' ? 'trap_answer_questions' : 'questions';

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
        } else if (criteria.category) {
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
      .map((doc) => ({ uid: doc.id, ...doc.data() } as UserProfile))
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

export async function setAvatarPrices(prices: AvatarPrice[]) {
     try {
        const settingsRef = doc(db, 'game_settings', 'avatar_prices');
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
        console.error("Error adding trap answer category:", error);
        if (isFirebaseError(error) && error.code === 'not-found') {
            // If the document doesn't exist, create it.
            await setDoc(doc(db, 'game_settings', 'trap_answer_categories'), {
                list: [category.trim()]
            });
            return { success: true };
        }
        return { success: false, error: 'Failed to add category.' };
    }
}
