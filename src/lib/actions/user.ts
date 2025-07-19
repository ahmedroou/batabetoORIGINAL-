
/**
 * @fileoverview User-related actions, such as profile creation.
 */
import { db } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, orderBy, limit, getDoc, where } from 'firebase/firestore';
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


export async function getLeaderboardUsers(): Promise<{ topUsers: UserProfile[], bottomUsers: UserProfile[] }> {
    try {
        const usersRef = collection(db, 'users');
        
        // Get top 10 users with points > 0
        const topQuery = query(usersRef, where('leaderboardPoints', '>', 0), orderBy('leaderboardPoints', 'desc'), limit(10));
        const topSnapshot = await getDocs(topQuery);
        const topUsers = topSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));

        // Get bottom 3 users with points <= 0
        const bottomQuery = query(usersRef, where('leaderboardPoints', '<=', 0), orderBy('leaderboardPoints', 'asc'), limit(3));
        const bottomSnapshot = await getDocs(bottomQuery);
        const bottomUsers = bottomSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));

        return { topUsers, bottomUsers };

    } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        return { topUsers: [], bottomUsers: [] };
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

export async function updateUserPoints(userId: string, points: number): Promise<{ success: boolean, error?: string }> {
    if (!userId) {
        return { success: false, error: "معرف المستخدم مطلوب." };
    }
    // This is a simplified check. In a real app, you'd have a server-side check.
    // For now, we assume this is called from an admin-only context.
    try {
        const userRef = doc(db, 'users', userId);
        
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
             return { success: false, error: "المستخدم غير موجود." };
        }

        await updateDoc(userRef, {
            leaderboardPoints: points
        });
        return { success: true };
    } catch (error) {
         console.error("Error updating user points:", error);
        if (isFirebaseError(error)) {
            return { success: false, error: `فشل تحديث النقاط: ${error.message}` };
        }
        return { success: false, error: "حدث خطأ غير متوقع." };
    }
}
