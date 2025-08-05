
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
    writeBatch
} from 'firebase/firestore';
import type { Article, AudienceGroup, UserProfile } from '@/types';

type ArticleData = Omit<Article, 'id' | 'createdAt'>;

/**
 * Creates a new news article. Admin/Editor only.
 * @param {ArticleData} articleData - The data for the new article.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createArticle(articleData: ArticleData): Promise<{ success: boolean; error?: string }> {
    try {
        await addDoc(collection(db, 'articles'), {
            ...articleData,
            createdAt: serverTimestamp(),
            views: 0,
        });
        return { success: true };
    } catch (error) {
        console.error("Error creating article:", error);
        return { success: false, error: 'فشل إنشاء المقال.' };
    }
}

/**
 * Updates an existing news article. Admin/Editor only.
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
 * @param {string} [userId] - The ID of the currently logged-in user to check against audience groups.
 * @returns {Promise<Article[]>} An array of published articles.
 */
export async function getPublishedArticles(userId?: string): Promise<Article[]> {
    try {
        const articlesCol = collection(db, 'articles');
        const q = query(
            articlesCol,
            where('isPublished', '==', true),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

        const allPublishedArticles = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
            } as Article;
        });
        
        // Filter articles based on audience
        if (!userId) {
            return allPublishedArticles.filter(article => article.audience === 'public');
        }

        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
             return allPublishedArticles.filter(article => article.audience === 'public');
        }
        const userProfile = userDoc.data() as UserProfile;
        const userAudienceGroups = userProfile.audienceGroups || [];

        return allPublishedArticles.filter(article => {
            if (article.audience === 'public') return true;
            if (Array.isArray(article.audience)) {
                return article.audience.some(groupId => userAudienceGroups.includes(groupId));
            }
            return false;
        });

    } catch (error) {
        console.error("Error fetching published articles:", error);
        return [];
    }
}

/**
 * Retrieves a single article by its ID.
 * @param {string} articleId - The ID of the article to fetch.
 * @returns {Promise<Article | null>} The article data or null if not found.
 */
export async function getArticleById(articleId: string): Promise<Article | null> {
    try {
        const articleRef = doc(db, 'articles', articleId);
        const docSnap = await getDoc(articleRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            // Optional: Increment view count here
            // await updateDoc(articleRef, { views: increment(1) });
            return {
                id: docSnap.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
            } as Article;
        }
        return null;
    } catch (error) {
        console.error("Error fetching article by ID:", error);
        return null;
    }
}


// --- Audience Group Management ---

export async function createAudienceGroup(name: string): Promise<{ success: boolean; error?: string }> {
  try {
    await addDoc(collection(db, 'audienceGroups'), {
      name,
      members: [],
      createdAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error creating audience group:", error);
    return { success: false, error: 'فشل إنشاء المجموعة.' };
  }
}

export async function getAudienceGroups(): Promise<AudienceGroup[]> {
  try {
    const snapshot = await getDocs(collection(db, 'audienceGroups'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AudienceGroup));
  } catch (error) {
    console.error("Error fetching audience groups:", error);
    return [];
  }
}

export async function deleteAudienceGroup(groupId: string): Promise<{ success: boolean; error?: string }> {
    const batch = writeBatch(db);
    const groupRef = doc(db, 'audienceGroups', groupId);
    try {
        const groupDoc = await getDoc(groupRef);
        if(!groupDoc.exists()) throw new Error("Group not found.");
        const groupData = groupDoc.data() as AudienceGroup;

        // Remove group from all users who are members
        if (groupData.members && groupData.members.length > 0) {
            for (const userId of groupData.members) {
                const userRef = doc(db, 'users', userId);
                batch.update(userRef, { audienceGroups: arrayRemove(groupId) });
            }
        }
        
        batch.delete(groupRef);
        await batch.commit();
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting audience group:", error);
        return { success: false, error: error.message || 'فشل حذف المجموعة.' };
    }
}

export async function addPlayerToAudienceGroup(groupId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const batch = writeBatch(db);
    const groupRef = doc(db, 'audienceGroups', groupId);
    const userRef = doc(db, 'users', userId);
    try {
        batch.update(groupRef, { members: arrayUnion(userId) });
        batch.update(userRef, { audienceGroups: arrayUnion(groupId) });
        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error adding player to group:", error);
        return { success: false, error: 'فشل إضافة اللاعب.' };
    }
}

export async function removePlayerFromAudienceGroup(groupId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const batch = writeBatch(db);
    const groupRef = doc(db, 'audienceGroups', groupId);
    const userRef = doc(db, 'users', userId);
    try {
        batch.update(groupRef, { members: arrayRemove(userId) });
        batch.update(userRef, { audienceGroups: arrayRemove(groupId) });
        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error removing player from group:", error);
        return { success: false, error: 'فشل إزالة اللاعب.' };
    }
}
