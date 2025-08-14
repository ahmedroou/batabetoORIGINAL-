
'use server';

/**
 * @fileoverview Advanced clan (teams) actions: creation, membership, roles, treasury, wars, ELO, quests, logs.
 * - Designed for Firestore with strong transactional guarantees and scalable data layout.
 * - Arabic messages; clean TypeScript signatures; rich features to power premium UI/UX.
 */

import { db } from '@/lib/firebase';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  limit,
  startAfter
} from 'firebase/firestore';
import type {
  Clan,
  ClanMember,
  ClanWarInvitation,
  Game,
  Player,
  UserProfile,
} from '@/types';
import { getPlayerFromUserId } from './user';

/** ----------------------------------------------------------------------
 * Utils & constants
 * -----------------------------------------------------------------------*/

const CLAN_CREATE_COST = 5; // coins
const CLAN_MAX_OFFICERS = 4;
const CLAN_MAX_MEMBERS = 50;
const CLAN_MIN_NAME = 2;
const CLAN_MAX_NAME = 18;
const DAILY_WITHDRAW_LIMIT = 20; // coins from treasury per leader/officer per day
const ELO_DEFAULT = 1000;
const ELO_K = 32;

const RESERVED_NAMES = new Set(['admin', 'official', 'staff', 'system']);

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[\u064B-\u065F\u0670]/g, '') // Arabic diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/[يى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[^a-z0-9\u0600-\u06FF]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const makeSlug = (name: string) => normalize(name);

type ClanRole = 'leader' | 'officer' | 'member';

interface PaginationOpts {
  limit?: number;
  cursor?: string; // doc id to startAfter
  sortBy?: 'totalPoints' | 'totalHonorPoints' | 'elo' | 'createdAt';
  order?: 'asc' | 'desc';
}

/**
 * Light-weight activity log unit stored in a subcollection per clan to avoid hot arrays.
 */
interface ClanLogEntry {
  type:
    | 'create'
    | 'invite_sent'
    | 'invite_revoked'
    | 'invite_accepted'
    | 'invite_rejected'
    | 'join_requested'
    | 'join_approved'
    | 'join_rejected'
    | 'leave'
    | 'kick'
    | 'promote'
    | 'demote'
    | 'transfer_leadership'
    | 'profile_update'
    | 'donate'
    | 'withdraw'
    | 'war_invite'
    | 'war_accept'
    | 'war_reject'
    | 'war_result'
    | 'shop_purchase';
  actorId: string;
  actorName: string;
  message: string;
  createdAt: Timestamp;
  meta?: Record<string, any>;
}

/** ----------------------------------------------------------------------
 * Validation helpers
 * -----------------------------------------------------------------------*/

function assertName(name: string) {
  if (!name || !name.trim()) throw new Error('اسم الفريق مطلوب.');
  const clean = name.trim();
  if (clean.length < CLAN_MIN_NAME) throw new Error('اسم الفريق قصير جدًا.');
  if (clean.length > CLAN_MAX_NAME) throw new Error('اسم الفريق طويل جدًا.');
  if (RESERVED_NAMES.has(clean.toLowerCase())) throw new Error('اسم الفريق غير متاح.');
}

async function assertUniqueClanName(transaction: FirebaseFirestore.Transaction | null, name: string) {
  const slug = makeSlug(name);
  const q = query(collection(db, 'clans'), where('slug', '==', slug));
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error('اسم الفريق محجوز مسبقًا.');
}

function assertRole(role: ClanRole) {
  if (!['leader', 'officer', 'member'].includes(role)) throw new Error('رتبة غير صالحة.');
}

/** ----------------------------------------------------------------------
 * Internal fetchers
 * -----------------------------------------------------------------------*/

async function getClanDoc(clanId: string) {
  const ref = doc(db, 'clans', clanId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('لم يتم العثور على الفريق.');
  return { ref, data: snapshot.data() as Clan, snapshot };
}


async function logClanEvent(clanId: string, entry: Omit<ClanLogEntry, 'createdAt'>) {
  const logsRef = collection(db, 'clans', clanId, 'logs');
  await setDoc(doc(logsRef), { ...entry, createdAt: Timestamp.now() } satisfies ClanLogEntry);
}

function canManage(actingRole: ClanRole) {
  return actingRole === 'leader' || actingRole === 'officer';
}

function ensureMemberRole(member?: ClanMember): asserts member is ClanMember {
  if (!member) throw new Error('عضو غير موجود.');
}

/** ----------------------------------------------------------------------
 * Core actions
 * -----------------------------------------------------------------------*/

/**
 * Create a clan with unique name, slug, emblem & theme, and seed metrics.
 */
export async function createClan(
  userId: string,
  clanName: string,
  opts?: { emblem?: string; color?: string; description?: string; region?: string }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    assertName(clanName);
    await assertUniqueClanName(null, clanName);

    const userRef = doc(db, 'users', userId);
    const clanRef = doc(collection(db, 'clans'));

    const emblem = opts?.emblem || 'Avatar000.png';
    const color = opts?.color || '#ffffff';

    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error('لم يتم العثور على المستخدم.');
      const user = userSnap.data() as UserProfile;
      if (user.clan) throw new Error('أنت عضو بالفعل في فريق.');
      if ((user.coins || 0) < CLAN_CREATE_COST) throw new Error('ليس لديك ما يكفي من الكوينز لإنشاء فريق.');

      const newMember: ClanMember = {
        id: userId,
        name: user.name,
        avatarId: user.avatarId,
        leaderboardPoints: user.leaderboardPoints || 0,
        role: 'leader',
      };

      const now = Timestamp.now();
      const slug = makeSlug(clanName);

      tx.set(clanRef, {
        name: clanName,
        slug,
        emblem,
        color,
        description: opts?.description || '',
        region: opts?.region || 'global',
        leaderId: userId,
        members: [newMember],
        totalPoints: (user.leaderboardPoints || 0) * 2,
        totalHonorPoints: user.honorPoints || 0,
        elo: ELO_DEFAULT,
        wins: 0,
        losses: 0,
        draws: 0,
        treasury: 0,
        unlockedEmblems: [emblem],
        invitations: [], // legacy array; new system uses subcollections
        createdAt: now,
        updatedAt: now,
        privacy: 'public', // public | closed | invite_only
        badges: [],
        settings: { recruitmentOpen: true, chatEnabled: true },
      } as Partial<Clan>);

      tx.update(userRef, {
        coins: increment(-CLAN_CREATE_COST),
        clan: { id: clanRef.id, name: clanName, emblem },
        clanRole: 'leader',
      });
    });

    await logClanEvent(clanRef.id, {
      type: 'create',
      actorId: userId,
      actorName: 'system',
      message: `تم إنشاء الفريق \"${clanName}\"`,
    });

    return { success: true, id: clanRef.id };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل إنشاء الفريق.' };
  }
}

/**
 * Paginated clan listing with flexible sorting for leaderboards UI.
 */
export async function getClans(opts: PaginationOpts = {}): Promise<Clan[]> {
    const { limit: queryLimit = 20, cursor, sortBy = 'totalPoints', order = 'desc' } = opts;
    try {
        const col = collection(db, 'clans');
        let q = query(col, orderBy(sortBy, order), limit(queryLimit));

        if (cursor) {
            const cursorDoc = await getDoc(doc(db, 'clans', cursor));
            if (cursorDoc.exists()) {
                q = query(col, orderBy(sortBy, order), startAfter(cursorDoc), limit(queryLimit));
            }
        }
        
        const snap = await getDocs(q);
        const clans: Clan[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        return clans;
    } catch (e) {
        console.error('Error fetching clans:', e);
        return [];
    }
}


/**
 * Update clan profile: name, emblem, color, description, privacy, region.
 */
export async function updateClanProfile(
  clanId: string,
  actingUserId: string,
  patch: Partial<Pick<Clan, 'name' | 'emblem' | 'color' | 'description' | 'privacy' | 'region' | 'settings'>>
) {
  try {
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const clanSnap = await tx.get(clanRef);
      if (!clanSnap.exists()) throw new Error('لم يتم العثور على الفريق.');
      const clan = clanSnap.data() as Clan;

      const member = clan.members.find((m) => m.id === actingUserId);
      ensureMemberRole(member);
      if (!canManage(member.role as ClanRole)) throw new Error('ليس لديك صلاحية تعديل ملف الفريق.');

      const update: any = { updatedAt: Timestamp.now() };
      if (patch.name && patch.name !== clan.name) {
        assertName(patch.name);
        await assertUniqueClanName(null, patch.name);
        update.name = patch.name;
        update.slug = makeSlug(patch.name);
      }
      if (patch.emblem) update.emblem = patch.emblem;
      if (patch.color) update.color = patch.color;
      if (patch.description !== undefined) update.description = patch.description;
      if (patch.privacy) update.privacy = patch.privacy;
      if (patch.region) update.region = patch.region;
      if (patch.settings) update.settings = patch.settings;

      tx.update(clanRef, update);
    });

    await logClanEvent(clanId, {
      type: 'profile_update',
      actorId: actingUserId,
      actorName: 'system',
      message: 'تم تحديث ملف الفريق',
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Apply to join clan (for public/open recruitment). Stored in subcollection to avoid hot array writes.
 */
export async function requestToJoinClan(
  userId: string,
  clanId: string,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { ref: clanRef } = await getClanDoc(clanId);
    const userRef = doc(db, 'users', userId);

    await runTransaction(db, async (tx) => {
      const [userSnap, clanSnap] = await Promise.all([tx.get(userRef), tx.get(clanRef)]);
      if (!userSnap.exists()) throw new Error('مستخدم غير موجود.');
      if (!clanSnap.exists()) throw new Error('فريق غير موجود.');

      const user = userSnap.data() as UserProfile;
      const c = clanSnap.data() as Clan;
      if (user.clan) throw new Error('أنت عضو بالفعل في فريق.');
      if (c.members.length >= CLAN_MAX_MEMBERS) throw new Error('الفريق ممتلئ.');
      if (c.privacy === 'closed') throw new Error('هذا الفريق مغلق ولا يقبل طلبات.');

      const reqRef = doc(collection(db, 'clans', clanId, 'join_requests'));
      tx.set(reqRef, {
        id: reqRef.id,
        userId,
        userName: user.name,
        avatarId: user.avatarId,
        message: message || '',
        createdAt: Timestamp.now(),
        status: 'pending',
      });
    });

    await logClanEvent(clanId, {
      type: 'join_requested',
      actorId: userId,
      actorName: 'system',
      message: 'تم إرسال طلب الانضمام',
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Approve / reject pending join request */
export async function respondToJoinRequest(
  clanId: string,
  actingUserId: string,
  requestId: string,
  decision: 'approved' | 'rejected'
) {
  try {
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const reqRef = doc(db, 'clans', clanId, 'join_requests', requestId);
      const userRef = (await tx.get(reqRef)).data()?.userId
        ? doc(db, 'users', (await tx.get(reqRef)).data()!.userId)
        : null;

      const clanSnap = await tx.get(clanRef);
      if (!clanSnap.exists()) throw new Error('فريق غير موجود.');
      const clan = clanSnap.data() as Clan;

      const actor = clan.members.find((m) => m.id === actingUserId);
      ensureMemberRole(actor);
      if (!canManage(actor.role as ClanRole)) throw new Error('ليس لديك صلاحية معالجة الطلبات.');

      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new Error('طلب غير موجود.');
      const req = reqSnap.data() as any;
      if (req.status !== 'pending') throw new Error('تمت معالجة الطلب مسبقًا.');

      if (decision === 'rejected') {
        tx.update(reqRef, { status: 'rejected', decidedAt: Timestamp.now() });
        return;
      }

      if (clan.members.length >= CLAN_MAX_MEMBERS) throw new Error('الفريق ممتلئ.');
      if (!userRef) throw new Error('مستخدم غير صالح.');

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error('مستخدم غير موجود.');
      const user = userSnap.data() as UserProfile;
      if (user.clan) throw new Error('المستخدم عضو بالفعل في فريق.');

      const newMember: ClanMember = {
        id: userRef.id,
        name: user.name,
        avatarId: user.avatarId,
        leaderboardPoints: user.leaderboardPoints || 0,
        role: 'member',
      };

      tx.update(clanRef, {
        members: arrayUnion(newMember),
        updatedAt: Timestamp.now(),
      });
      tx.update(userRef, { clan: { id: clanId, name: clan.name, emblem: clan.emblem }, clanRole: 'member' });
      tx.update(reqRef, { status: 'approved', decidedAt: Timestamp.now() });
    });

    await logClanEvent(clanId, {
      type: 'join_approved',
      actorId: actingUserId,
      actorName: 'system',
      message: 'تمت الموافقة على طلب الانضمام',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Invite a user to join clan (invite-only flow) */
export async function inviteUserToClan(
  clanId: string,
  actingUserId: string,
  targetUserId: string
) {
  try {
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const targetUserRef = doc(db, 'users', targetUserId);

      const [clanSnap, targetSnap] = await Promise.all([tx.get(clanRef), tx.get(targetUserRef)]);
      if (!clanSnap.exists()) throw new Error('فريق غير موجود.');
      if (!targetSnap.exists()) throw new Error('المستخدم غير موجود.');

      const clan = clanSnap.data() as Clan;
      const actor = clan.members.find((m) => m.id === actingUserId);
      ensureMemberRole(actor);
      if (!canManage(actor.role as ClanRole)) throw new Error('ليس لديك صلاحية الدعوة.');

      if (clan.members.length >= CLAN_MAX_MEMBERS) throw new Error('الفريق ممتلئ.');
      const target = targetSnap.data() as UserProfile;
      if (target.clan) throw new Error('المستخدم عضو في فريق بالفعل.');

      const invRef = doc(collection(db, 'clans', clanId, 'invites'));
      tx.set(invRef, {
        id: invRef.id,
        userId: targetUserId,
        userName: target.name,
        avatarId: target.avatarId,
        createdAt: Timestamp.now(),
        status: 'pending',
      });
    });

    await logClanEvent(clanId, {
      type: 'invite_sent',
      actorId: actingUserId,
      actorName: 'system',
      message: 'تم إرسال دعوة انضمام',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function respondToClanInvite(
  clanId: string,
  inviteId: string,
  userId: string,
  decision: 'accepted' | 'rejected'
) {
  try {
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const invRef = doc(db, 'clans', clanId, 'invites', inviteId);
      const userRef = doc(db, 'users', userId);

      const [clanSnap, invSnap, userSnap] = await Promise.all([tx.get(clanRef), tx.get(invRef), tx.get(userRef)]);
      if (!clanSnap.exists() || !invSnap.exists() || !userSnap.exists()) throw new Error('بيانات غير صالحة.');
      const clan = clanSnap.data() as Clan;
      const inv = invSnap.data() as any;
      const user = userSnap.data() as UserProfile;

      if (inv.status !== 'pending' || inv.userId !== userId) throw new Error('دعوة غير صالحة.');

      if (decision === 'rejected') {
        tx.update(invRef, { status: 'rejected', decidedAt: Timestamp.now() });
        return;
      }

      if (user.clan) throw new Error('أنت عضو بالفعل في فريق.');
      if (clan.members.length >= CLAN_MAX_MEMBERS) throw new Error('الفريق ممتلئ.');

      const newMember: ClanMember = {
        id: userId,
        name: user.name,
        avatarId: user.avatarId,
        leaderboardPoints: user.leaderboardPoints || 0,
        role: 'member',
      };
      tx.update(clanRef, { members: arrayUnion(newMember), updatedAt: Timestamp.now() });
      tx.update(userRef, { clan: { id: clanId, name: clan.name, emblem: clan.emblem }, clanRole: 'member' });
      tx.update(invRef, { status: 'accepted', decidedAt: Timestamp.now() });
    });

    await logClanEvent(clanId, {
      type: 'invite_accepted',
      actorId: userId,
      actorName: 'system',
      message: 'تم قبول دعوة الانضمام',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Leave / kick / role management */
export async function leaveClan(userId: string, clanId: string) {
  try {
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const userRef = doc(db, 'users', userId);

      const clanSnap = await tx.get(clanRef);
      const userSnap = await tx.get(userRef);
      if (!clanSnap.exists() || !userSnap.exists()) throw new Error('بيانات غير صالحة.');
      const clan = clanSnap.data() as Clan;
      const user = userSnap.data() as UserProfile;
      if (!user.clan || user.clan.id !== clanId) throw new Error('لست عضوًا في هذا الفريق.');

      const member = clan.members.find((m) => m.id === userId);
      ensureMemberRole(member);
      if (member.role === 'leader' && clan.members.length > 1)
        throw new Error('انقل القيادة أولاً قبل مغادرة الفريق.');

      const updatedMembers = clan.members.filter((m) => m.id !== userId);
      const update: any = { members: updatedMembers, updatedAt: Timestamp.now() };
      if (updatedMembers.length === 0) update.disbandedAt = Timestamp.now();
      tx.update(clanRef, update);
      tx.update(userRef, { clan: deleteField(), clanRole: deleteField() });
    });

    await logClanEvent(clanId, {
      type: 'leave',
      actorId: userId,
      actorName: 'system',
      message: 'غادر الفريق',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function transferLeadership(clanId: string, leaderId: string, newLeaderId: string) {
  try {
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const clanSnap = await tx.get(clanRef);
      if (!clanSnap.exists()) throw new Error('فريق غير موجود.');
      const clan = clanSnap.data() as Clan;

      if (clan.leaderId !== leaderId) throw new Error('فقط القائد يمكنه نقل القيادة.');
      const target = clan.members.find((m) => m.id === newLeaderId);
      ensureMemberRole(target);

      const updated = clan.members.map((m) =>
        m.id === newLeaderId ? { ...m, role: 'leader' } : m.id === leaderId ? { ...m, role: 'officer' } : m
      );

      tx.update(clanRef, { members: updated, leaderId: newLeaderId, updatedAt: Timestamp.now() });
    });

    await logClanEvent(clanId, {
      type: 'transfer_leadership',
      actorId: leaderId,
      actorName: 'system',
      message: 'تم نقل القيادة',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function changeMemberRole(
  clanId: string,
  actingUserId: string,
  targetUserId: string,
  newRole: ClanRole
) {
  try {
    assertRole(newRole);
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const clanSnap = await tx.get(clanRef);
      if (!clanSnap.exists()) throw new Error('فريق غير موجود.');
      const clan = clanSnap.data() as Clan;

      const actor = clan.members.find((m) => m.id === actingUserId);
      ensureMemberRole(actor);
      if (actor.role !== 'leader') throw new Error('فقط القائد يمكنه تغيير الرتب.');

      const target = clan.members.find((m) => m.id === targetUserId);
      ensureMemberRole(target);
      if (target.id === clan.leaderId) throw new Error('لا يمكن تعديل رتبة القائد بهذه الطريقة.');

      const officerCount = clan.members.filter((m) => m.role === 'officer').length;
      if (newRole === 'officer' && officerCount >= CLAN_MAX_OFFICERS) throw new Error('الحد الأقصى للنواب تم بلوغه.');

      const updated = clan.members.map((m) => (m.id === targetUserId ? { ...m, role: newRole } : m));
      tx.update(clanRef, { members: updated, updatedAt: Timestamp.now() });
    });

    await logClanEvent(clanId, {
      type: newRole === 'officer' ? 'promote' : 'demote',
      actorId: actingUserId,
      actorName: 'system',
      message: 'تم تحديث رتبة عضو',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function kickMember(clanId: string, actingUserId: string, targetUserId: string) {
  try {
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const userRef = doc(db, 'users', targetUserId);
      const clanSnap = await tx.get(clanRef);
      const userSnap = await tx.get(userRef);
      if (!clanSnap.exists() || !userSnap.exists()) throw new Error('بيانات غير صالحة.');
      const clan = clanSnap.data() as Clan;
      const targetUser = userSnap.data() as UserProfile;

      const actor = clan.members.find((m) => m.id === actingUserId);
      ensureMemberRole(actor);
      if (!canManage(actor.role as ClanRole)) throw new Error('لا تملك صلاحية الطرد.');

      const target = clan.members.find((m) => m.id === targetUserId);
      ensureMemberRole(target);
      if (target.role === 'leader') throw new Error('لا يمكن طرد القائد.');

      const updated = clan.members.filter((m) => m.id !== targetUserId);
      tx.update(clanRef, { members: updated, updatedAt: Timestamp.now() });
      if (targetUser.clan?.id === clanId) tx.update(userRef, { clan: deleteField(), clanRole: deleteField() });
    });

    await logClanEvent(clanId, {
      type: 'kick',
      actorId: actingUserId,
      actorName: 'system',
      message: 'تم طرد عضو من الفريق',
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Treasury: donations & withdrawals with daily cap */
export async function donateToClan(clanId: string, userId: string, amount: number) {
  try {
    if (amount <= 0) throw new Error('قيمة تبرع غير صالحة.');
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const userRef = doc(db, 'users', userId);
      const [clanSnap, userSnap] = await Promise.all([tx.get(clanRef), tx.get(userRef)]);
      if (!clanSnap.exists() || !userSnap.exists()) throw new Error('بيانات غير صالحة.');
      const clan = clanSnap.data() as Clan;
      const user = userSnap.data() as UserProfile;

      if (!user.clan || user.clan.id !== clanId) throw new Error('يجب أن تكون عضوًا للتبرع.');
      if ((user.coins || 0) < amount) throw new Error('لا تملك كوينز كافية.');

      tx.update(userRef, { coins: increment(-amount) });
      tx.update(clanRef, { treasury: increment(amount), updatedAt: Timestamp.now() });
    });

    await logClanEvent(clanId, {
      type: 'donate',
      actorId: userId,
      actorName: 'system',
      message: `تبرع بقيمة ${amount} كوينز`,
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function withdrawFromTreasury(
  clanId: string,
  actingUserId: string,
  amount: number
) {
  try {
    if (amount <= 0) throw new Error('قيمة سحب غير صالحة.');
    await runTransaction(db, async (tx) => {
      const clanRef = doc(db, 'clans', clanId);
      const userRef = doc(db, 'users', actingUserId);

      const [clanSnap, userSnap] = await Promise.all([tx.get(clanRef), tx.get(userRef)]);
      if (!clanSnap.exists() || !userSnap.exists()) throw new Error('بيانات غير صالحة.');
      const clan = clanSnap.data() as Clan;
      const user = userSnap.data() as UserProfile;

      const actor = clan.members.find((m) => m.id === actingUserId);
      ensureMemberRole(actor);
      if (!canManage(actor.role as ClanRole)) throw new Error('صلاحية غير كافية للسحب.');

      if ((clan.treasury || 0) < amount) throw new Error('خزينة الفريق لا تكفي.');

      // naive daily cap via per-user stamp in subcollection
      const capRef = doc(db, 'clans', clanId, 'withdraw_caps', actingUserId);
      const capSnap = await tx.get(capRef);
      const today = new Date();
      const key = `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
      const used = capSnap.exists() && capSnap.data()[key] ? capSnap.data()[key] : 0;
      if (used + amount > DAILY_WITHDRAW_LIMIT) throw new Error('تجاوزت حد السحب اليومي.');

      tx.update(clanRef, { treasury: increment(-amount), updatedAt: Timestamp.now() });
      tx.update(userRef, { coins: increment(amount) });
      tx.set(capRef, { [key]: used + amount }, { merge: true });
    });

    await logClanEvent(clanId, {
      type: 'withdraw',
      actorId: actingUserId,
      actorName: 'system',
      message: `سحب ${amount} كوينز من الخزينة`,
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** ----------------------------------------------------------------------
 * Clan wars: invites, scheduling, ELO results
 * -----------------------------------------------------------------------*/

export async function createClanWarInvite(data: Omit<ClanWarInvitation, 'id' | 'status' | 'challengerClan' | 'challengedClan'> & { challengerClanId: string; challengedClanId: string }) {
  const { challengerClanId, challengedClanId, gameType, battleTime } = data;
  const inviteRef = doc(collection(db, 'clan_war_invites'));

  try {
    const [challengerDoc, challengedDoc] = await Promise.all([
      getDoc(doc(db, 'clans', challengerClanId)),
      getDoc(doc(db, 'clans', challengedClanId)),
    ]);

    if (!challengerDoc.exists() || !challengedDoc.exists()) throw new Error('لم يتم العثور على أحد الفريقين.');

    const newInvite: ClanWarInvitation = {
      id: inviteRef.id,
      challengerClan: { id: challengerDoc.id, name: challengerDoc.data().name, emblem: challengerDoc.data().emblem },
      challengedClan: { id: challengedDoc.id, name: challengedDoc.data().name, emblem: challengedDoc.data().emblem },
      gameType,
      battleTime,
      status: 'pending',
    } as ClanWarInvitation;

    await setDoc(inviteRef, newInvite);
    await logClanEvent(challengerClanId, {
      type: 'war_invite',
      actorId: 'system',
      actorName: 'system',
      message: `تمت دعوة ${challengedDoc.data().name} لحرب عشائر`,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getClanWarInvites(clanId: string): Promise<ClanWarInvitation[]> {
  try {
    const invitesRef = collection(db, 'clan_war_invites');
    const qInv = query(invitesRef, where('challengedClan.id', '==', clanId), where('status', '==', 'pending'));
    const snapshot = await getDocs(qInv);
    return snapshot.docs.map((d) => d.data() as ClanWarInvitation);
  } catch (error) {
    console.error('Error fetching clan war invites', error);
    return [];
  }
}

export async function respondToClanWarInvite(inviteId: string, clanId: string, response: 'accepted' | 'rejected') {
  try {
    const inviteRef = doc(db, 'clan_war_invites', inviteId);
    const inviteDoc = await getDoc(inviteRef);
    if (!inviteDoc.exists() || inviteDoc.data()?.challengedClan.id !== clanId)
      throw new Error('دعوة غير صالحة أو لا تملك صلاحية الرد عليها.');

    if (response === 'accepted') {
      await updateDoc(inviteRef, { status: 'accepted' });
      // Optionally create scheduled war doc for UI
      const warRef = doc(collection(db, 'clan_wars'));
      await setDoc(warRef, {
        id: warRef.id,
        inviteId,
        challengerClan: inviteDoc.data()!.challengerClan,
        challengedClan: inviteDoc.data()!.challengedClan,
        gameType: inviteDoc.data()!.gameType,
        battleTime: inviteDoc.data()!.battleTime,
        status: 'scheduled',
        createdAt: Timestamp.now(),
      });

      await logClanEvent(clanId, {
        type: 'war_accept',
        actorId: 'system',
        actorName: 'system',
        message: 'تم قبول دعوة الحرب',
      });
    } else {
      await deleteDoc(inviteRef);
      await logClanEvent(clanId, {
        type: 'war_reject',
        actorId: 'system',
        actorName: 'system',
        message: 'تم رفض دعوة الحرب',
      });
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** ELO helpers */
function expectedScore(rA: number, rB: number) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}
function applyElo(rA: number, rB: number, scoreA: 0 | 0.5 | 1) {
  const expA = expectedScore(rA, rB);
  const newA = Math.round(rA + ELO_K * (scoreA - expA));
  const newB = Math.round(rB + ELO_K * ((1 - scoreA) - (1 - expA)));
  return { newA, newB };
}

/** Record war result and update ELO & stats */
export async function recordClanWarResult(
  warId: string,
  winnerClanId: string | 'draw'
) {
  try {
    const warRef = doc(db, 'clan_wars', warId);
    await runTransaction(db, async (tx) => {
      const warSnap = await tx.get(warRef);
      if (!warSnap.exists()) throw new Error('حرب غير موجودة.');
      const war = warSnap.data() as any;
      if (war.status === 'finished') throw new Error('تم تسجيل النتيجة سابقًا.');

      const aRef = doc(db, 'clans', war.challengerClan.id);
      const bRef = doc(db, 'clans', war.challengedClan.id);
      const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
      const a = aSnap.data() as Clan;
      const b = bSnap.data() as Clan;

      let scoreA: 0 | 0.5 | 1 = 0.5;
      if (winnerClanId !== 'draw') scoreA = winnerClanId === aRef.id ? 1 : 0;

      const { newA, newB } = applyElo(a.elo || ELO_DEFAULT, b.elo || ELO_DEFAULT, scoreA);

      tx.update(aRef, {
        elo: newA,
        wins: increment(scoreA === 1 ? 1 : 0),
        losses: increment(scoreA === 0 ? 1 : 0),
        draws: increment(scoreA === 0.5 ? 1 : 0),
        totalHonorPoints: increment(scoreA === 1 ? 3 : scoreA === 0.5 ? 1 : 0),
        updatedAt: Timestamp.now(),
      });
      tx.update(bRef, {
        elo: newB,
        wins: increment(scoreA === 0 ? 1 : 0),
        losses: increment(scoreA === 1 ? 1 : 0),
        draws: increment(scoreA === 0.5 ? 1 : 0),
        totalHonorPoints: increment(scoreA === 0 ? 3 : scoreA === 0.5 ? 1 : 0),
        updatedAt: Timestamp.now(),
      });

      tx.update(warRef, { status: 'finished', finishedAt: Timestamp.now(), winner: winnerClanId });
    });

    // log for both clans
    const warSnap = await getDoc(doc(db, 'clan_wars', warId));
    const war = warSnap.data() as any;
    await Promise.all([
      logClanEvent(war.challengerClan.id, {
        type: 'war_result',
        actorId: 'system',
        actorName: 'system',
        message: `نتيجة الحرب: ${winnerClanId === 'draw' ? 'تعادل' : winnerClanId === war.challengerClan.id ? 'فوز' : 'هزيمة'}`,
      }),
      logClanEvent(war.challengedClan.id, {
        type: 'war_result',
        actorId: 'system',
        actorName: 'system',
        message: `نتيجة الحرب: ${winnerClanId === 'draw' ? 'تعادل' : winnerClanId === war.challengedClan.id ? 'فوز' : 'هزيمة'}`,
      }),
    ]);

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** ----------------------------------------------------------------------
 * Quality-of-life getters for UI
 * -----------------------------------------------------------------------*/

export async function getClanSummary(clanId: string) {
  try {
    const { data: clan } = await getClanDoc(clanId);
    const invitesSnap = await getDocs(collection(db, 'clans', clanId, 'invites'));
    const requestsSnap = await getDocs(collection(db, 'clans', clanId, 'join_requests'));
    const logsSnap = await getDocs(query(collection(db, 'clans', clanId, 'logs'), orderBy('createdAt', 'desc')));

    return {
      clan,
      invites: invitesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      requests: requestsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      logs: logsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Seasonal reset example: soft-reset honor & award badge to top clans (call via cron)
 */
export async function seasonalReset(topN = 3) {
  try {
    const col = collection(db, 'clans');
    const snap = await getDocs(query(col, orderBy('totalHonorPoints', 'desc')));
    const clans = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Clan));

    const batch = writeBatch(db);
    clans.forEach((c, i) => {
      const ref = doc(db, 'clans', (c as any).id);
      const badges = Array.isArray(c.badges) ? c.badges : [];
      if (i < topN) badges.push({ type: 'season_top', seasonEndedAt: Timestamp.now(), rank: i + 1 });
      batch.update(ref, { badges, totalHonorPoints: 0, updatedAt: Timestamp.now() });
    });
    await batch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** ----------------------------------------------------------------------
 * Legacy exports maintained for backwards compatibility
 * -----------------------------------------------------------------------*/

// Kept to avoid breaking imports in existing codebases, mapped to new getClans
export async function getClansLegacy(): Promise<{clans: Clan[]}> {
  const clans = await getClans();
  return {clans};
}
