
'use server';

import { db } from '@/lib/firebase';
import { collection, doc, getDocs, writeBatch, runTransaction, Timestamp, updateDoc } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { getRanks } from '../user/queries';

async function commitChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  const BATCH_LIMIT_SAFE = 450;
  if (ops.length === 0) return;
  const batches = [];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT_SAFE) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT_SAFE).forEach(op => op(batch));
    batches.push(batch.commit());
  }
  await Promise.all(batches);
}

/**
 * Iterates through all users to fix the isPunished status.
 * Expensive: reads all users. Use only for maintenance.
 */
export async function backfillPunishmentStatus(): Promise<{ success: boolean; error?: string; count?: number }> {
    try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        if (snapshot.empty) return { success: true, count: 0 };

        const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
        let updatedCount = 0;
        const now = new Date();

        snapshot.forEach(docSnap => {
            const user = docSnap.data() as UserProfile;
            const humiliationActive = user.humiliation?.until && new Date((user.humiliation.until as any).toDate()) > now;
            const avatarActive = user.originalAvatarToRevert?.until && new Date((user.originalAvatarToRevert.until as any).toDate()) > now;
            const decreesActive = (user.decrees || []).some(d => d.until && new Date((d.until as any).toDate()) > now);
            const shouldBePunished = !!(humiliationActive || avatarActive || decreesActive);

            if ((user.isPunished ?? false) !== shouldBePunished) {
                ops.push(b => b.update(docSnap.ref, { isPunished: shouldBePunished }));
                updatedCount++;
            }
        });

        await commitChunks(ops);
        return { success: true, count: updatedCount };
    } catch (e: any) {
        console.error("Error in backfillPunishmentStatus:", e);
        return { success: false, error: e.message || 'فشل تحديث حالات العقوبة.' };
    }
}

/**
 * Iterates through all users and updates their `permissions` field based on their current rank.
 * Expensive: reads all users. Use only for one-time maintenance or after rank changes.
 */
export async function backfillUserPermissions(): Promise<{ success: boolean; error?: string; count?: number }> {
    try {
        const allRanks = await getRanks();
        if (allRanks.length === 0) return { success: false, error: "لم يتم العثور على أي ألقاب." };
        const sortedRanks = [...allRanks].sort((a, b) => b.threshold - a.threshold);

        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        if (snapshot.empty) return { success: true, count: 0 };

        const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
        let updatedCount = 0;

        snapshot.forEach(docSnap => {
            const user = docSnap.data() as UserProfile;
            const points = user.leaderboardPoints || 0;
            const currentRank = sortedRanks.find(r => points >= r.threshold) || sortedRanks[sortedRanks.length - 1];
            const correctPermissions = currentRank?.permissions || [];
            
            // Compare arrays for equality (order doesn't matter)
            const currentPermissions = new Set(user.permissions || []);
            const newPermissions = new Set(correctPermissions);
            const areSame = currentPermissions.size === newPermissions.size && [...currentPermissions].every(p => newPermissions.has(p));

            if (!areSame) {
                ops.push(b => b.update(docSnap.ref, { permissions: correctPermissions }));
                updatedCount++;
            }
        });

        await commitChunks(ops);
        return { success: true, count: updatedCount };
    } catch (e: any) {
        console.error("Error in backfillUserPermissions:", e);
        return { success: false, error: e.message || 'فشل تحديث صلاحيات المستخدمين.' };
    }
}
