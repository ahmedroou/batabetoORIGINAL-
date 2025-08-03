
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
} from 'firebase/firestore';
import type { Challenge, Game, UserProfile } from '@/types';

/**
 * Creates a new challenge.
 * @param {Omit<Challenge, 'id' | 'createdAt' | 'participantCount'>} challengeData - The data for the new challenge.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createChallenge(
    challengeData: Omit<Challenge, 'id' | 'createdAt' | 'participantCount'>
): Promise<{ success: boolean; error?: string }> {
    try {
        await addDoc(collection(db, 'challenges'), {
            ...challengeData,
            createdAt: serverTimestamp(),
            participantCount: 0,
        });
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
                // Ensure dates are converted properly
                createdAt: (data.createdAt as Timestamp).toDate(),
                endsAt: (data.endsAt as Timestamp).toDate(),
            } as Challenge;
        });

    } catch (error) {
        console.error("Error fetching challenges:", error);
        return [];
    }
}
