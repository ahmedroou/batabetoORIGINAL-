

'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  collection,
  query,
  getDocs,
  orderBy,
  limit,
  getDoc,
  where,
  setDoc,
  updateDoc,
  WriteBatch,
  writeBatch,
  increment,
  Timestamp,
  addDoc,
  serverTimestamp,
  deleteField,
  startAfter,
  DocumentData,
} from 'firebase/firestore';
import type {
  UserProfile,
  GameKing,
  SocialRank,
  TaxDemand,
  Decree,
  DuelChallenge,
  Game,
  MatchHistoryItem,
  AvatarPrice,
} from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/data/social-ranks';

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
const IN_QUERY_LIMIT = 30; // Firestore 'in' operator max items

function chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

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

function docToUserProfile(docSnap: DocumentData, uid: string): UserProfile {
    const data = docSnap.data();
    if (!data) throw new Error("Document data is empty.");

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
    } as UserProfile;
}


// -------------------------------------------------------------
// Ranks
// -------------------------------------------------------------
/**
 * Fetch social ranks. Falls back to DEFAULT_SOCIAL_RANKS and persists them (with icon serialized) if none exist.
 * NOTE: Icons are stored as strings (displayName) in Firestore. We keep them as-is and rely on the client registry to resolve.
 */
export async function getRanks(): Promise<SocialRank[]> {
  try {
    const docRef = doc(db, 'game_settings', 'social_ranks');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const stored = (docSnap.data().list || []) as any[];
      // Try to hydrate missing fields using defaults; keep icon as-is (string) and let UI map it.
      const normalized = stored.map((r) => {
        const fallback = DEFAULT_SOCIAL_RANKS.find((d: any) => d.name === r.name) || {};
        return { ...fallback, ...r };
      }) as unknown as SocialRank[];
      return normalized;
    }

    // Persist defaults with icon serialized to a string
    const serializable = DEFAULT_SOCIAL_RANKS.map((r: any) => ({
      ...r,
      icon: (r.icon as any)?.displayName || (typeof r.icon === 'string' ? r.icon : 'Icon'),
    }));
    await setDoc(docRef, { list: serializable });
    return DEFAULT_SOCIAL_RANKS;
  } catch (e) {
    console.error('Could not fetch ranks, returning default. Error: ', e);
    return DEFAULT_SOCIAL_RANKS;
  }
}

// -------------------------------------------------------------
// Profiles
// -------------------------------------------------------------
export async function getPlayerFromUserId(userId: string): Promise<UserProfile> {
  const userDocRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    throw new Error(
      `لم يتم العثور على ملف تعريف للمستخدم بالمعرف: ${userId}. تأكد من أن المستخدم قد أكمل التسجيل.`
    );
  }

  return docToUserProfile(userDoc, userId);
}

// -------------------------------------------------------------
// Kings
// -------------------------------------------------------------
export async function getGameKings(): Promise<Record<string, GameKing>> {
  try {
    const kingsCol = collection(db, 'game_kings');
    const snapshot = await getDocs(kingsCol);
    if (snapshot.empty) return {};

    const kings: Record<string, GameKing> = {};
    snapshot.forEach((d) => {
      const val: any = d.data();
      kings[d.id] = {
        name: val.name,
        avatarId: val.avatarId,
        winCount: val.winCount,
        kingId: val.kingId,
        totalLeaderboardPoints: 0,
      } as GameKing;
    });

    const allKingIds = Array.from(new Set(Object.values(kings).map((k) => k.kingId).filter(Boolean))) as string[];
    if (allKingIds.length === 0) return kings;

    const chunks = chunk(allKingIds, IN_QUERY_LIMIT);
    const usersData = new Map<string, UserProfile>();

    // Fire all queries in parallel (max N chunks)
    const snaps = await Promise.all(
      chunks.map((ids) => getDocs(query(collection(db, 'users'), where('__name__', 'in', ids))))
    );
    snaps.forEach((snap) => snap.docs.forEach((d) => usersData.set(d.id, d.data() as UserProfile)));

    for (const gameType in kings) {
      const king = kings[gameType];
      const kingUser = king.kingId ? usersData.get(king.kingId) : undefined;
      if (kingUser) {
        king.totalLeaderboardPoints = kingUser.leaderboardPoints || 0;
      }
    }

    return kings;
  } catch (error) {
    console.error('Error fetching game kings:', error);
    return {};
  }
}

export async function getKingOfGames(): Promise<UserProfile | null> {
  try {
    const qy = query(collection(db, 'users'), orderBy('leaderboardPoints', 'desc'), limit(1));
    const snapshot = await getDocs(qy);
    if (snapshot.empty) return null;
    const userDoc = snapshot.docs[0];
    return docToUserProfile(userDoc, userDoc.id);
  } catch (error) {
    console.error('Error fetching king of games:', error);
    return null;
  }
}

export async function getKingsPageData(): Promise<{ kings: Record<string, GameKing>; kingOfGames: UserProfile | null }> {
  try {
    const [kings, kingOfGames] = await Promise.all([getGameKings(), getKingOfGames()]);
    return { kings, kingOfGames };
  } catch (error) {
    console.error('Error fetching kings page data:', error);
    return { kings: {}, kingOfGames: null };
  }
}

// -------------------------------------------------------------
// Users (lists & leaderboards)
// -------------------------------------------------------------
export async function getAllUsers(filter?: 'punished', queryLimit?: number): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');

    if (filter !== 'punished') return [];

    const baseQuery = query(usersRef, where('isPunished', '==', true));
    const usersQuery = queryLimit ? query(baseQuery, limit(queryLimit)) : baseQuery;

    const snapshot = await getDocs(usersQuery);
    const users = snapshot.docs.map((docSnap) => docToUserProfile(docSnap, docSnap.id));
    return users;
  } catch (error) {
    console.error('Error fetching all users:', error);
    return [];
  }
}

export async function getGamePopularityStats(): Promise<Record<Game['gameType'], number>> {
  try {
    const statsRef = doc(db, 'game_stats', 'popularity');
    const docSnap = await getDoc(statsRef);
    if (docSnap.exists()) return docSnap.data() as Record<Game['gameType'], number>;
    return {} as Record<Game['gameType'], number>;
  } catch (error) {
    console.error('Error fetching game popularity stats:', error);
    return {} as Record<Game['gameType'], number>;
  }
}

// -------------------------------------------------------------
// Win counts & leaderboards
// -------------------------------------------------------------
export async function updateUserWinCount(
  gameType: Game['gameType'],
  userId: string,
  batch: WriteBatch
) {
  const userRef = doc(db, 'users', userId);
  batch.set(userRef, { winCounts: { [gameType]: increment(1) } }, { merge: true });
}


export async function getTopUsers(
  field: 'coins' | 'leaderboardPoints',
  count: number
): Promise<UserProfile[]> {
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

export async function getTopPunisher(): Promise<UserProfile | null> {
  try {
    const qy = query(
      collection(db, 'users'),
      where('punishmentsIssued', '>', 0),
      orderBy('punishmentsIssued', 'desc'),
      limit(1)
    );
    const snapshot = await getDocs(qy);
    if (snapshot.empty) return null;
    const userDoc = snapshot.docs[0];
    return docToUserProfile(userDoc, userDoc.id);
  } catch (error) {
    console.warn('Could not fetch top punisher, likely due to a missing index:', error);
    return null;
  }
}

export async function getUsersByRank(
  minPoints: number,
  maxPoints: number | null,
  count: number
): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const qy =
      maxPoints !== null
        ? query(
            usersRef,
            where('leaderboardPoints', '>=', minPoints),
            where('leaderboardPoints', '<', maxPoints),
            orderBy('leaderboardPoints', 'desc'),
            limit(count)
          )
        : query(
            usersRef,
            where('leaderboardPoints', '>=', minPoints),
            orderBy('leaderboardPoints', 'desc'),
            limit(count)
          );

    const querySnapshot = await getDocs(qy);
    return querySnapshot.docs.map((d) => docToUserProfile(d, d.id));
  } catch (error) {
    console.error('Error getting users by rank:', error);
    return [];
  }
}

// -------------------------------------------------------------
// Match history
// -------------------------------------------------------------
export async function recordMatchHistory(game: Game, gameId: string): Promise<void> {
    const gid = gameId ?? game.id;
    if (!gid) {
      console.error("Cannot record match history: gameId is missing.");
      return;
    }
  
    // Use playerScores keys as the definitive list of participants for this match.
    const playersToRecord = Object.keys(game.playerScores || {});
    if (playersToRecord.length === 0) {
      console.warn(`No players with scores found for game ${gid}. Skipping match history.`);
      return;
    }

    const allPlayersInGame = new Map(game.players.map(p => [p.id, p]));
  
    const matchData: Omit<MatchHistoryItem, 'id'> = {
      gameId: gid,
      gameType: game.gameType,
      createdAt: serverTimestamp() as unknown as Timestamp,
      finalScores: game.playerScores || {},
      // Construct a minimal player list for the history record.
      players: playersToRecord.map(playerId => {
          const pData = allPlayersInGame.get(playerId);
          return { 
              id: playerId, 
              name: pData?.name || 'Unknown Player',
              avatarId: pData?.avatarId || 'Avatar00.png'
          };
      }),
      winner: typeof game.gameResult?.winner === 'string' ? game.gameResult.winner : undefined,
    };
  
    const batch = writeBatch(db);
    for (const playerId of playersToRecord) {
      const historyRef = doc(collection(db, `users/${playerId}/matchHistory`));
      batch.set(historyRef, matchData);
    }
  
    try {
      await batch.commit();
    } catch (error) {
      console.error(`Failed to record match history for game ${gid}:`, error);
    }
}


// -------------------------------------------------------------
// Avatars
// -------------------------------------------------------------
export async function getAvatarPrices(): Promise<{ success: boolean; prices?: AvatarPrice[]; error?: string }> {
  try {
    const ref = doc(db, 'game_settings', 'avatar_prices');
    const snap = await getDoc(ref);
    if (snap.exists()) return { success: true, prices: (snap.data().prices || []) as AvatarPrice[] };
    return { success: true, prices: [] };
  } catch (e) {
    console.error('Error getting avatar prices:', e);
    return { success: false, error: 'Failed to fetch avatar prices.' };
  }
}

export async function getPunishmentAvatarPrices(): Promise<{
  success: boolean;
  prices?: AvatarPrice[];
  error?: string;
}> {
  try {
    const ref = doc(db, 'game_settings', 'punishment_avatar_prices');
    const snap = await getDoc(ref);
    if (snap.exists()) return { success: true, prices: (snap.data().prices || []) as AvatarPrice[] };
    return { success: true, prices: [] };
  } catch (e) {
    console.error('Error getting punishment avatar prices:', e);
    return { success: false, error: 'Failed to fetch punishment avatar prices.' };
  }
}

export async function getDefaultAvatar(): Promise<{ success: boolean; avatarId?: string; error?: string }> {
  try {
    const docRef = doc(db, 'game_settings', 'default_avatar');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return { success: true, avatarId: docSnap.data().avatarId };
    // Hardcoded fallback if not set
    return { success: true, avatarId: 'Avatar00.png' };
  } catch (error) {
    console.error('Error getting default avatar:', error);
    return { success: false, error: 'Failed to fetch default avatar.' };
  }
}
