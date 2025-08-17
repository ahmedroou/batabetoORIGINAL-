
'use server';

import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Game, GamePointsScoredEvent } from '@/types';

/**
 * Records an event when a player scores points in a game.
 * This creates a document in the 'social_events' collection.
 * @param {string} playerId - The ID of the player who scored.
 * @param {Game['gameType']} gameType - The type of game played.
 * @param {string} gameId - The ID of the game instance.
 * @param {number} points - The number of points scored.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function recordGamePointsScoredEvent(
    playerId: string,
    gameType: Game['gameType'],
    gameId: string,
    points: number
): Promise<{ success: boolean; error?: string }> {
    if (!playerId || !gameType || !gameId || typeof points !== 'number') {
        return { success: false, error: "معلومات غير كافية لتسجيل الحدث." };
    }

    try {
        const eventData: Omit<GamePointsScoredEvent, 'id' | 'timestamp'> = {
            type: 'game_points_scored',
            playerId,
            gameType,
            gameId,
            points,
        };

        await addDoc(collection(db, 'social_events'), {
            ...eventData,
            timestamp: serverTimestamp(),
        });

        return { success: true };
    } catch (error) {
        console.error("Error recording game points event:", error);
        return { success: false, error: "فشل تسجيل حدث نقاط اللعبة." };
    }
}

    