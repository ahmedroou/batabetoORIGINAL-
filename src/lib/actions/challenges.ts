

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
    limit,
} from 'firebase/firestore';
import type { Challenge, ChallengePrize, Game, UserProfile, GamePointsScoredEvent } from '@/types';
import { sendSystemMail } from './user/mail';
import { recordGamePointsScoredEvent } from './events';


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
            claimedBy: [],
        };

        await addDoc(challengesCollectionRef, newChallenge);
        
        return { success: true };
    } catch (error) {
        console.error("Error creating challenge:", error);
        return { success: false, error: 'فشل إنشاء البطولة.' };
    }
}


/**
 * Retrieves all challenges, optimized to reduce database reads.
 * It fetches the latest 15 challenges and performs a single bulk fetch for top participants.
 * @returns {Promise<Challenge[]>} An array of challenges with top participant data.
 */
export async function getChallenges(): Promise<Challenge[]> {
    try {
        const challengesCol = collection(db, 'challenges');
        // Optimization: Fetch only the latest 15 challenges to limit the main query size.
        const q = query(challengesCol, orderBy('endsAt', 'desc'), limit(15));
        const snapshot = await getDocs(q);
        
        let challenges = snapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
            const endsAt = data.endsAt instanceof Timestamp ? data.endsAt.toDate() : new Date(Date.now() + 24 * 60 * 60 * 1000);
            return {
                id: doc.id,
                ...data,
                createdAt,
                endsAt,
                topParticipants: [], // Initialize with an empty array
            } as Challenge;
        });

        // Optimization: Collect all top participant IDs from all challenges into a single set.
        const allTopParticipantIds = new Set<string>();
        challenges.forEach(challenge => {
            if (challenge.scores && Object.keys(challenge.scores).length > 0) {
                const sortedParticipantIds = Object.keys(challenge.scores).sort((a, b) => (challenge.scores[b] || 0) - (challenge.scores[a] || 0));
                sortedParticipantIds.slice(0, 3).forEach(id => allTopParticipantIds.add(id));
            }
        });

        // Optimization: Fetch all unique top participants in a single batch query.
        if (allTopParticipantIds.size > 0) {
            const idsArray = Array.from(allTopParticipantIds);
            const usersQuery = query(collection(db, 'users'), where('__name__', 'in', idsArray));
            const usersSnapshot = await getDocs(usersQuery);
            const usersDataMap = new Map<string, UserProfile>();
            usersSnapshot.docs.forEach(d => usersDataMap.set(d.id, { uid: d.id, ...d.data() } as UserProfile));
            
            // Map the fetched user data back to each challenge.
            challenges.forEach(challenge => {
                 if (challenge.scores && Object.keys(challenge.scores).length > 0) {
                    const sortedParticipantIds = Object.keys(challenge.scores).sort((a, b) => (challenge.scores[b] || 0) - (challenge.scores[a] || 0));
                    const top3Ids = sortedParticipantIds.slice(0, 3);
                    challenge.topParticipants = top3Ids
                        .map(id => usersDataMap.get(id))
                        .filter((user): user is UserProfile => !!user)
                        .sort((a,b) => (challenge.scores[b.uid] || 0) - (challenge.scores[a.uid] || 0));
                 }
            });
        }
        
        return challenges;

    } catch (error) {
        console.error("Error fetching challenges:", error);
        return [];
    }
}


/**
 * Gets full details for a single challenge, including the top 10 participants.
 * This is optimized to only fetch necessary data.
 * @param {string} challengeId - The ID of the challenge to fetch.
 * @returns {Promise<Challenge | null>} The challenge object with top 10 participant details.
 */
export async function getChallengeDetails(challengeId: string): Promise<Challenge | null> {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        const challengeDoc = await getDoc(challengeRef);
        if (!challengeDoc.exists()) return null;

        const data = challengeDoc.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
        const endsAt = data.endsAt instanceof Timestamp ? data.endsAt.toDate() : new Date();

        const challengeData: Challenge = {
            id: challengeDoc.id,
            ...data,
            createdAt,
            endsAt,
        } as Challenge;

        if (challengeData.scores && Object.keys(challengeData.scores).length > 0) {
            const sortedParticipantIds = Object.keys(challengeData.scores).sort((a, b) => (challengeData.scores[b] || 0) - (challengeData.scores[a] || 0));
            const top10Ids = sortedParticipantIds.slice(0, 10);
            
            if (top10Ids.length > 0) {
                const usersQuery = query(collection(db, 'users'), where('__name__', 'in', top10Ids));
                const usersSnapshot = await getDocs(usersQuery);
                const topUsersData = usersSnapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
                challengeData.participants = topUsersData.sort((a, b) => (challengeData.scores[b.uid] || 0) - (challengeData.scores[a.uid] || 0));
            } else {
                challengeData.participants = [];
            }
        } else {
             challengeData.participants = [];
        }

        return challengeData;

    } catch (error) {
        console.error("Error fetching challenge details:", error);
        return null;
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

        if (challengeData.entryFee && challengeData.entryFee.value > 0) {
            const { type, value } = challengeData.entryFee;
            const userCurrency = type === 'coins' ? userData.coins : userData.leaderboardPoints;
            if ((userCurrency || 0) < value) {
                throw new Error(`ليس لديك ما يكفي من ${type === 'coins' ? 'الكوينز' : 'نقاط الصدارة'} للانضمام (المطلوب: ${value}).`);
            }
            transaction.update(userRef, { [type]: increment(-value) });
        }


        transaction.update(challengeRef, {
            participantIds: arrayUnion(userId),
            participantCount: increment(1),
            [`scores.${userId}`]: 0,
        });

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
            const createdAt = challenge.createdAt instanceof Timestamp ? challenge.createdAt.toDate() : new Date();
            updateData.endsAt = Timestamp.fromMillis(createdAt.getTime() + updateData.durationInHours * 60 * 60 * 1000);
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

export async function getAllChallengesForAdmin(): Promise<Challenge[]> {
     try {
        const challengesCol = collection(db, 'challenges');
        const q = query(challengesCol, orderBy('createdAt', 'desc'), limit(15));
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
            const endsAt = data.endsAt instanceof Timestamp ? data.endsAt.toDate() : new Date();
            return {
                id: doc.id,
                ...data,
                createdAt,
                endsAt,
            } as Challenge;
        });

    } catch (error) {
        console.error("Error fetching all challenges for admin:", error);
        return [];
    }
}

async function updateChallengeScores(challenge: Challenge): Promise<Record<string, number>> {
    const eventsRef = collection(db, 'social_events');
    const q = query(eventsRef, 
        where('type', '==', 'game_points_scored'),
        where('timestamp', '>=', challenge.createdAt),
        where('timestamp', '<=', challenge.endsAt)
    );

    const snapshot = await getDocs(q);
    const newScores: Record<string, number> = {};

    snapshot.docs.forEach(doc => {
        const event = doc.data() as GamePointsScoredEvent;
        if (
            challenge.participantIds.includes(event.playerId) &&
            (challenge.specificGameType === 'all' || challenge.specificGameType === event.gameType)
        ) {
            newScores[event.playerId] = (newScores[event.playerId] || 0) + event.points;
        }
    });

    // Update the challenge doc with the new scores.
    await updateDoc(doc(db, 'challenges', challenge.id), { scores: newScores });

    return newScores;
}

export async function finalizeChallenge(challengeId: string): Promise<{ success: boolean; winnersCount: number; error?: string }> {
    const challengeRef = doc(db, 'challenges', challengeId);
    
    return runTransaction(db, async (transaction) => {
        const challengeDoc = await transaction.get(challengeRef);
        if (!challengeDoc.exists()) throw new Error("Challenge not found.");
        const challengeData = challengeDoc.data() as Challenge;

        if (challengeData.winners) throw new Error("This challenge has already been finalized.");

        // New logic: Recalculate scores from events before finalizing.
        const scores = await updateChallengeScores(challengeData);
        
        const sortedWinners = Object.entries(scores)
            .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
            .slice(0, 3);

        const winners: Challenge['winners'] = {};
        
        if (sortedWinners.length > 0) {
            const firstPlaceId = sortedWinners[0][0];
            const firstPlayerDoc = await getDoc(doc(db, 'users', firstPlaceId));
            if (firstPlayerDoc.exists()) {
                winners.first = { id: firstPlaceId, name: firstPlayerDoc.data().name };
            }
        }
        
        if (sortedWinners.length > 1) {
            const secondPlaceId = sortedWinners[1][0];
            const secondPlayerDoc = await getDoc(doc(db, 'users', secondPlaceId));
             if (secondPlayerDoc.exists()) {
                winners.second = { id: secondPlaceId, name: secondPlayerDoc.data().name };
             }
        }
        
        if (sortedWinners.length > 2) {
            const thirdPlaceId = sortedWinners[2][0];
            const thirdPlayerDoc = await getDoc(doc(db, 'users', thirdPlaceId));
            if (thirdPlayerDoc.exists()) {
                winners.third = { id: thirdPlaceId, name: thirdPlayerDoc.data().name };
            }
        }
        
        transaction.update(challengeRef, { winners: winners, claimedBy: [] });

        return { success: true, winnersCount: Object.keys(winners).length };

    }).catch((error: any) => {
        console.error("Error finalizing challenge:", error);
        return { success: false, winnersCount: 0, error: error.message };
    });
}

/**
 * Allows a player to claim their prize for a completed challenge.
 * @param {string} challengeId - The ID of the challenge.
 * @param {string} userId - The ID of the user claiming the prize.
 * @returns {Promise<{ success: boolean; error?: string; message?: string }>}
 */
export async function claimChallengePrize(challengeId: string, userId: string): Promise<{ success: boolean; error?: string; message?: string }> {
    const challengeRef = doc(db, 'challenges', challengeId);
    const userRef = doc(db, 'users', userId);

    return runTransaction(db, async (transaction) => {
        const [challengeDoc, userDoc] = await Promise.all([
            transaction.get(challengeRef),
            transaction.get(userRef)
        ]);

        if (!challengeDoc.exists()) throw new Error("البطولة غير موجودة.");
        if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");

        const challengeData = challengeDoc.data() as Challenge;
        
        if (!challengeData.winners) throw new Error("لم يتم تحديد الفائزين في هذه البطولة بعد.");
        if (challengeData.claimedBy?.includes(userId)) throw new Error("لقد طالبت بجائزتك بالفعل.");
        
        let rank: 'first' | 'second' | 'third' | null = null;
        if (challengeData.winners.first?.id === userId) rank = 'first';
        else if (challengeData.winners.second?.id === userId) rank = 'second';
        else if (challengeData.winners.third?.id === userId) rank = 'third';

        if (!rank) throw new Error("أنت لست من الفائزين في هذه البطولة.");

        const prizeMap = {
            first: challengeData.firstPlacePrize,
            second: challengeData.secondPlacePrize,
            third: challengeData.thirdPlacePrize,
        };

        const prizesToAward = prizeMap[rank];
        if (!prizesToAward || prizesToAward.length === 0) {
            // Mark as claimed even if no prize to prevent re-claims
            transaction.update(challengeRef, { claimedBy: arrayUnion(userId) });
            return { success: true, message: "لا توجد جوائز محددة لمركزك، ولكن تم تسجيل مطالبتك." };
        }
        
        const updates: { [key: string]: any } = {};
        prizesToAward.forEach(prize => {
            updates[prize.type] = increment(prize.value);
        });

        transaction.update(userRef, updates);
        transaction.update(challengeRef, { claimedBy: arrayUnion(userId) });

        const prizeDescriptions = prizesToAward.map(p => `${p.value} ${p.type === 'coins' ? 'كوينز' : p.type === 'diamonds' ? 'ألماس' : 'نقاط شرف'}`).join(', ');
        return { success: true, message: `تهانينا! لقد حصلت على: ${prizeDescriptions}.` };

    }).catch((error: any) => {
        console.error("Error claiming challenge prize:", error);
        return { success: false, error: error.message || "فشل المطالبة بالجائزة." };
    });
}
