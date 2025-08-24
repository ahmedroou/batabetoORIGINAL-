
'use server';

/**
 * @fileoverview Server actions for the "Behind the Mask" (mafia-style) game.
 *
 * ✅ نفس الواجهات والدوال المصدَّرة — بدون كسر المنطق العام.
 * ✨ تحسينات: توثيق المُرسِل (إن توفر)، منطق ليلي حتمي، تنظيف قرارات الليل،
 *     فحص المؤقّت على السيرفر، نقل الدردشة/الأحداث الخاصة إلى Subcollections،
 *     حماية من فقدان البيانات، قيود وقدرات أدق، تبريد/حظر إساءة الاستخدام.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  deleteField,
  arrayUnion, // (يُستخدم فقط لالتزام التوافق إن أردت الإبقاء على سلوك قديم)
  serverTimestamp,
  collection,
  writeBatch,
  setDoc,
} from 'firebase/firestore';

import type {
  Game,
  Player,
  NightAction,
  DayEvent,
  PrivateChatMessage,
  PublicChatMessage,
  PrivateEvent,
  PlayerRole,
} from '@/types';

import { getRoleDistribution, ROLES } from '@/data/mafia-roles';
import { updateLeagueScoresForGameEnd } from './user';

// ---------------------------------------------------------------------------
// Types & utils
// ---------------------------------------------------------------------------

type MafiaGameResult = { winner: 'good' | 'mafia' | 'draw' | 'game_over' | string; message: string };
export type FSUpdate = Record<string, unknown>;

const DEFAULTS = {
  ROLE_REVEAL_SECONDS: 15,
  NIGHT_SECONDS: 25,
  DAY_SECONDS: 180,
  VOTING_SECONDS: 45,
  PUBLIC_MSG_MAX: 240,
  PRIVATE_MSG_MAX: 240,
  PUBLIC_MSG_MIN_INTERVAL_MS: 1_000,
  PRIVATE_MSG_MIN_INTERVAL_MS: 800,
  PUBLIC_PREVIEW_LIMIT: 0, // 0 = إيقاف المعاينة القديمة داخل الوثيقة (نوصي بذلك)
};

const FALLBACK_ABILITIES: Record<string, Array<NightAction['action']>> = {
  killer: ['kill'],
  doctor: ['heal'],
  detective: ['investigate'],
  spy: ['spy'],
  bomber: ['bomb'],
  shapeshifter: ['shapeshift'],
  soldier: [],
};

const deadline = (seconds: number) =>
  Timestamp.fromMillis(Date.now() + Math.max(0, seconds) * 1_000);

const nowMs = () => Date.now();

const isAlive = (p?: Player | null): p is Player => !!p && p.status === 'alive';

const requireGame = (game: Game | undefined) => {
  if (!game) throw new Error('Game not found.');
  return game;
};

const requireHost = (game: Game, hostId: string) => {
  if (game.hostId !== hostId) throw new Error('Only the host can perform this action.');
};

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

const normalizeMsg = (s: string) => s.replace(/[\s\u200B\u00A0]+/g, ' ').trim();

const getSettings = (game: Game) => ({
  night: game.mafiaState?.settings?.nightTime ?? DEFAULTS.NIGHT_SECONDS,
  day: game.mafiaState?.settings?.dayTime ?? DEFAULTS.DAY_SECONDS,
});

const safeGetPlayer = (game: Game, id: string | null | undefined) =>
  game.players.find((p) => p.id === id);

const abilitiesOf = (role?: string | null): Array<NightAction['action']> => {
  if (!role) return [];
  const roleInfo = ROLES[role as keyof typeof ROLES];
  const fromRoles: Array<NightAction['action']> =
    (roleInfo && (roleInfo as any).abilities) || FALLBACK_ABILITIES[role] || [];
  return fromRoles as Array<NightAction['action']>;
};

const canAct = (actor: Player | undefined, action: NightAction['action']) => {
  if (!actor) return false;
  const acts = abilitiesOf(actor.role);
  return acts.includes(action);
};

export const checkForWinner = (players: Player[]): MafiaGameResult | null => {
  const alive = players.filter((p) => p.status === 'alive');
  const good = alive.filter((p) => p.team === 'good').length;
  const mafia = alive.filter((p) => p.team === 'mafia').length;

  if (mafia === 0) return { winner: 'good', message: 'لقد قضى فريق الخير على كل الأشرار!' };
  if (mafia >= good) return { winner: 'mafia', message: 'لقد سيطر فريق الشر على المدينة!' };
  return null;
};

const requirePhase = (game: Game, phases: string[]) => {
  const phase = game.mafiaState?.phase || '';
  if (!phases.includes(phase)) {
    throw new Error(`Invalid phase: ${phase}.`);
  }
};

const timerActive = (game: Game) => {
  const ends = (game.mafiaState?.timerEndsAt as any);
  if (!ends) return true;
  const ms =
    typeof ends?.toMillis === 'function' ? ends.toMillis() :
    typeof ends === 'number' ? ends : 0;
  if (!ms) return true;
  return nowMs() <= ms;
};

const ensurePhaseAndTimer = (game: Game, phases: string[]) => {
  requirePhase(game, phases);
  if (!timerActive(game)) throw new Error('Time is over for this phase.');
};

const isValidRoleKey = (r: any): r is PlayerRole => !!r && Object.prototype.hasOwnProperty.call(ROLES, r);

// ---------------------------------------------------------------------------
// Night & Day internal processors (pure helpers — لا I/O)
// ---------------------------------------------------------------------------

/**
 * معالج الليل النقي:
 * - يقرأ nightActions فقط ولا يكتب إلى Firestore.
 * - التنكّر (shapeshift) يطبّق مؤقتًا عبر apparentById.
 * - القتل جماعي حتمي عبر تصويت المافيا (تعادل ⇒ لا قتل).
 */
export async function processNightInternal(game: Game): Promise<{
  updatedPlayers: Player[];
  newEvents: DayEvent[];
  privateEventsByUser: Record<string, PrivateEvent[]>;
  privateChatOpenings: Array<{ chatId: string; participants: [string, string] }>;
  newLastHealedPlayerId: string | null;
}> {
  const players = game.players.map((p) => ({ ...p }));
  const nightActions = game.mafiaState?.nightActions || {};
  const newEvents: DayEvent[] = [];
  const privateEventsByUser: Record<string, PrivateEvent[]> = {};
  const privateChatOpenings: Array<{ chatId: string; participants: [string, string] }> = [];
  let newLastHealedPlayerId: string | null = null;

  const aliveMap = new Map(players.filter(isAlive).map(p => [p.id!, p]));

  // خريطة التنكّر المؤقت: actorId → disguiseRole (متحقق)
  const apparentById: Record<string, string> = {};
  Object.values(nightActions).forEach((a: any) => {
    if (a?.action === 'shapeshift' && a?.actorId && a?.disguiseRole && isValidRoleKey(a.disguiseRole)) {
      apparentById[a.actorId] = a.disguiseRole;
    }
  });

  // --- 1) Doctor heal (mark protection)
  const healAction = Object.values(nightActions).find((a: any) => a.action === 'heal');
  if (healAction && healAction.targetId && healAction.targetId !== 'skip') {
    const doctor = aliveMap.get(healAction.actorId);
    const target = aliveMap.get(healAction.targetId);
    if (isAlive(doctor) && isAlive(target)) {
      (target as any).isProtected = true;
      newLastHealedPlayerId = target.id!;
    }
  }

  // --- 2) Mafia collective kill (deterministic)
  const killVotes = Object.values(nightActions).filter((a: any) =>
    a?.action === 'kill' && a?.targetId && a.targetId !== 'skip' && aliveMap.has(a.targetId)
  ).reduce((acc: Record<string, number>, a: any) => {
    acc[a.targetId] = (acc[a.targetId] || 0) + 1;
    return acc;
  }, {});
  const maxKills = Math.max(0, ...Object.values(killVotes));
  const topKillTargets = Object.keys(killVotes).filter(id => killVotes[id] === maxKills);
  const killTargetId = (maxKills > 0 && topKillTargets.length === 1) ? topKillTargets[0] : null;

  // --- 3) Bomber revenge (يدعم أكثر من مفجّر واحد)
  const bomberActions = Object.values(nightActions).filter((a: any) => a.action === 'bomb');

  // --- 4) Resolve deaths
  const deaths: Player[] = [];
  const markKilled = (pid: string | null | undefined) => {
    if (!pid) return;
    const idx = players.findIndex((p) => p.id === pid);
    if (idx !== -1) {
      const target = players[idx] as any;
      if (target.isProtected) {
        newEvents.push({
          type: 'protection',
          message: 'لقد حاول القاتل الهجوم، لكن الطبيب أنقذ الهدف في الوقت المناسب!',
        });
        if (healAction) {
          (privateEventsByUser[healAction.actorId] ||= []).push({
            type: 'doctor_success',
            message: 'لقد نجحت في إنقاذ هدفك!',
          } as PrivateEvent);
        }
      } else if (players[idx].status === 'alive') {
        players[idx].status = 'killed';
        deaths.push(players[idx]);
        newEvents.push({
          type: 'death',
          message: `استيقظ أهل المدينة ليجدوا ${players[idx].name} قد قُتل!`,
          killedPlayer: { name: players[idx].name, avatarId: players[idx].avatarId },
        });
      }
    }
  };

  // Apply collective kill
  if (killTargetId) markKilled(killTargetId);

  // Bomber revenge: لكل مفجّر قُتل هذه الليلة ولم يكن محميًا
  for (const b of bomberActions as any[]) {
    if (!b?.actorId || !b?.targetId) continue;
    const bomberIdx = players.findIndex((p) => p.id === b.actorId);
    if (bomberIdx === -1) continue;
    const bomberAfter: any = players[bomberIdx];
    const bomberWasKilled = bomberAfter?.status === 'killed';
    const bomberProtected = bomberAfter?.isProtected === true;
    if (bomberWasKilled && !bomberProtected) {
      markKilled(b.targetId);
    }
  }

  // --- 5) Info actions (detective/spy)
  Object.values(nightActions).forEach((action: any) => {
    (privateEventsByUser[action.actorId] ||= []);
    const actor = players.find((p) => p.id === action.actorId);
    if (!isAlive(actor)) return;
    const target = players.find((p) => p.id === action.targetId);
    if (!target) return;

    if (action.action === 'investigate') {
      const roleInfo = ROLES[target.role! as PlayerRole];
      privateEventsByUser[action.actorId].push({
        type: 'investigation_result',
        message: `تقرير التحقيق: ${target.name} ينتمي إلى ${roleInfo?.team === 'mafia' ? 'فريق الشر' : 'فريق الخير'}.`,
        targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId },
      } as PrivateEvent);
    } else if (action.action === 'spy') {
      const apparent = apparentById[target.id!] || target.role!;
      const roleInfo = ROLES[apparent as PlayerRole];

      if (target.role === 'soldier') {
        privateEventsByUser[action.actorId].push({
          type: 'spy_result_soldier_block',
          message: `لقد حاولت التجسس على ${target.name}، لكنه جندي متأهب وكشفك!`,
          targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: target.role as PlayerRole },
        } as PrivateEvent);
      } else {
        privateEventsByUser[action.actorId].push({
          type: 'spy_result',
          message: `تقرير التجسس: دور ${target.name} هو ${roleInfo?.name ?? apparent}.`,
          targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: apparent as PlayerRole },
        } as PrivateEvent);

        // افتح دردشة خاصة تلقائيًا بين جاسوس ومافيا عند كشف مافيا (subcollection)
        if (roleInfo?.team === 'mafia') {
          const ids = [actor.id!, target.id!].sort();
          const chatId = `${ids[0]}-${ids[1]}`;
          privateChatOpenings.push({ chatId, participants: [ids[0], ids[1]] as [string, string] });
        }
      }
    }
  });

  // Cleanup temp flags (محليًا فقط)
  players.forEach((p: any) => {
    delete p.isProtected;
  });

  return { updatedPlayers: players, newEvents, privateEventsByUser, privateChatOpenings, newLastHealedPlayerId };
}

export async function processDayInternal(game: Game): Promise<{
  updatedGame: {
    players: Player[];
    events: DayEvent[];
    lastExecutedPlayer: { name: string; avatarId: string; temporaryTitle?: string } | null;
  };
  winner: MafiaGameResult | null;
}> {
  const players = [...game.players];
  const votes = game.mafiaState?.votes || {};
  const counts: Record<string, number> = {};
  const events: DayEvent[] = [];
  let executed: Player | null = null;

  const alivePlayerIds = new Set(game.players.filter(isAlive).map((p) => p.id));

  // Count only votes from living voters targeting living players
  Object.entries(votes).forEach(([voterId, targetId]) => {
    if (!targetId || !alivePlayerIds.has(voterId)) return;
    const target = players.find((p) => p.id === targetId);
    if (isAlive(target)) counts[targetId] = (counts[targetId] || 0) + 1;
  });

  const maxVotes = Math.max(0, ...Object.values(counts));
  const topIds = Object.keys(counts).filter((id) => counts[id] === maxVotes);

  if (topIds.length === 1 && maxVotes > 0) {
    const executedId = topIds[0];
    const idx = players.findIndex((p) => p.id === executedId);
    if (idx !== -1) {
      players[idx].status = 'voted_out';
      executed = players[idx];
      events.push({
        type: 'execution',
        message: `بعد نقاش حاد، قرر أهل المدينة إعدام ${executed.name}!`,
        executedPlayer: { name: executed.name, avatarId: executed.avatarId, temporaryTitle: (executed as any).temporaryTitle },
      });
    }
  } else {
    events.push({ type: 'no_execution', message: 'لم يتمكن أهل المدينة من الاتفاق على إعدام أحد.' });
  }

  const winner = checkForWinner(players);
  const lastExecutedPlayer = executed
    ? { name: executed.name, avatarId: executed.avatarId, temporaryTitle: (executed as any).temporaryTitle }
    : null;

  return { updatedGame: { players, events, lastExecutedPlayer }, winner };
}

// ---------------------------------------------------------------------------
// Exported Actions (public API) — preserved names & signatures
// ---------------------------------------------------------------------------

/** يبدأ اللعبة: توزيع الأدوار، الانتقال إلى مرحلة كشف الدور. */
export async function startGame(gameId: string, hostId: string): Promise<void> {

  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    if (game.gameState !== 'lobby') return;
    if (game.players.length < 4) throw new Error('The game requires at least 4 players.');

    const roles = getRoleDistribution(game.players.length);

    const updatedPlayers = game.players.map((player, i) => ({
      ...player,
      role: roles[i],
      team: ROLES[roles[i]! as PlayerRole]?.team,
      status: 'alive' as Player['status'],
    }));

    const update: FSUpdate = {
      players: updatedPlayers,
      gameState: 'role_reveal',
      'mafiaState.phase': 'role_reveal',
      round: 1,
      playerScores: {},
      'mafiaState.rolesInGame': roles,
      'mafiaState.night': 1,
      'mafiaState.events': [],
      // تمت إزالة تخزين الدردشة/الأحداث الخاصة من الوثيقة الرئيسية
      'mafiaState.privateEvents': deleteField(),
      'mafiaState.privateChats': deleteField(),
      'mafiaState.nightActions': {},
      'mafiaState.votes': {},
      'mafiaState.lastAbilityUse': {},
      'mafiaState.lastPublicMessageAtByUser': {},
      'mafiaState.timerEndsAt': deadline(DEFAULTS.ROLE_REVEAL_SECONDS),
    };

    tx.update(gameRef, update);
  });
}

/** انتقال من كشف الأدوار/التنفيذ إلى الليل. */
export async function transitionToNight(gameId: string, hostId: string): Promise<void> {

  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    const phase = game.mafiaState?.phase || '';
    if (!['role_reveal', 'execution'].includes(phase)) return;

    // تصحيح عدّاد الليالي
    const nextNight =
      phase === 'role_reveal'
        ? 1
        : (game.mafiaState?.night || 0) + 1;

    const { night } = getSettings(game);

    const update: FSUpdate = {
      'mafiaState.phase': 'night',
      'mafiaState.nightActions': {},
      'mafiaState.votes': {},
      'mafiaState.events': [],
      'mafiaState.night': nextNight,
      'mafiaState.timerEndsAt': deadline(night),
    };

    // زِد الجولة بعد مرحلة التنفيذ فقط
    if (phase === 'execution') {
      (update as any).round = (game.round || 1) + 1;
    }

    tx.update(gameRef, update);
  });
}

/** إرسال قرار ليلي للاعب. */
export async function submitNightAction(
  gameId: string,
  action: NightAction,
): Promise<{ success: boolean; error?: string }> {
  
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef);
      const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

      ensurePhaseAndTimer(game, ['night']);

      const actor = safeGetPlayer(game, action.actorId);
      if (!isAlive(actor)) throw new Error('Only living players can perform night actions.');

      // تحقق من صلاحية الفعل للدور
      if (!canAct(actor, action.action)) {
        throw new Error('دورك لا يملك هذه القدرة.');
      }

      // منع تكرار إرسال
      if (game.mafiaState?.nightActions?.[action.actorId!]) {
        throw new Error('لقد قمت بإرسال قرارك بالفعل لهذه الليلة.');
      }

      // تحقق من الهدف/البيانات
      if (action.targetId && action.targetId !== 'skip') {
        const target = safeGetPlayer(game, action.targetId);
        if (!isAlive(target)) {
          throw new Error('الهدف غير صالح.');
        }
      }
      if (action.action === 'shapeshift') {
        const disguise = (action as any).disguiseRole;
        if (!isValidRoleKey(disguise)) throw new Error('دور التنكّر غير صالح.');
      }

      // منع تكرار حماية نفس اللاعب
      if (action.targetId !== 'skip') {
        if (action.action === 'heal' && game.mafiaState?.lastHealedPlayerId === action.targetId) {
          throw new Error('لا يمكنك حماية نفس اللاعب مرتين على التوالي.');
        }
        // تبريد للقتل والتحقيق: ليلة راحة بين الاستخدامات
        const currentNight = game.mafiaState?.night || 1;
        const lastUsed = game.mafiaState?.lastAbilityUse?.[action.actorId!] || 0;
        if ((action.action === 'kill' || action.action === 'investigate') && currentNight === lastUsed + 1) {
          throw new Error('يجب أن ترتاح لليلة واحدة قبل استخدام قدرتك مرة أخرى.');
        }
      }

      const update: FSUpdate = { [`mafiaState.nightActions.${action.actorId}`]: action };

      if ((action.action === 'kill' || action.action === 'investigate') && action.targetId !== 'skip') {
        (update as any)[`mafiaState.lastAbilityUse.${action.actorId}`] = game.mafiaState?.night || 1;
      }

      tx.update(gameRef, update);
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'حدث خطأ غير متوقع.' };
  }
}

/** معالجة الليل والانتقال تلقائيًا إلى النهار أو النتائج. */
export async function processNight(gameId: string, hostId: string): Promise<void> {

  const gameRef = doc(db, 'games', gameId);

  // سنخزن إجراء ما بعد الالتزام هنا لتجنب تنفيذه داخل المعاملة
  let postCommit: null | (() => Promise<void>) = null;

  // مخازن مؤقتة يملؤها المعالج الداخلي
  let privateEventsByUser: Record<string, PrivateEvent[]> = {};
  let privateChatOpenings: Array<{ chatId: string; participants: [string, string] }> = [];

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    ensurePhaseAndTimer(game, ['night']);

    const res = await processNightInternal(game);
    const { updatedPlayers, newEvents, newLastHealedPlayerId } = res;
    privateEventsByUser = res.privateEventsByUser;
    privateChatOpenings = res.privateChatOpenings;

    const winner = checkForWinner(updatedPlayers);

    const update: FSUpdate = {
      players: updatedPlayers,
      'mafiaState.events': newEvents,
      // احفظ آخر لاعب تم حمايته (أو احذف الحقل)
      'mafiaState.lastHealedPlayerId': newLastHealedPlayerId ? newLastHealedPlayerId : deleteField(),
      // ⚠️ تنظيف قرارات الليل فورًا
      'mafiaState.nightActions': deleteField(),
    };

    if (winner) {
      (update as any)['gameState'] = 'final_results';
      (update as any)['mafiaState.phase'] = 'final_results';
      (update as any)['gameResult'] = winner;
      (update as any)['mafiaState.timerEndsAt'] = deleteField();

      const payloadForLeague = { ...game, players: updatedPlayers, gameResult: winner };
      postCommit = async () => {
        // إنشاء الدردشات والأحداث الخاصة بعد الالتزام
        await postCommitSideEffects(gameId, privateChatOpenings, privateEventsByUser);
        await updateLeagueScoresForGameEnd(payloadForLeague as any);
      };
    } else {
      const { day } = getSettings(game);
      (update as any)['mafiaState.phase'] = 'day';
      (update as any)['mafiaState.timerEndsAt'] = deadline(day);

      postCommit = async () => {
        await postCommitSideEffects(gameId, privateChatOpenings, privateEventsByUser);
      };
    }

    tx.update(gameRef, update);
  });

  if (postCommit) {
    await postCommit();
  }
}

/** الانتقال من النقاش إلى التصويت. */
export async function transitionToVoting(gameId: string, hostId: string): Promise<void> {

  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    if (game.mafiaState?.phase !== 'day') return;
    if (!timerActive(game)) throw new Error('Time is over for this phase.');

    tx.update(gameRef, {
      'mafiaState.phase': 'voting',
      'mafiaState.timerEndsAt': deadline(DEFAULTS.VOTING_SECONDS),
    });
  });
}

/** إرسال تصويت — مسموح أثناء النهار أو التصويت. */
export async function submitVote(
  gameId: string,
  voterId: string,
  targetId: string | null,
): Promise<{ success: boolean; error?: string }> {
  
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef);
      const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

      const phase = game.mafiaState?.phase;
      if (!['day', 'voting'].includes(String(phase))) throw new Error('Voting is not active.');
      if (!timerActive(game)) throw new Error('Time is over for this phase.');

      const voter = safeGetPlayer(game, voterId);
      if (!isAlive(voter)) throw new Error('Only living players can vote.');

      if (targetId) {
        const target = safeGetPlayer(game, targetId);
        if (!isAlive(target)) throw new Error('لا يمكنك التصويت للاعب غير موجود أو غير حي.');
      }

      const update: FSUpdate = { [`mafiaState.votes.${voterId}`]: targetId };

      // تقليص المؤقت إن أكمل الجميع تصويتهم (يشمل الامتناع null)
      const newVotes = { ...(game.mafiaState?.votes || {}), [voterId]: targetId };
      const aliveCount = game.players.filter((p) => p.status === 'alive').length;
      if (Object.keys(newVotes).length === aliveCount) {
        const remaining = (game.mafiaState?.timerEndsAt?.toMillis() || Date.now()) - nowMs();
        if (remaining > 20_000) (update as any)['mafiaState.timerEndsAt'] = deadline(20);
      }

      tx.update(gameRef, update);
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'حدث خطأ غير متوقع.' };
  }
}

/** معالجة التصويت في نهاية النهار/التصويت والانتقال لمرحلة التنفيذ أو إنهاء اللعبة. */
export async function processDay(gameId: string, hostId: string): Promise<void> {

  const gameRef = doc(db, 'games', gameId);

  let postCommit: null | (() => Promise<void>) = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    const phase = game.mafiaState?.phase || '';
    if (!['day', 'voting'].includes(phase)) return;

    const { updatedGame, winner } = await processDayInternal(game);

    const update: FSUpdate = { players: updatedGame.players };

    if (winner) {
      (update as any).gameState = 'final_results';
      (update as any)['mafiaState.phase'] = 'final_results';
      (update as any).gameResult = winner;
      (update as any)['mafiaState.timerEndsAt'] = deleteField();

      const payloadForLeague = { ...game, players: updatedGame.players, gameResult: winner };
      postCommit = async () => {
        await updateLeagueScoresForGameEnd(payloadForLeague as any);
      };
    } else {
      (update as any)['mafiaState.phase'] = 'execution';
      (update as any)['mafiaState.events'] = updatedGame.events;
      (update as any)['mafiaState.lastExecutedPlayer'] = updatedGame.lastExecutedPlayer;
      (update as any)['mafiaState.timerEndsAt'] = deleteField();
    }

    tx.update(gameRef, update);
  });

  if (postCommit) {
    await postCommit();
  }
}

/** إرسال رسالة عامة أثناء النهار. (نُخزنها في Subcollection) */
export async function sendPublicMessage(
  gameId: string,
  message: Omit<PublicChatMessage, 'timestamp'>,
): Promise<void> {
  
  const trimmed = normalizeMsg(clamp(message.message, DEFAULTS.PUBLIC_MSG_MAX));
  if (!trimmed) throw new Error('الرسالة فارغة.');

  const gameRef = doc(db, 'games', gameId);
  const messagesCol = collection(db, 'games', gameId, 'publicMessages');

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    if (game.mafiaState?.phase !== 'day') throw new Error('Can only send messages during the day.');
    if (!timerActive(game)) throw new Error('Time is over for this phase.');

    const sender = safeGetPlayer(game, message.senderId);
    if (!isAlive(sender)) throw new Error('Only living players can send messages.');

    // Rate-limit لكل لاعب
    const lastMap = (game.mafiaState as any)?.lastPublicMessageAtByUser || {};
    const lastMs = Number(lastMap[message.senderId] || 0);
    const dt = nowMs() - lastMs;
    if (dt < DEFAULTS.PUBLIC_MSG_MIN_INTERVAL_MS) throw new Error('الرجاء التمهل قبل إرسال رسالة أخرى.');

    // أنشئ رسالة في subcollection ضمن نفس المعاملة
    const msgRef = doc(messagesCol);
    tx.set(msgRef, {
      ...message,
      message: trimmed,
      timestamp: serverTimestamp(),
      phase: game.mafiaState?.phase,
      round: game.round || 1,
    } as PublicChatMessage);

    // حدّث آخر وقت إرسال لهذا اللاعب
    tx.update(gameRef, {
      [`mafiaState.lastPublicMessageAtByUser.${message.senderId}`]: nowMs(),
    });

    // (اختياري) إن رغبت بمعاينة سريعة داخل الوثيقة الرئيسية، يمكنك إضافة آخر رسالة فقط
    if (DEFAULTS.PUBLIC_PREVIEW_LIMIT > 0) {
      tx.update(gameRef, { 'mafiaState.publicChatPreview': {
        lastAt: serverTimestamp(),
        lastSenderId: message.senderId,
        lastExcerpt: trimmed.slice(0, 80),
      }});
    }
  });
}

/** إرسال رسالة خاصة بين المشاركين في دردشة خاصة (Subcollection + Rate-limit آمن). */
export async function sendPrivateMessage(
  gameId: string,
  chatId: string,
  message: Omit<PrivateChatMessage, 'timestamp'>,
): Promise<void> {

  const trimmed = normalizeMsg(clamp(message.message, DEFAULTS.PRIVATE_MSG_MAX));
  if (!trimmed) throw new Error('الرسالة فارغة.');

  const gameRef = doc(db, 'games', gameId);
  const chatRef = doc(db, 'games', gameId, 'privateChats', chatId);
  const msgsCol = collection(db, 'games', gameId, 'privateChats', chatId, 'messages');

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef);
    requireGame(gameSnap.exists() ? (gameSnap.data() as Game) : undefined);

    const chatSnap = await tx.get(chatRef);
    if (!chatSnap.exists()) throw new Error('المحادثة غير موجودة.');
    const chatData: any = chatSnap.data() || {};
    if (!Array.isArray(chatData.participants) || !chatData.participants.includes(message.senderId)) {
      throw new Error('ليست لديك صلاحية لإرسال رسائل في هذه المحادثة.');
    }

    // Rate-limit لكل مُرسِل على مستوى الدردشة
    const perUserLast: Record<string, number> = chatData.lastMessageAtByUser || {};
    const lastMs = Number(perUserLast[message.senderId] || 0);
    const dt = nowMs() - lastMs;
    if (dt < DEFAULTS.PRIVATE_MSG_MIN_INTERVAL_MS) throw new Error('الرجاء التمهل قبل إرسال رسالة أخرى.');

    // أضف الرسالة كوثيقة جديدة داخل المعاملة
    const msgRef = doc(msgsCol);
    tx.set(msgRef, {
      ...message,
      message: trimmed,
      timestamp: serverTimestamp(),
    } as PrivateChatMessage);

    // حدّث وقت آخر رسالة للمرسل
    tx.set(chatRef, {
      lastMessageAt: serverTimestamp(),
      lastMessageAtByUser: { [message.senderId]: nowMs() },
    }, { merge: true });
  });
}

/** تحديث إعدادات المافيا — فقط في اللوبي. */
export async function updateMafiaSettings(
  gameId: string,
  hostId: string,
  settings: Game['mafiaState'] extends { settings: infer S } ? S : { nightTime?: number; dayTime?: number },
): Promise<void> {

  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);
    requireHost(game, hostId);
    if (game.gameState !== 'lobby') throw new Error('Settings can only be changed in the lobby.');

    // Sanitize
    const nightTime = Math.max(10, Math.min(300, Number((settings as any)?.nightTime ?? DEFAULTS.NIGHT_SECONDS)));
    const dayTime = Math.max(30, Math.min(600, Number((settings as any)?.dayTime ?? DEFAULTS.DAY_SECONDS)));

    tx.update(gameRef, { 'mafiaState.settings': { nightTime, dayTime } });
  });
}

// ---------------------------------------------------------------------------
// Post-commit side effects: إنشاء/تحديث الدردشات الخاصة والأحداث الخاصة
// ---------------------------------------------------------------------------

async function postCommitSideEffects(
  gameId: string,
  privateChatOpenings: Array<{ chatId: string; participants: [string, string] }>,
  privateEventsByUser: Record<string, PrivateEvent[]>
) {
  const batch = writeBatch(db);

  // Ensure private chats exist
  for (const ch of privateChatOpenings) {
    const chatRef = doc(db, 'games', gameId, 'privateChats', ch.chatId);
    batch.set(chatRef, {
      participants: ch.participants,
      createdAt: serverTimestamp(),
    }, { merge: true });
  }

  // Write private events as individual docs under each user
  for (const [uid, events] of Object.entries(privateEventsByUser)) {
    const userEventsCol = collection(db, 'games', gameId, 'privateEvents', uid, 'events');
    for (const ev of events) {
      const evRef = doc(userEventsCol);
      batch.set(evRef, {
        ...ev,
        createdAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}
