
'use server';

import { db } from '@/lib/firebase';
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    getDocs,
    Timestamp,
    orderBy,
    doc,
    updateDoc,
    deleteDoc,
    getDoc,
} from 'firebase/firestore';
import type { Article } from '@/types';

type ArticleData = Omit<Article, 'id' | 'createdAt'>;

/**
 * Creates a new news article. Admin only.
 * @param {ArticleData} articleData - The data for the new article.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createArticle(articleData: ArticleData): Promise<{ success: boolean; error?: string }> {
    try {
        await addDoc(collection(db, 'articles'), {
            ...articleData,
            createdAt: serverTimestamp(),
        });
        return { success: true };
    } catch (error) {
        console.error("Error creating article:", error);
        return { success: false, error: 'فشل إنشاء المقال.' };
    }
}

/**
 * Updates an existing news article. Admin only.
 * @param {string} articleId - The ID of the article to update.
 * @param {Partial<ArticleData>} articleData - The data to update.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function updateArticle(articleId: string, articleData: Partial<ArticleData>): Promise<{ success: boolean; error?: string }> {
    try {
        const articleRef = doc(db, 'articles', articleId);
        await updateDoc(articleRef, articleData);
        return { success: true };
    } catch (error) {
        console.error("Error updating article:", error);
        return { success: false, error: 'فشل تحديث المقال.' };
    }
}

/**
 * Deletes a news article. Admin only.
 * @param {string} articleId - The ID of the article to delete.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function deleteArticle(articleId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const articleRef = doc(db, 'articles', articleId);
        await deleteDoc(articleRef);
        return { success: true };
    } catch (error) {
        console.error("Error deleting article:", error);
        return { success: false, error: 'فشل حذف المقال.' };
    }
}


/**
 * Retrieves all articles for the admin panel.
 * @returns {Promise<{ success: boolean; articles?: Article[]; error?: string }>}
 */
export async function getArticlesForAdmin(): Promise<{ success: boolean; articles?: Article[]; error?: string }> {
    try {
        const articlesCol = collection(db, 'articles');
        const q = query(articlesCol, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        const articles = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
            } as Article;
        });
        return { success: true, articles };
    } catch (error) {
        console.error("Error fetching articles for admin:", error);
        return { success: false, error: 'فشل جلب المقالات.' };
    }
}


/**
 * Retrieves all *published* articles for the public newspaper page.
 * @returns {Promise<Article[]>} An array of published articles.
 */
export async function getPublishedArticles(): Promise<Article[]> {
    try {
        const articlesCol = collection(db, 'articles');
        const q = query(
            articlesCol,
            where('isPublished', '==', true),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
            } as Article;
        });

    } catch (error) {
        console.error("Error fetching published articles:", error);
        return [];
    }
}
