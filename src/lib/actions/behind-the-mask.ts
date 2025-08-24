
'use server';

/**
 * Server actions for "Behind the Mask" (mafia-style).
 * - الحفاظ على واجهات الدوال الأصلية.
 * - تبريد (cooldown) مُصحَّح: يُطبَّق فقط إذا استُخدمت القدرة فعلاً ليلة سابقة.
 * - القاتل: قدرة قتل فردية (ليس تصويتاً جماعياً).
 * - الطبيب يمنع القتل على الهدف المحمي.
 * - الجندي يصد التجسس فقط (لا حصانة من القتل).
 * - لا نضع Promise داخل tx.update() — أي عمليات async خارج المعاملة.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  deleteField,
  arrayUnion,
  updateDoc,
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
import { distributeEndOfGameAwards, updateLeagueScoresForGameEnd } from './user';

// -----------------------------
// ثوابت ومساعدات
// -----------------------------
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

const canAct = (actor: Player | undefined, action: NightAction['action']) => {
  if (!actor || !actor.role) return false;
  return ROLES[actor.role]?.nightAction === action;
};

export async function checkForWinner(players: Player[]): Promise<MafiaGameResult | null> {
  const alive = players.filter((p) => p.status === 'alive');
  const good = alive.filter((p) => p.team === 'good').length;
  const mafia = alive.filter((p) => p.team === 'mafia').length;

  if (mafia === 0 && good > 0) return { winner: 'good', message: 'لقد قضى فريق الخير على كل الأشرار!' };
  if (mafia > 0 && good === 0) return { winner: 'mafia', message: 'لقد سيطر فريق الشر على المدينة!' };
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
  const ms = typeof ends?.toMillis === 'function' ? ends.toMillis() : Number(ends) || 0;
  return nowMs() <= ms;
};

/**
 * Require phase and timer, but allow host override if callerHostId === game.hostId.
 * Use this in actions the host may force (processNight, transitionToNight, transitionToVoting, processDay).
 */
const requirePhaseAndTimerOrHost = (game: Game, phases: string[], callerHostId?: string) => {
  requirePhase(game, phases);
  const active = timerActive(game);
  if (!active) {
    if (!callerHostId || callerHostId !== game.hostId) {
      throw new Error('Time is over for this phase.');
    }
  }
};

// -----------------------------
// Process night internal (pure)
// -----------------------------
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

  // temporary disguise map (affects what spy sees)
  const apparentById: Record<string, string> = {};
  Object.values(nightActions).forEach((a: any) => {
    if (a?.action === 'shapeshift' && a?.actorId && a?.disguiseRole) {
      // only accept valid role keys
      if (ROLES[a.disguiseRole as keyof typeof ROLES]) apparentById[a.actorId] = a.disguiseRole;
    }
  });

  // 1) Doctor protect
  const healAction = Object.values(nightActions).find((a: any) => a.action === 'heal');
  if (healAction && healAction.targetId && healAction.targetId !== 'skip') {
    const doctor = players.find((p) => p.id === healAction.actorId);
    const target = players.find((p) => p.id === healAction.targetId);
    if (isAlive(doctor) && isAlive(target)) {
      (target as any).isProtected = true;
      newLastHealedPlayerId = target.id!;
    }
  }

  // 2) Killer individual kill
  const killAction = Object.values(nightActions).find((a: any) => a.action === 'kill');
  const killTargetId = killAction && killAction.targetId !== 'skip' ? killAction.targetId! : null;

  // 3) Bomber revenge
  const bomberActions = Object.values(nightActions).filter((a: any) => a.action === 'bomb');

  // 4) Resolve deaths: killer first, then bombers
  const deaths: Player[] = [];
  const markKilled = (pid: string | null | undefined) => {
    if (!pid) return;
    const idx = players.findIndex((p) => p.id === pid);
    if (idx === -1) return;
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
  };

  if (killTargetId) markKilled(killTargetId);

  // bomber revenge: if bomber was killed and not protected then kill target
  for (const b of bomberActions as any[]) {
    if (!b?.actorId || !b?.targetId) continue;
    const bomberAfter = players.find((p) => p.id === b.actorId);
    const bomberWasKilled = bomberAfter?.status === 'killed';
    const bomberProtected = (bomberAfter as any)?.isProtected === true;
    if (bomberWasKilled && !bomberProtected) {
      markKilled(b.targetId);
    }
  }

  // 5) Info actions
  Object.values(nightActions).forEach((action: any) => {
    (newPrivateEvents[action.actorId] ||= []);
    const actor = players.find((p) => p.id === action.actorId);
    if (!isAlive(actor)) return;
    const target = players.find((p) => p.id === action.targetId);
    if (!target) return;

    if (action.action === 'investigate') {
      // detective sees real team (disguise does not affect)
      const roleInfo = ROLES[target.role! as PlayerRole];
      newPrivateEvents[action.actorId].push({
        type: 'investigation_result',
        message: `تقرير التحقيق: ${target.name} ينتمي إلى ${roleInfo?.team === 'mafia' ? 'فريق الشر' : 'فريق الخير'}.`,
        targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId },
      } as PrivateEvent);
    } else if (action.action === 'spy') {
      // soldier blocks spy only
      if (target.role === 'soldier') {
        newPrivateEvents[action.actorId].push({
          type: 'spy_result_soldier_block',
          message: `لقد حاولت التجسس على ${target.name}، لكنه جندي متأهب وكشفك!`,
          targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: target.role as PlayerRole },
        } as PrivateEvent);
        return;
      }

      // spy sees apparent role (affected by shapeshift)
      const apparent = apparentById[target.id!] || target.role!;
      const roleInfo = ROLES[apparent as PlayerRole];

      newPrivateEvents[action.actorId].push({
        type: 'spy_result',
        message: `تقرير التجسس: دور ${target.name} هو ${roleInfo?.name ?? apparent}.`,
        targetPlayer: { id: target.id, name: target.name, avatarId: target.avatarId, role: apparent as PlayerRole },
      } as PrivateEvent);

      // open private chat if spy discovered mafia (in your design mafia = killer + spy)
      if (roleInfo?.team === 'mafia') {
        const chatId = [action.actorId, target.id].sort().join('-');
        if (!newPrivateChats[chatId]) newPrivateChats[chatId] = { participants: [action.actorId, target.id], messages: [] };
      }
    }
  });

  // cleanup temp flags
  players.forEach((p: any) => {
    delete p.isProtected;
  });

  return { updatedPlayers: players, newEvents, newPrivateEvents, newPrivateChats, newLastHealedPlayerId };
}

// -----------------------------
// Process day internal (pure)
// -----------------------------
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
    const playerVoteCounts: Record<string, number> = {};
    let skipVotes = 0;
    const events: DayEvent[] = [];
    let executed: Player | null = null;
  
    const aliveIds = new Set(game.players.filter(isAlive).map((p) => p.id));
  
    // Tally votes for players and for skipping
    Object.entries(votes).forEach(([voterId, targetId]) => {
      if (!aliveIds.has(voterId)) return;
  
      if (targetId === null) {
        skipVotes += 1;
      } else if(targetId) {
        const target = players.find((p) => p.id === targetId);
        if (isAlive(target)) {
          playerVoteCounts[targetId] = (playerVoteCounts[targetId] || 0) + 1;
        }
      }
    });
  
    const maxPlayerVotes = Math.max(0, ...Object.values(playerVoteCounts));
  
    // Only execute if a player has strictly more votes than the skip option
    if (maxPlayerVotes > 0 && maxPlayerVotes > skipVotes) {
      const topIds = Object.keys(playerVoteCounts).filter((id) => playerVoteCounts[id] === maxPlayerVotes);
  
      // And only if there's no tie for the most votes
      if (topIds.length === 1) {
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
        // Tie among players
        events.push({ type: 'no_execution', message: 'لم يتمكن أهل المدينة من الاتفاق على إعدام أحد بسبب تساوي الأصوات.' });
      }
    } else {
      // Skip wins or is tied with the max player votes
      events.push({ type: 'no_execution', message: 'قرر أهل المدينة تخطي الإعدام هذه المرة.' });
    }
  
    const winner = await checkForWinner(players);
    const lastExecutedPlayer = executed ? { name: executed.name, avatarId: executed.avatarId, temporaryTitle: (executed as any).temporaryTitle } : null;
  
    return { updatedGame: { players, events, lastExecutedPlayer }, winner };
}

// -----------------------------
// Exported Actions (public API)
// -----------------------------

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

/** انتقال من كشف الأدوار/التنفيذ إلى الليل. (host may override expired timer) */
export async function transitionToNight(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    requirePhaseAndTimerOrHost(game, ['role_reveal', 'execution'], hostId);

    const phase = game.mafiaState?.phase || '';
    if (!['role_reveal', 'execution'].includes(phase)) return;

    const nextNight = phase === 'role_reveal' ? 1 : (game.mafiaState?.night || 0) + 1;
    const { night } = getSettings(game);

    const update: FSUpdate = {
      'mafiaState.phase': 'night',
      'mafiaState.nightActions': {},
      'mafiaState.votes': {},
      'mafiaState.events': [],
      'mafiaState.publicChat': [],
      'mafiaState.lastExecutedPlayer': deleteField(),
      'mafiaState.night': nextNight,
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

      if (game.mafiaState?.phase !== 'night') {
        // Silently fail if phase moved on.
        return;
      }
      
      const actor = safeGetPlayer(game, action.actorId);
      if (!isAlive(actor)) throw new Error('Only living players can perform night actions.');

      if (!canAct(actor, action.action)) throw new Error('دورك لا يملك هذه القدرة.');

      if (game.mafiaState?.nightActions?.[action.actorId]) throw new Error('لقد قمت بإرسال قرارك بالفعل لهذه الليلة.');

      if (action.targetId && action.targetId !== 'skip') {
        const target = safeGetPlayer(game, action.targetId);
        if (!isAlive(target)) throw new Error('الهدف غير صالح أو غير حي.');
      }

      if (action.action === 'shapeshift') {
        const disguise = (action as any).disguiseRole;
        if (!disguise || !(disguise in ROLES)) throw new Error('دور التنكّر غير صالح.');
      }

      const currentNight = game.mafiaState?.night || 1;
      const lastUsed = game.mafiaState?.lastAbilityUse?.[action.actorId!];
      // FIX: Ensure lastUsed is a number before check
      if ((action.action === 'kill' || action.action === 'investigate') && typeof lastUsed === 'number' && currentNight === lastUsed + 1) {
          throw new Error('يجب أن ترتاح لليلة واحدة قبل استخدام قدرتك مرة أخرى.');
      }

      const update: FSUpdate = { [`mafiaState.nightActions.${action.actorId}`]: action };

      if ((action.action === 'kill' || action.action === 'investigate') && action.targetId !== 'skip') {
        update[`mafiaState.lastAbilityUse.${action.actorId}`] = game.mafiaState?.night || 1;
      }

      tx.update(gameRef, update);
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'حدث خطأ غير متوقع.' };
  }
}

/** معالجة الليل والانتقال تلقائيًا إلى النهار أو النتائج. (host may override expired timer) */
export async function processNight(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let finalGameDataForAwards: Game | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    requirePhaseAndTimerOrHost(game, ['night'], hostId);

    const { updatedPlayers, newEvents, newPrivateEvents, newPrivateChats, newLastHealedPlayerId } =
      await processNightInternal(game);

    const winner = await checkForWinner(updatedPlayers);

    const update: FSUpdate = {
      players: updatedPlayers,
      'mafiaState.events': newEvents,
      'mafiaState.privateEvents': newPrivateEvents,
      'mafiaState.privateChats': newPrivateChats,
      'mafiaState.lastHealedPlayerId': newLastHealedPlayerId ? newLastHealedPlayerId : deleteField(),
      'mafiaState.nightActions': {},
    };

    if (winner) {
      update['gameState'] = 'final_results';
      update['mafiaState.phase'] = 'final_results';
      update['gameResult'] = winner;
      update['mafiaState.timerEndsAt'] = deleteField();
      finalGameDataForAwards = { ...game, players: updatedPlayers, gameResult: winner };
    } else {
      const { day } = getSettings(game);
      update['mafiaState.phase'] = 'day';
      update['mafiaState.timerEndsAt'] = deadline(day);
    }

    tx.update(gameRef, update);
  });
  
  if (finalGameDataForAwards) {
      await updateLeagueScoresForGameEnd(finalGameDataForAwards as any);
      await distributeEndOfGameAwards(gameId);
  }
}

/** الانتقال من النقاش إلى التصويت. (host may override expired timer) */
export async function transitionToVoting(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    if(game.mafiaState?.phase !== 'day') return; // Do not use requirePhase here, to avoid throwing error in a loop

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

      const newVotes = { ...(game.mafiaState?.votes || {}), [voterId]: targetId };
      const aliveCount = game.players.filter((p) => p.status === 'alive').length;
      if (Object.keys(newVotes).length === aliveCount) {
        const remaining = (game.mafiaState?.timerEndsAt?.toMillis() || nowMs()) - nowMs();
        if (remaining > 20_000) (update as any)['mafiaState.timerEndsAt'] = deadline(20);
      }

      tx.update(gameRef, update);
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'حدث خطأ غير متوقع.' };
  }
}

/** معالجة التصويت في نهاية النهار/التصويت والانتقال لمرحلة التنفيذ أو إنهاء اللعبة. (host may override expired timer) */
export async function processDay(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let finalGameDataForAwards: Game | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = requireGame(snap.exists() ? (snap.data() as Game) : undefined);

    requireHost(game, hostId);
    requirePhaseAndTimerOrHost(game, ['day', 'voting'], hostId);

    const { updatedGame, winner } = await processDayInternal(game);

    const update: FSUpdate = { players: updatedGame.players };

    if (winner) {
      (update as any).gameState = 'final_results';
      (update as any)['mafiaState.phase'] = 'final_results';
      (update as any).gameResult = winner;
      (update as any)['mafiaState.timerEndsAt'] = deleteField();

      finalGameDataForAwards = { ...game, players: updatedGame.players, gameResult: winner };
    } else {
      (update as any)['mafiaState.phase'] = 'execution';
      (update as any)['mafiaState.events'] = updatedGame.events;
      (update as any)['mafiaState.lastExecutedPlayer'] = updatedGame.lastExecutedPlayer;
      (update as any)['mafiaState.timerEndsAt'] = deleteField();
    }

    tx.update(gameRef, update);
  });
  
  if (finalGameDataForAwards) {
      await updateLeagueScoresForGameEnd(finalGameDataForAwards as any);
      await distributeEndOfGameAwards(gameId);
  }
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
    if (!timerActive(game)) throw new Error('Time is over for this phase.');

    const sender = safeGetPlayer(game, message.senderId);
    if (!isAlive(sender)) throw new Error('Only living players can send messages.');

    const last = (game.mafiaState?.publicChat || []).slice(-1)[0] as PublicChatMessage | undefined;
    if (last && last.senderId === message.senderId) {
      const lastMs =
        typeof (last.timestamp as any)?.toMillis === 'function'
          ? (last.timestamp as any).toMillis()
          : Number(last.timestamp) || 0;
      const dt = Timestamp.now().toMillis() - lastMs;
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

    if (!timerActive(game)) throw new Error('Time is over for this phase.');

    const sender = safeGetPlayer(game, message.senderId);
    if (!isAlive(sender)) throw new Error('Only living players can send private messages.');

    const chat = (game.mafiaState?.privateChats || ({} as any))[chatId];
    if (!chat) throw new Error('المحادثة غير موجودة.');
    if (!Array.isArray(chat.participants) || !chat.participants.includes(message.senderId)) {
      throw new Error('ليست لديك صلاحية لإرسال رسائل في هذه المحادثة.');
    }

    const msgs = Array.isArray(chat.messages) ? chat.messages : [];
    const last = msgs.slice(-1)[0] as PrivateChatMessage | undefined;
    if (last && last.senderId === message.senderId) {
      const lastMs =
        typeof (last.timestamp as any)?.toMillis === 'function'
          ? (last.timestamp as any).toMillis()
          : Number(last.timestamp) || 0;
      const dt = Timestamp.now().toMillis() - lastMs;
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

    const nightTime = Math.max(10, Math.min(300, Number((settings as any)?.nightTime ?? DEFAULTS.NIGHT_SECONDS)));
    const dayTime = Math.max(30, Math.min(600, Number((settings as any)?.dayTime ?? DEFAULTS.DAY_SECONDS)));

    tx.update(gameRef, { 'mafiaState.settings': { nightTime, dayTime } });
  });
}

    