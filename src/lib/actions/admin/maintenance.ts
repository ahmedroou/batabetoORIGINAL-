'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, writeBatch, Timestamp } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { getRanks } from '../user/queries';

/** نوع لعملية تضاف إلى batch بدون كسر التسمية والمنطق الأصلي */
type BatchOp = (b: ReturnType<typeof writeBatch>) => void;

/** حد آمن لكل batch (أقل من 500 حد فايرستور) */
const BATCH_LIMIT_SAFE = 450;

/** أداة عامة لتجزئة وكتابة العمليات على دفعات */
async function commitChunks(ops: BatchOp[]) {
  if (!ops || ops.length === 0) return;

  const commits: Promise<void>[] = [];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT_SAFE) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT_SAFE)) op(batch);
    commits.push(batch.commit());
  }
  await Promise.all(commits);
}

/* ============================== */
/*     أدوات مساعدة Utilities     */
/* ============================== */

/** يحوّل أي قيمة تاريخية (Timestamp/Date/number/string) إلى millis أو null */
function toMillis(value: unknown): number | null {
  if (value == null) return null;

  // Firestore Timestamp
  if (value instanceof Timestamp) return value.toMillis();

  // Date
  if (value instanceof Date) return value.getTime();

  // number (millis)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  // string (ISO أو أي parse-able)
  if (typeof value === 'string') {
    const d = new Date(value);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }

  // كائن يملك toDate() (بعض أنواع السيريالايز)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybe = value as any;
  if (maybe && typeof maybe.toDate === 'function') {
    const d = maybe.toDate();
    if (d instanceof Date) return d.getTime();
  }

  return null;
}

/** هل until مستقبلية (مازالت فعالة) مقارنةً بالآن؟ */
function isActiveUntil(until: unknown, nowMs: number): boolean {
  const t = toMillis(until);
  return t != null && t > nowMs;
}

/** مقارنة مجموعتين بدون اعتبار الترتيب */
function setsEqual<T>(a: Iterable<T>, b: Iterable<T>): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}

/* ================================================= */
/*    1) Backfill لعَلم العقوبة isPunished          */
/* ================================================= */

/**
 * Iterates through all users to fix the isPunished status.
 * Expensive: reads all users. Use only for maintenance.
 */
export async function backfillPunishmentStatus(): Promise<{
  success: boolean;
  error?: string;
  count?: number;
}> {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    if (snapshot.empty) return { success: true, count: 0 };

    const ops: BatchOp[] = [];
    let updatedCount = 0;
    const nowMs = Date.now();

    snapshot.forEach((docSnap) => {
      const user = docSnap.data() as UserProfile;

      const humiliationActive = isActiveUntil(user?.humiliation?.until, nowMs);
      const avatarActive = isActiveUntil(user?.originalAvatarToRevert?.until, nowMs);
      const decreesActive = Array.isArray(user?.decrees)
        ? user.decrees.some((d) => isActiveUntil(d?.until, nowMs))
        : false;

      const shouldBePunished = Boolean(humiliationActive || avatarActive || decreesActive);
      const current = Boolean(user.isPunished ?? false);

      if (current !== shouldBePunished) {
        ops.push((b) => b.update(docSnap.ref, { isPunished: shouldBePunished }));
        updatedCount++;
      }
    });

    await commitChunks(ops);
    return { success: true, count: updatedCount };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Error in backfillPunishmentStatus:', e);
    return { success: false, error: message || 'فشل تحديث حالات العقوبة.' };
  }
}

/* ================================================= */
/*  2) Backfill لصلاحيات المستخدم بناءً على الرتبة   */
/* ================================================= */

/**
 * Iterates through all users and updates their `permissions` field based on their current rank.
 * Expensive: reads all users. Use only for one-time maintenance or after rank changes.
 */
export async function backfillUserPermissions(): Promise<{
  success: boolean;
  error?: string;
  count?: number;
}> {
  try {
    const allRanks = await getRanks();
    if (!allRanks || allRanks.length === 0) {
      return { success: false, error: 'لم يتم العثور على أي ألقاب.' };
    }

    // الأعلى threshold أولًا
    const sortedRanks = [...allRanks].sort((a, b) => b.threshold - a.threshold);

    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    if (snapshot.empty) return { success: true, count: 0 };

    const ops: BatchOp[] = [];
    let updatedCount = 0;

    snapshot.forEach((docSnap) => {
      const user = docSnap.data() as UserProfile;
      const points = Number(user.leaderboardPoints ?? 0);

      // أقرب رتبة مناسبة لنقاط المستخدم (أعلى threshold لا يتجاوزه)
      const currentRank =
        sortedRanks.find((r) => points >= r.threshold) ??
        sortedRanks[sortedRanks.length - 1];

      const correctPermissions = Array.isArray(currentRank?.permissions)
        ? currentRank.permissions
        : [];

      const currentPermissions = Array.isArray(user.permissions) ? user.permissions : [];
      if (!setsEqual(currentPermissions, correctPermissions)) {
        ops.push((b) => b.update(docSnap.ref, { permissions: correctPermissions }));
        updatedCount++;
      }
    });

    await commitChunks(ops);
    return { success: true, count: updatedCount };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Error in backfillUserPermissions:', e);
    return { success: false, error: message || 'فشل تحديث صلاحيات المستخدمين.' };
  }
}
