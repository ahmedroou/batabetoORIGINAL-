
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
} from 'firebase/firestore';
import { isFirebaseError } from './helpers';
import { findBestMatch } from 'string-similarity';

export const TRAP_ANSWER_CATEGORIES = [
    "تاريخ",
    "رياضة",
    "أدب",
    "أنمي ومانجا",
    "إسلاميات",
    "فنون",
    "جغرافيا"
];

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
        return { error: 'حدث خطأ أثناء رفع أسئلة الجواب الفخ.' };
    }
}

export async function countQuestions(criteria: { game: 'who-am-i' | 'trap-answer', category?: string; searchTerm?: string; all?: boolean }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.all) {
        return { error: 'يجب تحديد معيار للعد.' };
    }

    const collectionName = criteria.game === 'trap-answer' ? 'trap_answer_questions' : 'questions';
    const textFieldName = criteria.game === 'trap-answer' ? 'question' : 'text';

    try {
        const questionsCol = collection(db, collectionName);
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(questionsCol);
            count = querySnapshot.size;
        } else if (criteria.category) {
            const q = query(questionsCol, where('category', '==', criteria.category.trim()));
            const querySnapshot = await getDocs(q);
            count = querySnapshot.size;
        } else if (criteria.searchTerm) {
            const searchTerm = criteria.searchTerm.trim();
            const querySnapshot = await getDocs(questionsCol);
            querySnapshot.forEach(doc => {
                const text = doc.data()[textFieldName] as string;
                if (text && text.includes(searchTerm)) {
                    count++;
                }
            });
        }
        
        return { success: true, count };
    } catch (error) {
        console.error("Error counting questions:", error);
        return { error: 'حدث خطأ أثناء عد الأسئلة.' };
    }
}

export async function deleteQuestions(criteria: { game: 'who-am-i' | 'trap-answer', category?: string; searchTerm?: string; all?: boolean }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.all) {
        return { error: 'يجب تحديد معيار للحذف.' };
    }

    const collectionName = criteria.game === 'trap-answer' ? 'trap_answer_questions' : 'questions';
    const textFieldName = criteria.game === 'trap-answer' ? 'question' : 'text';

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
        }

        await batch.commit();
        return { success: true, count };
    } catch (error) {
        console.error("Error deleting questions:", error);
        return { error: 'حدث خطأ أثناء حذف الأسئلة.' };
    }
}

export async function deleteSimilarQuestions(game: 'who-am-i' | 'trap-answer', category?: string) {
    if (!category) {
        return { error: "يجب تحديد قسم للبحث عن التكرارات." };
    }

    const collectionName = game === 'trap-answer' ? 'trap_answer_questions' : 'questions';
    const textFieldName = game === 'trap-answer' ? 'question' : 'text';
    const SIMILARITY_THRESHOLD = 0.95;

    try {
        const q = query(collection(db, collectionName), where("category", "==", category));
        const querySnapshot = await getDocs(q);
        
        const questions = querySnapshot.docs.map(doc => ({
            id: doc.id,
            text: doc.data()[textFieldName] as string,
            docRef: doc.ref
        }));

        if (questions.length < 2) {
            return { success: true, count: 0, message: "لا توجد أسئلة كافية للمقارنة في هذا القسم." };
        }
        
        const groups: string[][] = [];
        const processedIds = new Set<string>();

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
                    if (rating.rating >= SIMILARITY_THRESHOLD && !processedIds.has(duplicateId)) {
                        currentGroup.push(duplicateId);
                        processedIds.add(duplicateId);
                    }
                });
            }
            
            if (currentGroup.length > 1) {
                groups.push(currentGroup);
            }
        }

        if (groups.length === 0) {
            return { success: true, count: 0, message: 'لم يتم العثور على أسئلة مكررة.' };
        }

        const batch = writeBatch(db);
        let deletedCount = 0;
        
        groups.forEach(group => {
            // Sort IDs alphabetically to determine which is "newer".
            // Firestore IDs are time-ordered.
            group.sort(); 
            const newestId = group.pop(); // Keep the newest one (last in sorted list)

            group.forEach(idToDelete => {
                const questionToDelete = questions.find(q => q.id === idToDelete);
                if (questionToDelete) {
                    batch.delete(questionToDelete.docRef);
                    deletedCount++;
                }
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
