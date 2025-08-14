/**
 * @fileoverview Word War actions — v2 (GPT-5 Thinking)
 * Enhancements merged as requested:
 * 1) Server-grade timers (authoritative start markers; callable+scheduled enforcement provided separately).
 * 2) Card state Map (keyed by a safe key) with backward compatibility for existing array docs.
 * 3) Lightweight metrics (reject counters + last action timestamps + optional client latency hints).
 *
 * Notes:
 * - UI can keep using the legacy array for now, لكن للاستفادة الكاملة من الكتابة الجزئية
 *   انتقل للحقول الجديدة:
 *     - wordWarState.cardsMap: Record<CardKey, { text, color, revealed }>
 *     - wordWarState.cardsOrder: string[] (ثبات الترتيب لعرض اللوحة)
 *   حيث CardKey = safeKeyFromText(text).
 * - كل الدوال تحافظ على منطق اللعبة السابق.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  deleteField,
  updateDoc,
  serverTimestamp,
  startAfter,
  increment,
  type DocumentReference,
} from 'firebase/firestore';
import type { Game, Player, WordWarCard } from '@/types';
import { shuffle } from '@/lib/actions/helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { WORD_WAR_WORDS } from '@/data/word-war-words';

// =====================
// Constants & Utilities
// =====================
const DEFAULT_TURN_TIME = 60; // seconds
const PREPARATION_TIME = 15;  // seconds
const WORD_COUNT = 40;

const nowMs = () => Date.now();
const millis = (sec: number) => sec * 1000;

const nextTeam = (team: 'red' | 'blue') => (team === 'red' ? 'blue' : 'red');

function getTurnTime(game: Game): number {
  return game.wordWarState?.settings?.turnTime || DEFAULT_TURN_TIME;
}

/**
 * Safe key for use as object field path.
 * - Base64url of UTF-8 text to avoid '.', '/', '[', ']' ...etc.
 */
function keyFromText(text: string): string {
  const enc = new TextEncoder().encode(text);
  const b64 = typeof window === 'undefined'
    ? Buffer.from(enc).toString('base64')
    : btoa(String.fromCharCode(...Array.from(enc)));
  return b64.replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Server-consistent timer model: we store a serverTimestamp start marker and a duration.
 * UI can derive remaining time from { startedAt + durationSec }.
 * We also keep a client-computed endsAtApprox for snappy UI (non-authoritative).
 */
function setTimer(
  t: FirebaseFirestore.Transaction,
  gameRef: DocumentReference,
  phase: 'prep' | 'guide' | 'guess',
  durationSec: number
) {
  t.update(gameRef, {
    'wordWarState.timer': {
      phase,
      startedAt: serverTimestamp(),
      durationSec,
      endsAtApprox: nowMs() + millis(durationSec),
    },
  });
}

function clearTimer(t: FirebaseFirestore.Transaction, gameRef: DocumentReference) {
  t.update(gameRef, { 'wordWarState.timer': deleteField() });
}

function checkWinFromArray(cards: WordWarCard[]) {
  const redLeft = cards.filter((c) => c.color === 'red' && !c.revealed).length;
  const blueLeft = cards.filter((c) => c.color === 'blue' && !c.revealed).length;
  if (redLeft === 0) return { winner: 'red' as const, message: 'كشف الفريق الأحمر جميع كلماته!' };
  if (blueLeft === 0) return { winner: 'blue' as const, message: 'كشف الفريق الأزرق جميع كلماته!' };
  return null;
}

function checkWinFromMap(cardsMap: Record<string, WordWarCard>) {
  let redLeft = 0, blueLeft = 0;
  for (const k in cardsMap) {
    const c = cardsMap[k];
    if (!c.revealed) {
      if (c.color === 'red') redLeft++;
      if (c.color === 'blue') blueLeft++;
    }
  }
  if (redLeft === 0) return { winner: 'red' as const, message: 'كشف الفريق الأحمر جميع كلماته!' };
  if (blueLeft === 0) return { winner: 'blue' as const, message: 'كشف الفريق الأزرق جميع كلماته!' };
  return null;
}

function ensureHost(game: Game, hostId: string) {
  if (game.hostId !== hostId) throw new Error('Only the host can perform this action.');
}

function ensureLobby(game: Game) {
  if (game.gameState !== 'lobby') throw new Error('يمكن تنفيذ هذا الإجراء من الردهة فقط.');
}

function ensurePlayerInGame(game: Game, playerId: string) {
  const p = game.players.find((pl) => pl.id === playerId);
  if (!p) throw new Error('Player not found in game.');
  return p;
}

// To guard against duplicate/stale actions without breaking API, we maintain an internal turnId.
function bumpTurnId(t: FirebaseFirestore.Transaction, gameRef: DocumentReference, current: number | undefined) {
  t.update(gameRef, { 'wordWarState.turnId': (current || 0) + 1 });
}

// Metrics helpers
function metricInc(t: FirebaseFirestore.Transaction, gameRef: DocumentReference, path: string) {
  t.update(gameRef, { [path]: increment(1), 'metrics.lastUpdatedAt': serverTimestamp() });
}

// =====================
// Cards Generation (Map + Order) with backward compat array
// =====================
const generateCards = async () => {
  if (WORD_WAR_WORDS.length < WORD_COUNT) {
    throw new Error(`لا توجد كلمات كافية في قائمة الكلمات. تحتاج إلى ${WORD_COUNT} كلمة على الأقل.`);
  }

  const shuffledWords = shuffle([...WORD_WAR_WORDS]).slice(0, WORD_COUNT);

  // 15 Red, 14 Blue, 10 Neutral, 1 Assassin
  const colors: WordWarCard['color'][] = [
    ...Array(15).fill('red'),
    ...Array(14).fill('blue'),
    ...Array(10).fill('neutral'),
    'assassin',
  ];

  const shuffledColors = shuffle(colors);

  // Build map + order + legacy array for compatibility
  const cardsOrder: string[] = [];
  const cardsMap: Record<string, WordWarCard> = {};
  const legacyArray: WordWarCard[] = [];

  shuffledWords.forEach((word, index) => {
    const card: WordWarCard = { text: word, color: shuffledColors[index], revealed: false };
    const key = keyFromText(word);
    cardsOrder.push(key);
    cardsMap[key] = card;
    legacyArray.push(card);
  });

  return { cardsOrder, cardsMap, legacyArray };
};

// =====================
// Actions
// =====================
export async function updateGameSettings(
  gameId: string,
  hostId: string,
  settings: Game['wordWarState']['settings']
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    ensureHost(game, hostId);
    ensureLobby(game);

    t.update(gameRef, { 'wordWarState.settings': settings });
  });
}

export async function randomizeTeams(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    ensureHost(game, hostId);
    ensureLobby(game);

    const shuffledPlayers = shuffle([...game.players]);
    const half = Math.ceil(shuffledPlayers.length / 2);

    const updatedPlayers = game.players.map((p) => {
      const idx = shuffledPlayers.findIndex((sp) => sp.id === p.id);
      if (idx === -1) return p;
      const team = idx < half ? 'red' : 'blue';
      if (p.team === team) return p;
      return { ...p, team };
    });

    t.update(gameRef, { players: updatedPlayers });
  });
}

export async function selectTeam(gameId: string, playerId: string, team: 'red' | 'blue') {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    ensurePlayerInGame(game, playerId);
    if (game.gameState !== 'lobby') throw new Error('Can only change team in the lobby.');

    const updatedPlayers = game.players.map((p) => (p.id === playerId ? { ...p, team } : p));
    t.update(gameRef, { players: updatedPlayers });
  });
}

export async function startGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    ensureHost(game, hostId);

    const activePlayers = game.players.filter((p) => p.status !== 'left');
    if (activePlayers.some((p) => !p.team)) throw new Error('All players must be assigned to a team.');

    const teamRedPlayers = game.players.filter((p) => p.team === 'red');
    const teamBluePlayers = game.players.filter((p) => p.team === 'blue');

    if (teamRedPlayers.length < 2 || teamBluePlayers.length < 2) {
      throw new Error('يجب أن يكون لدى كل فريق لاعبان على الأقل لبدء اللعبة.');
    }

    const { cardsOrder, cardsMap, legacyArray } = await generateCards();

    const redGuideId = shuffle(teamRedPlayers)[0].id;
    const blueGuideId = shuffle(teamBluePlayers)[0].id;

    t.update(gameRef, {
      gameState: 'preparation',
      // New authoritative shape
      'wordWarState.cardsOrder': cardsOrder,
      'wordWarState.cardsMap': cardsMap,
      // Legacy array (read-only compat)
      'wordWarState.cards': legacyArray,
      'wordWarState.turn': 'red',
      'wordWarState.guides': { red: redGuideId, blue: blueGuideId },
      'wordWarState.currentHint': null,
      'wordWarState.guessesLeft': 0,
      'wordWarState.suspicions': {},
      'wordWarState.turnId': 1,
      'metrics.startedAt': serverTimestamp(),
    });

    setTimer(t, gameRef, 'prep', PREPARATION_TIME);
  });
}

export async function setGuide(gameId: string, hostId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    ensureHost(game, hostId);
    ensureLobby(game);

    const player = ensurePlayerInGame(game, playerId);
    if (!player.team) throw new Error('Player not found or not in a team.');

    t.update(gameRef, { [`wordWarState.guides.${player.team}`]: playerId });
  });
}

export async function submitHint(
  gameId: string,
  playerId: string,
  word: string,
  count: number,
  clientSentAtMs?: number // for metrics (optional)
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    if (game.gameState !== 'guide_turn') return; // ignore stale click silently
    if (game.wordWarState.guides[game.wordWarState.turn] !== playerId) throw new Error('ليس دورك كمرشد.');

    const turnTime = getTurnTime(game);

    t.update(gameRef, {
      gameState: 'guesser_turn',
      'wordWarState.currentHint': { word, count },
      'wordWarState.guessesLeft': count,
      'metrics.lastHintAt': serverTimestamp(),
      ...(clientSentAtMs ? { 'metrics.latency.lastHintMsApprox': Math.max(0, nowMs() - clientSentAtMs) } : {}),
    });

    setTimer(t, gameRef, 'guess', turnTime);
  });
}

export async function revealCard(
  gameId: string,
  playerId: string,
  cardText: string,
  expectedTurnId?: number,
  clientSentAtMs?: number // for metrics (optional)
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;
    const ww = game.wordWarState;

    if (!ww) return;

    // Authoritative timer guard (client-side transaction, serverTimestamp validated via Cloud Function/schedule too)
    const timer = ww.timer;
    if (timer?.startedAt && typeof timer.durationSec === 'number') {
      const started = timer.startedAt.toMillis();
      if (nowMs() < started + millis(timer.durationSec)) {
        // ok
      } else {
        // timeout reached, count metric and ignore
        metricInc(t, gameRef, 'metrics.rejected.timeout');
        return;
      }
    }

    if (game.gameState !== 'guesser_turn') return; // ignore stale

    // Optional guard to drop late clicks from a previous turn
    if (expectedTurnId != null && ww.turnId != null && expectedTurnId !== ww.turnId) {
      metricInc(t, gameRef, 'metrics.rejected.staleTurn');
      return;
    }

    const player = ensurePlayerInGame(game, playerId);
    if (player.team !== ww.turn) throw new Error('ليس دور فريقك للاختيار الآن.');

    // Prefer Map if exists
    const hasMap = !!ww.cardsMap && !!ww.cardsOrder;
    const updates: Record<string, unknown> = {};

    let revealedCard: WordWarCard | null = null;

    if (hasMap) {
      const key = keyFromText(cardText);
      const current = ww.cardsMap[key];
      if (!current) throw new Error('Card not found.');
      if (current.revealed) return; // idempotent
      revealedCard = current;
      updates[`wordWarState.cardsMap.${key}.revealed`] = true;
    } else {
      // Legacy array path (full rewrite)
      const cards = [...(ww.cards as WordWarCard[])];
      const idx = cards.findIndex((c) => c.text === cardText);
      if (idx === -1) throw new Error('Card not found.');
      if (cards[idx].revealed) return;
      cards[idx] = { ...cards[idx], revealed: true };
      revealedCard = cards[idx];
      updates['wordWarState.cards'] = cards;
    }

    // Determine flow based on revealed
    const color = revealedCard!.color;

    // Win check uses whichever shape we have
    const win = hasMap
      ? (() => {
          const cloned = { ...(ww.cardsMap as Record<string, WordWarCard>) };
          const k = keyFromText(cardText);
          cloned[k] = { ...cloned[k], revealed: true };
          return checkWinFromMap(cloned);
        })()
      : checkWinFromArray(updates['wordWarState.cards'] as WordWarCard[]);

    if (color === 'assassin') {
      updates['gameResult'] = { winner: ww.turn === 'red' ? 'blue' : 'red', message: 'تم كشف القاتل!' };
    } else if (!updates['gameResult']) {
      if (color !== ww.turn || (ww.guessesLeft! - 1) <= 0) {
        updates['wordWarState.turn'] = nextTeam(ww.turn);
      } else {
        updates['wordWarState.guessesLeft'] = Math.max(0, (ww.guessesLeft || 0) - 1);
      }
    }

    if (!updates['gameResult'] && win) updates['gameResult'] = win;

    if (updates['gameResult']) {
      updates['gameState'] = 'board_reveal';
      clearTimer(t, gameRef);
    } else if (updates['wordWarState.turn']) {
      updates['gameState'] = 'guide_turn';
      updates['wordWarState.currentHint'] = null;
      updates['wordWarState.guessesLeft'] = 0;
      updates['wordWarState.suspicions'] = {};
      bumpTurnId(t, gameRef, ww.turnId);
      t.update(gameRef, updates);
      setTimer(t, gameRef, 'guide', getTurnTime(game));
      // metrics
      t.update(gameRef, {
        'metrics.lastRevealAt': serverTimestamp(),
        ...(clientSentAtMs ? { 'metrics.latency.lastRevealMsApprox': Math.max(0, nowMs() - clientSentAtMs) } : {}),
      });
      return;
    }

    t.update(gameRef, {
      ...updates,
      'metrics.lastRevealAt': serverTimestamp(),
      ...(clientSentAtMs ? { 'metrics.latency.lastRevealMsApprox': Math.max(0, nowMs() - clientSentAtMs) } : {}),
    });
  });
}

export async function endTurn(gameId: string, playerId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    if (game.gameState !== 'guesser_turn') return; // ignore stale

    const currentTeam = game.wordWarState.turn;
    const next = nextTeam(currentTeam);

    t.update(gameRef, {
      gameState: 'guide_turn',
      'wordWarState.turn': next,
      'wordWarState.currentHint': null,
      'wordWarState.guessesLeft': 0,
      'wordWarState.suspicions': {},
      'metrics.lastEndTurnAt': serverTimestamp(),
    });

    bumpTurnId(t, gameRef, game.wordWarState.turnId);
    setTimer(t, gameRef, 'guide', getTurnTime(game));
  });
}

export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) return;
    const game = gameDoc.data() as Game;

    ensureHost(game, hostId);

    const timer = game.wordWarState?.timer;
    if (!timer?.startedAt || typeof timer.durationSec !== 'number') return;

    const started = timer.startedAt.toMillis();
    const expiresAt = started + millis(timer.durationSec);
    if (nowMs() < expiresAt) return; // not yet expired

    if (game.gameState === 'preparation') {
      t.update(gameRef, { gameState: 'guide_turn' });
      setTimer(t, gameRef, 'guide', getTurnTime(game));
      return;
    }

    if (game.gameState === 'guide_turn' || game.gameState === 'guesser_turn') {
      const currentTeam = game.wordWarState.turn;
      const next = nextTeam(currentTeam);

      t.update(gameRef, {
        gameState: 'guide_turn',
        'wordWarState.turn': next,
        'wordWarState.currentHint': null,
        'wordWarState.guessesLeft': 0,
        'wordWarState.suspicions': {},
        'metrics.timeouts': increment(1),
      });
      bumpTurnId(t, gameRef, game.wordWarState.turnId);
      setTimer(t, gameRef, 'guide', getTurnTime(game));
    }
  });
}

export async function toggleSuspicion(gameId: string, playerId: string, cardText: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    if (game.gameState !== 'guesser_turn') return; // ignore when not guessing

    const player = ensurePlayerInGame(game, playerId);
    if (!player.team) throw new Error('Player not assigned to a team.');

    const suspicions = game.wordWarState.suspicions || ({} as Record<string, string[]>);
    const cardSus = suspicions[cardText] || [];
    const isMine = cardSus.includes(playerId);

    if (isMine) {
      const newArr = cardSus.filter((id) => id !== playerId);
      if (newArr.length === 0) {
        t.update(gameRef, { [`wordWarState.suspicions.${cardText}`]: deleteField() });
      } else {
        t.update(gameRef, { [`wordWarState.suspicions.${cardText}`]: newArr });
      }
    } else {
      t.update(gameRef, { [`wordWarState.suspicions.${cardText}`]: [...cardSus, playerId] });
    }
  });
}

export async function proceedToFinalResults(gameId: string, hostId: string) {
  let gameDataForLeagueUpdate: Game | null = null;
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    ensureHost(game, hostId);
    if (game.gameState !== 'board_reveal') return;

    gameDataForLeagueUpdate = game;

    t.update(gameRef, {
      gameState: 'final_results',
      'metrics.finalizedAt': serverTimestamp(),
    });

    clearTimer(t, gameRef);
  });

  if (gameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
  }
}

// =====================
// --- Extra files (copy as needed) ---
// 1) Cloud Functions (functions/src/wordWarTimers.ts)
// 2) Security Rules snippet (firestore.rules)
// =====================

/*
// functions/src/wordWarTimers.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();
const adb = admin.firestore();

// Utility: compute expiry
const ms = (s:number)=>s*1000;

export const wordWar_enforceTimers = onSchedule('every 1 minutes', async () => {
  const now = Date.now();
  const snap = await adb.collection('games')
    .where('wordWarState.timer.startedAt', '<=', admin.firestore.Timestamp.fromMillis(now - ms(10))) // coarse prefilter
    .get();

  const batch = adb.batch();
  for (const doc of snap.docs) {
    const g = doc.data() as any;
    const timer = g?.wordWarState?.timer;
    if (!timer?.startedAt || typeof timer.durationSec !== 'number') continue;
    const started = timer.startedAt.toMillis();
    const expiresAt = started + ms(timer.durationSec);
    if (now < expiresAt) continue;

    // mirror logic of handleTimeout (server-authoritative)
    if (g.gameState === 'preparation') {
      batch.update(doc.ref, { gameState: 'guide_turn', 'wordWarState.timer': {
        phase: 'guide', startedAt: admin.firestore.FieldValue.serverTimestamp(), durationSec: g.wordWarState?.settings?.turnTime || 60,
        endsAtApprox: Date.now() + ms(g.wordWarState?.settings?.turnTime || 60),
      }});
      continue;
    }
    if (g.gameState === 'guide_turn' || g.gameState === 'guesser_turn') {
      const next = g.wordWarState.turn === 'red' ? 'blue' : 'red';
      batch.update(doc.ref, {
        gameState: 'guide_turn',
        'wordWarState.turn': next,
        'wordWarState.currentHint': null,
        'wordWarState.guessesLeft': 0,
        'wordWarState.suspicions': {},
        'wordWarState.turnId': (g.wordWarState.turnId || 0) + 1,
        'metrics.timeouts': admin.firestore.FieldValue.increment(1),
        'wordWarState.timer': {
          phase: 'guide', startedAt: admin.firestore.FieldValue.serverTimestamp(), durationSec: g.wordWarState?.settings?.turnTime || 60,
          endsAtApprox: Date.now() + ms(g.wordWarState?.settings?.turnTime || 60),
        }
      });
    }
  }
  await batch.commit();
});

export const wordWar_handleTimeoutIfExpired = onCall(async (req) => {
  const { gameId } = req.data || {};
  if (!gameId) throw new Error('Missing gameId');
  const ref = adb.collection('games').doc(gameId);
  await adb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;
    const g:any = snap.data();
    const timer = g?.wordWarState?.timer;
    if (!timer?.startedAt || typeof timer.durationSec !== 'number') return;
    const started = timer.startedAt.toMillis();
    const expiresAt = started + ms(timer.durationSec);
    if (Date.now() < expiresAt) return;

    if (g.gameState === 'preparation') {
      t.update(ref, { gameState: 'guide_turn', 'wordWarState.timer': {
        phase: 'guide', startedAt: admin.firestore.FieldValue.serverTimestamp(), durationSec: g.wordWarState?.settings?.turnTime || 60,
        endsAtApprox: Date.now() + ms(g.wordWarState?.settings?.turnTime || 60),
      }});
      return;
    }
    if (g.gameState === 'guide_turn' || g.gameState === 'guesser_turn') {
      const next = g.wordWarState.turn === 'red' ? 'blue' : 'red';
      t.update(ref, {
        gameState: 'guide_turn',
        'wordWarState.turn': next,
        'wordWarState.currentHint': null,
        'wordWarState.guessesLeft': 0,
        'wordWarState.suspicions': {},
        'wordWarState.turnId': (g.wordWarState.turnId || 0) + 1,
        'metrics.timeouts': admin.firestore.FieldValue.increment(1),
        'wordWarState.timer': {
          phase: 'guide', startedAt: admin.firestore.FieldValue.serverTimestamp(), durationSec: g.wordWarState?.settings?.turnTime || 60,
          endsAtApprox: Date.now() + ms(g.wordWarState?.settings?.turnTime || 60),
        }
      });
    }
  });
  return { ok: true };
});
*/

/*
// firestore.rules (snippet; optional — soft guard against stale writes)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{gameId} {
      allow read: if true;
      // Example: allow updates if timer either absent or not expired.
      allow update: if
        request.auth != null && (
          !('wordWarState' in resource.data) ||
          !('timer' in resource.data.wordWarState) ||
          (resource.data.wordWarState.timer.durationSec is int &&
            resource.data.wordWarState.timer.startedAt is timestamp &&
            request.time.toMillis() < resource.data.wordWarState.timer.startedAt.toMillis() + (resource.data.wordWarState.timer.durationSec * 1000))
        );
    }
  }
}
*/
