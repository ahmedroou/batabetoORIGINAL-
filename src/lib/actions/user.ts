
/**
 * @fileoverview User-related actions, such as profile creation.
 */
import { db, auth } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, orderBy, limit, getDoc, where, increment, runTransaction, arrayUnion } from 'firebase/firestore';
import { isFirebaseError, generateLeagueId } from './helpers';
import { AVATAR_IDS } from '@/data/avatars';
import type { UserProfile, League } from '@/types';
import { updateProfile } from 'firebase/auth';

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
            hasChangedName: false,
            leagues: [],
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

export async function updateUserName(userId: string, newName: string) {
    if (!userId || !newName.trim()) {
        return { success: false, error: "الاسم الجديد مطلوب." };
    }

    const userRef = doc(db, 'users', userId);

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) {
                throw new Error("لم يتم العثور على المستخدم.");
            }
            const userData = userDoc.data();
            if (userData.hasChangedName) {
                throw new Error("لقد قمت بتغيير اسمك بالفعل. لا يمكن تغييره مرة أخرى.");
            }

            transaction.update(userRef, {
                name: newName,
                hasChangedName: true,
            });
        });

        // Update Firebase Auth profile as well
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.uid === userId) {
            await updateProfile(currentUser, { displayName: newName });
        }
        
        return { success: true };

    } catch (error: any) {
        console.error("Error updating username:", error);
        return { success: false, error: error.message || "حدث خطأ غير متوقع." };
    }
}


export async function getLeaderboardUsers(): Promise<{ leaderboardUsers: UserProfile[] }> {
    try {
        const usersRef = collection(db, 'users');
        const allUsersSnapshot = await getDocs(usersRef);
        const allUsers = allUsersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        
        const leaderboardUsers = allUsers
            .filter(u => (u.gamesPlayed || 0) > 0)
            .sort((a, b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0));
            
        return { leaderboardUsers };

    } catch (fallbackError) {
         console.error("Error in fallback leaderboard fetch:", fallbackError);
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

export async function createLeague(userId: string, leagueName: string, password?: string) {
    if (!userId || !leagueName.trim()) {
        return { error: 'اسم الدوري مطلوب.' };
    }
    try {
        const leagueId = generateLeagueId(); 
        const leagueRef = doc(db, 'leagues', leagueId);

        const newLeague: Omit<League, 'id'> = {
            name: leagueName.trim(),
            adminId: userId,
            members: [userId],
            createdAt: serverTimestamp() as any,
        };
        if (password) {
            newLeague.password = password;
        }

        const userRef = doc(db, 'users', userId);

        await runTransaction(db, async (transaction) => {
            transaction.set(leagueRef, newLeague);
            transaction.update(userRef, {
                leagues: arrayUnion({ id: leagueId, name: newLeague.name })
            });
        });

        return { success: true, leagueId };
    } catch (error) {
        console.error("Firebase error in createLeague:", error);
        if (isFirebaseError(error)) {
            return { error: `فشل إنشاء الدوري بسبب خطأ في Firebase.` };
        }
        return { error: 'حدث خطأ غير متوقع عند إنشاء الدوري.' };
    }
}

export async function joinLeague(userId: string, leagueId: string, password?: string) {
    if (!userId || !leagueId.trim()) {
        return { error: 'معرف الدوري مطلوب.' };
    }

    try {
        const leagueRef = doc(db, 'leagues', leagueId);
        const userRef = doc(db, 'users', userId);

        await runTransaction(db, async (transaction) => {
            const leagueDoc = await transaction.get(leagueRef);
            if (!leagueDoc.exists()) {
                throw new Error("الدوري غير موجود. تأكد من المعرف.");
            }
            const league = leagueDoc.data() as League;

            if (league.members.includes(userId)) {
                throw new Error("أنت عضو بالفعل في هذا الدوري.");
            }

            if (league.password && league.password !== password) {
                throw new Error("كلمة المرور غير صحيحة.");
            }

            transaction.update(leagueRef, {
                members: arrayUnion(userId)
            });
            transaction.update(userRef, {
                leagues: arrayUnion({ id: leagueId, name: league.name })
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error joining league:", error);
        return { error: error.message || "فشل الانضمام للدوري." };
    }
}
