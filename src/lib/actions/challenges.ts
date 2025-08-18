'use server';

/**
 * Challenges Service — Refactor & Hardening (GPT-5 Thinking)
 *
 * Key improvements:
 * - Safer Firestore usage (batching `in` queries, transaction hygiene, timestamp guards).
 * - Consistent timestamp handling and derived Date objects for UI.
 * - Validation on inputs and updates; prevents illegal field edits.
 * - Finalization split into two phases to avoid sending emails inside transactions.
 * - Arabic error messages preserved / improved.
 * - Utility helpers to keep code clean and testable.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
  writeBatch,
  doc,
  arrayUnion,
  updateDoc,
  deleteDoc,
  getDoc,
  increment,
  runTransaction,
  limit,
  DocumentData,
} from 'firebase/firestore';

import type {
  Challenge,
  ChallengePrize,
  Game,
  UserProfile,
  GamePointsScoredEvent,
} from '@/types';

import { sendSystemMail } from './user/mail';
import { recordGamePointsScoredEvent } from './events';

// --------------------------------------------------
// Types & Helpers
// --------------------------------------------------

type CreateChallengeInput = Omit<
  Challenge,
  'id' | 'createdAt' | 'participantIds' | 'endsAt' | 'participantCount' | 'scores' | 'claimedBy' | 'participants' | 'topParticipants' | 'winners'
> & { durationInHours: number };

const USERS_COLLECTION = 'users';
const CHALLENGES_COLLECTION = 'challenges';
const EVENTS_COLLECTION = 'social_events';
const EVENTS_TYPE_FIELD = 'type';
const EVENTS_TIMESTAMP_FIELD = 'timestamp';

const IN_MAX = 10; // Firestore `in` operator limit

/** Chunk an array to a given size. */
function chunk<T>(arr: T[], size: number = IN_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Returns Date from Firestore value. */
function asDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'number') return new Date(v);
  if (typeof v?.toDate === 'function') return v.toDate();
  return null;
}

/** Ensure a future endsAt from createdAt + hours. */
function computeEndsAt(createdAt: Date, durationInHours: number): Timestamp {
  const ms = Math.max(1, Math.floor(durationInHours)) * 60 * 60 * 1000;
  return Timestamp.fromMillis(createdAt.getTime() + ms);
}

/** Guard updates from mutating protected fields at runtime. */
function stripIllegalUpdateFields(data: Record<string, any>): Record<string, any> {
  const illegal = new Set([
    'id',
    'createdAt',
    'participantIds',
    'participantCount',
    'scores',
    'winners',
    'claimedBy',
    'participants',
    'topParticipants',
  ]);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) if (!illegal.has(k)) clean[k] = v;
  return clean;
}

/** Resolve a user-friendly name from profile; fallback gracefully. */
function getDisplayName(user?: Partial<UserProfile> | null): string {
  if (!user) return 'Unknown';
  return (
    (user as any).name ||
    (user as any).displayName ||
    (user as any).username ||
    'Unknown'
  );
}

/** Map prize type keys to user fields (normalize naming variants). */
function prizeFieldKey(type: ChallengePrize['type']): keyof UserProfile | string {
  // Normalize common aliases without breaking existing schema.
  switch (type) {
    case 'coins':
      return 'coins';
    case 'diamonds':
      return 'diamonds';
    case 'honorPoints':
    case 'honourPoints':
    case 'honor':
      return 'honorPoints';
    case 'leaderboardPoints':
    case 'points':
      return 'leaderboardPoints';
    default:
      return type as string; // allow custom prize fields if schema supports
  }
}

// --------------------------------------------------
// Create
// --------------------------------------------------

/**
 * Creates a new tournament-style challenge. Admin only.
 */
export async function createChallenge(
  challengeData: CreateChallengeInput
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!challengeData?.title) {
      return { success: false, error: 'العنوان مطلوب.' };
    }
    if (!Number.isFinite(challengeData.durationInHours) || challengeData.durationInHours <= 0) {
      return { success: false, error: 'مدة البطولة يجب أن تكون أكبر من 0 ساعة.' };
    }

    const { durationInHours, ...rest } = challengeData;
    const now = new Date();

    const newChallenge: Omit<Challenge, 'id'> = {
      ...rest,
      createdAt: serverTimestamp() as unknown as Timestamp,
      endsAt: computeEndsAt(now, durationInHours),
      participantIds: [],
      participantCount: 0,
      scores: {},
      claimedBy: [],
    } as unknown as Omit<Challenge, 'id'>;

    await addDoc(collection(db, CHALLENGES_COLLECTION), newChallenge);
    return { success: true };
  } catch (error) {
    console.error('Error creating challenge:', error);
    return { success: false, error: 'فشل إنشاء البطولة.' };
  }
}

// --------------------------------------------------
// Read (Public)
// --------------------------------------------------

/**
 * Retrieves latest challenges (paginated window) with top participants resolved in a single batched pass.
 */
export async function getChallenges(): Promise<Challenge[]> {
  try {
    const qChallenges = query(
      collection(db, CHALLENGES_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(15)
    );

    const snapshot = await getDocs(qChallenges);

    const challenges: Challenge[] = snapshot.docs.map((d) => {
      const data = d.data();
      const createdAt = asDate((data as any).createdAt) ?? new Date();
      const endsAt = asDate((data as any).endsAt) ?? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
      return {
        id: d.id,
        ...(data as DocumentData),
        createdAt,
        endsAt,
        topParticipants: [],
      } as unknown as Challenge;
    });

    // Collect unique top-3 ids across challenges
    const allTopIds = new Set<string>();
    for (const ch of challenges) {
      const scores = (ch.scores ?? {}) as Record<string, number>;
      const ids = Object.keys(scores);
      if (ids.length) {
        ids
          .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
          .slice(0, 3)
          .forEach((id) => allTopIds.add(id));
      }
    }

    // Batched user fetches to respect `in` limit
    const usersMap = new Map<string, UserProfile>();
    const idsArray = Array.from(allTopIds);
    for (const group of chunk(idsArray, IN_MAX)) {
      if (!group.length) continue;
      const qUsers = query(collection(db, USERS_COLLECTION), where('__name__', 'in', group));
      const usersSnap = await getDocs(qUsers);
      usersSnap.docs.forEach((u) => usersMap.set(u.id, { uid: u.id, ...(u.data() as DocumentData) } as UserProfile));
    }

    // Map back top participants (sorted by score desc)
    for (const ch of challenges) {
      const scores = (ch.scores ?? {}) as Record<string, number>;
      const sortedIds = Object.keys(scores).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
      const top3 = sortedIds
        .slice(0, 3)
        .map((id) => usersMap.get(id))
        .filter((u): u is UserProfile => !!u)
        .sort((a, b) => (scores[b.uid] ?? 0) - (scores[a.uid] ?? 0));
      (ch as any).topParticipants = top3;
    }

    return challenges;
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return [];
  }
}

/**
 * Gets full details for a single challenge, including the top 10 participants.
 */
export async function getChallengeDetails(challengeId: string): Promise<Challenge | null> {
  try {
    const ref = doc(db, CHALLENGES_COLLECTION, challengeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data();
    const createdAt = asDate((data as any).createdAt) ?? new Date();
    const endsAt = asDate((data as any).endsAt) ?? new Date();

    const ch: Challenge = {
      id: snap.id,
      ...(data as DocumentData),
      createdAt,
      endsAt,
    } as unknown as Challenge;

    const scores = (ch.scores ?? {}) as Record<string, number>;
    const ids = Object.keys(scores);
    if (!ids.length) {
      (ch as any).participants = [];
      return ch;
    }

    const top10 = ids.sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)).slice(0, 10);

    const participants: UserProfile[] = [];
    for (const group of chunk(top10, IN_MAX)) {
      const qUsers = query(collection(db, USERS_COLLECTION), where('__name__', 'in', group));
      const usersSnap = await getDocs(qUsers);
      usersSnap.docs.forEach((u) => participants.push({ uid: u.id, ...(u.data() as DocumentData) } as UserProfile));
    }

    (ch as any).participants = participants.sort((a, b) => (scores[b.uid] ?? 0) - (scores[a.uid] ?? 0));
    return ch;
  } catch (error) {
    console.error('Error fetching challenge details:', error);
    return null;
  }
}

// --------------------------------------------------
// Mutations (Public)
// --------------------------------------------------

/**
 * Allows a user to join a challenge.
 */
export async function joinChallenge(
  challengeId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const challengeRef = doc(db, CHALLENGES_COLLECTION, challengeId);
  const userRef = doc(db, USERS_COLLECTION, userId);

  try {
    await runTransaction(db, async (tx) => {
      const [challengeDoc, userDoc] = await Promise.all([
        tx.get(challengeRef),
        tx.get(userRef),
      ]);

      if (!challengeDoc.exists()) throw new Error('البطولة غير موجودة.');
      if (!userDoc.exists()) throw new Error('المستخدم غير موجود.');

      const ch = challengeDoc.data() as Challenge;
      const now = new Date();
      const endsAt = asDate((ch as any).endsAt) ?? now;
      if (endsAt.getTime() <= now.getTime()) {
        throw new Error('انتهت مدة البطولة، لا يمكن الانضمام.');
      }

      const participants = (ch.participantIds ?? []) as string[];
      if (participants.includes(userId)) throw new Error('أنت مشترك بالفعل في هذه البطولة.');

      // Handle entry fee (optional)
      const fee = (ch as any).entryFee as { type?: string; value?: number } | undefined;
      if (fee && fee.value && fee.value > 0 && fee.type) {
        const key = prizeFieldKey(fee.type as any);
        const user = userDoc.data() as UserProfile;
        const current = (user as any)[key] ?? 0;
        if ((current as number) < fee.value) {
          const label = key === 'coins' ? 'الكوينز' : key === 'leaderboardPoints' ? 'نقاط الصدارة' : String(key);
          throw new Error(`ليس لديك ما يكفي من ${label} للانضمام (المطلوب: ${fee.value}).`);
        }
        tx.update(userRef, { [key]: increment(-fee.value) });
      }

      tx.update(challengeRef, {
        participantIds: arrayUnion(userId),
        participantCount: increment(1),
        [`scores.${userId}`]: 0,
      });

      tx.update(userRef, {
        challenges: arrayUnion({ id: challengeId, title: (ch as any).title, joinedAt: Timestamp.now() }),
      });
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error joining challenge:', error);
    return { success: false, error: error?.message || 'فشل الانضمام للبطولة.' };
  }
}

// --------------------------------------------------
// Admin Mutations
// --------------------------------------------------

/**
 * Updates an existing challenge. Admin only.
 */
export async function updateChallenge(
  challengeId: string,
  data: Partial<Omit<Challenge, 'id' | 'createdAt' | 'participantCount' | 'participantIds' | 'scores' | 'winners' | 'claimedBy'>> & {
    durationInHours?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = doc(db, CHALLENGES_COLLECTION, challengeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('البطولة غير موجودة.');

    const ch = snap.data() as Challenge;
    const cleanUpdate = stripIllegalUpdateFields({ ...data });

    if (typeof cleanUpdate.durationInHours !== 'undefined') {
      const createdAt = asDate((ch as any).createdAt) ?? new Date();
      cleanUpdate.endsAt = computeEndsAt(createdAt, Number(cleanUpdate.durationInHours));
      delete (cleanUpdate as any).durationInHours;
    }

    await updateDoc(ref, cleanUpdate);
    return { success: true };
  } catch (error: any) {
    console.error('Error updating challenge:', error);
    return { success: false, error: 'فشل تحديث البطولة.' };
  }
}

/**
 * Deletes a challenge. Admin only.
 */
export async function deleteChallenge(challengeId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteDoc(doc(db, CHALLENGES_COLLECTION, challengeId));
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting challenge:', error);
    return { success: false, error: 'فشل حذف البطولة.' };
  }
}

/**
 * Admin list (larger page) — latest 50.
 */
export async function getAllChallengesForAdmin(): Promise<Challenge[]> {
  try {
    const qChallenges = query(
      collection(db, CHALLENGES_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snapshot = await getDocs(qChallenges);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...(data as DocumentData),
        createdAt: asDate((data as any).createdAt) ?? new Date(),
        endsAt: asDate((data as any).endsAt) ?? new Date(),
      } as unknown as Challenge;
    });
  } catch (error) {
    console.error('Error fetching all challenges for admin:', error);
    return [];
  }
}

// --------------------------------------------------
// Scoring & Finalization
// --------------------------------------------------

/**
 * Rebuild scores for a given challenge based on GamePointsScoredEvent within window.
 * Writes the recomputed scores to the challenge document and returns them.
 */
async function updateChallengeScores(challenge: Challenge): Promise<Record<string, number>> {
  const participants: string[] = (challenge.participantIds ?? []) as string[];
  if (!participants.length) return challenge.scores ?? {};

  const createdAt = asDate((challenge as any).createdAt) ?? new Date(0);
  const endsAt = asDate((challenge as any).endsAt) ?? new Date();

  // Build query — prefer using Timestamp for range filters
  const qEvents = query(
    collection(db, EVENTS_COLLECTION),
    where(EVENTS_TYPE_FIELD, '==', 'game_points_scored'),
    where(EVENTS_TIMESTAMP_FIELD, '>=', Timestamp.fromMillis(createdAt.getTime())),
    where(EVENTS_TIMESTAMP_FIELD, '<=', Timestamp.fromMillis(endsAt.getTime()))
  );

  const snap = await getDocs(qEvents);
  const newScores: Record<string, number> = Object.fromEntries(participants.map((id) => [id, 0]));

  snap.docs.forEach((d) => {
    const ev = d.data() as GamePointsScoredEvent;
    const pid = (ev as any).playerId as string;
    const gtype = (ev as any).gameType as Game | 'all' | undefined;
    const pts = (ev as any).points as number;

    if (!pid || typeof pts !== 'number') return;

    const allowGame = (challenge as any).specificGameType === 'all' || !((challenge as any).specificGameType) || (challenge as any).specificGameType === gtype;
    if (allowGame && participants.includes(pid)) {
      newScores[pid] = (newScores[pid] ?? 0) + pts;
    }
  });

  await updateDoc(doc(db, CHALLENGES_COLLECTION, (challenge as any).id), { scores: newScores });
  return newScores;
}

/**
 * Finalizes a challenge, computes top 3, writes winners, and awards prizes.
 *
 * NOTE: We recompute scores BEFORE the transaction, then in a transaction we
 * write winners + balances (no external calls). After commit, we send mails.
 */
export async function finalizeChallenge(
  challengeId: string
): Promise<{ success: boolean; winnersCount: number; error?: string }> {
  const challengeRef = doc(db, CHALLENGES_COLLECTION, challengeId);

  try {
    // Phase 1: Ensure scores are up to date (outside transaction)
    const existing = await getDoc(challengeRef);
    if (!existing.exists()) throw new Error('Challenge not found.');
    const challengeData = { id: existing.id, ...(existing.data() as DocumentData) } as unknown as Challenge;

    // Optional: prevent early finalization
    const now = new Date();
    const endsAt = asDate((challengeData as any).endsAt) ?? now;
    if (now.getTime() < endsAt.getTime()) {
      // Allowing finalization before end is usually a mistake — guard it.
      throw new Error('لا يمكن إنهاء البطولة قبل موعد الانتهاء.');
    }

    await updateChallengeScores(challengeData);

    // Phase 2: Transaction — compute winners and award prizes
    type AwardPlan = { userId: string; prize: ChallengePrize[]; rank: 1 | 2 | 3 };
    const awardPlans: AwardPlan[] = [];
    let winnersWritten: number = 0;
    let winnersPayload: Challenge['winners'] | undefined;

    await runTransaction(db, async (tx) => {
      const fresh = await tx.get(challengeRef);
      if (!fresh.exists()) throw new Error('Challenge not found.');
      const ch = fresh.data() as Challenge;

      if ((ch as any).winners) {
        // Already finalized
        winnersWritten = Object.keys((ch as any).winners || {}).length;
        winnersPayload = (ch as any).winners;
        return;
      }

      const scores = (ch.scores ?? {}) as Record<string, number>;
      const sorted = Object.entries(scores).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

      const winners: Challenge['winners'] = {} as Challenge['winners'];

      if (sorted[0]) {
        const firstId = sorted[0][0];
        winners.first = { id: firstId, name: 'Unknown' } as any;
        if ((ch as any).firstPlacePrize?.length) awardPlans.push({ userId: firstId, prize: (ch as any).firstPlacePrize, rank: 1 });
      }
      if (sorted[1]) {
        const secondId = sorted[1][0];
        winners.second = { id: secondId, name: 'Unknown' } as any;
        if ((ch as any).secondPlacePrize?.length) awardPlans.push({ userId: secondId, prize: (ch as any).secondPlacePrize, rank: 2 });
      }
      if (sorted[2]) {
        const thirdId = sorted[2][0];
        winners.third = { id: thirdId, name: 'Unknown' } as any;
        if ((ch as any).thirdPlacePrize?.length) awardPlans.push({ userId: thirdId, prize: (ch as any).thirdPlacePrize, rank: 3 });
      }

      // Apply balance updates inside the transaction, but DO NOT send emails here.
      for (const plan of awardPlans) {
        const uref = doc(db, USERS_COLLECTION, plan.userId);
        const updates: Record<string, any> = {};
        for (const p of plan.prize) {
          const key = prizeFieldKey(p.type);
          updates[key] = increment(p.value);
        }
        tx.update(uref, updates);
      }

      tx.update(challengeRef, { winners, claimedBy: [] });

      winnersWritten = Object.keys(winners).length;
      winnersPayload = winners;
    });

    // Phase 3: Post-commit side effects — Fetch winner names & send mails
    if (winnersWritten > 0 && winnersPayload) {
      const ids = [winnersPayload.first?.id, winnersPayload.second?.id, winnersPayload.third?.id].filter(Boolean) as string[];

      const usersMap = new Map<string, UserProfile>();
      for (const group of chunk(ids, IN_MAX)) {
        const qUsers = query(collection(db, USERS_COLLECTION), where('__name__', 'in', group));
        const usersSnap = await getDocs(qUsers);
        usersSnap.docs.forEach((u) => usersMap.set(u.id, u.data() as UserProfile));
      }

      const firstName = winnersPayload.first ? getDisplayName(usersMap.get(winnersPayload.first.id)) : undefined;
      const secondName = winnersPayload.second ? getDisplayName(usersMap.get(winnersPayload.second.id)) : undefined;
      const thirdName = winnersPayload.third ? getDisplayName(usersMap.get(winnersPayload.third.id)) : undefined;

      // Update names (best-effort, no race impact if it fails)
      await updateDoc(challengeRef, {
        'winners.first.name': firstName ?? 'Unknown',
        'winners.second.name': secondName ?? 'Unknown',
        'winners.third.name': thirdName ?? 'Unknown',
      }).catch(() => void 0);

      // Send mails (non-transactional, avoids duplicates on txn retries)
      const mailPlans: Array<{ uid: string; rank: number; prizes: ChallengePrize[] }> = [];
      if (winnersPayload.first && (existing.data() as any).firstPlacePrize?.length) mailPlans.push({ uid: winnersPayload.first.id, rank: 1, prizes: (existing.data() as any).firstPlacePrize });
      if (winnersPayload.second && (existing.data() as any).secondPlacePrize?.length) mailPlans.push({ uid: winnersPayload.second.id, rank: 2, prizes: (existing.data() as any).secondPlacePrize });
      if (winnersPayload.third && (existing.data() as any).thirdPlacePrize?.length) mailPlans.push({ uid: winnersPayload.third.id, rank: 3, prizes: (existing.data() as any).thirdPlacePrize });

      for (const m of mailPlans) {
        const desc = m.prizes
          .map((p) => `${p.value} ${p.type === 'coins' ? 'كوينز' : p.type === 'diamonds' ? 'ألماس' : p.type === 'leaderboardPoints' ? 'نقاط الصدارة' : 'نقاط شرف'}`)
          .join('، ');
        await sendSystemMail(m.uid, {
          subject: `لقد فزت بالمركز ${m.rank} في البطولة!`,
          body: `تهانينا! لقد فزت بالمركز ${m.rank} في بطولة "${(challengeData as any).title}". تمت إضافة: ${desc} إلى رصيدك.`,
        }).catch(() => void 0);
      }
    }

    return { success: true, winnersCount: winnersWritten };
  } catch (error: any) {
    console.error('Error finalizing challenge:', error);
    return { success: false, winnersCount: 0, error: error?.message };
  }
}

// --------------------------------------------------
// Notes / Indexes (for reference)
// --------------------------------------------------
/**
 * Required Firestore indexes (ensure via Firebase console):
 * - social_events: composite index on (type == 'game_points_scored', timestamp ASC/DESC) for the range query.
 * - challenges: createdAt ordered queries.
 */
