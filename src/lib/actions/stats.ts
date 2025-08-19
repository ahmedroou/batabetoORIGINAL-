
'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { Game } from '@/types';

/**
 * Fetches game popularity statistics from Firestore.
 * This function retrieves the 'popularity' document from the 'game_stats' collection.
 * 
 * @returns {Promise<Record<Game['gameType'], number>>} A promise that resolves to an object 
 * where keys are game types and values are their popularity counts. Returns an empty object on failure.
 */
export async function getGamePopularityStats(): Promise<Record<Game['gameType'], number>> {
  try {
    const statsRef = doc(db, 'game_stats', 'popularity');
    const docSnap = await getDoc(statsRef);
    if (docSnap.exists()) {
      return docSnap.data() as Record<Game['gameType'], number>;
    }
    return {} as Record<Game['gameType'], number>;
  } catch (error) {
    console.error('Error fetching game popularity stats:', error);
    return {} as Record<Game['gameType'], number>;
  }
}
