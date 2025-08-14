

'use server';

import { db } from '@/lib/firebase';
import { doc, collection, query, getDocs, orderBy, limit, getDoc, where, setDoc, updateDoc, WriteBatch, writeBatch, increment } from 'firebase/firestore';
import type { UserProfile, GameKing, SocialRank, TaxDemand, Decree, DuelChallenge, Game } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';
import { getTopUsers as adminGetTopUsers } from '../admin/users';


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
    
    const decrees = (userData.decrees || []).map((d: any) => ({
      ...d,
      until: d.until?.toDate ? d.until.toDate() : d.until,
    }));
    
    const humiliation = userData.humiliation ? { ...userData.humiliation, at: userData.humiliation.at?.toDate(), until: userData.humiliation.until?.toDate() } : null;
    const originalAvatarToRevert = userData.originalAvatarToRevert ? { ...userData.originalAvatarToRevert, until: userData.originalAvatarToRevert.until?.toDate() } : null;
    
    const lastPunishmentTimestamp = userData.lastPunishmentTimestamp || {};
    for (const key in lastPunishmentTimestamp) {
        if (lastPunishmentTimestamp[key]?.toDate) {
            lastPunishmentTimestamp[key] = lastPunishmentTimestamp[key].toDate();
        }
    }


    return {
        uid: userId,
        name: userData.name || 'لاعب غير معروف',
        avatarId: userData.avatarId || 'Avatar00.png',
        leaderboardPoints: userData.leaderboardPoints || 0,
        ...userData,
        decrees,
        humiliation,
        originalAvatarToRevert,
        lastPunishmentTimestamp
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
      const data = doc.data();
      kings[doc.id] = {
          name: data.name,
          avatarId: data.avatarId,
          winCount: data.winCount,
          kingId: data.kingId,
          totalLeaderboardPoints: 0, 
      } as GameKing;
    });
    
    const allKingIds = Object.values(kings).map(k => k.kingId).filter(Boolean);
    const kingIdChunks: string[][] = [];
    for (let i = 0; i < allKingIds.length; i += 30) {
        kingIdChunks.push(allKingIds.slice(i, i + 30));
    }
    
    const usersData = new Map<string, UserProfile>();

    for (const chunk of kingIdChunks) {
        const usersQuery = query(collection(db, 'users'), where('__name__', 'in', chunk));
        const usersSnapshot = await getDocs(usersQuery);
        usersSnapshot.docs.forEach(d => usersData.set(d.id, d.data() as UserProfile));
    }

    for(const gameType in kings) {
        const king = kings[gameType];
        const kingUser = usersData.get(king.kingId);
        if (kingUser) {
            king.totalLeaderboardPoints = kingUser.leaderboardPoints || 0;
        }
    }
    
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

export async function getKingsPageData(): Promise<{ kings: Record<string, GameKing>, kingOfGames: UserProfile | null }> {
    try {
        const [kings, kingOfGames] = await Promise.all([
            getGameKings(),
            getKingOfGames()
        ]);
        return { kings, kingOfGames };
    } catch (error) {
        console.error("Error fetching kings page data:", error);
        return { kings: {}, kingOfGames: null };
    }
}


export async function getAllUsers(filter?: 'punished', queryLimit?: number): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        let usersQuery;
        
        if (filter === 'punished') {
            const baseQuery = query(usersCol, where('isPunished', '==', true));
            usersQuery = queryLimit ? query(baseQuery, limit(queryLimit)) : baseQuery;
        } else {
            return [];
        }

        const snapshot = await getDocs(usersQuery);
        let users = snapshot.docs.map(doc => {
            const data = doc.data();
            const decrees = (data.decrees || []).map((d: any) => ({ ...d, until: d.until?.toDate ? d.until.toDate() : d.until }));
            const humiliation = data.humiliation ? { ...data.humiliation, at: (data.humiliation.at as any)?.toDate(), until: (data.humiliation.until as any)?.toDate() } : null;
            const originalAvatarToRevert = data.originalAvatarToRevert ? { ...data.originalAvatarToRevert, until: (data.originalAvatarToRevert.until as any)?.toDate() } : null;

            const lastPunishmentTimestamp = data.lastPunishmentTimestamp || {};
            for (const key in lastPunishmentTimestamp) {
                if (lastPunishmentTimestamp[key]?.toDate) {
                    lastPunishmentTimestamp[key] = lastPunishmentTimestamp[key].toDate();
                }
            }

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
                lastPunishmentTimestamp: lastPunishmentTimestamp,
                originalAvatarToRevert: originalAvatarToRevert,
                unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
                isPunished: data.isPunished || false,
            } as UserProfile;
        });
        
        return users;

    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
}

export async function getGamePopularityStats(): Promise<Record<Game['gameType'], number>> {
    try {
        const statsRef = doc(db, 'game_stats', 'popularity');
        const docSnap = await getDoc(statsRef);
        if (docSnap.exists()) {
            return docSnap.data() as Record<Game['gameType'], number>;
        }
        return {} as Record<Game['gameType'], number>;
    } catch (error) {
        console.error("Error fetching game popularity stats:", error);
        return {} as Record<Game['gameType'], number>;
    }
}


// Internal function to update win counts and check for new Game Kings
export async function updateUserWinCount(gameType: Game['gameType'], userId: string, batch: WriteBatch) {
    
    const userRef = doc(db, 'users', userId);
    // Note: This function now accepts a WriteBatch object instead of a full transaction,
    // so we cannot `get` docs. This is acceptable as we are only using increments.
    
    batch.update(userRef, {
      [`winCounts.${gameType}`]: increment(1)
    });
}

export async function getTopUsers(field: 'coins' | 'leaderboardPoints', count: number): Promise<UserProfile[]> {
    return adminGetTopUsers(field, count);
}

export async function getTopPunisher(): Promise<UserProfile | null> {
    try {
        const q = query(collection(db, 'users'), where('punishmentsIssued', '>', 0), orderBy('punishmentsIssued', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            return null;
        }
        const userDoc = snapshot.docs[0];
        return { uid: userDoc.id, ...userDoc.data() } as UserProfile;
    } catch (error) {
        console.warn("Could not fetch top punisher, likely due to a missing index:", error);
        return null;
    }
}

export async function getUsersByRank(minPoints: number, maxPoints: number | null, count: number): Promise<UserProfile[]> {
    try {
        const usersRef = collection(db, 'users');
        let q;
        if (maxPoints !== null) {
            q = query(
                usersRef, 
                where('leaderboardPoints', '>=', minPoints),
                where('leaderboardPoints', '<', maxPoints),
                orderBy('leaderboardPoints', 'desc'), 
                limit(count)
            );
        } else {
            q = query(
                usersRef, 
                where('leaderboardPoints', '>=', minPoints),
                orderBy('leaderboardPoints', 'desc'), 
                limit(count)
            );
        }
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    } catch (error) {
        console.error("Error getting users by rank:", error);
        return [];
    }
}
