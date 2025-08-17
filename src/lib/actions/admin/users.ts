

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
  Timestamp,
} from 'firebase/firestore';
import type { UserProfile, Mail, Game, MatchHistoryItem, GameKing } from '@/types';
import { sendSystemMail } from '../user/mail';
import { calculateEndOfGameAwards } from '../user/awards';
import { getRanks, recordMatchHistory } from '../user/queries';

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
        if (penalty.points && penalty.points > 0) {
            updates.leaderboardPoints = increment(-penalty.points);
        }
        if (penalty.coins && penalty.coins > 0) {
            updates.coins = increment(-penalty.coins);
        }

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

type ServiceResult<T = undefined> = { success: true; data?: T } | { success: false; error: string };

/**
 * Distributes end-of-game awards. This is an admin-privileged action.
 * @param gameId The ID of the finalized game object.
 */
export async function distributeEndOfGameAwards(gameId: string): Promise<ServiceResult<{ finalAwards?: any }>> {
    const gameRef = doc(db, 'games', gameId);

    try {
        const freshSnap = await getDoc(gameRef);
        if (!freshSnap.exists()) return { success: false, error: "اللعبة غير موجودة."};
        
        const game = { ...freshSnap.data(), id: gameId } as Game;

        if (game.gameResult?.error || !!game.gameResult?.finalAwards) {
            return { success: true }; // Already finalized or errored
        }

        try {
            await recordMatchHistory(game, gameId);
        } catch(histError) {
            const errorMsg = histError instanceof Error ? histError.message : String(histError);
            console.error(`Failed to record match history for game ${gameId}, but proceeding to awards.`, errorMsg);
            await updateDoc(gameRef, { 'gameResult.error': `Failed to record match history: ${errorMsg}` });
        }

        const allRanks = await getRanks();
        const { data: awardsData } = calculateEndOfGameAwards(game, allRanks);
        
        if (!awardsData) {
            await updateDoc(gameRef, { 'gameResult.error': 'Failed to calculate awards.' });
            return { success: false, error: 'فشل حساب الجوائز.' };
        }
        
        const { updates, winUpdate, specialAwards } = awardsData;
        const batch = writeBatch(db);

        Object.entries(updates).forEach(([playerId, playerUpdates]) => {
            const userRef = doc(db, 'users', playerId);
            const firestoreUpdates: { [key: string]: any } = {};

            const pointsDelta = playerUpdates.leaderboardPoints ?? 0;
            const coinsDelta = playerUpdates.coins ?? 0;
            const winsDelta = playerUpdates.winCounts?.[game.gameType] ?? 0;


            if (pointsDelta !== 0) firestoreUpdates.leaderboardPoints = increment(pointsDelta);
            if (coinsDelta !== 0) firestoreUpdates.coins = increment(coinsDelta);
            if (playerUpdates.gamesPlayed && game.gameType) {
              firestoreUpdates[`gamesPlayed.${game.gameType}`] = increment(1);
            }
            if(winsDelta > 0) {
                 firestoreUpdates[`winCounts.${game.gameType}`] = increment(winsDelta);
            }
            if (playerUpdates.permissions) {
                firestoreUpdates.permissions = playerUpdates.permissions;
            }
            
            if (Object.keys(firestoreUpdates).length > 0) {
                batch.update(userRef, firestoreUpdates);
            }
        });
        
        // This is redundant with the logic inside the loop, so it's removed.
        // if (winUpdate) {
        //     const winnerRef = doc(db, 'users', winUpdate.userId);
        //     batch.set(winnerRef, { winCounts: { [winUpdate.gameType]: increment(1) } }, { merge: true });
        // }

        const finalUpdate: any = {
            'gameResult.winner': winUpdate?.userId || game.gameResult?.winner || 'none',
        };
        finalUpdate['gameResult.finalAwards'] = specialAwards || {};
        
        batch.update(gameRef, finalUpdate);
        
        await batch.commit();

        return { success: true, data: { finalAwards: specialAwards } };

    } catch (error: any) {
        console.error(`Error in distributeEndOfGameAwards for game ${gameId}:`, error);
        try {
            await updateDoc(doc(db, 'games', gameId), {
                'gameResult.error': `Award distribution failed: ${error.message}`,
            });
        } catch(logError) {
            console.error(`Failed to log error to game document ${gameId}:`, logError);
        }
        return { success: false, error: `فشل توزيع الجوائز: ${error.message}` };
    }
}

/**
 * Recalculates and updates the "Game King" for each game type based on win counts.
 * This is an expensive operation and should be run manually by an admin.
 * @returns {Promise<{success: boolean, updatedCount?: number, error?: string}>} The result of the operation.
 */
export async function recalculateGameKings(): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  try {
    const allUsersSnapshot = await getDocs(collection(db, 'users'));
    if (allUsersSnapshot.empty) {
      return { success: true, updatedCount: 0 };
    }

    const users = allUsersSnapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() } as UserProfile));

    const gameTypes = Object.values(users.reduce((acc, user) => {
        Object.keys(user.winCounts || {}).forEach(gameType => acc.add(gameType));
        return acc;
    }, new Set<string>()));

    const batch = writeBatch(db);
    let updatedCount = 0;

    for (const gameType of gameTypes) {
      const topPlayer = users
        .filter((u) => u.winCounts && u.winCounts[gameType as keyof Game['winCounts']] > 0)
        .sort((a, b) => (b.winCounts![gameType as keyof Game['winCounts']] || 0) - (a.winCounts![gameType as keyof Game['winCounts']] || 0))[0];

      if (topPlayer) {
        const kingRef = doc(db, 'game_kings', gameType);
        const kingData: GameKing = {
          kingId: topPlayer.uid,
          name: topPlayer.name,
          avatarId: topPlayer.avatarId,
          winCount: topPlayer.winCounts![gameType as keyof Game['winCounts']] || 0,
          totalLeaderboardPoints: topPlayer.leaderboardPoints || 0
        };
        batch.set(kingRef, kingData, { merge: true });
        updatedCount++;
      }
    }

    await batch.commit();
    return { success: true, updatedCount };
  } catch (error: any) {
    console.error('Error recalculating game kings:', error);
    return { success: false, error: error.message || 'فشل إعادة حساب ملوك الألعاب.' };
  }
}
