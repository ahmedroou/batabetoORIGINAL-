
'use server';

/**
 * @fileoverview Admin actions related to Artificial Intelligence flows.
 */

import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import type { Article, SocialEvent, Game } from '@/types';
import { generateNewsArticle } from '@/ai/flows/generate-news-article-flow';
import { getTopUsers, getTopPunisher, getAllUsers } from '../user/queries';
import { getChallenges } from '../challenges';


async function getRecentFinishedGames(count: number): Promise<Game[]> {
  try {
    const gamesCol = collection(db, 'games');
    const qRef = query(
      gamesCol,
      where('gameState', '==', 'final_results'),
      orderBy('createdAt', 'desc'),
      limit(count),
    );
    const snapshot = await getDocs(qRef);
    return snapshot.docs.map((d) => d.data() as Game);
  } catch (e) {
    console.error('Error fetching recent games:', e);
    return [];
  }
}

async function getJournalistSourceMaterial(directive?: string) {
  const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const eventsQuery = query(
    collection(db, 'social_events'),
    where('timestamp', '>=', oneDayAgo),
    orderBy('timestamp', 'desc'),
  );

  const articlesQuery = query(
    collection(db, 'articles'),
    where('createdAt', '>=', sevenDaysAgo),
    orderBy('createdAt', 'desc'),
  );

  const [eventsSnapshot, articlesSnapshot, leaderboard, punished_players, top_punisher, active_challenges, recent_games] =
    await Promise.all([
      getDocs(eventsQuery),
      getDocs(articlesQuery),
      getTopUsers('leaderboardPoints', 5),
      getAllUsers('punished'),
      getTopPunisher(),
      getChallenges(),
      getRecentFinishedGames(10),
    ]);

  const events = eventsSnapshot.docs.map(
    (d) => ({ ...d.data(), timestamp: (d.data().timestamp as Timestamp).toDate() } as SocialEvent),
  );
  const previous_articles = articlesSnapshot.docs.map(
    (d) => ({ ...d.data(), createdAt: (d.data().createdAt as Timestamp).toDate() } as Article),
  );

  return {
    events,
    previous_articles,
    leaderboard,
    punished_players,
    top_punisher,
    active_challenges,
    recent_games,
    directive,
    date: new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
}

export async function runAiJournalist(
  directive?: string,
): Promise<{ success: boolean; article?: { headline: string }; error?: string }> {
  try {
    const sourceMaterial = await getJournalistSourceMaterial(directive);
    const generatedArticle = await generateNewsArticle(sourceMaterial);

    if (!generatedArticle.headline || !generatedArticle.body) {
      throw new Error('فشل الذكاء الاصطناعي في توليد مقال متكامل.');
    }

    await addDoc(collection(db, 'articles'), {
      title: generatedArticle.headline,
      content: generatedArticle.body,
      category: generatedArticle.category,
      imageUrl: '',
      authorName: 'المراسل الذكي',
      authorId: 'ai_journalist',
      isPublished: true,
      audience: ['public'],
      createdAt: serverTimestamp(),
      views: 0,
    });

    return { success: true, article: { headline: generatedArticle.headline } };
  } catch (e: any) {
    console.error('Error running AI journalist:', e);
    return { success: false, error: e?.message || 'حدث خطأ غير متوقع.' };
  }
}
