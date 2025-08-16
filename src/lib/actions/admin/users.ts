

'use server';

/**
 * @fileoverview Admin actions related to user management.
 */

import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    writeBatch,
    query,
    where,
    updateDoc,
    serverTimestamp,
    orderBy,
    limit,
    increment,
    runTransaction,
} from 'firebase/firestore';
import type { UserProfile, Mail, Game } from '@/types';
import { sendSystemMail } from '../user/mail';
import { calculateEndOfGameAwards } from '../user/awards';
import { getRanks } from '../user/queries';
import { recordMatchHistory } from '../user/queries';

const normalize = (s: any) => (typeof s === 'string' ? s : String(s ?? '')).trim().replace(/\s+/g, ' ');
const stringNonEmpty = (s: any) => typeof s === 'string' && normalize(s).length > 0;

export async function adminSearchUsers(searchTerm: string): Promise<UserProfile[]> {
  if (!stringNonEmpty(searchTerm)) return [];
  const term = normalize(searchTerm);
  const usersRef = collection(db, 'users');

  const nameQuery = query(usersRef, where('name', '>=', term), where('name', '<=', term + '\uf8ff'));
  const emailQuery = query(usersRef, where('email', '>=', term.toLowerCase()), where('email', '<=', term.toLowerCase() + '\uf8ff'));

  try {
    const [nameSnapshot, emailSnapshot] = await Promise.all([ getDocs(nameQuery), getDocs(emailQuery) ]);
    const usersMap = new Map<string, UserProfile>();
    nameSnapshot.forEach(doc => { if (!usersMap.has(doc.id)) usersMap.set(doc.id, { uid: doc.id, ...doc.data() } as UserProfile) });
    emailSnapshot.forEach(doc => { if (!usersMap.has(doc.id)) usersMap.set(doc.id, { uid: doc.id, ...doc.data() } as UserProfile) });
    return Array.from(usersMap.values()).slice(0, 50);
  } catch (error) {
    console.warn('Falling back to client-side filtering for user search due to error:', error);
    try {
        const fullSnapshot = await getDocs(usersRef);
        const lowerCaseSearchTerm = term.toLowerCase();
        return fullSnapshot.docs
            .map((doc) => ({ uid: doc.id, ...doc.data() } as UserProfile))
            .filter((user) => user.name?.toLowerCase().includes(lowerCaseSearchTerm) || user.email?.toLowerCase().includes(lowerCaseSearchTerm))
            .slice(0, 50);
    } catch(fallbackError) {
        console.error('Fallback user search also failed:', fallbackError);
        return [];
    }
  }
}

export async function adminUpdateUser(userId: string, data: Partial<UserProfile>) {
  if (!stringNonEmpty(userId)) return { success: false, error: 'User ID is required.' };
  const sanitized: Partial<UserProfile> & Record<string, any> = { ...data };
  delete sanitized.isAdmin;
  delete sanitized.isEditor;
  try {
    const ref = doc(db, 'users', userId);
    await updateDoc(ref, sanitized);
    return { success: true };
  } catch (e) {
    console.error("Error updating user by admin:", e);
    return { success: false, error: "Failed to update user profile." };
  }
}

export async function resetAllUserAvatars(): Promise<{ success: boolean; error?: string; count?: number, message?: string }> {
    try {
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);
        
        if (querySnapshot.empty) return { success: true, count: 0, message: "لم يتم العثور على مستخدمين." };

        const batch = writeBatch(db);
        const defaultAvatarDoc = await getDoc(doc(db, 'game_settings', 'default_avatar'));
        const defaultAvatarId = defaultAvatarDoc.exists() ? defaultAvatarDoc.data().avatarId : 'Avatar00.png';

        querySnapshot.forEach(doc => {
            batch.update(doc.ref, {
                avatarId: defaultAvatarId,
                unlockedAvatars: [defaultAvatarId]
            });
        });

        await batch.commit();
        return { success: true, count: querySnapshot.size, message: `تمت إعادة تعيين شخصيات ${querySnapshot.size} مستخدم.` };
    } catch (error) {
        console.error("Error resetting all user avatars:", error);
        return { success: false, error: 'فشل إعادة ضبط شخصيات المستخدمين.' };
    }
}

export async function getTopUsers(field: 'coins' | 'leaderboardPoints', count: number): Promise<UserProfile[]> {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy(field, 'desc'), limit(count));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    } catch (error) {
        console.error(`Error getting top users by ${field}:`, error);
        return [];
    }
}

export async function adminSendMail(recipientIds: string[], subject: string, body: string, coins: number): Promise<{ success: boolean; error?: string }> {
  if (!recipientIds?.length || !stringNonEmpty(subject) || !stringNonEmpty(body)) {
    return { success: false, error: "المعلومات غير كافية لإرسال الرسالة." };
  }

  const batch = writeBatch(db);
  const senderName = 'Admin';
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  
  recipientIds.forEach(recipientId => {
    const mailRef = doc(collection(db, `users/${recipientId}/mail`));
    const mailData: Omit<Mail, 'id' | 'createdAt'> = {
        senderName,
        subject,
        body,
        isRead: false,
        expiresAt,
        coins: coins > 0 ? coins : undefined,
        coinsClaimed: coins > 0 ? false : undefined,
    };
    batch.set(mailRef, { ...mailData, createdAt: serverTimestamp() });
  });

  try {
    await batch.commit();
    return { success: true };
  } catch (error: any) {
    console.error("Error sending mail:", error);
    return { success: false, error: error.message || "فشل إرسال الرسالة." };
  }
}

export async function giveReward(actorId: string, targetId: string, reward: { points?: number, coins?: number }, reason: string): Promise<{ success: boolean; error?: string }> {
    return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const actorDoc = await transaction.get(actorRef);
        if(!actorDoc.exists() || !actorDoc.data()?.isAdmin) {
            throw new Error("ليس لديك صلاحية لتنفيذ هذا الأمر.");
        }
        
        const targetRef = doc(db, "users", targetId);
        const targetDoc = await transaction.get(targetRef);
        
        if (!targetDoc.exists()) throw new Error("اللاعب المستهدف غير موجود.");
        
        const updates: any = {};
        if (reward.points && reward.points > 0) updates.leaderboardPoints = increment(reward.points);
        if (reward.coins && reward.coins > 0) updates.coins = increment(reward.coins);
        
        if (Object.keys(updates).length > 0) {
            transaction.update(targetRef, updates);
        }

        const mailContent = {
            subject: 'لقد تلقيت مكافأة!',
            body: `لقد منحك المشرف مكافأة: ${reward.points || 0} نقاط و ${reward.coins || 0} كوينز. السبب: ${reason}`
        };
        await sendSystemMail(targetId, mailContent, transaction);
        return { success: true };

    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل منح المكافأة." };
    });
};

export async function applyPunishment(actorId: string, targetId: string, penalty: { points?: number, coins?: number}, reason: string): Promise<{ success: boolean; error?: string }> {
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const actorDoc = await transaction.get(actorRef);
        if(!actorDoc.exists() || !actorDoc.data()?.isAdmin) {
            throw new Error("ليس لديك صلاحية لتنفيذ هذا الأمر.");
        }

        const targetRef = doc(db, "users", targetId);
        const targetDoc = await transaction.get(targetRef);
        if (!targetDoc.exists()) throw new Error("اللاعب المستهدف غير موجود.");
        
        const updates: any = {};
        if (penalty.points && penalty.points > 0) updates.leaderboardPoints = increment(-penalty.points);
        if (penalty.coins && penalty.coins > 0) updates.coins = increment(-penalty.coins);

        if (Object.keys(updates).length > 0) transaction.update(targetRef, updates);

         const mailContent = {
            subject: 'لقد تلقيت عقوبة!',
            body: `لقد طبق المشرف عليك عقوبة: خصم ${penalty.points || 0} نقاط و ${penalty.coins || 0} كوينز. السبب: ${reason}`
        };
        await sendSystemMail(targetId, mailContent, transaction);
        return { success: true };
     }).catch((error: any) => {
        return { success: false, error: error.message || "فشل تطبيق العقوبة." };
    });
};

/**
 * Distributes end-of-game awards. This is an admin-privileged action.
 * @param game The final game state object.
 */
export async function distributeEndOfGameAwards(game: Game) {
    if (!game || !game.id) {
        console.error("distributeEndOfGameAwards called with invalid game object.");
        return;
    }

    try {
        const gameRef = doc(db, 'games', game.id);
        const allRanks = await getRanks();
        const { data: awards } = calculateEndOfGameAwards(game, allRanks);

        if (!awards) {
             await updateDoc(gameRef, { 'gameResult.error': 'Failed to calculate awards.' });
             return;
        }
        
        const { updates, winUpdate, specialAwards } = awards;

        const batch = writeBatch(db);

        // Update player stats (points, coins, games played)
        Object.entries(updates).forEach(([playerId, playerUpdates]) => {
            const userRef = doc(db, 'users', playerId);
            const firestoreUpdates: { [key: string]: any } = {};

            const pointsDelta = playerUpdates.leaderboardPoints;
            const coinsDelta = playerUpdates.coins;

            if (pointsDelta > 0) firestoreUpdates.leaderboardPoints = increment(pointsDelta);
            if (coinsDelta > 0) firestoreUpdates.coins = increment(coinsDelta);
            
            // Always increment games played for the specific game type
            firestoreUpdates[`gamesPlayed.${game.gameType}`] = increment(1);
            
            if (Object.keys(firestoreUpdates).length > 0) {
                batch.update(userRef, firestoreUpdates);
            }
        });
        
        // Update individual win count if applicable
        if (winUpdate) {
            const winnerRef = doc(db, 'users', winUpdate.userId);
            batch.update(winnerRef, { [`winCounts.${game.gameType}`]: increment(1) });
        }

        // Write special awards and final game result to the game document
        batch.update(gameRef, {
            'gameResult.winner': winUpdate?.userId || game.gameResult?.winner || 'none',
            'trapAnswerState.finalAwards': specialAwards || {},
        });
        
        await batch.commit();

    } catch (error: any) {
        console.error(`Error in distributeEndOfGameAwards for game ${game.id}:`, error);
        // Log error to the game document for easier debugging
        try {
            await updateDoc(doc(db, 'games', game.id), {
                'gameResult.error': `Award distribution failed: ${error.message}`
            });
        } catch (logError) {
            console.error(`Failed to log error to game document ${game.id}:`, logError);
        }
    }
}
