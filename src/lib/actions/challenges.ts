
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
    writeBatch,
    doc
} from 'firebase/firestore';
import type { Challenge, Game } from '@/types';
import { generateGameId } from './helpers';

/**
 * Creates a new challenge and 3 associated game rooms.
 * @param {Omit<Challenge, 'id' | 'createdAt' | 'participantCount' | 'gameRoomIds'>} challengeData - The data for the new challenge.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createChallenge(
    challengeData: Omit<Challenge, 'id' | 'createdAt' | 'participantCount' | 'gameRoomIds'>
): Promise<{ success: boolean; error?: string }> {
    const batch = writeBatch(db);
    const challengeRef = doc(collection(db, 'challenges'));

    try {
        const gameRoomIds = [];
        for (let i = 0; i < 3; i++) {
            const gameId = generateGameId();
            const gameRoomRef = doc(db, 'games', gameId);
            
            const newGameRoom: Partial<Game> = {
                challengeId: challengeRef.id,
                hostId: 'system', // System is the host initially
                players: [],
                playerUids: [],
                gameState: 'lobby',
                createdAt: serverTimestamp() as Timestamp,
                expiresAt: challengeData.endsAt, // The room expires when the challenge ends
                gameType: challengeData.gameType,
            };
            
            batch.set(gameRoomRef, newGameRoom);
            gameRoomIds.push({ id: gameId, playerCount: 0 });
        }
        
        const newChallenge: Omit<Challenge, 'id'> = {
            ...challengeData,
            createdAt: serverTimestamp() as Timestamp,
            participantCount: 0,
            gameRoomIds: gameRoomIds,
        };

        batch.set(challengeRef, newChallenge);
        
        await batch.commit();

        return { success: true };
    } catch (error) {
        console.error("Error creating challenge:", error);
        return { success: false, error: 'فشل إنشاء التحدي.' };
    }
}


/**
 * Retrieves all active challenges.
 * @returns {Promise<Challenge[]>} An array of active challenges.
 */
export async function getChallenges(): Promise<Challenge[]> {
    try {
        const challengesCol = collection(db, 'challenges');
        const q = query(
            challengesCol, 
            where('endsAt', '>', Timestamp.now()),
            orderBy('endsAt', 'asc')
        );
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp).toDate(),
                endsAt: (data.endsAt as Timestamp).toDate(),
            } as Challenge;
        });

    } catch (error) {
        console.error("Error fetching challenges:", error);
        return [];
    }
}
