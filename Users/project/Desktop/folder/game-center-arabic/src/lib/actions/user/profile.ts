

'use server';

import { db, auth } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { isFirebaseError } from '../helpers';
import { getDefaultAvatar } from '../admin';
import type { UserProfile } from '@/types';


export async function createUserProfile(userId: string, name: string, email: string, gender: 'male' | 'female') {
    if (!name.trim()) {
        return { error: 'الاسم مطلوب.' };
    }
     if (!gender) {
        return { error: 'الجنس مطلوب.' };
    }
    try {
        const { avatarId: defaultAvatar } = await getDefaultAvatar();
        await setDoc(doc(db, 'users', userId), {
            name: name.trim(),
            email: email,
            gender: gender,
            createdAt: serverTimestamp(),
            isAdmin: false,
            isEditor: false,
            coins: 0,
            diamonds: 0,
            avatarId: defaultAvatar || 'Avatar00.png',
            unlockedAvatars: [defaultAvatar || 'Avatar00.png'],
            unlockedPunishmentAvatars: [],
            leaderboardPoints: 0,
            honorPoints: 0, 
            loyaltyPoints: 0, 
            rebellionPoints: 0,
            trophies: 0,
            gamesPlayed: 0,
            hasChangedName: false,
            leagues: [],
            winCounts: {},
            humiliation: null,
            allegiance: null,
            alliances: [],
            taxDemands: [],
            decrees: [],
            duelChallenges: [],
            lastPunishmentTimestamp: {},
            originalAvatarToRevert: null,
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


export async function updateUserName(userId: string, newName: string) {
    if (!userId || !newName.trim()) {
        return { success: false, error: "الاسم الجديد مطلوب." };
    }

    const userRef = doc(db, 'users', userId);

    try {
        const currentUser = auth.currentUser;
        if (!currentUser || currentUser.uid !== userId) {
            throw new Error("User not authenticated or mismatch.");
        }

        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            throw new Error("لم يتم العثور على المستخدم.");
        }
        const userData = userDoc.data();
        if (userData.hasChangedName) {
            throw new Error("لقد قمت بتغيير اسمك بالفعل. لا يمكن تغييره مرة أخرى.");
        }

        // Update both Firestore and Auth profile
        await updateDoc(userRef, {
            name: newName,
            hasChangedName: true,
        });
        await updateProfile(currentUser, { displayName: newName });
        
        return { success: true };

    } catch (error: any) {
        console.error("Error updating username:", error);
        return { success: false, error: error.message || "حدث خطأ غير متوقع." };
    }
}


export async function updateUserAvatar(userId: string, avatarId: string) {
    if (!userId || !avatarId) {
        return { error: "معلومات غير كافية لتحديث الشخصية." };
    }
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data() as UserProfile;
        
        if (!userDoc.exists() || !userData.unlockedAvatars?.includes(avatarId)) {
            return { error: "أنت لا تملك هذه الشخصية." };
        }
        
        // Prevent changing avatar if under punishment
        if (userData.originalAvatarToRevert && new Date(userData.originalAvatarToRevert.until) > new Date()) {
             return { error: "لا يمكنك تغيير شخصيتك وأنت تحت تأثير عقوبة." };
        }

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

export async function updateUserGender(userId: string, gender: 'male' | 'female'): Promise<{ success: boolean; error?: string }> {
    if (!userId || !gender) {
        return { success: false, error: "معلومات غير كافية." };
    }
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { gender });
        return { success: true };
    } catch (error) {
        console.error("Firebase error in updateUserGender:", error);
        if (isFirebaseError(error)) {
            return { success: false, error: `فشل تحديث الجنس: ${error.message}` };
        }
        return { success: false, error: 'حدث خطأ غير متوقع.' };
    }
}
