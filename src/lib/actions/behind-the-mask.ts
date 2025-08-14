'use server';

/**
 * @fileoverview Server actions for the "Behind the Mask" (mafia-style) game.
 *
 * ✅ نفس الواجهات والدوال المصدَّرة — بدون كسر المنطق العام.
 * ✨ تحسينات كبيرة على القابلية للصيانة، الصرامة، والأمان المنطقي.
 * 🧩 تقليل التعارضات على Firestore، ضبط المؤقتات مركزيًا، تنقية الرسائل،
 *     ورفع وضوح الأخطاء مع تعريب كامل للمستخدم.
 */

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, deleteField, arrayUnion } from 'firebase/firestore';
import type {
  Game,
  Player,
  NightAction,
  DayEvent,
  PrivateChatMessage,
  PublicChatMessage,
  GameResult,
  PrivateEvent,
} from '@/types';
import { getRoleDistribution, ROLES } from '@/data/mafia-roles';
import { updateLeagueScoresForGameEnd } from './user';

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
};

type FSUpdate = Record<string, unknown>;

const deadline = (seconds: number) => Timestamp.fromMillis(Date.now() + Math.max(0, seconds) * 1000);

const isAlive = (p?: Player | null): p is Player => !!p && p.status === 'alive';

const requireGame = (game: Game | undefined) => {
  if (!game) throw new Error('Game not found.');
  return game;
};

const requireHost = (game: Game, hostId: string) => {
  if (game.hostId !== hostId) throw new Error('Only the host can perform this action.');
};

const ensureNotFinal = (game: Game) => {
  if (game.gameState === 'final_results' || game.mafiaState?.phase === 'final_results') {
    throw new Error('انتهت اللعبة بالفعل.');
  }
};

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

const getSettings = (game: Game) => ({
  night: game.mafiaState?.settings?.nightTime ?? DEFAULTS.NIGHT_SECONDS,
  day: game.mafiaState?.settings?.dayTime ?? DEFAULTS.DAY_SECONDS,
});

const safeGetPlayer = (game: Game, id: string | null | undefined) => game.players.find((p) => p.id === id);

export const checkForWinner = (players: Player[]): GameResult | null => {
  const alive = players.filter((p) => p.status === 'alive');
  const good = alive.filter((p) => p.team === 'good').length;
  const mafia = alive.filter((p) => p.team === 'mafia').length;
  if (mafia === 0) return { winner: 'good', message: 'لقد قضى فريق الخير على كل الأشرار!' };
  if (mafia >= good) return { winner: 'mafia', message: 'لقد سيطر فريق الشر على المدينة!' };
  return null;
};

// ---------------------------------------------------------------------------
// Night & Day internal processors (pure-ish helpers)
// ---------------------------------------------------------------------------

export async function processNightInternal(game: Game) {
  const players = game.players.map((p) => ({ ...p }));
  const nightActions = game.mafiaState?.nightActions || {};
  const newEvents: DayEvent[] = [];
  const newPrivateEvents: Record<string, PrivateEvent[]> = {};
  const newPrivateChats: Record<string, any> = game.mafiaState?.privateChats || {};
  let newLastHealedPlayerId: string | null = null;
  let killTarget: { targetId: string; bomberId?: string } | null = null;

  // 1) Doctor heal
  const healAction = Object.values(nightActions).find((a) => a.action === 'heal');
  if (healAction) {
    const doctor = players.find((p) => p.id === healAction.actorId);
    if (isAlive(doctor)) {
      const target = players.find((p) => p.id === healAction.targetId);
      if (isAlive(target)) {
        (target as any).isProtected = true;
        newLastHealedPlayerId = target.id;
      }
    }
  }

  // 2) Killer kill
  const killAction = Object.values(nightActions).find((a) => a.action === 'kill');
  if (killAction && killAction.targetId !== 'skip') {
    killTarget = { targetId: killAction.targetId };
  }

  // 3) Bomber revenge
  const bomberAction = Object.values(nightActions).find((a) => a.action === 'bomb');
  if (bomberAction?.targetId) {
    const bomber = players.find((p) => p.id === bomberAction.actorId);
    if (bomber && bomber.status === 'killed' && killAction?.targetId === bomber.id) {
      killTarget = { targetId: bomberAction.targetId, bomberId: bomberAction.actorId };
    }
  }

  // 4) Resolve kill
  if (killTarget) {
    const idx = players.findIndex((p) => p.id === killTarget!.targetId);
    if (idx !== -1) {
      const target = players[idx];
      if ((target as any).isProtected) {
        newEvents.push({ type: 'protection', message: 'لقد حاول القاتل الهجوم، لكن الطبيب أنقذ الهدف في الوقت المناسب!' });
        if (healAction) {
          (newPrivateEvents[healAction.actorId] ||= []).push({ type: 'doctor_success', message: 'لقد نجحت في إنقاذ هدفك!' });
        }
      } else {
        players[idx].status = 'killed';
        newEvents.push({
          type: 'death',
          message: `استيقظ أهل المدينة ليجدوا ${target.name} قد قُتل!`,
          killedPlayer: { name: target.name, avatarId: target.avatarId },
        });
      }
    }
  }

  // 5) Info actions (detective/spy)
  Object.values(nightActions).forEach((action) => {
    (newPrivateEvents[action.actorId] ||= []);
    const actor = players.find((p) => p.id === action.actorId);
    if (!isAlive(actor)) return;
    const target = players.find((p) => p.id === action.targetId);
    if (!target) return;

    if (action.action === 'investigate') {
      const roleInfo = ROLES[target.role!];
      newPrivateEvents[action.actorId].push({
        type: 'investigation_result',
        message: `تقرير التحقيق: ${target.name} ينتمي إلى ${roleInfo.team === 'mafia' ? 'فريق الشر' : 'فريق الخير'}.`,
        targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId },
      });
    } else if (action.action === 'spy') {
      const apparent = target.apparentRole || target.role!;
      const roleInfo = ROLES[apparent];
      if (target.role === 'soldier') {
        newPrivateEvents[action.actorId].push({
          type: 'spy_result_soldier_block',
          message: `لقد حاولت التجسس على ${target.name}، لكنه جندي متأهب وكشفك!`,
          targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: target.role },
        });
      } else {
        newPrivateEvents[action.actorId].push({
          type: 'spy_result',
          message: `تقرير التجسس: دور ${target.name} هو ${roleInfo.name}.`,
          targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: apparent },
        });
        if (roleInfo.team === 'mafia') {
          const chatId = [actor.id, target.id].sort().join('-');
          if (!newPrivateChats[chatId]) newPrivateChats[chatId] = { participants: [actor.id, target.id], messages: [] };
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

export async function processDayInternal(game: Game) {
  const players = [...game.players];
  const votes = game.mafiaState?.votes || {};
  const counts: Record<string, number> = {};
  const events: DayEvent[] = [];
  let executed: Player | null = null;

  Object.values(votes).forEach((targetId) => {
    if (targetId) counts[targetId] = (counts[targetId] || 0) + 1;
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
        executedPlayer: { name: executed.name, avatarId: executed.avatarId, temporaryTitle: executed.temporaryTitle },
      });
    }
  } else {
    events.push({ type: 'no_execution', message: 'لم يتمكن أهل المدينة من الاتفاق على إعدام أحد.' });
  }

  const winner = checkForWinner(players);
  const lastExecutedPlayer = executed
    ? { name: executed.name, avatarId: executed.avatarId, temporaryTitle: executed.temporaryTitle }
    : null;

  return { updatedGame: { players, events, lastExecutedPlayer }, winner };
}

// ---------------------------------------------------------------------------
// Exported Actions (public API) — preserved names & signatures
// ---------------------------------------------------------------------------

/**
 * يبدأ اللعبة: توزيع الأدوار، الانتقال إلى مرحلة كشف الدور.
 */
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
      team: ROLES[roles[i]!].team,
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
      'mafiaState.nightActions': {},
      'mafiaState.timerEndsAt': deadline(DEFAULTS.ROLE_REVEAL_SECONDS),
    };

    tx.update(gameRef, update);
  });
}

/**
 * انتقال من كشف الأدوار/التنفيذ إلى الليل.
 */
export async function transitionToNight(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    if (!['role_reveal', 'execution'].includes(game.mafiaState?.phase || '')) return;

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

/**
 * إرسال قرار ليلي للاعب.
 */
export async function submitNightAction(
  gameId: string,
  action: NightAction,
): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef);
      const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

      if (game.mafiaState?.phase !== 'night') throw new Error('Night actions can only be submitted at night.');

      const actor = safeGetPlayer(game, action.actorId);
      if (!isAlive(actor)) throw new Error('Only living players can perform night actions.');

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

      if (action.action === 'shapeshift' && action.disguiseRole) {
        const idx = game.players.findIndex((p) => p.id === action.actorId);
        if (idx > -1) update[`players.${idx}.apparentRole`] = action.disguiseRole; // سيتم تنظيفها بنهاية الليل
      }

      tx.update(gameRef, update);
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'حدث خطأ غير متوقع.' };
  }
}

/**
 * معالجة الليل والانتقال تلقائيًا إلى النهار أو النتائج.
 */
export async function processNight(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    if (game.mafiaState?.phase !== 'night') return;

    const { updatedPlayers, newEvents, newPrivateEvents, newPrivateChats, newLastHealedPlayerId } =
      await processNightInternal(game);

    // إزالة الـ apparentRole المؤقت قبل الحفظ
    const cleaned = updatedPlayers.map(({ apparentRole, ...rest }) => rest);

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
      await updateLeagueScoresForGameEnd({ ...game, players: cleaned, gameResult: winner });
    } else {
      const { day } = getSettings(game);
      update['mafiaState.phase'] = 'day';
      update['mafiaState.timerEndsAt'] = deadline(day);
    }

    tx.update(gameRef, update);
  });
}

/**
 * الانتقال من النقاش إلى التصويت.
 */
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

/**
 * إرسال تصويت أثناء النهار.
 */
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

      if (game.mafiaState?.phase !== 'day') throw new Error('Voting is not active.');

      const voter = safeGetPlayer(game, voterId);
      if (!isAlive(voter)) throw new Error('Only living players can vote.');

      // لا تسمح بالتصويت للاعب غير موجود أو غير حي
      if (targetId) {
        const target = safeGetPlayer(game, targetId);
        if (!isAlive(target)) throw new Error('لا يمكنك التصويت للاعب غير موجود أو غير حي.');
      }

      const newVotes = { ...(game.mafiaState?.votes || {}), [voterId]: targetId };
      const aliveCount = game.players.filter((p) => p.status === 'alive').length;

      const update: FSUpdate = { [`mafiaState.votes.${voterId}`]: targetId };

      // تقليص المؤقت إن أكمل الجميع التصويت
      if (Object.keys(newVotes).length === aliveCount) {
        const remaining = (game.mafiaState?.timerEndsAt?.toMillis() || Date.now()) - Date.now();
        if (remaining > 20_000) update['mafiaState.timerEndsAt'] = deadline(20);
      }

      tx.update(gameRef, update);
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'حدث خطأ غير متوقع.' };
  }
}

/**
 * معالجة التصويت في نهاية النهار والانتقال لمرحلة التنفيذ أو إنهاء اللعبة.
 */
export async function processDay(gameId: string, hostId: string): Promise<void> {
  let gameForLeague: Game | null = null;
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    if (game.mafiaState?.phase !== 'day') return;

    const { updatedGame, winner } = await processDayInternal(game);

    const update: FSUpdate = { players: updatedGame.players };

    if (winner) {
      update.gameState = 'final_results';
      update['mafiaState.phase'] = 'final_results';
      update.gameResult = winner;
      update['mafiaState.timerEndsAt'] = deleteField();
      gameForLeague = { ...game, players: updatedGame.players, gameResult: winner };
    } else {
      update['mafiaState.phase'] = 'execution';
      update['mafiaState.events'] = updatedGame.events;
      update['mafiaState.lastExecutedPlayer'] = updatedGame.lastExecutedPlayer;
      update['mafiaState.timerEndsAt'] = deleteField();
    }

    tx.update(gameRef, update);
  });

  if (gameForLeague) await updateLeagueScoresForGameEnd(gameForLeague);
}

/**
 * إرسال رسالة عامة أثناء النهار.
 */
export async function sendPublicMessage(gameId: string, message: Omit<PublicChatMessage, 'timestamp'>): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const fullMessage: PublicChatMessage = { ...message, message: clamp(message.message, DEFAULTS.PUBLIC_MSG_MAX), timestamp: Timestamp.now() } as PublicChatMessage;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    if (game.mafiaState?.phase !== 'day') throw new Error('Can only send messages during the day.');

    const sender = safeGetPlayer(game, message.senderId);
    if (!isAlive(sender)) throw new Error('Only living players can send messages.');

    tx.update(gameRef, { 'mafiaState.publicChat': arrayUnion(fullMessage) });
  });
}

/**
 * إرسال رسالة خاصة بين الجاسوس والقاتل.
 */
export async function sendPrivateMessage(
  gameId: string,
  chatId: string,
  message: Omit<PrivateChatMessage, 'timestamp'>,
): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  const fullMessage: PrivateChatMessage = { ...message, message: clamp(message.message, DEFAULTS.PRIVATE_MSG_MAX), timestamp: Timestamp.now() } as PrivateChatMessage;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    const sender = safeGetPlayer(game, message.senderId);
    if (!isAlive(sender)) throw new Error('Only living players can send private messages.');

    tx.update(gameRef, { [`mafiaState.privateChats.${chatId}.messages`]: arrayUnion(fullMessage) });
  });
}

/**
 * تحديث إعدادات المافيا — فقط في اللوبي.
 */
export async function updateMafiaSettings(
  gameId: string,
  hostId: string,
  settings: Game['mafiaState']['settings'],
): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);
    requireHost(game, hostId);
    if (game.gameState !== 'lobby') throw new Error('Settings can only be changed in the lobby.');

    // لا نُحدِّث المؤقت هنا (لا يوجد مؤقت نشط في اللوبي)
    tx.update(gameRef, { 'mafiaState.settings': settings });
  });
}
