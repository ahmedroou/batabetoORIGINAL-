
/**
 * @fileoverview User-related actions, such as profile creation.
 */
import { db, auth } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, orderBy, limit, getDoc, where, increment, runTransaction, arrayUnion, writeBatch, deleteDoc, arrayRemove, deleteField, type Transaction, Timestamp } from 'firebase/firestore';
import { isFirebaseError, generateLeagueId } from './helpers';
import { AVATAR_IDS } from '@/data/avatars';
import type { UserProfile, League, SocialRank, AvatarPrice, Game, Mail } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';
import { updateProfile } from 'firebase/auth';
import { getDefaultAvatar } from './admin';

export async function createUserProfile(userId: string, name: string, email: string) {
    if (!name.trim()) {
        return { error: 'الاسم مطلوب.' };
    }
    try {
        const { avatarId: defaultAvatar } = await getDefaultAvatar();
        await setDoc(doc(db, 'users', userId), {
            name: name.trim(),
            email: email,
            createdAt: serverTimestamp(),
            isAdmin: false,
            coins: 5,
            avatarId: defaultAvatar || 'Avatar00.png',
            unlockedAvatars: [defaultAvatar || 'Avatar00.png'],
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
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists() || !userDoc.data()?.unlockedAvatars?.includes(avatarId)) {
            return { error: "أنت لا تملك هذه الشخصية." };
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

export async function purchaseAvatar(userId: string, avatarId: string): Promise<{ success: boolean; error?: string }> {
     if (!userId || !avatarId) {
        return { success: false, error: "معلومات غير كافية." };
    }

    const userRef = doc(db, 'users', userId);
    const pricesRef = doc(db, 'game_settings', 'avatar_prices');

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const pricesDoc = await transaction.get(pricesRef);

            if (!userDoc.exists()) throw new Error("لم يتم العثور على المستخدم.");
            if (!pricesDoc.exists()) throw new Error("لم يتم العثور على أسعار الشخصيات.");

            const userData = userDoc.data() as UserProfile;
            const priceData = pricesDoc.data();
            const avatarPriceInfo = priceData.prices?.find((p: any) => p.avatarId === avatarId);

            if (!avatarPriceInfo) throw new Error("لم يتم العثور على سعر لهذه الشخصية.");
            const price = avatarPriceInfo.price;

            if (userData.unlockedAvatars?.includes(avatarId)) throw new Error("أنت تملك هذه الشخصية بالفعل.");
            if (userData.coins < price) throw new Error("ليس لديك ما يكفي من الكوينز لشراء هذه الشخصية.");

            transaction.update(userRef, {
                coins: increment(-price),
                unlockedAvatars: arrayUnion(avatarId)
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error purchasing avatar:", error);
        return { success: false, error: error.message || "فشل شراء الشخصية." };
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

export async function getLeagueData(leagueId: string): Promise<{ league: League | null, members: UserProfile[] }> {
    try {
        const leagueRef = doc(db, 'leagues', leagueId);
        const leagueDoc = await getDoc(leagueRef);

        if (!leagueDoc.exists()) {
            return { league: null, members: [] };
        }

        const league = { id: leagueDoc.id, ...leagueDoc.data() } as League;
        
        let members: UserProfile[] = [];
        if (league.members && league.members.length > 0) {
            const usersRef = collection(db, 'users');
            // Firestore 'in' query can take up to 30 elements
            const memberChunks = [];
            for (let i = 0; i < league.members.length; i += 30) {
                memberChunks.push(league.members.slice(i, i + 30));
            }
            
            const memberPromises = memberChunks.map(chunk => 
                getDocs(query(usersRef, where('__name__', 'in', chunk)))
            );

            const memberSnapshots = await Promise.all(memberPromises);
            
            memberSnapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                     const userData = doc.data();
                     // Add league-specific points to the user profile for this context
                     const leaguePoints = league.scores?.[doc.id] || 0;
                     const gamesPlayedInLeague = league.gamesPlayed?.[doc.id] || 0;
                     members.push({ ...userData, uid: doc.id, leaderboardPoints: leaguePoints, gamesPlayed: gamesPlayedInLeague } as UserProfile);
                });
            });
        }
        
        return { league, members };
    } catch (error) {
        console.error("Error fetching league data:", error);
        return { league: null, members: [] };
    }
}


export async function updateUserStats(leagueId: string, userId: string, stats: { points: number; gamesPlayed: number }): Promise<{ success: boolean, error?: string }> {
    if (!userId || !leagueId) {
        return { success: false, error: "معرف المستخدم والدوري مطلوب." };
    }
    try {
        const leagueRef = doc(db, 'leagues', leagueId);
        
        const leagueDoc = await getDoc(leagueRef);
        if (!leagueDoc.exists()) {
             return { success: false, error: "الدوري غير موجود." };
        }

        await updateDoc(leagueRef, {
            [`scores.${userId}`]: stats.points,
            [`gamesPlayed.${userId}`]: stats.gamesPlayed
        });
        return { success: true };
    } catch (error) {
         console.error("Error updating user stats in league:", error);
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
            scores: { [userId]: 0 },
            gamesPlayed: { [userId]: 0 },
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
                members: arrayUnion(userId),
                [`scores.${userId}`]: 0,
                [`gamesPlayed.${userId}`]: 0,
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

export async function deleteLeague(leagueId: string, requestingUserId: string): Promise<{ success: boolean; error?: string }> {
    if (!leagueId || !requestingUserId) {
        return { success: false, error: "معلومات غير كافية للحذف." };
    }

    const leagueRef = doc(db, "leagues", leagueId);
    const requestingUserRef = doc(db, "users", requestingUserId);

    try {
        await runTransaction(db, async (transaction) => {
            const leagueDoc = await transaction.get(leagueRef);
            const userDoc = await transaction.get(requestingUserRef);

            if (!leagueDoc.exists()) {
                throw new Error("الدوري غير موجود.");
            }
            if (!userDoc.exists()) {
                throw new Error("المستخدم الطالب للحذف غير موجود.");
            }
            
            const league = leagueDoc.data() as League;
            const user = userDoc.data() as UserProfile;

            const isLeagueAdmin = league.adminId === requestingUserId;
            const isAppAdmin = user.isAdmin === true;

            if (!isLeagueAdmin && !isAppAdmin) {
                throw new Error("ليس لديك الصلاحية لحذف هذا الدوري.");
            }
            
            const members = league.members || [];
            
            // Delete the league document
            transaction.delete(leagueRef);

            // Remove the league from each member's profile
            for (const memberId of members) {
                const memberRef = doc(db, "users", memberId);
                transaction.update(memberRef, {
                    leagues: arrayRemove({ id: leagueId, name: league.name }),
                });
            }
        });

        return { success: true };

    } catch (error: any) {
        console.error("Error deleting league:", error);
        return { success: false, error: error.message || "فشل حذف الدوري." };
    }
}


export async function kickPlayerFromLeague(leagueId: string, adminId: string, memberToKickId: string): Promise<{ success: boolean; error?: string }> {
    if (!leagueId || !adminId || !memberToKickId) {
        return { success: false, error: "معلومات غير كافية لطرد اللاعب." };
    }
    if (adminId === memberToKickId) {
        return { success: false, error: "لا يمكنك طرد نفسك." };
    }

    const leagueRef = doc(db, "leagues", leagueId);
    const memberRef = doc(db, "users", memberToKickId);

    try {
        await runTransaction(db, async (transaction) => {
            const leagueDoc = await transaction.get(leagueRef);
            if (!leagueDoc.exists()) throw new Error("الدوري غير موجود.");
            
            const league = leagueDoc.data() as League;
            if (league.adminId !== adminId) throw new Error("فقط مشرف الدوري يمكنه طرد اللاعبين.");
            if (!league.members.includes(memberToKickId)) throw new Error("هذا اللاعب ليس عضواً في الدوري.");

            // Remove player from league data
            transaction.update(leagueRef, {
                members: arrayRemove(memberToKickId),
                [`scores.${memberToKickId}`]: deleteField(),
                [`gamesPlayed.${memberToKickId}`]: deleteField(),
            });

            // Remove league from player's profile
            transaction.update(memberRef, {
                leagues: arrayRemove({ id: leagueId, name: league.name }),
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error kicking player from league:", error);
        return { success: false, error: error.message || "فشل طرد اللاعب." };
    }
}

export async function leaveLeague(leagueId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!leagueId || !userId) {
        return { success: false, error: "معلومات غير كافية لمغادرة الدوري." };
    }

    const leagueRef = doc(db, "leagues", leagueId);
    const userRef = doc(db, "users", userId);

    try {
        await runTransaction(db, async (transaction) => {
            const leagueDoc = await transaction.get(leagueRef);
            if (!leagueDoc.exists()) throw new Error("الدوري غير موجود.");

            const league = leagueDoc.data() as League;
            if (league.adminId === userId) throw new Error("لا يمكن للمشرف مغادرة الدوري. يجب حذف الدوري بدلاً من ذلك.");
            if (!league.members.includes(userId)) throw new Error("أنت لست عضواً في هذا الدوري.");
            
            // Remove user from league data
            transaction.update(leagueRef, {
                members: arrayRemove(userId),
                [`scores.${userId}`]: deleteField(),
                [`gamesPlayed.${userId}`]: deleteField(),
            });
            
            // Remove league from user's profile
            transaction.update(userRef, {
                leagues: arrayRemove({ id: leagueId, name: league.name }),
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error leaving league:", error);
        return { success: false, error: error.message || "فشل مغادرة الدوري." };
    }
}


export function getSocialRankForUser(points: number, allRanks: SocialRank[]): SocialRank | null {
    if (!allRanks || allRanks.length === 0) {
        allRanks = DEFAULT_SOCIAL_RANKS;
    }
    
    const sortedRanks = [...allRanks].sort((a,b) => b.threshold - a.threshold);

    for (const rank of sortedRanks) {
        if (points >= rank.threshold) {
            return rank;
        }
    }

    return sortedRanks[sortedRanks.length -1] || null; // Return the lowest rank if no match
}

export async function updateLeagueScoresForGameEnd(
    game: Game, 
    transaction: Transaction,
    userProfiles: Record<string, UserProfile>,
    leagueDocs: Record<string, League>
) {
    const finalScores = game.playerScores || {};
    
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    if (playersToUpdate.length === 0) return;

    for (const playerInfo of playersToUpdate) {
        const pointsToAdd = finalScores[playerInfo.id] || 0;
        const userProfile = userProfiles[playerInfo.id];

        if (userProfile) {
            const userRef = doc(db, 'users', playerInfo.id);
            // Always update gamesPlayed for all participants
            transaction.update(userRef, {
                gamesPlayed: increment(1),
            });

            // Add points if they earned any
            if (pointsToAdd > 0) {
                 transaction.update(userRef, {
                    leaderboardPoints: increment(pointsToAdd)
                });
            }
            
            const leagues = userProfile.leagues || [];
            for (const leagueInfo of leagues) {
                if (leagueDocs[leagueInfo.id]) {
                    const leagueRef = doc(db, 'leagues', leagueInfo.id);
                    // Always increment games played in the league
                    const gamesPlayedUpdate = { [`gamesPlayed.${playerInfo.id}`]: increment(1) };
                    transaction.update(leagueRef, gamesPlayedUpdate);
                    
                    // Add points if they earned any
                    if (pointsToAdd > 0) {
                        const scoreUpdate = { [`scores.${playerInfo.id}`]: increment(pointsToAdd) };
                        transaction.update(leagueRef, scoreUpdate);
                    }
                }
            }
        }
    }
}


export async function resetAllLeagueStats(adminId: string): Promise<{ success: boolean, count?: number, error?: string }> {
    const adminRef = doc(db, 'users', adminId);
    const leaguesRef = collection(db, 'leagues');

    try {
        const adminDoc = await getDoc(adminRef);
        if (!adminDoc.exists() || !adminDoc.data()?.isAdmin) {
            return { success: false, error: "Only admins can perform this action." };
        }

        const leagueSnapshot = await getDocs(leaguesRef);
        if (leagueSnapshot.empty) {
            return { success: true, count: 0 };
        }

        const batch = writeBatch(db);
        leagueSnapshot.forEach(leagueDoc => {
            const leagueData = leagueDoc.data() as League;
            const newScores: Record<string, number> = {};
            const newGamesPlayed: Record<string, number> = {};
            leagueData.members.forEach(memberId => {
                newScores[memberId] = 0;
                newGamesPlayed[memberId] = 0;
            });
            batch.update(leagueDoc.ref, {
                scores: newScores,
                gamesPlayed: newGamesPlayed
            });
        });

        await batch.commit();

        return { success: true, count: leagueSnapshot.size };

    } catch (error: any) {
        console.error("Error resetting all league stats:", error);
        return { success: false, error: error.message || "Failed to reset league stats." };
    }
}

// Mailbox Actions
export async function getMail(userId: string): Promise<Mail[]> {
    if (!userId) return [];
    try {
        const mailRef = collection(db, `users/${userId}/mail`);
        const now = Timestamp.now();
        const q = query(mailRef, where('expiresAt', '>', now), orderBy('expiresAt', 'desc'));
        const snapshot = await getDocs(q);

        deleteExpiredMail(userId);

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                senderName: data.senderName,
                subject: data.subject,
                body: data.body,
                isRead: data.isRead,
                createdAt: data.createdAt.toDate(), // Convert to Date
                expiresAt: data.expiresAt.toDate(), // Convert to Date
                coins: data.coins,
                coinsClaimed: data.coinsClaimed,
            } as Mail;
        });
    } catch (error) {
        console.error("Error fetching mail:", error);
        return [];
    }
}

export async function markMailAsRead(userId: string, mailId: string): Promise<void> {
  if (!userId || !mailId) return;
  try {
    const mailDocRef = doc(db, `users/${userId}/mail`, mailId);
    await updateDoc(mailDocRef, { isRead: true });
  } catch (error) {
    console.error("Error marking mail as read:", error);
  }
}

async function deleteExpiredMail(userId: string) {
    try {
        const mailRef = collection(db, `users/${userId}/mail`);
        const now = Timestamp.now();
        const q = query(mailRef, where('expiresAt', '<=', now));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`Deleted ${snapshot.size} expired mail(s) for user ${userId}.`);
    } catch (error) {
        console.error("Error deleting expired mail:", error);
    }
}


export async function claimMailCoins(userId: string, mailId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId || !mailId) {
        return { success: false, error: "معلومات غير كافية للمطالبة." };
    }

    const userRef = doc(db, "users", userId);
    const mailRef = doc(db, `users/${userId}/mail`, mailId);

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const mailDoc = await transaction.get(mailRef);

            if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");
            if (!mailDoc.exists()) throw new Error("الرسالة غير موجودة.");

            const mailData = mailDoc.data() as Mail;

            if (mailData.coinsClaimed) throw new Error("لقد طالبت بهذه الكوينز بالفعل.");
            if (!mailData.coins || mailData.coins <= 0) throw new Error("لا توجد كوينز للمطالبة بها في هذه الرسالة.");

            // Add coins to user's balance
            transaction.update(userRef, {
                coins: increment(mailData.coins)
            });

            // Mark coins as claimed in the mail
            transaction.update(mailRef, {
                coinsClaimed: true
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error claiming mail coins:", error);
        return { success: false, error: error.message || "فشل المطالبة بالكوينز." };
    }
}
