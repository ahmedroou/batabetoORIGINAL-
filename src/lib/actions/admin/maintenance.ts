
'use server';

/**
 * @fileoverview Admin actions for database maintenance and backfilling tasks.
 */

import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    getDocs,
    writeBatch,
    Timestamp,
    query,
    where
} from 'firebase/firestore';
import type { Game, GameKing, SocialRank, UserProfile } from '@/types';
import { getRanks, updateUserWinCount } from '../user/queries';

const BATCH_LIMIT_SAFE = 450;

function chunkArray<T>(arr: T[], size = BATCH_LIMIT_SAFE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function commitChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  if (ops.length === 0) return;
  const batches = chunkArray(ops, BATCH_LIMIT_SAFE).map((opsChunk) => {
    const b = writeBatch(db);
    opsChunk.forEach((op) => op(b));
    return b.commit();
  });
  await Promise.all(batches);
}

export async function recalculateGameKings() {
  try {
    const gameKingsRef = collection(db, 'game_kings');
    const usersRef = collection(db, 'users');

    const current = await getDocs(gameKingsRef);
    const delOps: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    current.forEach((d) => delOps.push((b) => b.delete(d.ref)));
    await commitChunks(delOps);

    const usersSnapshot = await getDocs(usersRef);
    if (usersSnapshot.empty) return { success: true, updatedCount: 0 };

    const users: UserProfile[] = usersSnapshot.docs.map(
      (d) => ({ uid: d.id, ...d.data() } as UserProfile),
    );

    const newKings: Record<string, GameKing & { kingId: string }> = {};
    users.forEach((u) => {
      const winCounts = (u.winCounts || {}) as Record<string, number>;
      for (const [gameType, count] of Object.entries(winCounts)) {
        if (!newKings[gameType] || count > newKings[gameType].winCount) {
          newKings[gameType] = {
            kingId: u.uid!,
            name: u.name,
            avatarId: u.avatarId,
            winCount: count,
          };
        }
      }
    });

    const setOps: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
    for (const [gameType, king] of Object.entries(newKings)) {
      const ref = doc(gameKingsRef, gameType);
      setOps.push((b) => b.set(ref, king));
    }
    await commitChunks(setOps);

    return { success: true, updatedCount: Object.keys(newKings).length };
  } catch (e: any) {
    console.error('Error recalculating game kings:', e);
    return { success: false, error: e?.message || 'فشل إعادة حساب ملوك الألعاب.' };
  }
}

export async function backfillPunishmentStatus() {
    const usersRef = collection(db, 'users');
    try {
        const snap = await getDocs(usersRef);
        if (snap.empty) return { success: true, count: 0 };

        const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
        let updated = 0;
        const now = new Date();

        snap.forEach((d) => {
            const u = d.data() as UserProfile;
            const hasHumiliation = (u.humiliation?.until as any)?.toDate() > now;
            const hasAvatarPunishment = (u.originalAvatarToRevert?.until as any)?.toDate() > now;
            const hasDecree = (u.decrees || []).some(dec => (dec.until as any)?.toDate() > now);
            const isPunished = !!(hasHumiliation || hasAvatarPunishment || hasDecree);
            
            if (u.isPunished !== isPunished) {
                ops.push((b) => b.update(d.ref, { isPunished }));
                updated++;
            }
        });

        await commitChunks(ops);
        return { success: true, count: snap.size };
    } catch (e: any) {
        console.error('Error backfilling punishment status:', e);
        return { success: false, count: 0, error: 'Failed to update user punishment statuses.' };
    }
}


export async function backfillUserPermissions() {
    const usersRef = collection(db, 'users');
    try {
        const [allRanks, usersSnap] = await Promise.all([getRanks(), getDocs(usersRef)]);
        if (usersSnap.empty) return { success: true, count: 0 };

        const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

        const getRank = (points: number, ranks: SocialRank[]): SocialRank | null => {
            const sortedRanks = [...ranks].sort((a, b) => b.threshold - a.threshold);
            for (const r of sortedRanks) if (points >= r.threshold) return r;
            return sortedRanks[sortedRanks.length - 1] || null;
        };

        usersSnap.forEach((d) => {
            const u = d.data() as UserProfile;
            const points = u.leaderboardPoints || 0;
            const rank = getRank(points, allRanks);
            const newPerms = rank?.permissions || [];
            const curPerms = u.permissions || [];
            const same = curPerms.length === newPerms.length && curPerms.every((p) => newPerms.includes(p));
            if (!same) ops.push((b) => b.update(d.ref, { permissions: newPerms }));
        });

        await commitChunks(ops);
        return { success: true, count: usersSnap.size };
    } catch (e: any) {
        console.error('Error backfilling user permissions:', e);
        return { success: false, count: 0, error: 'Failed to update user permissions.' };
    }
}


export async function deleteOldArticles() {
  try {
    const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const qRef = query(collection(db, 'articles'), where('createdAt', '<', sevenDaysAgo));
    const snap = await getDocs(qRef);
    if (snap.empty) return { success: true, deletedCount: 0 };

    const refs = snap.docs.map((d) => d.ref);
    let deleted = 0;

    for (const group of chunkArray(refs)) {
      const b = writeBatch(db);
      group.forEach((r) => b.delete(r));
      await batch.commit();
      deleted += group.length;
    }

    return { success: true, deletedCount: deleted };
  } catch (e: any) {
    console.error('Error deleting old articles:', e);
    return { success: false, error: 'فشل حذف المقالات القديمة.' };
  }
}
