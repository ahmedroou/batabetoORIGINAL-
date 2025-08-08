
'use server';

import { db } from '@/lib/firebase';
import { doc, collection, query, getDocs, orderBy, limit, getDoc, where, setDoc, updateDoc } from 'firebase/firestore';
import type { UserProfile, GameKing, SocialRank, TaxDemand, Decree, DuelChallenge } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';
import { withAdminAuth } from '../helpers';


// This function is purely for fetching ranks from the database.
export async function getRanks(): Promise<SocialRank[]> {
    try {
        const docRef = doc(db, 'game_settings', 'social_ranks');
        const docSnap = await getDoc(docRef);
        // If the document exists and has a non-empty list, return it.
        if (docSnap.exists() && docSnap.data().list?.length > 0) {
            const storedRanks: SocialRank[] = docSnap.data().list.map((rank: any) => ({
                permissions: rank.permissions || [],
                ...rank,
            }));
            return storedRanks;
        }
        // If the document does not exist or the list is empty, return the default ranks
        // WITHOUT writing to the database. This prevents overwriting custom ranks.
        return DEFAULT_SOCIAL_RANKS;
    } catch(e) {
        console.error("Could not fetch ranks, returning default. Error: ", e);
        return DEFAULT_SOCIAL_RANKS;
    }
}

export const setSocialRanks = withAdminAuth(async (adminId: string, ranks: SocialRank[]): Promise<{success: boolean, error?: string}> => {
    try {
        const settingsRef = doc(db, 'game_settings', 'social_ranks');
        await setDoc(settingsRef, { list: ranks });
        return { success: true };
    } catch (error) {
        console.error("Error setting social ranks:", error);
        return { success: false, error: 'فشل حفظ الألقاب الاجتماعية.' };
    }
});


export async function getPlayerFromUserId(userId: string): Promise<UserProfile> {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
       throw new Error(`لم يتم العثور على ملف تعريف للمستخدم بالمعرف: ${userId}. تأكد من أن المستخدم قد أكمل التسجيل.`);
    }
    
    const userData = userDoc.data();
    // Ensure decrees array and its until property are correctly handled
    const decrees = (userData.decrees || []).map((d: any) => ({
      ...d,
      until: d.until?.toDate ? d.until.toDate() : d.until, // Convert Timestamp to Date
    }));
    
    return {
        uid: userId,
        name: userData.name || 'لاعب غير معروف',
        avatarId: userData.avatarId || 'Avatar00.png',
        leaderboardPoints: userData.leaderboardPoints || 0,
        ...userData,
        decrees, // Overwrite with the converted array
    } as UserProfile;
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

export async function getKingOfGames(): Promise<UserProfile | null> {
    try {
        const q = query(collection(db, 'users'), orderBy('leaderboardPoints', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            return null;
        }
        const userDoc = snapshot.docs[0];
        return { uid: userDoc.id, ...userDoc.data() } as UserProfile;
    } catch (error) {
        console.error("Error fetching king of games:", error);
        return null;
    }
}


export async function getAllUsers(filter?: 'punished'): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        let usersQuery;
        
        if (filter === 'punished') {
            usersQuery = query(usersCol, where('isPunished', '==', true));
        } else {
            usersQuery = query(usersCol, orderBy('leaderboardPoints', 'desc'));
        }

        const snapshot = await getDocs(usersQuery);
        let users = snapshot.docs.map(doc => {
            const data = doc.data();
            // Convert Firestore Timestamps to JS Dates for client-side logic
            const humiliation = data.humiliation ? { ...data.humiliation, at: (data.humiliation.at as any)?.toDate(), until: (data.humiliation.until as any)?.toDate() } : null;
            const originalAvatarToRevert = data.originalAvatarToRevert ? { ...data.originalAvatarToRevert, until: (data.originalAvatarToRevert.until as any)?.toDate() } : null;
            const decrees = (data.decrees || []).map((d: Decree) => ({ ...d, until: (d.until as any)?.toDate ? (d.until as any).toDate() : d.until }));

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
                humiliation: humiliation,
                allegiance: data.allegiance || null,
                taxDemands: data.taxDemands || [],
                alliances: data.alliances || [],
                decrees: decrees,
                duelChallenges: data.duelChallenges || [],
                lastPunishmentTimestamp: data.lastPunishmentTimestamp || {},
                originalAvatarToRevert: originalAvatarToRevert,
                unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
                isPunished: data.isPunished || false,
            } as UserProfile;
        });

        // If we queried for punished users, we still need to filter out expired punishments client-side
        if (filter === 'punished') {
            users = users.filter(p => 
                (p.humiliation && p.humiliation.until && p.humiliation.until > new Date()) ||
                (p.originalAvatarToRevert && p.originalAvatarToRevert.until && p.originalAvatarToRevert.until > new Date()) ||
                (p.decrees && p.decrees.some(d => d.until && d.until > new Date()))
            );
        }

        return users;

    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
}


// Internal function to update win counts and check for new Game Kings
export async function updateUserWinCount(gameType: any, userId: string, transaction: any) {
    const userRef = doc(db, 'users', userId);
    const kingRef = doc(db, 'game_kings', gameType);

    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) return;
    const userData = userDoc.data() as UserProfile;

    const newWinCount = (userData.winCounts?.[gameType] || 0) + 1;

    transaction.update(userRef, {
      [`winCounts.${gameType}`]: newWinCount
    });
  
    const kingDoc = await transaction.get(kingRef);
  
    if (!kingDoc.exists()) {
      transaction.set(kingRef, {
        kingId: userId,
        name: userData.name,
        avatarId: userData.avatarId,
        winCount: newWinCount,
      });
    } else {
      const kingData = kingDoc.data() as GameKing;
      if (newWinCount > kingData.winCount) {
        transaction.update(kingRef, {
          kingId: userId,
          name: userData.name,
          avatarId: userData.avatarId,
          winCount: newWinCount,
        });
      }
    }
}


export async function searchUsers(searchTerm: string): Promise<UserProfile[]> {
  if (!searchTerm.trim()) {
    return [];
  }
  
  const term = searchTerm.toLowerCase();

  try {
    const usersRef = collection(db, 'users');

    const nameQuery = query(usersRef, 
        where('name', '>=', term),
        where('name', '<=', term + '\uf8ff')
    );
    const emailQuery = query(usersRef, 
        where('email', '>=', term), 
        where('email', '<=', term + '\uf8ff')
    );

    const [nameSnapshot, emailSnapshot] = await Promise.all([
        getDocs(nameQuery),
        getDocs(emailQuery)
    ]);
    
    const usersMap = new Map<string, UserProfile>();

    const processSnapshot = (snapshot: any) => {
         snapshot.docs.forEach((doc: any) => {
            const data = doc.data();
             const humiliation = data.humiliation ? { ...data.humiliation, at: (data.humiliation.at as any)?.toDate(), until: (data.humiliation.until as any)?.toDate() } : null;
            const originalAvatarToRevert = data.originalAvatarToRevert ? { ...data.originalAvatarToRevert, until: (data.originalAvatarToRevert.until as any)?.toDate() } : null;

            usersMap.set(doc.id, { 
                uid: doc.id, 
                ...data,
                humiliation,
                originalAvatarToRevert
            } as UserProfile);
        });
    }

    processSnapshot(nameSnapshot);
    processSnapshot(emailSnapshot);

    return Array.from(usersMap.values());
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

export async function getUsersByRank(minPoints: number, maxPoints: number | null, limitCount: number = 8): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        let usersQuery;
        
        const qConstraints: any[] = [
            orderBy('leaderboardPoints', 'desc'),
            limit(limitCount)
        ];
        
        if (minPoints > 0) {
             qConstraints.unshift(where('leaderboardPoints', '>=', minPoints));
        }
        if (maxPoints !== null) {
            qConstraints.unshift(where('leaderboardPoints', '<', maxPoints));
        }


        usersQuery = query(usersCol, ...qConstraints);

        const snapshot = await getDocs(usersQuery);
        return snapshot.docs.map(doc => {
            const data = doc.data();
             const humiliation = data.humiliation ? { ...data.humiliation, at: (data.humiliation.at as any)?.toDate(), until: (data.humiliation.until as any)?.toDate() } : null;
            const originalAvatarToRevert = data.originalAvatarToRevert ? { ...data.originalAvatarToRevert, until: (data.originalAvatarToRevert.until as any)?.toDate() } : null;
            const decrees = (data.decrees || []).map((d: Decree) => ({ ...d, until: (d.until as any)?.toDate ? (d.until as any).toDate() : d.until }));

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
                humiliation: humiliation,
                allegiance: data.allegiance || null,
                taxDemands: (data.taxDemands || []),
                alliances: data.alliances || [],
                decrees: decrees,
                duelChallenges: (data.duelChallenges || []),
                lastPunishmentTimestamp: data.lastPunishmentTimestamp || {},
                originalAvatarToRevert: originalAvatarToRevert,
                unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
            } as UserProfile;
        });
    } catch (error) {
        console.error("Error fetching users by rank:", error);
        return [];
    }
}

    