
'use server';

/**
 * @fileoverview Server actions for the "Behind the Mask" (mafia-style) game.
 *
 * ✅ نفس الواجهات والدوال المصدَّرة — بدون كسر المنطق العام.
 * ✨ تحسينات على الصرامة والمنطق وحماية الحالة من التعارض.
 * 🧩 إصلاحات مهمة: طور التصويت/النهار، منطق قنبلة/حماية الليل، دردشة خاصة آمنة،
 *     ضبط الرسائل، التحقق من الصلاحيات، تنظيف الأعلام المؤقتة.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  deleteField,
  arrayUnion,
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
// Local types
// ---------------------------------------------------------------------------

type MafiaGameResult = { winner: 'good' | 'mafia' | 'draw' | 'game_over' | string; message: string };

// ---------------------------------------------------------------------------
// Constants & Utility helpers
// ---------------------------------------------------------------------------

const DEFAULTS = {
  ROLE_REVEAL_SECONDS: 15,
  NIGHT_SECONDS: 25,
  DAY_SECONDS: 180,
  VOTING_SECONDS: 45,
  PUBLIC_MSG_MAX: 240,
  PRIVATE_MSG_MAX: 240,
  PUBLIC_MSG_MIN_INTERVAL_MS: 1_000,
  PRIVATE_MSG_MIN_INTERVAL_MS: 800,
};

// إذا كان لديك abilities داخل ROLES فسيتم استخدامها تلقائياً.
// بخلاف ذلك، سنسقط على هذا الجدول المبسط.
const FALLBACK_ABILITIES: Record<string, Array<NightAction['action']>> = {
  killer: ['kill'],
  doctor: ['heal'],
  detective: ['investigate'],
  spy: ['spy'],
  bomber: ['bomb'],
  shapeshifter: ['shapeshift'],
  soldier: [],
};

// الحقول الجديدة في mafiaState التي يستخدمها هذا الملف (تأكد من وجودها في الأنواع لديك)
// - lastAbilityUse: Record<playerId, nightNumber>
// - lastHealedPlayerId?: string
// - privateChats: Record<chatId, { participants: string[]; messages: PrivateChatMessage[] }>
// - privateEvents: Record<playerId, PrivateEvent[]>
// - votes: Record<voterId, targetId|null>

// Firebase update helper
export type FSUpdate = Record<string, unknown>;

const deadline = (seconds: number) =>
  Timestamp.fromMillis(Date.now() + Math.max(0, seconds) * 1_000);

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
  if (mafia > good) return { winner: 'mafia', message: 'لقد سيطر فريق الشر على المدينة!' };
  return null;
};

const requirePhase = (game: Game, phases: string[]) => {
  const phase = game.mafiaState?.phase || '';
  if (!phases.includes(phase)) {
    throw new Error(`Invalid phase: ${phase}.`);
  }
};

// ---------------------------------------------------------------------------
// Night & Day internal processors (pure helpers — لا I/O)
// ---------------------------------------------------------------------------

export async function processNightInternal(game: Game): Promise<{
  updatedPlayers: Player[];
  newEvents: DayEvent[];
  newPrivateEvents: Record<string, PrivateEvent[]>;
  newPrivateChats: Record<string, any>;
  newLastHealedPlayerId: string | null;
}> {
  const players = game.players.map((p) => ({ ...p }));
  const nightActions = game.mafiaState?.nightActions || {};
  const newEvents: DayEvent[] = [];
  const newPrivateEvents: Record<string, PrivateEvent[]> = {};
  const newPrivateChats: Record<string, any> = { ...(game.mafiaState?.privateChats || {}) };
  let newLastHealedPlayerId: string | null = null;

  // --- 1) Doctor heal (mark protection)
  const healAction = Object.values(nightActions).find((a) => a.action === 'heal');
  if (healAction && healAction.targetId && healAction.targetId !== 'skip') {
    const doctor = players.find((p) => p.id === healAction.actorId);
    const target = players.find((p) => p.id === healAction.targetId);
    if (isAlive(doctor) && isAlive(target)) {
      (target as any).isProtected = true;
      newLastHealedPlayerId = target.id!;
    }
  }

  // --- 2) Primary kill target (if any)
  const killAction = Object.values(nightActions).find((a) => a.action === 'kill');
  const killTargetId = killAction && killAction.targetId !== 'skip' ? killAction.targetId! : null;

  // --- 3) Bomber revenge: triggers only if bomber is the kill target and NOT protected
  const bomberAction = Object.values(nightActions).find((a) => a.action === 'bomb');

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
          (newPrivateEvents[healAction.actorId] ||= []).push({
            type: 'doctor_success',
            message: 'لقد نجحت في إنقاذ هدفك!',
          });
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

  // Apply primary kill first
  if (killTargetId) markKilled(killTargetId);

  // Bomber revenge: only if bomber was the killed target AND not protected
  if (
    bomberAction?.targetId &&
    killTargetId === bomberAction.actorId
  ) {
    const bomberAfter = players.find((p) => p.id === bomberAction.actorId);
    const bomberWasKilled = bomberAfter?.status === 'killed';
    const bomberProtected = (bomberAfter as any)?.isProtected === true;
    if (bomberWasKilled && !bomberProtected) {
      markKilled(bomberAction.targetId);
      // لا نضيف PrivateEvent بنوع جديد غير معرّف في الأنواع لتفادي تعارض الأنواع.
    }
  }

  // --- 5) Info actions (detective/spy)
  Object.values(nightActions).forEach((action) => {
    (newPrivateEvents[action.actorId] ||= []);
    const actor = players.find((p) => p.id === action.actorId);
    if (!isAlive(actor)) return;
    const target = players.find((p) => p.id === action.targetId);
    if (!target) return;

    if (action.action === 'investigate') {
      const roleInfo = ROLES[target.role! as PlayerRole];
      newPrivateEvents[action.actorId].push({
        type: 'investigation_result',
        message: `تقرير التحقيق: ${target.name} ينتمي إلى ${roleInfo?.team === 'mafia' ? 'فريق الشر' : 'فريق الخير'}.`,
        targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId },
      });
    } else if (action.action === 'spy') {
      const apparent = (target as any).apparentRole || target.role!;
      const roleInfo = ROLES[apparent as PlayerRole];
      if (target.role === 'soldier') {
        newPrivateEvents[action.actorId].push({
          type: 'spy_result_soldier_block',
          message: `لقد حاولت التجسس على ${target.name}، لكنه جندي متأهب وكشفك!`,
          targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: target.role as PlayerRole },
        });
      } else {
        newPrivateEvents[action.actorId].push({
          type: 'spy_result',
          message: `تقرير التجسس: دور ${target.name} هو ${roleInfo?.name ?? apparent}.`,
          targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: apparent as PlayerRole },
        });
        if (roleInfo?.team === 'mafia') {
          const chatId = [actor.id, target.id].sort().join('-');
          if (!newPrivateChats[chatId])
            newPrivateChats[chatId] = { participants: [actor.id, target.id], messages: [] };
        }
      }
    }
  });

  // Cleanup temp flags
  players.forEach((p: any) => {
    delete p.isProtected;
    delete p.apparentRole;
  });

  return { updatedPlayers: players, newEvents, newPrivateEvents, newPrivateChats, newLastHealedPlayerId };
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

  // Count only votes that target living players
  Object.entries(votes).forEach(([_, targetId]) => {
    if (!targetId) return;
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
    if (game.gameState !== 'lobby') return; // منع إعادة البدء
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
      'mafiaState.publicChat': [],
      'mafiaState.privateEvents': {},
      'mafiaState.privateChats': {},
      'mafiaState.nightActions': {},
      'mafiaState.votes': {},
      'mafiaState.lastAbilityUse': {},
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

    const { night } = getSettings(game);

    const update: FSUpdate = {
      'mafiaState.phase': 'night',
      'mafiaState.nightActions': {},
      'mafiaState.votes': {},
      'mafiaState.events': [],
      'mafiaState.publicChat': [],
      'mafiaState.lastExecutedPlayer': deleteField(),
      'mafiaState.night': (game.mafiaState?.night || 0) + 1,
      'mafiaState.timerEndsAt': deadline(night),
    };

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

      requirePhase(game, ['night']);

      const actor = safeGetPlayer(game, action.actorId);
      if (!isAlive(actor)) throw new Error('Only living players can perform night actions.');

      // تحقق من صلاحية الفعل للدور
      if (!canAct(actor, action.action)) {
        throw new Error('دورك لا يملك هذه القدرة.');
      }

      // منع تكرار إرسال
      if (game.mafiaState?.nightActions?.[action.actorId]) {
        throw new Error('لقد قمت بإرسال قرارك بالفعل لهذه الليلة.');
      }

      // منع تكرار حماية نفس اللاعب
      if (action.targetId !== 'skip') {
        if (action.action === 'heal' && game.mafiaState?.lastHealedPlayerId === action.targetId) {
          throw new Error('لا يمكنك حماية نفس اللاعب مرتين على التوالي.');
        }
        // تبريد للقتل والتحقيق: ليلة راحة بين الاستخدامات
        const currentNight = game.mafiaState?.night || 1;
        const lastUsed = game.mafiaState?.lastAbilityUse?.[action.actorId] || 0;
        if ((action.action === 'kill' || action.action === 'investigate') && currentNight === lastUsed + 1) {
          throw new Error('يجب أن ترتاح لليلة واحدة قبل استخدام قدرتك مرة أخرى.');
        }
      }

      const update: FSUpdate = { [`mafiaState.nightActions.${action.actorId}`]: action };

      if ((action.action === 'kill' || action.action === 'investigate') && action.targetId !== 'skip') {
        update[`mafiaState.lastAbilityUse.${action.actorId}`] = game.mafiaState?.night || 1;
      }

      if (action.action === 'shapeshift' && (action as any).disguiseRole) {
        const idx = game.players.findIndex((p) => p.id === action.actorId);
        if (idx > -1) (update as any)[`players.${idx}.apparentRole`] = (action as any).disguiseRole; // مؤقت — يُحذف بنهاية الليل
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
  let finalGameData: Game | null = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    requirePhase(game, ['night']);

    const { updatedPlayers, newEvents, newPrivateEvents, newPrivateChats, newLastHealedPlayerId } =
      await processNightInternal(game);

    const cleaned = updatedPlayers.map(({ apparentRole, ...rest }: any) => rest);

    const winner = checkForWinner(cleaned);

    const update: FSUpdate = {
      players: cleaned,
      'mafiaState.events': newEvents,
      'mafiaState.privateEvents': newPrivateEvents,
      'mafiaState.privateChats': newPrivateChats,
      'mafiaState.lastHealedPlayerId': newLastHealedPlayerId ? newLastHealedPlayerId : deleteField(),
    };

    if (winner) {
      update.gameState = 'final_results';
      update['mafiaState.phase'] = 'final_results';
      update.gameResult = winner;
      update['mafiaState.timerEndsAt'] = deleteField();
      finalGameData = { ...game, players: cleaned, gameResult: winner };
    } else {
      const { day } = getSettings(game);
      update['mafiaState.phase'] = 'day';
      update['mafiaState.timerEndsAt'] = deadline(day);
    }

    tx.update(gameRef, update);
  });

  if (finalGameData) {
    await updateLeagueScoresForGameEnd(finalGameData);
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

      const voter = safeGetPlayer(game, voterId);
      if (!isAlive(voter)) throw new Error('Only living players can vote.');

      if (targetId) {
        const target = safeGetPlayer(game, targetId);
        if (!isAlive(target)) throw new Error('لا يمكنك التصويت للاعب غير موجود أو غير حي.');
      }

      const update: FSUpdate = { [`mafiaState.votes.${voterId}`]: targetId };

      // تقليص المؤقت إن أكمل الجميع التصويت
      const newVotes = { ...(game.mafiaState?.votes || {}), [voterId]: targetId };
      const aliveCount = game.players.filter((p) => p.status === 'alive').length;
      if (Object.keys(newVotes).length === aliveCount) {
        const remaining = (game.mafiaState?.timerEndsAt?.toMillis() || Date.now()) - Date.now();
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
  let gameForLeague: Game | null = null;
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    // ندعم المرحلتين day و voting
    const phase = game.mafiaState?.phase || '';
    if (!['day', 'voting'].includes(phase)) return;

    const { updatedGame, winner } = await processDayInternal(game);

    const update: FSUpdate = { players: updatedGame.players };

    if (winner) {
      (update as any).gameState = 'final_results';
      (update as any)['mafiaState.phase'] = 'final_results';
      (update as any).gameResult = winner;
      (update as any)['mafiaState.timerEndsAt'] = deleteField();
      gameForLeague = { ...game, players: updatedGame.players, gameResult: winner };
    } else {
      (update as any)['mafiaState.phase'] = 'execution';
      (update as any)['mafiaState.events'] = updatedGame.events;
      (update as any)['mafiaState.lastExecutedPlayer'] = updatedGame.lastExecutedPlayer;
      (update as any)['mafiaState.timerEndsAt'] = deleteField();
    }

    tx.update(gameRef, update);
  });

  if (gameForLeague) await updateLeagueScoresForGameEnd(gameForLeague);
}

/** إرسال رسالة عامة أثناء النهار. */
export async function sendPublicMessage(
  gameId: string,
  message: Omit<PublicChatMessage, 'timestamp'>,
): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const trimmed = normalizeMsg(clamp(message.message, DEFAULTS.PUBLIC_MSG_MAX));
  if (!trimmed) throw new Error('الرسالة فارغة.');
  const fullMessage: PublicChatMessage = {
    ...message,
    message: trimmed,
    timestamp: Timestamp.now(),
  } as PublicChatMessage;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    if (game.mafiaState?.phase !== 'day') throw new Error('Can only send messages during the day.');

    const sender = safeGetPlayer(game, message.senderId);
    if (!isAlive(sender)) throw new Error('Only living players can send messages.');

    // منع السبام البسيط: قارن بآخر رسالة
    const last = (game.mafiaState?.publicChat || []).slice(-1)[0] as PublicChatMessage | undefined;
    if (last && last.senderId === message.senderId) {
      const dt = (Timestamp.now().toMillis() - (last.timestamp as any).toMillis?.() || 0);
      if (dt < DEFAULTS.PUBLIC_MSG_MIN_INTERVAL_MS) throw new Error('الرجاء التمهل قبل إرسال رسالة أخرى.');
    }

    tx.update(gameRef, { 'mafiaState.publicChat': arrayUnion(fullMessage) });
  });
}

/** إرسال رسالة خاصة بين المشاركين في دردشة خاصة (متحققة). */
export async function sendPrivateMessage(
  gameId: string,
  chatId: string,
  message: Omit<PrivateChatMessage, 'timestamp'>,
): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const trimmed = normalizeMsg(clamp(message.message, DEFAULTS.PRIVATE_MSG_MAX));
  if (!trimmed) throw new Error('الرسالة فارغة.');
  const fullMessage: PrivateChatMessage = {
    ...message,
    message: trimmed,
    timestamp: Timestamp.now(),
  } as PrivateChatMessage;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    const sender = safeGetPlayer(game, message.senderId);
    if (!isAlive(sender)) throw new Error('Only living players can send private messages.');

    const chat = (game.mafiaState?.privateChats || ({} as any))[chatId];
    if (!chat) throw new Error('المحادثة غير موجودة.');
    if (!Array.isArray(chat.participants) || !chat.participants.includes(message.senderId)) {
      throw new Error('ليست لديك صلاحية لإرسال رسائل في هذه المحادثة.');
    }

    // منع السبام البسيط: قارن بآخر رسالة داخل نفس المحادثة
    const msgs = Array.isArray(chat.messages) ? chat.messages : [];
    const last = msgs.slice(-1)[0] as PrivateChatMessage | undefined;
    if (last && last.senderId === message.senderId) {
      const dt = (Timestamp.now().toMillis() - (last.timestamp as any).toMillis?.() || 0);
      if (dt < DEFAULTS.PRIVATE_MSG_MIN_INTERVAL_MS) throw new Error('الرجاء التمهل قبل إرسال رسالة أخرى.');
    }

    tx.update(gameRef, { [`mafiaState.privateChats.${chatId}.messages`]: arrayUnion(fullMessage) });
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

    