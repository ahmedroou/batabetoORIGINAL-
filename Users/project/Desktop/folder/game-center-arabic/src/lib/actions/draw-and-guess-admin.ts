

'use server';

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
    arrayUnion,
    arrayRemove,
} from 'firebase/firestore';
import { isFirebaseError, withAdminAuth } from './helpers';
import { DEFAULT_DRAW_AND_GUESS_CATEGORIES } from '@/types';


export const uploadDrawAndGuessPromptsFromJson = withAdminAuth(async (adminId: string, prompts: { text: string }[], category: string) => {
    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }
    if (!category || typeof category !== 'string' || category.trim() === '') {
        return { error: 'يجب تحديد قسم صالح.' };
    }

    try {
        const batch = writeBatch(db);
        const promptsCol = collection(db, 'draw_and_guess_prompts');
        let validPromptsCount = 0;

        prompts.forEach(p => {
            if (p && typeof p.text === 'string' && p.text.trim() !== '') {
                const docRef = doc(promptsCol);
                batch.set(docRef, {
                    text: p.text.trim(),
                    category: category.trim(),
                });
                validPromptsCount++;
            }
        });

        if (validPromptsCount === 0) {
            return { error: 'لم يتم العثور على كلمات صالحة في الملف.' };
        }

        await batch.commit();
        return { success: true, count: validPromptsCount };
    } catch (error) {
        console.error("Error uploading draw and guess prompts:", error);
        return { error: 'حدث خطأ أثناء رفع الكلمات.' };
    }
});

async function getDrawAndGuessCategoriesUnwrapped(): Promise<{success: boolean, categories?: string[], error?: string}> {
    try {
        const docRef = doc(db, 'game_settings', 'draw_and_guess_categories');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, categories: docSnap.data().list || [] };
        }
        await setDoc(docRef, { list: DEFAULT_DRAW_AND_GUESS_CATEGORIES });
        return { success: true, categories: DEFAULT_DRAW_AND_GUESS_CATEGORIES };
    } catch (error) {
        console.error("Error getting draw and guess categories:", error);
        return { success: false, error: 'Failed to fetch categories.' };
    }
}

export const getDrawAndGuessCategories = withAdminAuth(async (adminId: string) => {
    return getDrawAndGuessCategoriesUnwrapped();
});

export const addDrawAndGuessCategory = withAdminAuth(async (adminId: string, category: string): Promise<{success: boolean, error?: string}> => {
    if (!category || typeof category !== 'string' || category.trim() === '') {
        return { error: 'اسم القسم غير صالح.' };
    }
    try {
        const settingsRef = doc(db, 'game_settings', 'draw_and_guess_categories');
        await updateDoc(settingsRef, {
            list: arrayUnion(category.trim())
        });
        return { success: true };
    } catch (error) {
        if (isFirebaseError(error) && error.code === 'not-found') {
            await setDoc(doc(db, 'game_settings', 'draw_and_guess_categories'), {
                list: [category.trim()]
            });
            return { success: true };
        }
        console.error("Error adding draw and guess category:", error);
        return { success: false, error: 'Failed to add category.' };
    }
});

export const editDrawAndGuessCategory = withAdminAuth(async (adminId: string, oldCategory: string, newCategory: string): Promise<{ success: boolean; error?: string }> => {
    if (!oldCategory || !newCategory || oldCategory.trim() === '' || newCategory.trim() === '') {
        return { error: 'الاسم القديم والجديد مطلوبان.' };
    }
     if (oldCategory.trim() === newCategory.trim()) {
        return { error: 'الاسم الجديد للقسم يجب أن يختلف عن الاسم القديم.' };
    }

    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'draw_and_guess_categories');
    
    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) throw new Error("مستند إعدادات الأقسام غير موجود.");
        
        const categories: string[] = settingsSnap.data().list || [];
        if (!categories.includes(oldCategory)) return { error: 'القسم القديم غير موجود.' };
        if (categories.includes(newCategory.trim())) return { error: 'الاسم الجديد للقسم موجود بالفعل.' };

        const updatedCategories = categories.map(c => c === oldCategory ? newCategory.trim() : c);
        batch.update(settingsRef, { list: updatedCategories });
        
        const questionsQuery = query(collection(db, 'draw_and_guess_prompts'), where("category", "==", oldCategory));
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

export const deleteDrawAndGuessCategory = withAdminAuth(async (adminId: string, categoryToDelete: string): Promise<{ success: boolean; count?: number; error?: string }> => {
    if (!categoryToDelete || categoryToDelete.trim() === '') {
        return { error: 'يجب تحديد قسم للحذف.' };
    }
    
    const batch = writeBatch(db);
    const settingsRef = doc(db, 'game_settings', 'draw_and_guess_categories');

    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) throw new Error("مستند إعدادات الأقسام غير موجود.");
        const categories: string[] = settingsSnap.data().list || [];
        if (categories.length <= 1) return { error: "لا يمكن حذف آخر قسم متبقٍ." };
        if (!categories.includes(categoryToDelete)) return { error: "القسم المحدد للحذف غير موجود." };
        
        batch.update(settingsRef, { list: arrayRemove(categoryToDelete) });

        const questionsQuery = query(collection(db, 'draw_and_guess_prompts'), where("category", "==", categoryToDelete));
        const questionsSnapshot = await getDocs(questionsQuery);

        questionsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return { success: true, count: questionsSnapshot.size };

    } catch (error) {
        console.error("Error deleting category:", error);
        return { success: false, error: 'فشل حذف القسم والكلمات المرتبطة به.' };
    }
});
