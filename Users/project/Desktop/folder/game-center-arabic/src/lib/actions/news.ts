

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
    runTransaction,
} from 'firebase/firestore';
import type { Article, AudienceGroup, UserProfile, SocialEvent, Challenge } from '@/types';
import { generateNewsArticle } from '@/ai/flows/generate-news-article-flow';
import { getAllUsers, getTopUsers, getTopPunisher } from './user/queries';
import { getChallenges } from './challenges';


type ArticleData = Omit<Article, 'id' | 'createdAt'>;

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

export async function createPlayerArticle(authorId: string, articleData: Pick<Article, 'title' | 'content'>, isAnonymous: boolean): Promise<{ success: boolean; error?: string }> {
    if (!authorId) return { success: false, error: "يجب تسجيل الدخول." };
    if (!articleData.title.trim() || !articleData.content.trim()) return { success: false, error: "العنوان والمحتوى مطلوبان." };
    
    const userRef = doc(db, 'users', authorId);
    
    return runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("لم يتم العثور على المستخدم.");
        
        const userData = userDoc.data() as UserProfile;
        if ((userData.coins || 0) < 1) throw new Error("ليس لديك ما يكفي من الكوينز (التكلفة 1).");

        transaction.update(userRef, { coins: increment(-1) });

        const articleRef = doc(collection(db, 'articles'));
        const newArticle: ArticleData = {
            ...articleData,
            authorId: authorId,
            authorName: isAnonymous ? 'لاعب مجهول' : userData.name,
            isPublished: true, 
            category: 'مقالات اللاعبين',
            audience: ['public'],
        };
        transaction.set(articleRef, { ...newArticle, createdAt: serverTimestamp() });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message };
    });
}


export async function updateArticle(articleId: string, articleData: Partial<ArticleData>): Promise<{ success: boolean; error?: string }> {
    try {
        if (!articleData.authorId) throw new Error("Author ID is required to update an article.");
        const userDoc = await getDoc(doc(db, 'users', articleData.authorId));
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

export async function getPublishedArticles(userId?: string): Promise<Article[]> {
    try {
        const articlesCol = collection(db, 'articles');
        const articlesQuery = query(
            articlesCol,
            where('isPublished', '==', true),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(articlesQuery);

        const allPublishedArticles = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
            } as Article;
        });
        
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


export async function getArticleById(articleId: string): Promise<Article | null> {
    try {
        const articleRef = doc(db, 'articles', articleId);
        const docSnap = await getDoc(articleRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
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

async function getJournalistSourceMaterial(): Promise<{
    events: SocialEvent[];
    previous_articles: Article[];
    leaderboard: UserProfile[];
    punished_players: UserProfile[];
    top_punisher: UserProfile | null;
    active_challenges: Challenge[];
}> {
    const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const eventsQuery = query(collection(db, 'social_events'), where('timestamp', '>=', oneDayAgo), orderBy('timestamp', 'desc'));
    
    const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const articlesQuery = query(collection(db, 'articles'), where('createdAt', '>=', sevenDaysAgo), orderBy('createdAt', 'desc'));

    const [eventsSnapshot, articlesSnapshot, leaderboard, punished_players, top_punisher, active_challenges] = await Promise.all([
        getDocs(eventsQuery),
        getDocs(articlesQuery),
        getTopUsers('leaderboardPoints', 5),
        getAllUsers('punished'),
        getTopPunisher(),
        getChallenges(),
    ]);

    const events = eventsSnapshot.docs.map(doc => ({ ...doc.data(), timestamp: doc.data().timestamp.toDate() } as SocialEvent));
    const previous_articles = articlesSnapshot.docs.map(doc => ({ ...doc.data(), createdAt: doc.data().createdAt.toDate() } as Article));

    return { events, previous_articles, leaderboard, punished_players, top_punisher, active_challenges };
}


export async function runAiJournalist(directive?: string): Promise<{success: boolean, article?: { headline: string }, error?: string}> {
    try {
        const sourceMaterial = await getJournalistSourceMaterial();
        
        const today = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const generatedArticle = await generateNewsArticle({
            date: today,
            directive,
            ...sourceMaterial,
        });

        if (!generatedArticle.headline || !generatedArticle.body) {
            throw new Error("فشل الذكاء الاصطناعي في توليد مقال متكامل.");
        }
        
        await addDoc(collection(db, 'articles'), {
            title: generatedArticle.headline,
            content: generatedArticle.body,
            category: generatedArticle.category,
            imageUrl: generatedArticle.imageUrl || "",
            authorName: "المراسل الذكي",
            authorId: "ai_journalist",
            isPublished: true,
            audience: ['public'],
            createdAt: serverTimestamp(),
            views: 0,
        });
        
        return { success: true, article: { headline: generatedArticle.headline } };
    } catch (error: any) {
        console.error("Error running AI journalist:", error);
        return { success: false, error: error.message || "حدث خطأ غير متوقع." };
    }
}


export async function deleteOldArticles(): Promise<{success: boolean, deletedCount?: number, error?: string}> {
    try {
        const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const q = query(collection(db, 'articles'), where('createdAt', '<', sevenDaysAgo));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return { success: true, deletedCount: 0 };
        }
        
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();

        return { success: true, deletedCount: snapshot.size };
    } catch (error: any) {
        console.error("Error deleting old articles:", error);
        return { success: false, error: "فشل حذف المقالات القديمة." };
    }
}
