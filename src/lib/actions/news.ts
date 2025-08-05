
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
    writeBatch,
    arrayUnion,
    arrayRemove,
    increment,
    limit,
} from 'firebase/firestore';
import type { Article, AudienceGroup, UserProfile, SocialEvent, AnonymousMessage, AnonymousMessageReply } from '@/types';

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
 * Creates a new player-submitted article. Costs 4 coins.
 * @param {string} authorId - The ID of the user creating the article.
 * @param {Pick<Article, 'title' | 'content'>} articleData - The article title and content.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createPlayerArticle(authorId: string, articleData: Pick<Article, 'title' | 'content'>): Promise<{ success: boolean; error?: string }> {
    if (!authorId) return { success: false, error: "يجب تسجيل الدخول." };
    if (!articleData.title.trim() || !articleData.content.trim()) return { success: false, error: "العنوان والمحتوى مطلوبان." };
    
    const userRef = doc(db, 'users', authorId);
    
    return runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("لم يتم العثور على المستخدم.");
        
        const userData = userDoc.data() as UserProfile;
        if ((userData.coins || 0) < 4) throw new Error("ليس لديك ما يكفي من الكوينز (التكلفة 4).");

        // Deduct coins
        transaction.update(userRef, { coins: increment(-4) });

        // Create article
        const articleRef = doc(collection(db, 'articles'));
        const newArticle: ArticleData = {
            ...articleData,
            authorId: authorId,
            authorName: userData.name, // We still store it but won't display it
            isPublished: true, // Player articles are published immediately
            category: 'مقالات اللاعبين',
            audience: ['public'],
        };
        transaction.set(articleRef, { ...newArticle, createdAt: serverTimestamp() });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message };
    });
}


/**
 * Updates an existing news article. Admin/Editor only.
 * @param {string} articleId - The ID of the article to update.
 * @param {Partial<ArticleData>} articleData - The data to update.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function updateArticle(articleId: string, articleData: Partial<ArticleData>): Promise<{ success: boolean; error?: string }> {
    try {
        const userDoc = await getDoc(doc(db, 'users', articleData.authorId!));
        if (!userDoc.exists() || (!userDoc.data().isAdmin && !userDoc.data().isEditor)) {
            return { success: false, error: "غير مصرح لك." };
        }
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
        // Query only for published articles, ordering will be done client-side to avoid complex indexes.
        const q = query(
            articlesCol,
            where('isPublished', '==', true)
        );
        const snapshot = await getDocs(q);

        const allPublishedArticles = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
            } as Article;
        }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort by date descending
        
        // Filter articles based on audience
        if (!userId) {
             const publicArticles = allPublishedArticles.filter(article => !article.audience || article.audience.includes('public'));
             return publicArticles;
        }

        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
             const publicArticles = allPublishedArticles.filter(article => !article.audience || article.audience.includes('public'));
             return publicArticles;
        }
        const userProfile = userDoc.data() as UserProfile;
        const userAudienceGroups = userProfile.audienceGroups || [];

        return allPublishedArticles.filter(article => {
            if (!article.audience || article.audience.includes('public')) return true;
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
        batch.update(userRef, { audienceGroups: arrayRemove(userId) });
        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error removing player from group:", error);
        return { success: false, error: 'فشل إزالة اللاعب.' };
    }
}

export async function getRecentSocialEvents(): Promise<SocialEvent[]> {
    try {
        const eventsCol = collection(db, 'social_events');
        const q = query(eventsCol, orderBy('timestamp', 'desc'), limit(5));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
             const data = doc.data();
             return {
                 ...data,
                 timestamp: (data.timestamp as Timestamp)?.toDate() || new Date(),
             } as SocialEvent;
        });
    } catch (error) {
        console.error("Error fetching social events:", error);
        return [];
    }
}


// --- Anonymous Mailbox ---

export async function submitAnonymousMessage(senderId: string, senderName: string, senderAvatarId: string, content: string): Promise<{ success: boolean; error?: string }> {
  const userRef = doc(db, 'users', senderId);
  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");
    const userData = userDoc.data() as UserProfile;
    if ((userData.coins || 0) < 1) throw new Error("ليس لديك كوينز كافية (التكلفة 1).");
    
    transaction.update(userRef, { coins: increment(-1) });

    const messageRef = doc(collection(db, 'anonymous_messages'));
    transaction.set(messageRef, {
      content,
      senderId,
      senderName,
      senderAvatarId,
      createdAt: serverTimestamp(),
      revealedBy: [],
      replies: [],
    });
    
    return { success: true };
  }).catch((error: any) => {
    return { success: false, error: error.message };
  });
}

export async function getAnonymousMessages(currentUserId?: string): Promise<AnonymousMessage[]> {
  try {
    const messagesCol = collection(db, 'anonymous_messages');
    const q = query(messagesCol, orderBy('createdAt', 'desc'), limit(20));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      const isRevealed = data.revealedBy?.includes(currentUserId) || data.senderId === currentUserId;
      
      const message: AnonymousMessage = {
        id: doc.id,
        content: data.content,
        createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
        revealedBy: data.revealedBy || [],
        replies: (data.replies || []).map((r: any) => ({...r, createdAt: r.createdAt?.toDate()})),
      };

      if (isRevealed) {
        message.senderId = data.senderId;
        message.senderName = data.senderName;
        message.senderAvatarId = data.senderAvatarId;
      }

      return message;
    });
  } catch (error) {
    console.error("Error fetching anonymous messages:", error);
    return [];
  }
}

export async function revealAnonymousSender(userId: string, messageId: string): Promise<{ success: boolean; error?: string }> {
  const userRef = doc(db, 'users', userId);
  const messageRef = doc(db, 'anonymous_messages', messageId);

  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    const messageDoc = await transaction.get(messageRef);

    if (!userDoc.exists()) throw new Error("لم يتم العثور على المستخدم.");
    if (!messageDoc.exists()) throw new Error("لم يتم العثور على الرسالة.");

    const userData = userDoc.data();
    if ((userData.coins || 0) < 5) throw new Error("ليس لديك ما يكفي من الكوينز (التكلفة 5).");

    transaction.update(userRef, { coins: increment(-5) });
    transaction.update(messageRef, { revealedBy: arrayUnion(userId) });

    return { success: true };
  }).catch((error: any) => {
    return { success: false, error: error.message };
  });
}

export async function replyToAnonymousMessage(messageId: string, replyData: Omit<AnonymousMessageReply, 'id' | 'createdAt'>): Promise<{ success: boolean, error?: string }> {
    try {
        const messageRef = doc(db, 'anonymous_messages', messageId);
        const fullReply: Omit<AnonymousMessageReply, 'id'> = {
            ...replyData,
            createdAt: new Date(),
        };
        await updateDoc(messageRef, {
            replies: arrayUnion(fullReply),
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: "فشل إرسال الرد." };
    }
}
