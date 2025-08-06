"use server";

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
 * Creates a new challenge and one initial game room.
 * @param {Omit<Challenge, 'id' | 'createdAt' | 'participantCount' | 'gameRoomIds' | 'endsAt'> & { durationInHours: number }} challengeData - The data for the new challenge.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createChallenge(
    challengeData: Omit<Challenge, 'id' | 'createdAt' | 'participantCount' | 'gameRoomIds' | 'endsAt'> & { durationInHours: number }
): Promise<{ success: boolean; error?: string }> {
    const batch = writeBatch(db);
    const challengeRef = doc(collection(db, 'challenges'));

    try {
        const { durationInHours, ...restOfChallengeData } = challengeData;
        const endsAt = Timestamp.fromMillis(Date.now() + durationInHours * 60 * 60 * 1000);

        // Create one initial game room
        const gameId = generateGameId();
        const gameRoomRef = doc(db, 'games', gameId);
        
        const newGameRoom: Partial<Game> = {
            challengeId: challengeRef.id,
            challengeDetails: {
                title: challengeData.title,
                minPlayersToStart: challengeData.minPlayersToStart,
                entryFee: challengeData.entryFee
            },
            hostId: 'system',
            players: [],
            playerUids: [],
            gameState: 'lobby',
            createdAt: serverTimestamp() as Timestamp,
            expiresAt: endsAt,
            gameType: challengeData.gameType,
        };
        batch.set(gameRoomRef, newGameRoom);
        
        const newChallenge: Omit<Challenge, 'id'> = {
            ...restOfChallengeData,
            createdAt: serverTimestamp() as Timestamp,
            endsAt: endsAt,
            participantCount: 0,
            gameRoomIds: [{ id: gameId, playerCount: 0 }],
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
