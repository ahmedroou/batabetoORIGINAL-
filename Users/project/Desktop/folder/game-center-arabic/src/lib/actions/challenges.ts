
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
    doc,
    arrayUnion,
    updateDoc,
    deleteDoc,
    getDoc,
    increment,
} from 'firebase/firestore';
import type { Challenge, ChallengePrize, Game } from '@/types';
import { withAdminAuth } from './helpers';


type CreateChallengeInput = Omit<Challenge, 'id' | 'createdAt' | 'participantIds' | 'endsAt' | 'participantCount'> & { durationInHours: number };

/**
 * Creates a new tournament-style challenge. Admin only.
 * @param {string} adminId - The ID of the admin creating the challenge.
 * @param {CreateChallengeInput} challengeData - The data for the new challenge.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export const createChallenge = withAdminAuth(async (adminId: string, challengeData: CreateChallengeInput): Promise<{ success: boolean; error?: string }> => {
    const challengesCollectionRef = collection(db, 'challenges');

    try {
        const { durationInHours, ...restOfChallengeData } = challengeData;
        const endsAt = Timestamp.fromMillis(Date.now() + durationInHours * 60 * 60 * 1000);

        const newChallenge: Omit<Challenge, 'id'> = {
            ...restOfChallengeData,
            createdAt: serverTimestamp() as Timestamp,
            endsAt: endsAt,
            participantIds: [],
            participantCount: 0,
        };

        await addDoc(challengesCollectionRef, newChallenge);
        
        return { success: true };
    } catch (error) {
        console.error("Error creating challenge:", error);
        return { success: false, error: 'فشل إنشاء البطولة.' };
    }
});


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
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
                endsAt: (data.endsAt as Timestamp)?.toDate(),
            } as Challenge;
        });

    } catch (error) {
        console.error("Error fetching challenges:", error);
        return [];
    }
}


/**
 * Allows a user to join a challenge.
 * @param {string} challengeId - The ID of the challenge to join.
 * @param {string} userId - The ID of the user joining.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function joinChallenge(challengeId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const challengeRef = doc(db, 'challenges', challengeId);
    try {
        await updateDoc(challengeRef, {
            participantIds: arrayUnion(userId),
            participantCount: increment(1)
        });
        return { success: true };
    } catch (error) {
        console.error("Error joining challenge:", error);
        return { success: false, error: "فشل الانضمام للبطولة." };
    }
}

/**
 * Updates an existing challenge. Admin only.
 * @param {string} adminId - The ID of the admin.
 * @param {string} challengeId - The ID of the challenge to update.
 * @param {Partial<Challenge>} data - The data to update.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export const updateChallenge = withAdminAuth(async (adminId: string, challengeId: string, data: Partial<Omit<Challenge, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> => {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        if ((data as any).durationInHours) {
            const docSnap = await getDoc(challengeRef);
            if(docSnap.exists()){
                const challenge = docSnap.data() as Challenge;
                const createdAtMillis = (challenge.createdAt as Timestamp).toMillis();
                data.endsAt = Timestamp.fromMillis(createdAtMillis + (data as any).durationInHours * 60 * 60 * 1000);
            }
            delete (data as any).durationInHours;
        }

        await updateDoc(challengeRef, data);
        return { success: true };
    } catch (error: any) {
        console.error("Error updating challenge:", error);
        return { success: false, error: "فشل تحديث البطولة." };
    }
});

/**
 * Deletes a challenge. Admin only.
 * @param {string} adminId - The ID of the admin.
 * @param {string} challengeId - The ID of the challenge to delete.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export const deleteChallenge = withAdminAuth(async (adminId: string, challengeId: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        await deleteDoc(challengeRef);
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting challenge:", error);
        return { success: false, error: "فشل حذف البطولة." };
    }
});

// For admin to view all challenges, including expired ones
export const getAllChallengesForAdmin = withAdminAuth(async (adminId: string): Promise<Challenge[]> => {
     try {
        const challengesCol = collection(db, 'challenges');
        const q = query(challengesCol, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
                endsAt: (data.endsAt as Timestamp)?.toDate(),
            } as Challenge;
        });

    } catch (error) {
        console.error("Error fetching all challenges for admin:", error);
        return [];
    }
});
