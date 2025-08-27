

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
  DocumentData,
} from 'firebase/firestore';
import type { UserProfile, Mail, Game, MatchHistoryItem, GameKing } from '@/types';
import { sendSystemMail } from '../user/mail';
import { calculateEndOfGameAwards } from '../user/awards';
import { getRanks, recordMatchHistory } from '../user/queries';
import { GAME_TYPE_NAMES } from '@/types';

const normalize = (s: any) => (typeof s === 'string' ? s : String(s ?? '')).trim().replace(/\s+/g, ' ');
const stringNonEmpty = (s: any) => typeof s === 'string' && normalize(s).length > 0;

function docToUserProfile(docSnap: DocumentData, uid: string): UserProfile {
    const data = docSnap.data();
    if (!data) throw new Error("Document data is empty.");

    const tsToDate = (v: any): Date | null => {
        if (!v) return null;
        if (v instanceof Date) return v;
        if (v instanceof Timestamp) return v.toDate();
        if (typeof v === 'number') return new Date(v);
        if (typeof v?.toDate === 'function') return v.toDate();
        if (typeof v === 'string') {
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d;
        }
        return null;
    };

    const decrees = (data.decrees || []).map((d: any) => ({
      ...d,
      at: tsToDate(d.at),
      until: tsToDate(d.until),
    }));

    const humiliation = data.humiliation
      ? { ...data.humiliation, at: tsToDate(data.humiliation.at), until: tsToDate(data.humiliation.until) }
      : null;

    const originalAvatarToRevert = data.originalAvatarToRevert
      ? { ...data.originalAvatarToRevert, until: tsToDate(data.originalAvatarToRevert.until) }
      : null;

    const lastPunishmentTimestamp = { ...(data.lastPunishmentTimestamp || {}) };
    for (const key in lastPunishmentTimestamp) {
        lastPunishmentTimestamp[key] = tsToDate(lastPunishmentTimestamp[key]);
    }
     const allegiance = data.allegiance ? { ...data.allegiance, until: tsToDate(data.allegiance.until) } : null;

    return {
        uid,
        name: data.name || 'لاعب غير معروف',
        email: data.email || null,
        gender: data.gender,
        isAdmin: !!data.isAdmin,
        isEditor: !!data.isEditor,
        coins: data.coins ?? 0,
        diamonds: data.diamonds ?? 0,
        avatarId: data.avatarId || 'Avatar00.png',
        unlockedAvatars: data.unlockedAvatars || ['Avatar00.png'],
        leaderboardPoints: data.leaderboardPoints || 0,
        honorPoints: data.honorPoints || 0,
        loyaltyPoints: data.loyaltyPoints || 0,
        rebellionPoints: data.rebellionPoints || 0,
        trophies: data.trophies || 0,
        gamesPlayed: data.gamesPlayed || {},
        hasChangedName: !!data.hasChangedName,
        leagues: data.leagues || [],
        winCounts: data.winCounts || {},
        clan: data.clan || null,
        clanRole: data.clanRole,
        audienceGroups: data.audienceGroups || [],
        humiliation,
        allegiance,
        taxDemands: data.taxDemands || [],
        alliances: data.alliances || [],
        decrees,
        duelChallenges: data.duelChallenges || [],
        lastPunishmentTimestamp,
        originalAvatarToRevert,
        unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
        isPunished: !!data.isPunished,
        punishmentsIssued: data.punishmentsIssued || 0,
    } as UserProfile;
}

export async function adminSearchUsers(searchTerm: string): Promise<UserProfile[]> {
  if (!stringNonEmpty(searchTerm)) return [];
  const term = normalize(searchTerm);
  const usersRef = collection(db, 'users');

  const nameQuery = query(usersRef, where('name', '>=', term), where('name', '<=', term + '\uf8ff'));
  const emailQuery = query(usersRef, where('email', '>=', term.toLowerCase()), where('email', '<=', term.toLowerCase() + '\uf8ff'));

  try {
    const [nameSnapshot, emailSnapshot] = await Promise.all([ getDocs(nameQuery), getDocs(emailQuery) ]);

    const usersMap = new Map<string, UserProfile>();

    nameSnapshot.forEach(doc => {
      if (!usersMap.has(doc.id)) {
        usersMap.set(doc.id, docToUserProfile(doc, doc.id));
      }
    });

    emailSnapshot.forEach(doc => {
      if (!usersMap.has(doc.id)) {
        usersMap.set(doc.id, docToUserProfile(doc, doc.id));
      }
    });
    
    return Array.from(usersMap.values()).slice(0, 50);

  } catch (error) {
    console.error('Admin user search failed due to Firestore query error (index might be missing):', error);
    // Do NOT fall back to a full collection scan, as it's too expensive.
    return [];
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
        
        if (querySnapshot.empty) {
            return { success: true, count: 0, message: "لم يتم العثور على مستخدمين لإعادة تعيينهم." };
        }

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
        
        return { success: true, count: querySnapshot.size, message: `تمت إعادة تعيين شخصيات ${querySnapshot.size} مستخدم بنجاح.` };
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
        return querySnapshot.docs.map(docSnap => docToUserProfile(docSnap, docSnap.id));
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

        // Try to record history but don't let it block awards.
        try {
            await recordMatchHistory(game, gameId);
        } catch(histError) {
            const errorMsg = histError instanceof Error ? histError.message : String(histError);
            console.error(`Failed to record match history for game ${gameId}, but proceeding to awards.`, errorMsg);
            // Log this non-critical error to the game document itself for debugging.
            await updateDoc(gameRef, { 'gameResult.error': `Failed to record match history: ${errorMsg}` });
        }

        const allRanks = await getRanks();
        const { data: awardsData } = calculateEndOfGameAwards(game, allRanks);
        
        if (!awardsData) {
            await updateDoc(gameRef, { 'gameResult.error': 'Failed to calculate awards.' });
            return { success: false, error: 'فشل حساب الجوائز.' };
        }
        
        const { updates, winUpdates, specialAwards } = awardsData;
        const batch = writeBatch(db);

        Object.entries(updates).forEach(([playerId, playerUpdates]) => {
            const userRef = doc(db, 'users', playerId);
            const firestoreUpdates: { [key: string]: any } = {};

            const pointsDelta = playerUpdates.leaderboardPoints ?? 0;
            const coinsDelta = playerUpdates.coins ?? 0;
            
            if (pointsDelta !== 0) firestoreUpdates.leaderboardPoints = increment(pointsDelta);
            if (coinsDelta !== 0) firestoreUpdates.coins = increment(coinsDelta);
            if (playerUpdates.gamesPlayed && game.gameType) {
              firestoreUpdates[`gamesPlayed.${game.gameType}`] = increment(1);
            }
            if (playerUpdates.permissions) {
                firestoreUpdates.permissions = playerUpdates.permissions;
            }
            
            if (Object.keys(firestoreUpdates).length > 0) {
                batch.update(userRef, firestoreUpdates);
            }
        });
        
        // Handle win counts for both individual and team winners
        if (winUpdates && winUpdates.length > 0) {
            winUpdates.forEach(win => {
                const userRef = doc(db, 'users', win.userId);
                batch.update(userRef, { [`winCounts.${win.gameType}`]: increment(1) });
            });
        }
        
        // Finalize the game document
        const finalUpdate: any = {
            'gameResult.winner': game.gameResult?.winner || 'none',
        };
        finalUpdate['gameResult.finalAwards'] = specialAwards || {};
        
        batch.update(gameRef, finalUpdate);
        
        await batch.commit();

        return { success: true, data: { finalAwards: specialAwards } };

    } catch (error: any) {
        console.error(`Error in distributeEndOfGameAwards for game ${gameId}:`, error);
        try {
            // Attempt to log the critical error to the game doc for diagnosis
            await updateDoc(doc(db, 'games', gameId), {
                'gameResult.error': `Award distribution failed: ${error.message}`,
            });
        } catch(logError) {
            console.error(`Failed to log error to game document ${gameId}:`, logError);
        }
        return { success: false, error: `فشل توزيع الجوائز: ${error.message}` };
    }
}

export async function recalculateGameKings(): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
    try {
        const gameTypes = Object.keys(GAME_TYPE_NAMES);
        const kingsCollection = collection(db, 'game_kings');
        const usersCollection = collection(db, 'users');
        const batch = writeBatch(db);
        let updatedCount = 0;

        for (const gameType of gameTypes) {
            // Find the user with the highest win count for the current game type
            const winCountsQuery = query(
                usersCollection,
                where(`winCounts.${gameType}`, '>', 0),
                orderBy(`winCounts.${gameType}`, 'desc'),
                limit(1)
            );

            const snapshot = await getDocs(winCountsQuery);

            if (!snapshot.empty) {
                const kingDoc = snapshot.docs[0];
                const kingData = kingDoc.data() as UserProfile;
                
                const gameKingRef = doc(kingsCollection, gameType);
                batch.set(gameKingRef, {
                    kingId: kingDoc.id,
                    name: kingData.name,
                    avatarId: kingData.avatarId,
                    winCount: kingData.winCounts?.[gameType as keyof typeof kingData.winCounts] || 0,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
                updatedCount++;
            }
        }
        
        await batch.commit();
        return { success: true, updatedCount };
    } catch (e: any) {
        console.error("Error recalculating game kings:", e);
        return { success: false, error: e.message || 'فشل تحديث ملوك الألعاب.' };
    }
}
