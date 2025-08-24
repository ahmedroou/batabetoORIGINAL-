

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
  DocumentData,
  startAfter,
} from 'firebase/firestore';
import type { Article, AudienceGroup, UserProfile, SocialEvent, Challenge, Game } from '@/types';
import { getAllUsers, getTopPunisher, getTopUsers } from './user/queries';
import { getChallenges } from './challenges';
import { generateNewsArticle } from '@/ai/flows/generate-news-article-flow';

// -----------------------------
// Types & helpers
// -----------------------------
type ServiceResult<T = undefined> = { success: true; data?: T } | { success: false; error: string };

const ARTICLES_COLLECTION = 'articles';
const AUDIENCE_GROUPS_COLLECTION = 'audienceGroups';
const GAMES_COLLECTION = 'games';
const SOCIAL_EVENTS_COLLECTION = 'social_events';

function parseTimestampToDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  // Handles Firestore serverTimestamp placeholders or plain Date
  if (value.toDate && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  try {
    return new Date(value);
  } catch {
    return null;
  }
}

function toArticleDoc(docSnap: { id: string; data: () => DocumentData }) {
  const raw = docSnap.data();
  return {
    id: docSnap.id,
    ...(raw as any),
    createdAt: parseTimestampToDate(raw.createdAt) || new Date(),
  } as Article;
}

function isNonEmptyString(v: any) {
  return typeof v === 'string' && v.trim().length > 0;
}

function handleError(e: unknown, prefix = 'خطأ') {
  console.error(prefix, e);
  if (e instanceof Error) return e.message;
  return String(e);
}

// -----------------------------
// Article CRUD & helpers
// -----------------------------

/**
 * Create a generic article (admin/editor usage).
 */
export async function createArticle(articleData: Omit<Article, 'id' | 'createdAt'>): Promise<ServiceResult> {
  try {
    // Basic validation
    if (!isNonEmptyString(articleData.title) || !isNonEmptyString(articleData.content)) {
      return { success: false, error: 'العنوان والمحتوى مطلوبان.' };
    }

    // Default fields
    const toWrite = {
      ...articleData,
      createdAt: serverTimestamp(),
      views: articleData.views ?? 0,
    };

    await addDoc(collection(db, ARTICLES_COLLECTION), toWrite);
    return { success: true };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل إنشاء المقال') };
  }
}

/**
 * Create a player article (costs coins). Atomic operation: deduct coin and create article.
 */
export async function createPlayerArticle(
  authorId: string,
  articleData: Pick<Article, 'title' | 'content'>,
  isAnonymous = false
): Promise<ServiceResult> {
  if (!isNonEmptyString(authorId)) return { success: false, error: 'يجب تسجيل الدخول.' };
  if (!isNonEmptyString(articleData.title) || !isNonEmptyString(articleData.content)) {
    return { success: false, error: 'العنوان والمحتوى مطلوبان.' };
  }

  const userRef = doc(db, 'users', authorId);
  const articleRef = doc(collection(db, ARTICLES_COLLECTION));

  try {
    return await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error('المستخدم غير موجود.');

      const user = userSnap.data() as UserProfile;
      const coins = user.coins ?? 0;
      const COST = 1;
      if (coins < COST) throw new Error('ليس لديك ما يكفي من الكوينز (التكلفة 1).');

      tx.update(userRef, { coins: increment(-COST) });

      const articlePayload = {
        title: articleData.title,
        content: articleData.content,
        authorId,
        authorName: isAnonymous ? 'لاعب مجهول' : user.name || 'لاعب',
        isPublished: true,
        category: 'مقالات اللاعبين',
        audience: ['public'],
        createdAt: serverTimestamp(),
        views: 0,
      };

      tx.set(articleRef, articlePayload);
      return { success: true } as ServiceResult;
    });
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل إنشاء مقال اللاعب') };
  }
}

/**
 * Update article (requires that the user performing update is author or editor/admin).
 * Callers should pass authorId (actor's id) to validate permission.
 */
export async function updateArticle(
  articleId: string,
  actorId: string,
  updates: Partial<Omit<Article, 'id' | 'createdAt'>>
): Promise<ServiceResult> {
  try {
    if (!isNonEmptyString(articleId)) return { success: false, error: 'مطلوب معرف المقال.' };

    // Read actor
    const actorSnap = await getDoc(doc(db, 'users', actorId));
    if (!actorSnap.exists()) return { success: false, error: 'المستخدم غير موجود.' };
    const actor = actorSnap.data() as UserProfile;
    const isPrivileged = !!(actor.isAdmin || actor.isEditor);

    // Read article
    const articleRef = doc(db, ARTICLES_COLLECTION, articleId);
    const articleSnap = await getDoc(articleRef);
    if (!articleSnap.exists()) return { success: false, error: 'المقال غير موجود.' };

    const article = articleSnap.data() as Article;

    // If not privileged, only author may update
    if (!isPrivileged && article.authorId !== actorId) {
      return { success: false, error: 'غير مصرح لك بتحديث هذا المقال.' };
    }

    // Prevent overwriting createdAt/id
    const safeUpdates: any = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.createdAt;

    await updateDoc(articleRef, safeUpdates);
    return { success: true };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل تحديث المقال') };
  }
}

/**
 * Delete article (admin/editor or author)
 */
export async function deleteArticle(articleId: string, actorId?: string): Promise<ServiceResult> {
  try {
    if (!isNonEmptyString(articleId)) return { success: false, error: 'مطلوب معرف المقال.' };

    if (actorId) {
      const actorSnap = await getDoc(doc(db, 'users', actorId));
      if (!actorSnap.exists()) return { success: false, error: 'المستخدم غير موجود.' };
      const actor = actorSnap.data() as UserProfile;
      const isPrivileged = !!(actor.isAdmin || actor.isEditor);

      const articleSnap = await getDoc(doc(db, ARTICLES_COLLECTION, articleId));
      if (!articleSnap.exists()) return { success: false, error: 'المقال غير موجود.' };
      const article = articleSnap.data() as Article;

      if (!isPrivileged && article.authorId !== actorId) {
        return { success: false, error: 'غير مصرح لك بحذف هذا المقال.' };
      }
    }

    await deleteDoc(doc(db, ARTICLES_COLLECTION, articleId));
    return { success: true };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل حذف المقال') };
  }
}

/**
 * Fetch articles for admin with pagination.
 */
export async function getArticlesForAdmin(opts?: { limit?: number; startAfterId?: string }): Promise<ServiceResult<{data: Article[]}>> {
  try {
    const pageLimit = opts?.limit ?? 50;
    const articlesCol = collection(db, ARTICLES_COLLECTION);
    let q = query(articlesCol, orderBy('createdAt', 'desc'), limit(pageLimit));

    if (opts?.startAfterId) {
      const startDocSnap = await getDoc(doc(db, ARTICLES_COLLECTION, opts.startAfterId));
      if (startDocSnap.exists()) q = query(articlesCol, orderBy('createdAt', 'desc'), startAfter(startDocSnap), limit(pageLimit));
    }

    const snap = await getDocs(q);
    const articles: Article[] = snap.docs.map(d => toArticleDoc(d as any));
    return { success: true, data: articles };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل جلب المقالات للإدارة') };
  }
}

/**
 * Get published articles visible to a given user (supports pagination).
 * - If no userId provided, returns only public articles.
 */
export async function getPublishedArticles(
  userId?: string,
  opts?: { limit?: number; startAfterId?: string }
): Promise<ServiceResult<{ articles: Article[]; nextPageId?: string }>> {
  try {
    const pageLimit = opts?.limit ?? 20;
    const articlesCol = collection(db, ARTICLES_COLLECTION);
    let baseQuery = query(articlesCol, where('isPublished', '==', true), orderBy('createdAt', 'desc'), limit(pageLimit + 1)); // fetch one extra for cursor

    if (opts?.startAfterId) {
      const startDocSnap = await getDoc(doc(db, ARTICLES_COLLECTION, opts.startAfterId));
      if (startDocSnap.exists()) baseQuery = query(articlesCol, where('isPublished', '==', true), orderBy('createdAt', 'desc'), startAfter(startDocSnap), limit(pageLimit + 1));
    }

    const snapshot = await getDocs(baseQuery);
    const rawArticles = snapshot.docs.map(d => toArticleDoc(d as any));
    let visible = rawArticles;

    if (userId) {
      // Determine user's audience groups
      const userSnap = await getDoc(doc(db, 'users', userId));
      const userProfile = userSnap.exists() ? (userSnap.data() as UserProfile) : null;
      const userAudienceGroups = userProfile?.audienceGroups ?? [];

      visible = rawArticles.filter(a => {
        if (!a.audience || a.audience.length === 0) return true; // default public
        if (Array.isArray(a.audience)) {
          if (a.audience.includes('public')) return true;
          return a.audience.some((g) => userAudienceGroups.includes(g));
        }
        return true;
      });
    } else {
      visible = rawArticles.filter(a => !a.audience || (Array.isArray(a.audience) && a.audience.includes('public')));
    }

    // compute cursor for next page if any
    let nextPageId: string | undefined;
    if (rawArticles.length > pageLimit) {
      const extra = rawArticles[pageLimit];
      nextPageId = extra.id;
      visible = rawArticles.slice(0, pageLimit);
    }

    return { success: true, data: { articles: visible, nextPageId } };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل جلب المقالات المنشورة') };
  }
}

/**
 * Get single article by id. Optionally increment views atomically.
 */
export async function getArticleById(articleId: string, incrementViews = false): Promise<Article | null> {
  try {
    const ref = doc(db, ARTICLES_COLLECTION, articleId);
    if (incrementViews) {
      // transactionally read + increment
      const res = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return null;
        const data = toArticleDoc(snap as any);
        tx.update(ref, { views: increment(1) });
        return data;
      });
      return res;
    } else {
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return toArticleDoc(snap as any);
    }
  } catch (err) {
    handleError(err, 'فشل جلب المقالة');
    return null;
  }
}

/**
 * Increment views (non-transactional, but safe enough). Separated for clarity.
 */
export async function incrementArticleViews(articleId: string, amount = 1): Promise<ServiceResult> {
  try {
    const ref = doc(db, ARTICLES_COLLECTION, articleId);
    await updateDoc(ref, { views: increment(amount) });
    return { success: true };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل زيادة عدد المشاهدات') };
  }
}

// -----------------------------
// Audience groups
// -----------------------------
export async function createAudienceGroup(name: string): Promise<ServiceResult<AudienceGroup>> {
  try {
    if (!isNonEmptyString(name)) return { success: false, error: 'اسم المجموعة مطلوب.' };
    const ref = await addDoc(collection(db, AUDIENCE_GROUPS_COLLECTION), { name: name.trim(), members: [], createdAt: serverTimestamp() });
    const snap = await getDoc(ref);
    const group = { id: ref.id, ...(snap.exists() ? snap.data() : {} ) } as AudienceGroup;
    return { success: true, data: group };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل إنشاء مجموعة الجمهور') };
  }
}

export async function getAudienceGroups(): Promise<ServiceResult<AudienceGroup[]>> {
  try {
    const snapshot = await getDocs(collection(db, AUDIENCE_GROUPS_COLLECTION));
    const groups = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AudienceGroup));
    return { success: true, data: groups };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل جلب مجموعات الجمهور') };
  }
}

/**
 * Delete audience group and remove groupId from users in a batch.
 */
export async function deleteAudienceGroup(groupId: string): Promise<ServiceResult> {
  if (!isNonEmptyString(groupId)) return { success: false, error: 'معرّف المجموعة مطلوب.' };

  try {
    const groupRef = doc(db, AUDIENCE_GROUPS_COLLECTION, groupId);
    const groupSnap = await getDoc(groupRef);
    if (!groupSnap.exists()) return { success: false, error: 'المجموعة غير موجودة.' };
    const groupData = groupSnap.data() as AudienceGroup;
    const batch = writeBatch(db);

    // Remove group from member user docs
    const members = groupData.members ?? [];
    for (const uid of members) {
      batch.update(doc(db, 'users', uid), { audienceGroups: arrayRemove(groupId) });
    }
    batch.delete(groupRef);
    await batch.commit();
    return { success: true };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل حذف مجموعة الجمهور') };
  }
}

export async function addPlayerToAudienceGroup(groupId: string, userId: string): Promise<ServiceResult> {
  if (!isNonEmptyString(groupId) || !isNonEmptyString(userId)) return { success: false, error: 'معرّف المجموعة ومعرّف المستخدم مطلوبان.' };
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, AUDIENCE_GROUPS_COLLECTION, groupId), { members: arrayUnion(userId) });
    batch.update(doc(db, 'users', userId), { audienceGroups: arrayUnion(groupId) });
    await batch.commit();
    return { success: true };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل إضافة اللاعب للمجموعة') };
  }
}

export async function removePlayerFromAudienceGroup(groupId: string, userId: string): Promise<ServiceResult> {
  if (!isNonEmptyString(groupId) || !isNonEmptyString(userId)) return { success: false, error: 'معرّف المجموعة ومعرّف المستخدم مطلوبان.' };
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, AUDIENCE_GROUPS_COLLECTION, groupId), { members: arrayRemove(userId) });
    batch.update(doc(db, 'users', userId), { audienceGroups: arrayRemove(groupId) });
    await batch.commit();
    return { success: true };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل إزالة اللاعب من المجموعة') };
  }
}

export async function adminSearchUsersInNews(searchTerm: string): Promise<UserProfile[]> {
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
// -----------------------------
// Maintenance
// -----------------------------
/**
 * Delete articles older than N days in batches.
 */
export async function deleteOldArticles(days = 7): Promise<ServiceResult<{ deletedCount: number }>> {
  try {
    if (days <= 0) return { success: false, error: 'قيمة الأيام غير صحيحة.' };

    const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
    const q = query(collection(db, ARTICLES_COLLECTION), where('createdAt', '<', cutoff));
    const snap = await getDocs(q);
    if (snap.empty) return { success: true, data: { deletedCount: 0 } };

    // Commit deletes in batch groups (safety: Firestore limit 500 per batch)
    const docs = snap.docs;
    const BATCH_LIMIT = 400;
    let deleted = 0;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deleted += chunk.length;
    }

    return { success: true, data: { deletedCount: deleted } };
  } catch (err) {
    return { success: false, error: handleError(err, 'فشل حذف المقالات القديمة') };
  }
}

// -----------------------------
// AI Article Generation
// -----------------------------

/**
 * Gathers all necessary data for the AI, generates an article, and saves it as a draft.
 * Admin-only action.
 */
export async function generateAndSaveArticle(): Promise<ServiceResult> {
  try {
    const now = new Date();
    const oneDayAgo = Timestamp.fromMillis(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = Timestamp.fromMillis(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all data in parallel
    const [
      leaderboard,
      punishedPlayers,
      topPunisher,
      activeChallenges,
      previousArticlesSnap,
      recentGamesSnap,
      socialEventsSnap,
    ] = await Promise.all([
      getTopUsers('leaderboardPoints', 5),
      getAllUsers('punished', 10),
      getTopPunisher(),
      getChallenges(), // Assuming this fetches active challenges
      getDocs(query(collection(db, ARTICLES_COLLECTION), where('createdAt', '>=', oneWeekAgo), orderBy('createdAt', 'desc'), limit(10))),
      getDocs(query(collection(db, GAMES_COLLECTION), where('createdAt', '>=', oneDayAgo), orderBy('createdAt', 'desc'), limit(10))),
      getDocs(query(collection(db, SOCIAL_EVENTS_COLLECTION), where('timestamp', '>=', oneDayAgo), limit(50))),
    ]);

    // Prepare input for AI
    const aiInput = {
      events: socialEventsSnap.docs.map(d => d.data()),
      previous_articles: previousArticlesSnap.docs.map(d => toArticleDoc(d as any)),
      leaderboard: leaderboard,
      punished_players: punishedPlayers,
      top_punisher: topPunisher,
      active_challenges: activeChallenges,
      recent_games: recentGamesSnap.docs.map(d => ({id: d.id, ...d.data()})),
      date: now.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    };

    // Generate the article using the AI flow
    const generatedArticle = await generateNewsArticle(aiInput);
    if (!generatedArticle || !generatedArticle.headline) {
      throw new Error('AI failed to generate a valid article.');
    }

    // Save as a draft for admin review
    const articleToSave: Omit<Article, 'id' | 'createdAt'> = {
      title: generatedArticle.headline,
      content: generatedArticle.body,
      imageUrl: generatedArticle.imageUrl,
      authorName: 'المراسل الذكي',
      authorId: 'ai_reporter',
      isPublished: false, // Save as draft
      category: 'أخبار اللعبة',
      audience: ['public'],
    };

    await createArticle(articleToSave);
    return { success: true };

  } catch (error) {
    return { success: false, error: handleError(error, 'فشل توليد وحفظ المقال') };
  }
}
