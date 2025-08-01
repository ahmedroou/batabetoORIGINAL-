

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
import { isFirebaseError } from './helpers';
import type { UserProfile, AvatarPrice, SocialRank, PrisonQuestion, Game, TrapQuestion, Mail } from '@/types';
import { DEFAULT_TRAP_ANSWER_CATEGORIES, DEFAULT_SOCIAL_RANKS } from '@/types';
import { safeCompareStrings } from './trap-answer';


/**
 * Uploads general questions from a JSON array to the 'questions' collection.
 * @param {Array<{ text: string; category: string }>} questions - An array of question objects.
 * @returns {Promise<{ success?: boolean; count?: number; error?: string }>} Result of the upload operation.
 */
export async function uploadQuestionsFromJson(questions: { text: string; category: string }[]) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'questions');
        let validQuestionsCount = 0;

        questions.forEach(question => {
            // Validate each question object
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
}

/**
 * Uploads Trap Answer game questions from a JSON array to the 'trap_answer_questions' collection.
 * @param {Array<{ question: string, answer: string, dummyAnswers: string[] }>} questions - An array of Trap Answer question objects.
 * @param {string} category - The category for these questions.
 * @returns {Promise<{ success?: boolean; count?: number; error?: string }>} Result of the upload operation.
 */
export async function uploadTrapAnswerQuestionsFromJson(questions: { question: string, answer: string, dummyAnswers: string[] }[], category: string) {
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
            // Validate each Trap Answer question object
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
}

/**
 * Uploads Prison game questions from a JSON array to the 'prison_questions' collection.
 * @param {Array<{ text: string }>} questions - An array of Prison question objects.
 * @returns {Promise<{ success?: boolean; count?: number; error?: string }>} Result of the upload operation.
 */
export async function uploadPrisonQuestionsFromJson(questions: { text: string }[]) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'prison_questions');
        let validQuestionsCount = 0;

        questions.forEach(q => {
            // Validate each Prison question object
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


/**
 * Uploads Word War game words from a JSON array to the 'word_war_words' collection.
 * @param {string[]} words - An array of words.
 * @returns {Promise<{ success?: boolean; count?: number; error?: string }>} Result of the upload operation.
 */
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
}


/**
 * Counts questions based on specified criteria.
 * Note: For searchTerm and answerSearchTerm, this fetches all documents and filters client-side due to Firestore's query limitations.
 * @param {object} criteria - The criteria for counting questions.
 * @param {'trap-answer' | 'prison' | 'word_war'} criteria.game - The game type.
 * @param {string} [criteria.category] - Category to filter by (for trap-answer).
 * @param {string} [criteria.searchTerm] - Text to search within the question text.
 * @param {string} [criteria.answerSearchTerm] - Text to search within the answer text (for trap-answer).
 * @param {boolean} [criteria.all] - If true, counts all questions in the collection.
 * @param {{ threshold: number }} [criteria.duplicates] - If present, counts duplicate questions based on similarity threshold.
 * @returns {Promise<{ success?: boolean; count?: number; error?: string }>} Result containing the count or an error.
 */
export async function countQuestions(criteria: { game: 'trap-answer' | 'prison' | 'word_war', category?: string; searchTerm?: string; answerSearchTerm?: string; all?: boolean, duplicates?: { threshold: number } }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all && !criteria.duplicates) {
        return { error: 'يجب تحديد معيار للعد.' };
    }

    const collectionName = criteria.game === 'trap-answer' ? 'trap_answer_questions' : criteria.game === 'prison' ? 'prison_questions' : 'word_war_words';

    try {
        const itemsCol = collection(db, collectionName);
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(itemsCol);
            count = querySnapshot.size;
        } else if (criteria.category && !criteria.duplicates && criteria.game === 'trap-answer') {
            const q = query(itemsCol, where('category', '==', criteria.category.trim()));
            const querySnapshot = await getDocs(q);
            count = querySnapshot.size;
        } else if (criteria.searchTerm) {
            const textFieldName = criteria.game === 'trap-answer' ? 'question' : 'text';
            const searchTerm = criteria.searchTerm.trim();
            const querySnapshot = await getDocs(itemsCol); // Fetch all for client-side filtering
            querySnapshot.forEach(doc => {
                const text = doc.data()[textFieldName] as string;
                if (text && text.includes(searchTerm)) {
                    count++;
                }
            });
        } else if (criteria.answerSearchTerm && criteria.game === 'trap-answer') {
            const searchTerm = criteria.answerSearchTerm.trim();
            const querySnapshot = await getDocs(itemsCol); // Fetch all for client-side filtering
            querySnapshot.forEach(doc => {
                const text = doc.data()['answer'] as string;
                if (text && text.includes(searchTerm)) {
                    count++;
                }
            });
        } else if (criteria.duplicates && criteria.category && criteria.game === 'trap-answer') {
            // Find duplicates only for Trap Answer questions within a category
            const { count: duplicateCount } = await findSimilarQuestions(criteria.game, criteria.duplicates.threshold, criteria.category);
            count = duplicateCount;
        }
        
        return { success: true, count };
    } catch (error) {
        console.error("Error counting items:", error);
        return { error: 'حدث خطأ أثناء عد العناصر.' };
    }
}

/**
 * Deletes questions based on specified criteria.
 * Note: For searchTerm and answerSearchTerm, this fetches all documents and filters client-side due to Firestore's query limitations.
 * @param {object} criteria - The criteria for deleting questions.
 * @param {'trap-answer' | 'prison' | 'word_war'} criteria.game - The game type.
 * @param {string} [criteria.category] - Category to filter by (for trap-answer).
 * @param {string} [criteria.searchTerm] - Text to search within the question text.
 * @param {string} [criteria.answerSearchTerm] - Text to search within the answer text (for trap-answer).
 * @param {boolean} [criteria.all] - If true, deletes all questions in the collection.
 * @returns {Promise<{ success?: boolean; count?: number; error?: string; message?: string }>} Result containing the count of deleted questions or an error.
 */
export async function deleteQuestions(criteria: { game: 'trap-answer' | 'prison' | 'word_war', category?: string; searchTerm?: string; answerSearchTerm?: string; all?: boolean }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.answerSearchTerm && !criteria.all) {
        return { error: 'يجب تحديد معيار للحذف.' };
    }

     const collectionName = criteria.game === 'trap-answer' ? 'trap_answer_questions' : criteria.game === 'prison' ? 'prison_questions' : 'word_war_words';

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
        } else if (criteria.category && criteria.game === 'trap-answer') {
            const q = query(itemsCol, where('category', '==', criteria.category.trim()));
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
            const querySnapshot = await getDocs(itemsCol); // Fetch all for client-side filtering
            querySnapshot.forEach(doc => {
                const text = doc.data()[textFieldName] as string;
                if (text && text.includes(searchTerm)) {
                    batch.delete(doc.ref);
                    count++;
                }
            });
            if (count === 0) {
                return { success: true, count: 0, message: 'لم يتم العثور على عناصر تحتوي على هذا النص.' };
            }
        } else if (criteria.answerSearchTerm && criteria.game === 'trap-answer') {
            const searchTerm = criteria.answerSearchTerm.trim();
            const querySnapshot = await getDocs(itemsCol); // Fetch all for client-side filtering
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
        console.error("Error deleting items:", error);
        return { error: 'حدث خطأ أثناء حذف العناصر.' };
    }
}

/**
 * Finds similar questions within a specific category for Trap Answer game.
 * Uses a safe, built-in string comparison function.
 * Note: This fetches all questions in the category and performs comparisons client-side.
 * @param {'trap-answer'} game - The game type (currently only 'trap-answer' is supported for this function).
 * @param {number} similarityThreshold - The similarity threshold (0-1) to consider questions as duplicates.
 * @param {string} category - The category to search within.
 * @returns {Promise<{ groups: string[][]; count: number }>} An object containing groups of similar question IDs and the count of duplicates found.
 * @throws {Error} If category is not specified.
 */
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
        return { groups: [], count: 0 }; // Need at least two questions to find duplicates
    }

    const groups: string[][] = [];
    const processedIds = new Set<string>(); // Keep track of IDs already processed to avoid redundant comparisons
    let deletedCount = 0;

    for (let i = 0; i < questions.length; i++) {
        if (processedIds.has(questions[i].id)) {
            continue; // Skip if already part of a group
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
            // Sort alphabetically (which aligns with Firestore's time-ordered IDs)
            // This ensures consistent selection of the "newest" or "oldest" to keep/delete.
            currentGroup.sort();
            deletedCount += currentGroup.length - 1; // All but one in the group will be deleted
        }
    }
    return { groups, count: deletedCount };
}


/**
 * Deletes similar (duplicate) questions for Trap Answer game within a specific category.
 * Keeps the "newest" question in each group of duplicates (based on Firestore ID).
 * @param {'trap-answer'} game - The game type (currently only 'trap-answer' is supported).
 * @param {number} similarityThreshold - The similarity threshold (0-1) to consider questions as duplicates.
 * @param {string} category - The category to delete duplicates from.
 * @returns {Promise<{ success?: boolean; count?: number; error?: string; message?: string }>} Result containing the count of deleted questions or an error.
 */
export async function deleteSimilarQuestions(game: 'trap-answer', similarityThreshold: number, category?: string) {
    try {
        const { groups, count: deletedCount } = await findSimilarQuestions(game, similarityThreshold, category);

        if (groups.length === 0) {
            return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة.' };
        }

        const batch = writeBatch(db);
        
        groups.forEach(group => {
            group.sort(); // Sort by ID (Firestore IDs are time-ordered, so this puts newer IDs last)
            group.pop(); // Remove the last element (the "newest" one) from the group, so it's kept

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


/**
 * Sets a global announcement message.
 * @param {string} text - The announcement text.
 * @returns {Promise<{ success?: boolean; error?: string }>} Result of the operation.
 */
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

/**
 * Retrieves the current global announcement message.
 * @returns {Promise<{ success?: boolean; text?: string; error?: string }>} Result containing the announcement text or an error.
 */
export async function getAnnouncement() {
    try {
        const docRef = doc(db, 'game_settings', 'announcement');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, text: docSnap.data().text || '' };
        }
        return { success: true, text: '' }; // No announcement set
    } catch (error) {
        console.error("Error getting announcement:", error);
        return { error: "فشل جلب الإعلان." };
    }
}


/**
 * Searches for user profiles by name or email.
 * Note: This fetches all user documents and filters client-side due to Firestore's query limitations for partial string matching.
 * @param {string} searchTerm - The term to search for.
 * @returns {Promise<UserProfile[]>} An array of matching user profiles.
 */
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
          user.name?.toLowerCase().includes(lowerCaseSearchTerm) ||
          user.email?.toLowerCase().includes(lowerCaseSearchTerm)
      );
    return users;
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

/**
 * Updates a user's profile data (admin only).
 * @param {string} userId - The ID of the user to update.
 * @param {Partial<UserProfile>} data - The data to update.
 * @returns {Promise<{success: boolean, error?: string}>} Result of the update operation.
 */
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

/**
 * Retrieves the list of categories for the Trap Answer game.
 * If no categories are set, it initializes with default ones.
 * @returns {Promise<{success: boolean, categories?: string[], error?: string}>} Result containing the categories or an error.
 */
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

/**
 * Adds a new category to the Trap Answer game.
 * @param {string} category - The category name to add.
 * @returns {Promise<{success: boolean, error?: string}>} Result of the operation.
 */
export async function addTrapAnswerCategory(category: string): Promise<{success: boolean, error?: string}> {
    if (!category || typeof category !== 'string' || category.trim() === '') {
        return { error: 'اسم القسم غير صالح.' };
    }
    try {
        const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
        await updateDoc(settingsRef, {
            list: arrayUnion(category.trim()) // Atomically add to array
        });
        return { success: true };
    } catch (error) {
        if (isFirebaseError(error) && error.code === 'not-found') {
            // If the document doesn't exist, create it with the new category.
            await setDoc(doc(db, 'game_settings', 'trap_answer_categories'), {
                list: [category.trim()]
            });
            return { success: true };
        }
        console.error("Error adding trap answer category:", error);
        return { success: false, error: 'Failed to add category.' };
    }
}

/**
 * Edits an existing category name for the Trap Answer game and updates all associated questions.
 * @param {string} oldCategory - The current name of the category.
 * @param {string} newCategory - The new name for the category.
 * @returns {Promise<{ success: boolean; error?: string }>} Result of the operation.
 */
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

        // Update the category list in settings
        const updatedCategories = categories.map(c => c === oldCategory ? newCategory.trim() : c);
        batch.update(settingsRef, { list: updatedCategories });
        
        // Update the category field for all questions under the old category
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

/**
 * Deletes a category from the Trap Answer game and all associated questions.
 * @param {string} categoryToDelete - The name of the category to delete.
 * @returns {Promise<{ success: boolean; count?: number; error?: string }>} Result containing the count of deleted questions or an error.
 */
export async function deleteTrapAnswerCategory(categoryToDelete: string): Promise<{ success: boolean; count?: number; error?: string }> {
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
        
        // Remove category from the list
        batch.update(settingsRef, { list: arrayRemove(categoryToDelete) });

        // Delete all questions associated with this category
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

/**
 * Resets all user avatars to the default avatar and unlocks only the default avatar for them.
 * @returns {Promise<{ success: boolean; error?: string; count?: number, message?: string }>} Result of the operation.
 */
export async function resetAllUserAvatars(): Promise<{ success: boolean; error?: string; count?: number, message?: string }> {
    try {
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);
        
        if (querySnapshot.empty) {
            return { success: true, count: 0, message: "لم يتم العثور على مستخدمين لإعادة تعيينهم." };
        }

        const batch = writeBatch(db);
        const { avatarId: defaultAvatar } = await getDefaultAvatar(); // Get the currently set default avatar

        querySnapshot.forEach(doc => {
            batch.update(doc.ref, {
                avatarId: defaultAvatar || 'Avatar00.png', // Fallback to a hardcoded default
                unlockedAvatars: [defaultAvatar || 'Avatar00.png'] // Unlock only the default
            });
        });

        await batch.commit();
        
        return { success: true, count: querySnapshot.size, message: `تمت إعادة تعيين شخصيات ${querySnapshot.size} مستخدم بنجاح.` };
    } catch (error) {
        console.error("Error resetting all user avatars:", error);
        return { success: false, error: 'فشل إعادة ضبط شخصيات المستخدمين.' };
    }
}

/**
 * Retrieves the top users based on a specified field (coins or leaderboardPoints).
 * @param {'coins' | 'leaderboardPoints'} field - The field to sort by.
 * @param {number} count - The number of top users to retrieve.
 * @returns {Promise<UserProfile[]>} An array of top user profiles.
 */
export async function getTopUsers(field: 'coins' | 'leaderboardPoints', count: number): Promise<UserProfile[]> {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy(field, 'desc'), limit(count));
        const querySnapshot = await getDocs(q);
        // Map data to UserProfile, ensuring 'uid' is correctly assigned from doc.id
        return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    } catch (error) {
        console.error(`Error getting top users by ${field}:`, error);
        return [];
    }
}

// Social Ranks
/**
 * Sets the social rank tiers for users.
 * @param {SocialRank[]} ranks - An array of social rank objects.
 * @returns {Promise<{success: boolean, error?: string}>} Result of the operation.
 */
export async function setSocialRanks(ranks: SocialRank[]): Promise<{success: boolean, error?: string}> {
    try {
        const settingsRef = doc(db, 'game_settings', 'social_ranks');
        // Overwrite the whole array to ensure consistency.
        await setDoc(settingsRef, { list: ranks });
        return { success: true };
    } catch (error) {
        console.error("Error setting social ranks:", error);
        return { success: false, error: 'فشل حفظ الألقاب الاجتماعية.' };
    }
}

/**
 * Retrieves the defined social rank tiers.
 * If no ranks are set, it initializes with default ones.
 * @returns {Promise<{success: boolean, ranks?: SocialRank[], error?: string}>} Result containing the social ranks or an error.
 */
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
/**
 * Sets the prices for avatars.
 * @param {AvatarPrice[]} prices - An array of avatar price objects.
 * @returns {Promise<{success: boolean, error?: string}>} Result of the operation.
 */
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

/**
 * Retrieves the prices for avatars.
 * @returns {Promise<{success: boolean, prices?: AvatarPrice[], error?: string}>} Result containing the avatar prices or an error.
 */
export async function getAvatarPrices(): Promise<{success: boolean, prices?: AvatarPrice[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'avatar_prices');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, prices: docSnap.data().prices || [] };
        }
        return { success: true, prices: [] }; // No prices set, return empty array
    } catch (error) {
        console.error("Error getting avatar prices:", error);
        return { success: false, error: 'Failed to fetch avatar prices.' };
    }
}

/**
 * Sets a specific avatar as the default and ensures its price is 0.
 * @param {string} avatarId - The ID of the avatar to set as default.
 * @returns {Promise<{ success: boolean; error?: string }>} Result of the operation.
 */
export async function setDefaultAvatar(avatarId: string): Promise<{ success: boolean; error?: string }> {
    if (!avatarId || avatarId.trim() === '') {
        return { success: false, error: "Avatar ID is required." };
    }
    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'default_avatar');
    const pricesRef = doc(db, 'game_settings', 'avatar_prices');
    
    try {
        // Set the default avatar ID
        batch.set(settingsRef, { avatarId: avatarId });

        // Ensure the default avatar has a price of 0 in the avatar_prices document
        const pricesDoc = await getDoc(pricesRef);
        if (pricesDoc.exists()) {
            const prices = (pricesDoc.data().prices || []) as AvatarPrice[];
            const priceIndex = prices.findIndex(p => p.avatarId === avatarId);
            if (priceIndex !== -1) {
                prices[priceIndex].price = 0; // Update existing price to 0
            } else {
                prices.push({ avatarId: avatarId, price: 0 }); // Add with price 0 if not found
            }
            batch.update(pricesRef, { prices });
        } else {
            // If avatar_prices document doesn't exist, create it with the default avatar at price 0
            batch.set(pricesRef, { prices: [{ avatarId, price: 0 }] });
        }
        
        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error setting default avatar:", error);
        return { success: false, error: "Failed to set default avatar." };
    }
}

/**
 * Retrieves the currently set default avatar ID.
 * @returns {Promise<{ success: boolean; avatarId?: string; error?: string }>} Result containing the default avatar ID or an error.
 */
export async function getDefaultAvatar(): Promise<{ success: boolean; avatarId?: string; error?: string }> {
    try {
        const docRef = doc(db, 'game_settings', 'default_avatar');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, avatarId: docSnap.data().avatarId };
        }
        // Return a hardcoded default if no default avatar is explicitly set
        return { success: true, avatarId: 'Avatar00.png' }; 
    } catch (error) {
        console.error("Error getting default avatar:", error);
        return { success: false, error: 'Failed to fetch default avatar.' };
    }
}

// Judge Powers (Admin-specific game management)
/**
 * Retrieves live game statistics for a specific Prison game, intended for admin/judge view.
 * @param {string} gameId - The ID of the game to retrieve stats for.
 * @returns {Promise<{ gameData?: { players: any[], gameState: string, round: number }; error?: string }>} Live game data or an error.
 */
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
            // Correctly access player's bid and prison history
            const currentBid = game.prisonState?.bids?.[p.id] || 0;
            const roundsInPrison = game.prisonState?.prisonHistory?.[p.id]?.inPrison || 0; // Corrected from prisonLog
            
            let activity = "ينتظر";
            if (game.prisonState?.withdrawnBidders?.includes(p.id)) {
                activity = "منسحب";
            } else if (game.prisonState?.bids?.[p.id]) {
                activity = `زايد بـ ${game.prisonState.bids[p.id]}`;
            } else if (game.gameState === 'open_auction' || game.gameState === 'closed_auction_answering') { // Check both auction states
                activity = game.prisonState.playerProgress?.[p.id]?.answers?.length > 0 ? "يكتب..." : "لم يبدأ بعد"; // More descriptive
            }

            return {
                id: p.id,
                name: p.name,
                avatarId: p.avatarId,
                status: p.status,
                activity,
                currentBid, // Changed from highestBid to currentBid for clarity
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

/**
 * Allows an admin to kick any player from any game.
 * Handles game deletion if the game becomes empty after kicking.
 * @param {string} gameId - The ID of the game from which to kick the player.
 * @param {string} adminId - The ID of the admin performing the action (for logging/security, though not fully implemented here).
 * @param {string} playerIdToKick - The ID of the player to kick.
 * @returns {Promise<{ success: boolean; error?: string }>} Result of the operation.
 */
export async function kickPlayerFromAnyGame(gameId: string, adminId: string, playerIdToKick: string): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId); // No toUpperCase needed here as gameId comes directly from path
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw new Error("Game not found.");
            }

            const game = gameDoc.data() as Game;
            const playerIndex = game.players.findIndex(p => p.id === playerIdToKick);
            if (playerIndex === -1) {
                throw new Error("Player not found in this game.");
            }
            
            const updatedPlayers = game.players.filter(p => p.id !== playerIdToKick);
            const updatedPlayerUids = game.playerUids.filter(uid => uid !== playerIdToKick);
            
            if (updatedPlayers.length === 0) {
                // If no players remain, delete the game
                transaction.delete(gameRef); 
            } else {
                let newHostId = game.hostId;
                // If the kicked player was the host, assign a new host
                if (game.hostId === playerIdToKick) {
                    // Prioritize active players, then any remaining players
                    const remainingLivePlayers = updatedPlayers.filter(p => p.status === 'alive');
                    newHostId = remainingLivePlayers[0]?.id || updatedPlayers[0]?.id || '';
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

/**
 * Sends a message from an admin to multiple users' inboxes.
 * @param {string} adminId - The ID of the admin sending the message.
 * @param {string[]} recipientIds - The array of user IDs receiving the message.
 * @param {string} subject - The subject of the message.
 * @param {string} body - The body of the message.
 * @param {number} coins - The number of coins to attach to the message.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function adminSendMail(adminId: string, recipientIds: string[], subject: string, body: string, coins: number): Promise<{ success: boolean; error?: string }> {
  if (!adminId || !recipientIds || recipientIds.length === 0 || !subject.trim() || !body.trim()) {
    return { success: false, error: "المعلومات غير كافية لإرسال الرسالة." };
  }

  try {
    const adminDoc = await getDoc(doc(db, 'users', adminId));
    if (!adminDoc.exists() || !adminDoc.data()?.isAdmin) {
      return { success: false, error: "ليس لديك صلاحية لإرسال الرسائل." };
    }
    
    const senderName = adminDoc.data()?.name || 'Admin';
    const expiresAt = Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000); // Message expires in 3 days

    const mailData: Omit<Mail, 'id' | 'createdAt'> = {
        senderName,
        subject,
        body,
        isRead: false,
        expiresAt: expiresAt.toDate(), // Store as JS Date for consistency
        coins: coins > 0 ? coins : undefined,
        coinsClaimed: coins > 0 ? false : undefined,
    };
    
    // Use a batch to send mail to all recipients efficiently
    const batch = writeBatch(db);
    recipientIds.forEach(recipientId => {
        const mailRef = doc(collection(db, `users/${recipientId}/mail`));
        batch.set(mailRef, { ...mailData, createdAt: serverTimestamp() });
    });
    
    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error("Error sending mail:", error);
    return { success: false, error: error.message || "فشل إرسال الرسالة." };
  }
}
