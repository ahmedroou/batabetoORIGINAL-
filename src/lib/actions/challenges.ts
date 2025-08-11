
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
    runTransaction,
} from 'firebase/firestore';
import type { Challenge, ChallengePrize, Game, UserProfile } from '@/types';
import { sendSystemMail } from './user/mail';


type CreateChallengeInput = Omit<Challenge, 'id' | 'createdAt' | 'participantIds' | 'endsAt' | 'participantCount' | 'scores'> & { durationInHours: number };

/**
 * Creates a new tournament-style challenge. Admin only.
 * @param {CreateChallengeInput} challengeData - The data for the new challenge.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createChallenge(challengeData: CreateChallengeInput): Promise<{ success: boolean; error?: string }> {
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
            scores: {},
        };

        await addDoc(challengesCollectionRef, newChallenge);
        
        return { success: true };
    } catch (error) {
        console.error("Error creating challenge:", error);
        return { success: false, error: 'فشل إنشاء البطولة.' };
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
    const userRef = doc(db, 'users', userId);
    
    return runTransaction(db, async (transaction) => {
        const [challengeDoc, userDoc] = await Promise.all([
            transaction.get(challengeRef),
            transaction.get(userRef)
        ]);

        if (!challengeDoc.exists()) {
            throw new Error("البطولة غير موجودة.");
        }
        if (!userDoc.exists()) {
            throw new Error("المستخدم غير موجود.");
        }
        const challengeData = challengeDoc.data() as Challenge;
        const userData = userDoc.data() as UserProfile;

        if (challengeData.participantIds?.includes(userId)) {
            throw new Error("أنت مشترك بالفعل في هذه البطولة.");
        }

        // Handle entry fee
        if (challengeData.entryFee && challengeData.entryFee.value > 0) {
            const { type, value } = challengeData.entryFee;
            const userCurrency = type === 'coins' ? userData.coins : userData.leaderboardPoints;
            if ((userCurrency || 0) < value) {
                throw new Error(`ليس لديك ما يكفي من ${type === 'coins' ? 'الكوينز' : 'نقاط الصدارة'} للانضمام (المطلوب: ${value}).`);
            }
            // Deduct the fee
            transaction.update(userRef, { [type]: increment(-value) });
        }


        // Add user to challenge
        transaction.update(challengeRef, {
            participantIds: arrayUnion(userId),
            participantCount: increment(1)
        });

        // Add challenge to user's profile
        transaction.update(userRef, {
            challenges: arrayUnion({
                id: challengeId,
                title: challengeData.title,
                joinedAt: Timestamp.now(),
            })
        });

        return { success: true };
    }).catch((error: any) => {
        console.error("Error joining challenge:", error);
        return { success: false, error: error.message || "فشل الانضمام للبطولة." };
    });
}

/**
 * Updates an existing challenge. Admin only.
 * @param {string} challengeId - The ID of the challenge to update.
 * @param {Partial<Challenge>} data - The data to update.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function updateChallenge(challengeId: string, data: Partial<Omit<Challenge, 'id' | 'createdAt' | 'participantCount' | 'participantIds' | 'scores'>> & {durationInHours?: number}): Promise<{ success: boolean; error?: string }> {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        let updateData: any = { ...data };

        const docSnap = await getDoc(challengeRef);
        if(!docSnap.exists()){
            throw new Error("Challenge not found.");
        }
        const challenge = docSnap.data() as Challenge;
        
        if (updateData.durationInHours) {
            const createdAtMillis = (challenge.createdAt as Timestamp).toMillis();
            updateData.endsAt = Timestamp.fromMillis(createdAtMillis + updateData.durationInHours * 60 * 60 * 1000);
            delete updateData.durationInHours;
        }

        await updateDoc(challengeRef, updateData);
        return { success: true };
    } catch (error: any) {
        console.error("Error updating challenge:", error);
        return { success: false, error: "فشل تحديث البطولة." };
    }
}

/**
 * Deletes a challenge. Admin only.
 * @param {string} challengeId - The ID of the challenge to delete.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function deleteChallenge(challengeId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        await deleteDoc(challengeRef);
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting challenge:", error);
        return { success: false, error: "فشل حذف البطولة." };
    }
}

// For admin to view all challenges, including expired ones
export async function getAllChallengesForAdmin(): Promise<Challenge[]> {
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
}


export async function finalizeChallenge(challengeId: string): Promise<{ success: boolean; winnersCount: number; error?: string }> {
    const challengeRef = doc(db, 'challenges', challengeId);
    
    return runTransaction(db, async (transaction) => {
        const challengeDoc = await transaction.get(challengeRef);
        if (!challengeDoc.exists()) throw new Error("Challenge not found.");
        const challengeData = challengeDoc.data() as Challenge;

        if (challengeData.winners) throw new Error("This challenge has already been finalized.");

        const scores = challengeData.scores || {};
        const sortedWinners = Object.entries(scores)
            .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
            .slice(0, 3);

        const winners: Challenge['winners'] = {};
        let winnersCount = 0;
        
        const applyPrizes = async (userId: string, prizes: ChallengePrize[]) => {
            const userRef = doc(db, 'users', userId);
            const updates: { [key: string]: any } = {};
            let mailBody = `تهانينا! لقد فزت بالجوائز التالية في بطولة: ${challengeData.title}\n\n`;

            for (const prize of prizes) {
                updates[prize.type] = increment(prize.value);
                mailBody += `- ${prize.value} ${prize.type}\n`;
            }
            
            transaction.update(userRef, updates);
            await sendSystemMail(userId, { subject: `🎉 لقد فزت في البطولة!`, body: mailBody });
        };
        
        if (sortedWinners.length > 0) {
            const firstPlace = sortedWinners[0];
            const firstPlayerDoc = await transaction.get(doc(db, 'users', firstPlace[0]));
            if (firstPlayerDoc.exists()) {
                winners.first = { id: firstPlace[0], name: firstPlayerDoc.data().name };
                await applyPrizes(firstPlace[0], challengeData.firstPlacePrize);
                winnersCount++;
            }
        }
        
        if (sortedWinners.length > 1) {
            const secondPlace = sortedWinners[1];
             const secondPlayerDoc = await transaction.get(doc(db, 'users', secondPlace[0]));
             if (secondPlayerDoc.exists()) {
                winners.second = { id: secondPlace[0], name: secondPlayerDoc.data().name };
                await applyPrizes(secondPlace[0], challengeData.secondPlacePrize);
                winnersCount++;
             }
        }
        
        if (sortedWinners.length > 2) {
            const thirdPlace = sortedWinners[2];
            const thirdPlayerDoc = await transaction.get(doc(db, 'users', thirdPlace[0]));
            if (thirdPlayerDoc.exists()) {
                winners.third = { id: thirdPlace[0], name: thirdPlayerDoc.data().name };
                await applyPrizes(thirdPlace[0], challengeData.thirdPlacePrize);
                winnersCount++;
            }
        }
        
        transaction.update(challengeRef, { winners: winners });

        return { success: true, winnersCount };

    }).catch((error: any) => {
        console.error("Error finalizing challenge:", error);
        return { success: false, winnersCount: 0, error: error.message };
    });
}
