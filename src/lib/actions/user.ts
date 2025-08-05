
/**
 * @fileoverview User-related actions, such as profile creation.
 */
import { db, auth } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, orderBy, limit, getDoc, where, increment, runTransaction, arrayUnion, writeBatch, deleteDoc, arrayRemove, deleteField, type Transaction, Timestamp } from 'firebase/firestore';
import { isFirebaseError, generateLeagueId, generateGameId as generateRoomId } from './helpers';
import { AVATAR_IDS } from '@/data/avatars';
import type { UserProfile, League, SocialRank, AvatarPrice, Game, Mail, GameKing, Humiliation, Allegiance, PermissionId, Alliance, TaxDemand, Decree, DuelChallenge } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';
import { updateProfile } from 'firebase/auth';
import { getDefaultAvatar, getSocialRanks } from './admin';

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
            coins: 5,
            diamonds: 0,
            avatarId: defaultAvatar || 'Avatar00.png',
            unlockedAvatars: [defaultAvatar || 'Avatar00.png'],
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
            const avatarPriceInfo: AvatarPrice | undefined = priceData.prices?.find((p: any) => p.avatarId === avatarId);

            if (!avatarPriceInfo) throw new Error("لم يتم العثور على سعر لهذه الشخصية.");
            const { price, currency } = avatarPriceInfo;

            if (userData.unlockedAvatars?.includes(avatarId)) throw new Error("أنت تملك هذه الشخصية بالفعل.");
            
            const userCurrency = currency === 'diamonds' ? userData.diamonds : userData.coins;
            if (userCurrency < price) {
                throw new Error(`ليس لديك ما يكفي من ${currency === 'diamonds' ? 'الألماس' : 'الكوينز'}.`);
            }
            
            const currencyFieldToUpdate = currency === 'diamonds' ? 'diamonds' : 'coins';

            transaction.update(userRef, {
                [currencyFieldToUpdate]: increment(-price),
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
        const currentUser = auth.currentUser;
        if (!currentUser || currentUser.uid !== userId) {
            throw new Error("User not authenticated or mismatch.");
        }

        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) {
                throw new Error("لم يتم العثور على المستخدم.");
            }
            const userData = userDoc.data();
            if (userData.hasChangedName) {
                throw new Error("لقد قمت بتغيير اسمك بالفعل. لا يمكن تغييره مرة أخرى.");
            }

            // Update Firestore document
            transaction.update(userRef, {
                name: newName,
                hasChangedName: true,
            });
        });

        // Update Firebase Auth profile AFTER the transaction is successful
        await updateProfile(currentUser, { displayName: newName });
        
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
        return { success: false, error: error.message || "فشل الانضمام للدوري." };
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

export async function updateLeagueScoresForGameEnd(game: Game, passedTransaction?: Transaction, playerPoints?: Record<string, number>) {
    const finalScores = playerPoints || game.playerScores || {};
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    if (playersToUpdate.length === 0) return;

    const processUpdates = async (transaction: Transaction) => {
        // Step 1: READ all necessary documents first.
        const userRefs = playersToUpdate.map(p => doc(db, 'users', p.id));
        const userDocs = await Promise.all(userRefs.map(ref => transaction.get(ref)));

        const userProfiles: Record<string, UserProfile> = {};
        const leagueIds = new Set<string>();

        userDocs.forEach((docSnap, index) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as UserProfile;
                const userId = playersToUpdate[index]!.id;
                userProfiles[userId] = data;
                data.leagues?.forEach(l => leagueIds.add(l.id));
            }
        });

        const leagueRefs = Array.from(leagueIds).map(id => doc(db, 'leagues', id));
        const leagueDocs = leagueIds.size > 0 ? await Promise.all(leagueRefs.map(ref => transaction.get(ref))) : [];
        const leagueDataMap: Record<string, League> = {};
        leagueDocs.forEach(docSnap => {
            if (docSnap.exists()) {
                leagueDataMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() } as League;
            }
        });

        // Step 2: WRITE all updates now that reads are complete.
        let playerRanks: Record<string, number> = {};
        if (game.gameType === 'prison' || game.gameType === 'trap-answer' || game.gameType === 'draw-and-guess') {
            const sortedPlayers = [...playersToUpdate].sort((a, b) => (finalScores[b.id] || 0) - (finalScores[a.id] || 0));
            sortedPlayers.forEach((player, index) => {
                playerRanks[player.id] = index + 1; // Rank is 1-based
            });
        }
        
        const winningTeam = game.gameResult?.winner;

        for (const playerInfo of playersToUpdate) {
            let pointsToAdd = 0;
            let coinsToAdd = 0;
            let isWinner = false;
            
            if (game.gameType === 'king-of-genius' || game.gameType === 'word_war' || game.gameType === 'behind-the-mask' || game.gameType === 'the-castle') {
                 if (playerInfo.team && winningTeam === playerInfo.team) {
                    pointsToAdd = 3;
                    coinsToAdd = 2;
                    isWinner = true;
                } else if(playerInfo.team && game.gameResult?.winner.includes(playerInfo.team === 'A' ? 'الأزرق' : 'الأحمر')) {
                    pointsToAdd = 3;
                    coinsToAdd = 2;
                    isWinner = true;
                }
            } else {
                const rank = playerRanks[playerInfo.id];
                if (rank === 1) { pointsToAdd = 3; coinsToAdd = 2; isWinner = true; }
                else if (rank === 2) { pointsToAdd = 2; coinsToAdd = 1; }
                else if (rank === 3) { pointsToAdd = 1; }
            }
            
            if (isWinner) {
                await updateUserWinCount(game.gameType, playerInfo.id, transaction);
            }

            const userProfile = userProfiles[playerInfo.id];
            if (userProfile) {
                const userRef = doc(db, 'users', playerInfo.id);
                const updates: any = { gamesPlayed: increment(1) };
                if (pointsToAdd > 0) updates.leaderboardPoints = increment(pointsToAdd);
                if (coinsToAdd > 0) updates.coins = increment(coinsToAdd);
                
                transaction.update(userRef, updates);
                
                const leagues = userProfile.leagues || [];
                for (const leagueInfo of leagues) {
                    if (leagueDataMap[leagueInfo.id]) {
                        const leagueRef = doc(db, 'leagues', leagueInfo.id);
                        const leagueUpdates: any = { [`gamesPlayed.${playerInfo.id}`]: increment(1) };
                        if (pointsToAdd > 0) {
                            leagueUpdates[`scores.${playerInfo.id}`] = increment(pointsToAdd);
                        }
                        transaction.update(leagueRef, leagueUpdates);
                    }
                }
            }
        }
    };
    
    if (passedTransaction) {
        await processUpdates(passedTransaction);
    } else {
        await runTransaction(db, processUpdates);
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

/**
 * Sends a system mail to a user, typically for rewards or notifications.
 * @param {string} userId - The ID of the user receiving the mail.
 * @param {Omit<Mail, 'id' | 'senderName' | 'createdAt' | 'expiresAt' | 'isRead'>} mailContent - The content of the mail.
 * @param {Transaction} [transaction] - An optional Firestore transaction object.
 */
export async function sendSystemMail(userId: string, mailContent: Omit<Mail, 'id' | 'senderName' | 'createdAt' | 'expiresAt' | 'isRead'>, transaction?: Transaction) {
    const mailRef = doc(collection(db, `users/${userId}/mail`));
    const mailData = {
        ...mailContent,
        senderName: 'النظام',
        isRead: false,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000), // Expires in 3 days
    };

    if (transaction) {
        transaction.set(mailRef, mailData);
    } else {
        await setDoc(mailRef, mailData);
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

export async function getGameKings(): Promise<Record<string, GameKing>> {
  try {
    const kingsCol = collection(db, 'game_kings');
    const snapshot = await getDocs(kingsCol);
    if (snapshot.empty) {
      return {};
    }
    const kings: Record<string, GameKing> = {};
    snapshot.forEach(doc => {
      kings[doc.id] = doc.data() as GameKing;
    });
    return kings;
  } catch (error) {
    console.error("Error fetching game kings:", error);
    return {};
  }
}

export async function getAllUsers(searchTerm?: string): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        let usersQuery = query(usersCol, orderBy('leaderboardPoints', 'desc'));

        const snapshot = await getDocs(usersQuery);
        let users = snapshot.docs.map(doc => {
            const data = doc.data();
            // Ensure all new fields have default values for older documents
            return {
                uid: doc.id,
                name: data.name || 'Unknown',
                email: data.email || null,
                gender: data.gender,
                isAdmin: data.isAdmin || false,
                isEditor: data.isEditor || false,
                coins: data.coins ?? 0,
                diamonds: data.diamonds ?? 0,
                avatarId: data.avatarId || 'Avatar00.png',
                unlockedAvatars: data.unlockedAvatars || ['Avatar00.png'],
                leaderboardPoints: data.leaderboardPoints || 0,
                honorPoints: data.honorPoints || 0,
                loyaltyPoints: data.loyaltyPoints || 0,
                rebellionPoints: data.rebellionPoints || 0,
                trophies: data.trophies || 0,
                gamesPlayed: data.gamesPlayed || 0,
                hasChangedName: data.hasChangedName || false,
                leagues: data.leagues || [],
                winCounts: data.winCounts || {},
                clan: data.clan || null,
                clanRole: data.clanRole,
                audienceGroups: data.audienceGroups || [],
                humiliation: data.humiliation || null,
                allegiance: data.allegiance || null,
                taxDemands: (data.taxDemands || []).filter((d: TaxDemand) => d.status === 'pending'),
                alliances: data.alliances || [],
                decrees: (data.decrees || []).filter((d: Decree) => d.until && new Date(d.until.seconds * 1000) > new Date()),
                duelChallenges: (data.duelChallenges || []).filter((d: DuelChallenge) => d.status === 'pending'),
                lastPunishmentTimestamp: data.lastPunishmentTimestamp || {},
            } as UserProfile;
        });

        if (searchTerm) {
            const lowerCaseTerm = searchTerm.toLowerCase();
            users = users.filter(user => 
                user.name.toLowerCase().includes(lowerCaseTerm) || 
                (user.email && user.email.toLowerCase().includes(lowerCaseTerm))
            );
        }
        
        return users;
    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
}


export async function humiliatePlayer(actorId: string, targetId: string): Promise<{ success: boolean, error?: string }> {
    const allRanks = await getSocialRanks().then(res => res.ranks || DEFAULT_SOCIAL_RANKS);
    
    return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;

        const actorRank = getSocialRankForUser(actor.leaderboardPoints, allRanks);
        const targetRank = getSocialRankForUser(target.leaderboardPoints, allRanks);
        
        if (!actorRank || !targetRank) throw new Error("خطأ في تحديد الرتب.");
        if (actorRank.threshold < 300) throw new Error("ليس لديك الصلاحية لإذلال الآخرين.");
        if (actorRank.threshold <= targetRank.threshold) throw new Error("لا يمكنك إذلال لاعب من نفس طبقتك أو أعلى.");
        if (target.allegiance?.to === actorId) throw new Error("لا يمكنك إذلال لاعب أعلن ولاءه لك.");

        if (target.humiliation && new Date(target.humiliation.until) > new Date()) {
            throw new Error("هذا اللاعب مُذل بالفعل.");
        }
        
        const humiliation: Humiliation = {
            by: actorId,
            byName: actor.name,
            at: new Date(),
            until: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        };
        
        transaction.update(targetRef, {
            leaderboardPoints: increment(-5),
            humiliation: humiliation
        });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل تنفيذ الإذلال." };
    });
}

export async function pledgeAllegiance(actorId: string, targetId: string): Promise<{ success: boolean, error?: string }> {
    const allRanks = await getSocialRanks().then(res => res.ranks || DEFAULT_SOCIAL_RANKS);

    return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;
        
        const actorRank = getSocialRankForUser(actor.leaderboardPoints, allRanks);
        const targetRank = getSocialRankForUser(target.leaderboardPoints, allRanks);

        if (!actorRank || !targetRank) throw new Error("خطأ في تحديد الرتب.");
        if (actorRank.threshold >= targetRank.threshold) throw new Error("لا يمكنك إعلان الولاء للاعب من نفس طبقتك أو أقل.");
        if (actor.coins < 10) throw new Error("لا تملك ما يكفي من الكوينز لإعلان الولاء (التكلفة 10).");
        if (actor.allegiance?.to === targetId) throw new Error("ولاؤك لهذا اللاعب بالفعل.");

        const allegiance: Allegiance = {
            to: targetId,
            toName: target.name,
            at: new Date(),
        };
        // Actor pays 10 coins
        transaction.update(actorRef, {
            coins: increment(-10),
            allegiance: allegiance
        });
        // Target gains 10 honor points
        transaction.update(targetRef, {
             honorPoints: increment(10)
        });
        
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل إعلان الولاء." };
    });
}

export async function issueDecree(actorId: string, targetId: string, decree: Decree): Promise<{ success: boolean, error?: string }> {
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await transaction.getAll(actorRef, targetRef);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");
        
        const actor = actorDoc.data() as UserProfile;
        if ((actor.honorPoints || 0) < 10) throw new Error("لا تملك نقاط شرف كافية لإصدار مرسوم (التكلفة 10).");
        
        const lastPunishment = actor.lastPunishmentTimestamp?.[targetId];
        if (lastPunishment && (Date.now() - lastPunishment.toMillis() < 24 * 60 * 60 * 1000)) {
            throw new Error("لا يمكنك معاقبة هذا اللاعب مرة أخرى إلا بعد مرور 24 ساعة.");
        }
        
        // Cost actor 10 honor points
        transaction.update(actorRef, { 
            honorPoints: increment(-10),
            [`lastPunishmentTimestamp.${targetId}`]: serverTimestamp(),
        });

        // Apply decree to target
        transaction.update(targetRef, { decrees: arrayUnion(decree) });
        
        return { success: true };
     }).catch((error: any) => {
        return { success: false, error: error.message || "فشل إصدار المرسوم." };
    });
}


export async function begForMercy(actorId: string, targetId: string, cost: number): Promise<{ success: boolean, error?: string }> {
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);
        
        const [actorDoc, targetDoc] = await transaction.getAll(actorRef, targetRef);
        
        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");
        
        const actor = actorDoc.data() as UserProfile;
        if ((actor.loyaltyPoints || 0) < cost) throw new Error(`لا تملك نقاط ولاء كافية (التكلفة ${cost}).`);
        
        // Actor pays loyalty points
        transaction.update(actorRef, { loyaltyPoints: increment(-cost) });
        // Target gains honor points
        transaction.update(targetRef, { honorPoints: increment(cost) });

        await sendSystemMail(targetId, {
            subject: "توسل من أجل الرحمة",
            body: `اللاعب ${actor.name} يتوسل إليك من أجل الرحمة والحماية، وقدم لك ${cost} نقاط ولاء كهدية.`,
        }, transaction);

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل التوسل." };
    });
}


export async function demandTaxes(actorId: string, targetId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const actorRef = doc(db, "users", actorId);
    const targetRef = doc(db, "users", targetId);

    return runTransaction(db, async (transaction) => {
        const [actorDoc, targetDoc] = await transaction.getAll(actorRef, targetRef);
        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");
        
        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;

        if (target.allegiance?.to === actorId) throw new Error("لا يمكنك فرض ضريبة على من أعلن ولاءه لك.");
        if ((actor.honorPoints || 0) < 5) throw new Error("لا تملك نقاط شرف كافية لفرض ضريبة (التكلفة 5).");
        
        const lastPunishment = actor.lastPunishmentTimestamp?.[targetId];
        if (lastPunishment && (Date.now() - lastPunishment.toMillis() < 24 * 60 * 60 * 1000)) {
            throw new Error("لا يمكنك معاقبة هذا اللاعب مرة أخرى إلا بعد مرور 24 ساعة.");
        }


        const newDemand: TaxDemand = {
            fromId: actorId,
            fromName: actor.name,
            amount: amount,
            status: 'pending',
            createdAt: new Date(),
        };

        transaction.update(targetRef, { taxDemands: arrayUnion(newDemand) });
        transaction.update(actorRef, {
            honorPoints: increment(-5),
            [`lastPunishmentTimestamp.${targetId}`]: serverTimestamp(),
        });
        
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل فرض الضريبة." };
    });
}


export async function respondToTaxDemand(actorId: string, demand: TaxDemand, response: 'paid' | 'rejected'): Promise<{ success: boolean, error?: string }> {
    const actorRef = doc(db, "users", actorId);
    const taxerRef = doc(db, "users", demand.fromId);

    return runTransaction(db, async (transaction) => {
        const actorDoc = await transaction.get(actorRef);
        if (!actorDoc.exists()) throw new Error("لم يتم العثور على ملفك الشخصي.");
        
        const actorData = actorDoc.data() as UserProfile;
        const demands = actorData.taxDemands || [];
        const demandIndex = demands.findIndex(d => d.fromId === demand.fromId && d.createdAt.toString() === demand.createdAt.toString());
        if (demandIndex === -1) throw new Error("لم يتم العثور على طلب الضريبة هذا.");

        const updatedDemands = [...demands];
        updatedDemands.splice(demandIndex, 1);
        
        if (response === 'paid') {
            if (actorData.coins < demand.amount) throw new Error("ليس لديك ما يكفي من الكوينز لدفع الضريبة.");
            transaction.update(actorRef, { coins: increment(-demand.amount), loyaltyPoints: increment(2), taxDemands: updatedDemands });
            transaction.update(taxerRef, { coins: increment(demand.amount), honorPoints: increment(2) });
        } else { // rejected
            transaction.update(actorRef, { taxDemands: updatedDemands, rebellionPoints: increment(1) });
        }
        
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل الرد على طلب الضريبة." };
    });
}


export async function requestAlliance(actorId: string, targetId: string): Promise<{ success: boolean; error?: string }> {
    const actorRef = doc(db, "users", actorId);
    const targetRef = doc(db, "users", targetId);
    return runTransaction(db, async (transaction) => {
        const [actorDoc, targetDoc] = await transaction.getAll(actorRef, targetRef);
        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;

        const newAlliance: Alliance = {
            id: [actorId, targetId].sort().join('_'), // Consistent ID
            members: {
                [actorId]: { name: actor.name, avatarId: actor.avatarId, status: 'accepted' },
                [targetId]: { name: target.name, avatarId: target.avatarId, status: 'pending' },
            },
            createdAt: new Date(),
        };

        transaction.update(targetRef, { alliances: arrayUnion(newAlliance) });
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل طلب التحالف." };
    });
}

export async function respondToAlliance(actorId: string, alliance: Alliance, response: 'accepted' | 'rejected'): Promise<{ success: boolean; error?: string }> {
     const actorRef = doc(db, "users", actorId);
     const otherMemberId = Object.keys(alliance.members).find(id => id !== actorId);
     if(!otherMemberId) return { success: false, error: "خطأ في بيانات التحالف." };
     const otherMemberRef = doc(db, "users", otherMemberId);

    return runTransaction(db, async (transaction) => {
        const [actorDoc, otherDoc] = await transaction.getAll(actorRef, otherMemberRef);
        if (!actorDoc.exists() || !otherDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actorData = actorDoc.data() as UserProfile;
        const otherData = otherDoc.data() as UserProfile;

        // Find and remove the pending alliance from both users
        const actorAllianceIndex = (actorData.alliances || []).findIndex(a => a.id === alliance.id);
        if (actorAllianceIndex === -1) throw new Error("لم يتم العثور على طلب التحالف.");
        
        const updatedActorAlliances = [...(actorData.alliances || [])];
        updatedActorAlliances.splice(actorAllianceIndex, 1);
        
        const updatedOtherAlliances = [...(otherData.alliances || [])];
        const otherAllianceIndex = updatedOtherAlliances.findIndex(a => a.id === alliance.id);
        if (otherAllianceIndex !== -1) {
            updatedOtherAlliances.splice(otherAllianceIndex, 1);
        }

        if (response === 'accepted') {
            alliance.members[actorId]!.status = 'accepted';
            // Add the accepted alliance back to both
            updatedActorAlliances.push(alliance);
            updatedOtherAlliances.push(alliance);
        }
        
        transaction.update(actorRef, { alliances: updatedActorAlliances });
        transaction.update(otherMemberRef, { alliances: updatedOtherAlliances });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل الرد على طلب التحالف." };
    });
}

export async function applyPunishment(adminId: string, targetId: string, penalty: { points?: number, coins?: number}, reason: string): Promise<{ success: boolean; error?: string }> {
     return runTransaction(db, async (transaction) => {
        const adminRef = doc(db, "users", adminId);
        const targetRef = doc(db, "users", targetId);

        const [adminDoc, targetDoc] = await transaction.getAll(adminRef, targetRef);

        if (!adminDoc.exists() || !adminDoc.data()?.isAdmin) {
            throw new Error("فقط الأدمن يمكنه تطبيق العقوبات.");
        }
        if (!targetDoc.exists()) {
            throw new Error("اللاعب المستهدف غير موجود.");
        }
        
        const updates: any = {};
        if (penalty.points && penalty.points > 0) {
            updates.leaderboardPoints = increment(-penalty.points);
        }
        if (penalty.coins && penalty.coins > 0) {
            updates.coins = increment(-penalty.coins);
        }

        if (Object.keys(updates).length > 0) {
            transaction.update(targetRef, updates);
        }

        // Send a mail to the user about the punishment
        await sendSystemMail(targetId, {
            subject: "تم تطبيق عقوبة عليك",
            body: `لقد تم تطبيق عقوبة عليك من قبل الإدارة. السبب: ${reason}. تم خصم ${penalty.points || 0} نقطة و ${penalty.coins || 0} كوينز.`,
        }, transaction);

        return { success: true };
     }).catch((error: any) => {
        return { success: false, error: error.message || "فشل تطبيق العقوبة." };
    });
}

export async function giveReward(adminId: string, targetId: string, reward: { points?: number, coins?: number }, reason: string): Promise<{ success: boolean; error?: string }> {
     return runTransaction(db, async (transaction) => {
        const adminRef = doc(db, "users", adminId);
        const targetRef = doc(db, "users", targetId);
        
        const [adminDoc, targetDoc] = await transaction.getAll(adminRef, targetRef);
        
        if (!adminDoc.exists() || !adminDoc.data()?.isAdmin) {
            throw new Error("فقط الأدمن يمكنه منح المكافآت.");
        }
        if (!targetDoc.exists()) {
            throw new Error("اللاعب المستهدف غير موجود.");
        }
        
        const updates: any = {};
        if (reward.points && reward.points > 0) {
            updates.leaderboardPoints = increment(reward.points);
        }
        if (reward.coins && reward.coins > 0) {
            updates.coins = increment(reward.coins);
        }
        
        if (Object.keys(updates).length > 0) {
            transaction.update(targetRef, updates);
        }

        await sendSystemMail(targetId, {
            subject: "لقد حصلت على مكافأة!",
            body: `لقد حصلت على مكافأة من الإدارة. السبب: ${reason}. تم إضافة ${reward.points || 0} نقطة و ${reward.coins || 0} كوينز إلى رصيدك.`,
            coins: reward.coins,
        }, transaction);

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل منح المكافأة." };
    });
}

export async function issueDuelChallenge(actorId: string, targetId: string, betAmount: number): Promise<{ success: boolean; error?: string }> {
     const actorRef = doc(db, "users", actorId);
     const targetRef = doc(db, "users", targetId);

     return runTransaction(db, async (transaction) => {
         const [actorDoc, targetDoc] = await transaction.getAll(actorRef, targetRef);
         if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

         const actor = actorDoc.data() as UserProfile;
         const target = targetDoc.data() as UserProfile;
         
         if(actor.coins < betAmount) throw new Error("لا تملك ما يكفي من الكوينز للمراهنة.");

         const challengeId = generateRoomId();
         const newChallenge: DuelChallenge = {
             id: challengeId,
             fromId: actorId,
             fromName: actor.name,
             betAmount: betAmount,
             status: 'pending',
             createdAt: new Date(),
         };
         
         transaction.update(targetRef, { duelChallenges: arrayUnion(newChallenge) });

         return { success: true };
     }).catch((error: any) => {
         return { success: false, error: error.message || "فشل إرسال التحدي." };
     });
}

export async function respondToDuelChallenge(actorId: string, challenge: DuelChallenge, response: 'accepted' | 'rejected'): Promise<{ success: boolean, error?: string, gameId?: string }> {
    const actorRef = doc(db, "users", actorId);
    const challengerRef = doc(db, "users", challenge.fromId);
    
     return runTransaction(db, async (transaction) => {
         const [actorDoc, challengerDoc] = await transaction.getAll(actorRef, challengerRef);
         if (!actorDoc.exists() || !challengerDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

         const actorData = actorDoc.data() as UserProfile;
         const challengerData = challengerDoc.data() as UserProfile;

         const demands = actorData.duelChallenges || [];
         const demandIndex = demands.findIndex(d => d.id === challenge.id);
         if (demandIndex === -1) throw new Error("لم يتم العثور على طلب التحدي هذا.");

         const updatedDemands = [...demands];
         updatedDemands.splice(demandIndex, 1);
         
         let gameId: string | undefined = undefined;

         if (response === 'accepted') {
             if (actorData.coins < challenge.betAmount) throw new Error("لا تملك ما يكفي من الكوينز لقبول الرهان.");
             
             // Create a new Word War game room
             gameId = challenge.id;
             const gameRef = doc(db, 'games', gameId);
             
             const players: Player[] = [
                 { id: actorId, name: actorData.name, avatarId: actorData.avatarId, team: 'blue', status: 'alive', leaderboardPoints: actorData.leaderboardPoints },
                 { id: challenge.fromId, name: challengerData.name, avatarId: challengerData.avatarId, team: 'red', status: 'alive', leaderboardPoints: challengerData.leaderboardPoints }
             ];

             const newGame: Omit<Game, 'id'> = {
                hostId: actorId,
                players,
                playerUids: [actorId, challenge.fromId],
                gameState: 'lobby' as GameState,
                createdAt: Timestamp.now(),
                expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
                gameType: 'word_war',
                playerScores: { [actorId]: 0, [challenge.fromId]: 0 },
             };
             
             transaction.set(gameRef, newGame);
             
         } else {
             // If rejected, just remove the challenge from the target player
             transaction.update(actorRef, { duelChallenges: updatedDemands });
         }
         
         return { success: true, gameId };
     }).catch((error: any) => {
         return { success: false, error: error.message || "فشل الرد على التحدي." };
     });
}

export async function forceAvatarChange(actorId: string, targetId: string, avatarId: string): Promise<{ success: boolean; error?: string }> {
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);
        
        const [actorDoc, targetDoc] = await transaction.getAll(actorRef, targetRef);
        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;
        
        const avatarPriceDoc = await getDoc(doc(db, 'game_settings', 'avatar_prices'));
        const punishmentAvatar = avatarPriceDoc.data()?.prices?.find((p: AvatarPrice) => p.avatarId === avatarId && p.isPunishment);

        if (!punishmentAvatar) throw new Error("هذه الشخصية غير متاحة كعقوبة.");
        if (actor.coins < punishmentAvatar.price) throw new Error("لا تملك ما يكفي من الكوينز لشراء هذه العقوبة.");

        const lastPunishment = actor.lastPunishmentTimestamp?.[targetId];
        if (lastPunishment && (Date.now() - lastPunishment.toMillis() < 24 * 60 * 60 * 1000)) {
            throw new Error("لا يمكنك معاقبة هذا اللاعب مرة أخرى إلا بعد مرور 24 ساعة.");
        }

        transaction.update(actorRef, {
            coins: increment(-punishmentAvatar.price),
            [`lastPunishmentTimestamp.${targetId}`]: serverTimestamp(),
        });
        
        const originalAvatar = {
            id: target.avatarId,
            until: new Date(Date.now() + 24 * 60 * 60 * 1000), // Revert after 24 hours
        };

        transaction.update(targetRef, {
            avatarId: avatarId,
            originalAvatarToRevert: originalAvatar, // Store what to revert to
        });
        
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل فرض تغيير الشخصية." };
    });
}
