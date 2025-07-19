
/**
 * @fileoverview User-related actions, such as profile creation.
 */
import { db } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, orderBy, limit, getDoc, where, increment } from 'firebase/firestore';
import { isFirebaseError } from './helpers';
import { AVATAR_IDS } from '@/data/avatars';
import type { UserProfile } from '@/types';

export async function createUserProfile(userId: string, name: string, email: string) {
    if (!name.trim()) {
        return { error: 'الاسم مطلوب.' };
    }
    try {
        const randomAvatar = AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
        await setDoc(doc(db, 'users', userId), {
            name: name.trim(),
            email: email,
            createdAt: serverTimestamp(),
            isAdmin: false,
            coins: 5,
            avatarId: randomAvatar,
            leaderboardPoints: 0,
            trophies: 0,
            gamesPlayed: 0,
        });
        return { success: true };
    } catch (error) {
        console.error("Firebase error in createUserProfile:", error);
        if (isFirebaseError(error)) {
            return { error: 'فشل إنشاء الملف الشخصي بسبب خطأ في Firebase.' };
        }
        return { error: 'حدث خطأ غير متوقع عند إنشاء الملف الشخصي.' };
    }
}


export async function updateUserAvatar(userId: string, avatarId: string) {
    if (!userId || !avatarId) {
        return { error: "معلومات غير كافية لتحديث الشخصية." };
    }
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            avatarId: avatarId
        });
        return { success: true };
    } catch (error) {
        console.error("Firebase error in updateUserAvatar:", error);
        if (isFirebaseError(error)) {
            return { error: `فشل تحديث الشخصية: ${error.message}` };
        }
        return { error: 'حدث خطأ غير متوقع.' };
    }
}


export async function getLeaderboardUsers(): Promise<{ leaderboardUsers: UserProfile[] }> {
    try {
        const usersRef = collection(db, 'users');
        const q = query(
            usersRef,
            orderBy('leaderboardPoints', 'desc')
        );
        const querySnapshot = await getDocs(q);
        
        const allUsers = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        const leaderboardUsers = allUsers.filter(u => (u.gamesPlayed || 0) > 0);
            
        return { leaderboardUsers };

    } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        return { leaderboardUsers: [] };
    }
}


export async function getAllUsers(): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        const userSnapshot = await getDocs(usersCol);
        const userList = userSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        return userList;
    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
}

export async function updateUserStats(userId: string, stats: { points: number; gamesPlayed: number }): Promise<{ success: boolean, error?: string }> {
    if (!userId) {
        return { success: false, error: "معرف المستخدم مطلوب." };
    }
    try {
        const userRef = doc(db, 'users', userId);
        
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
             return { success: false, error: "المستخدم غير موجود." };
        }

        await updateDoc(userRef, {
            leaderboardPoints: stats.points,
            gamesPlayed: stats.gamesPlayed
        });
        return { success: true };
    } catch (error) {
         console.error("Error updating user stats:", error);
        if (isFirebaseError(error)) {
            return { success: false, error: `فشل تحديث البيانات: ${error.message}` };
        }
        return { success: false, error: "حدث خطأ غير متوقع." };
    }
}
