'use server';

import { db } from '@/lib/firebase';
import { doc, collection, query, getDocs, orderBy, limit, getDoc, where, setDoc } from 'firebase/firestore';
import type { UserProfile, GameKing, SocialRank, TaxDemand, Decree, DuelChallenge } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';


// This function is purely for fetching ranks from the database.
export async function getRanks(): Promise<SocialRank[]> {
    try {
        const docRef = doc(db, 'game_settings', 'social_ranks');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().list?.length > 0) {
            const storedRanks: SocialRank[] = docSnap.data().list.map((rank: any) => ({
                permissions: rank.permissions || [],
                ...rank,
            }));
            return storedRanks;
        }
        await setDoc(docRef, { list: DEFAULT_SOCIAL_RANKS });
        return DEFAULT_SOCIAL_RANKS;
    } catch(e) {
        console.error("Could not fetch ranks, returning default. Error: ", e);
        return DEFAULT_SOCIAL_RANKS;
    }
}


export async function getPlayerFromUserId(userId: string): Promise<UserProfile> {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
       throw new Error(`لم يتم العثور على ملف تعريف للمستخدم بالمعرف: ${userId}. تأكد من أن المستخدم قد أكمل التسجيل.`);
    }
    
    const userData = userDoc.data();
    return {
        uid: userId,
        name: userData.name || 'لاعب غير معروف',
        avatarId: userData.avatarId || 'Avatar00.png',
        leaderboardPoints: userData.leaderboardPoints || 0,
        ...userData
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


export async function getAllUsers(): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        const usersQuery = query(usersCol, orderBy('leaderboardPoints', 'desc'));

        const snapshot = await getDocs(usersQuery);
        return snapshot.docs.map(doc => {
            const data = doc.data();
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
                originalAvatarToRevert: data.originalAvatarToRevert || null,
                unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
            } as UserProfile;
        });

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

    nameSnapshot.docs.forEach(doc => {
        usersMap.set(doc.id, { uid: doc.id, ...doc.data() } as UserProfile);
    });

    emailSnapshot.docs.forEach(doc => {
        if (!usersMap.has(doc.id)) {
            usersMap.set(doc.id, { uid: doc.id, ...doc.data() } as UserProfile);
        }
    });

    return Array.from(usersMap.values());
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

export async function getUsersByRank(minPoints: number, maxPoints: number | null, limitCount: number): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        let usersQuery;
        
        if(maxPoints !== null) {
            usersQuery = query(usersCol, 
                where('leaderboardPoints', '>=', minPoints),
                where('leaderboardPoints', '<', maxPoints),
                orderBy('leaderboardPoints', 'desc'),
                limit(limitCount)
            );
        } else {
             usersQuery = query(usersCol, 
                where('leaderboardPoints', '>=', minPoints),
                orderBy('leaderboardPoints', 'desc'),
                limit(limitCount)
            );
        }

        const snapshot = await getDocs(usersQuery);
        return snapshot.docs.map(doc => {
            const data = doc.data();
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
                originalAvatarToRevert: data.originalAvatarToRevert || null,
                unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
            } as UserProfile;
        });
    } catch (error) {
        console.error("Error fetching users by rank:", error);
        return [];
    }
}
