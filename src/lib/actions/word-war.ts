
'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  deleteField,
  updateDoc,
  serverTimestamp,
  increment,
  type DocumentReference,
} from 'firebase/firestore';
import type { Game, Player, WordWarCard } from '@/types';
import { shuffle } from '@/lib/actions/helpers';
import { updateLeagueScoresForGameEnd, distributeEndOfGameAwards } from './user';
import { WORD_WAR_WORDS } from '@/data/word-war-words';

const DEFAULT_TURN_TIME = 60;
const PREPARATION_TIME = 15;
const WORD_COUNT = 40;
const BOARD_REVEAL_TIME = 30; // seconds

const nowMs = () => Date.now();
const millis = (sec: number) => sec * 1000;

const nextTeam = (team: 'red' | 'blue') => (team === 'red' ? 'blue' : 'red');

function getTurnTime(game: Game): number {
  return game.wordWarState?.settings?.turnTime || DEFAULT_TURN_TIME;
}

function keyFromText(text: string): string {
  const enc = new TextEncoder().encode(text);
  const b64 = typeof window === 'undefined'
    ? Buffer.from(enc).toString('base64')
    : btoa(String.fromCharCode(...Array.from(enc)));
  return b64.replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function setTimer(
  t: FirebaseFirestore.Transaction,
  gameRef: DocumentReference,
  phase: 'prep' | 'guide' | 'guess' | 'board_reveal',
  durationSec: number
) {
  t.update(gameRef, {
    'wordWarState.timer': {
      phase,
      startedAt: serverTimestamp(),
      durationSec,
      endsAtApprox: Timestamp.fromMillis(nowMs() + millis(durationSec)),
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

function bumpTurnId(t: FirebaseFirestore.Transaction, gameRef: DocumentReference, current: number | undefined) {
  t.update(gameRef, { 'wordWarState.turnId': (current || 0) + 1 });
}

function metricInc(t: FirebaseFirestore.Transaction, gameRef: DocumentReference, path: string) {
  t.update(gameRef, { [path]: increment(1), 'metrics.lastUpdatedAt': serverTimestamp() });
}

const generateCards = async () => {
  if (WORD_WAR_WORDS.length < WORD_COUNT) {
    throw new Error(`لا توجد كلمات كافية في قائمة الكلمات. تحتاج إلى ${WORD_COUNT} كلمة على الأقل.`);
  }

  const shuffledWords = shuffle([...WORD_WAR_WORDS]).slice(0, WORD_COUNT);
  const colors: WordWarCard['color'][] = [
    ...Array(15).fill('red'),
    ...Array(14).fill('blue'),
    ...Array(10).fill('neutral'),
    'assassin',
  ];
  const shuffledColors = shuffle(colors);

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
      'wordWarState.cardsOrder': cardsOrder,
      'wordWarState.cardsMap': cardsMap,
      'wordWarState.cards': legacyArray,
      'wordWarState.turn': 'red',
      'wordWarState.guides': { red: redGuideId, blue: blueGuideId },
      'wordWarState.currentHint': null,
      'wordWarState.guessesLeft': 0,
      'wordWarState.suspicions': {},
      'wordWarState.turnId': 1,
      'wordWarState.hintHistory': [],
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
  opts?: { expectedTurnId?: number; clientSentAtMs?: number } 
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    if (game.gameState !== 'guide_turn') return;
    if (game.wordWarState.guides[game.wordWarState.turn] !== playerId) throw new Error('ليس دورك كمرشد.');

    const turnTime = getTurnTime(game);
    const newHint = { word, count, team: game.wordWarState.turn };
    const hintHistory = [...(game.wordWarState.hintHistory || []), newHint];

    t.update(gameRef, {
      gameState: 'guesser_turn',
      'wordWarState.currentHint': newHint,
      'wordWarState.guessesLeft': count,
      'wordWarState.hintHistory': hintHistory.slice(-5), // آخر 5 فقط
      'metrics.lastHintAt': serverTimestamp(),
      ...(opts?.clientSentAtMs ? { 'metrics.latency.lastHintMsApprox': Math.max(0, nowMs() - opts.clientSentAtMs) } : {}),
    });

    setTimer(t, gameRef, 'guess', turnTime);
  });
}

export async function revealCard(
  gameId: string,
  playerId: string,
  cardText: string,
  opts?: { expectedTurnId?: number; clientSentAtMs?: number }
) {
  let gameDataForLeagueUpdate: Game | null = null;
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;
    const ww = game.wordWarState;
    if (!ww) return;

    // مهلة الدور
    const timer = ww.timer;
    if (timer?.startedAt && typeof timer.durationSec === 'number') {
      const started = timer.startedAt.toMillis();
      if (nowMs() >= started + millis(timer.durationSec)) {
        metricInc(t, gameRef, 'metrics.rejected.timeout');
        return;
      }
    }

    if (game.gameState !== 'guesser_turn') return;

    // حماية من الطلبات البطيئة / الدور الخاطئ
    if (opts?.expectedTurnId != null && ww.turnId != null && opts.expectedTurnId !== ww.turnId) {
      metricInc(t, gameRef, 'metrics.rejected.staleTurn');
      return;
    }

    const player = ensurePlayerInGame(game, playerId);
    if (player.team !== ww.turn) throw new Error('It is not your team\'s turn to act.');

    const hasMap = !!ww.cardsMap && !!ww.cardsOrder;
    const updates: Record<string, unknown> = {};
    let revealedCard: WordWarCard | null = null;

    if (hasMap) {
      const key = keyFromText(cardText);
      const current = ww.cardsMap[key];
      if (!current) throw new Error('Card not found.');
      if (current.revealed) return; // سبق كشفها
      revealedCard = current;
      updates[`wordWarState.cardsMap.${key}.revealed`] = true;
    } else {
      const cards = [...(ww.cards as WordWarCard[])];
      const idx = cards.findIndex((c) => c.text === cardText);
      if (idx === -1) throw new Error('Card not found.');
      if (cards[idx].revealed) return;
      cards[idx] = { ...cards[idx], revealed: true };
      revealedCard = cards[idx];
      updates['wordWarState.cards'] = cards;
    }

    const color = revealedCard!.color;

    // فحص الفوز بعد تطبيق الكشف
    const win = hasMap
      ? (() => {
          const cloned = { ...(ww.cardsMap as Record<string, WordWarCard>) };
          const k = keyFromText(cardText);
          cloned[k] = { ...cloned[k], revealed: true };
          return checkWinFromMap(cloned);
        })()
      : checkWinFromArray(updates['wordWarState.cards'] as WordWarCard[]);

    if (color === 'assassin' || win) {
      updates['gameResult'] = win || { winner: ww.turn === 'red' ? 'blue' : 'red', message: 'تم كشف القاتل!' };
      updates['gameState'] = 'board_reveal';
      setTimer(t, gameRef, 'board_reveal', BOARD_REVEAL_TIME);
    } else if (color !== ww.turn || (ww.guessesLeft! - 1) <= 0) {
      // خطأ أو آخر محاولة => تبديل الدور
      updates['gameState'] = 'guide_turn';
      updates['wordWarState.turn'] = nextTeam(ww.turn);
      updates['wordWarState.currentHint'] = null;
      updates['wordWarState.guessesLeft'] = 0;
      updates['wordWarState.suspicions'] = {};
      bumpTurnId(t, gameRef, ww.turnId);
      setTimer(t, gameRef, 'guide', getTurnTime(game));
    } else {
      // نفس الدور مستمر
      updates['wordWarState.guessesLeft'] = Math.max(0, (ww.guessesLeft || 0) - 1);
    }

    t.update(gameRef, {
      ...updates,
      'metrics.lastRevealAt': serverTimestamp(),
      ...(opts?.clientSentAtMs ? { 'metrics.latency.lastRevealMsApprox': Math.max(0, nowMs() - opts.clientSentAtMs) } : {}),
    });

    if (updates.gameState === 'board_reveal') {
      gameDataForLeagueUpdate = { ...game, ...(updates as any) };
    }
  });

  if (gameDataForLeagueUpdate) {
    await distributeEndOfGameAwards(gameDataForLeagueUpdate);
    await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
  }
}

export async function endTurn(gameId: string, playerId: string, opts?: { expectedTurnId?: number; clientSentAtMs?: number }) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;
    const ww = game.wordWarState;

    if (!ww) return;
    if (game.gameState !== 'guesser_turn') return;

    const player = ensurePlayerInGame(game, playerId);
    if (player.team !== ww.turn) throw new Error('It is not your team\'s turn to act.');

    if (opts?.expectedTurnId != null && ww.turnId != null && opts.expectedTurnId !== ww.turnId) {
      metricInc(t, gameRef, 'metrics.rejected.staleTurn');
      return;
    }

    const currentTeam = ww.turn;
    const next = nextTeam(currentTeam);

    t.update(gameRef, {
      gameState: 'guide_turn',
      'wordWarState.turn': next,
      'wordWarState.currentHint': null,
      'wordWarState.guessesLeft': 0,
      'wordWarState.suspicions': {},
      'metrics.lastEndTurnAt': serverTimestamp(),
    });

    bumpTurnId(t, gameRef, ww.turnId);
    setTimer(t, gameRef, 'guide', getTurnTime(game));
  });
}

export async function handleTimeout(gameId: string, actorId: string, opts?: { expectedTurnId?: number; clientSentAtMs?: number }) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) return;
    const game = gameDoc.data() as Game;

    ensurePlayerInGame(game, actorId);

    const timer = game.wordWarState?.timer;
    if (!timer?.startedAt || typeof timer.durationSec !== 'number') return;

    const started = timer.startedAt.toMillis();
    const expiresAt = started + millis(timer.durationSec);
    if (nowMs() < expiresAt) return;

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
    } else if (game.gameState === 'board_reveal') {
      t.update(gameRef, { gameState: 'final_results', 'wordWarState.timer': deleteField() });
    }
  });
}

export async function toggleSuspicion(gameId: string, playerId: string, cardText: string, opts?: { expectedTurnId?: number; clientSentAtMs?: number }) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;
    const ww = game.wordWarState;

    if (!ww) return;
    if (game.gameState !== 'guesser_turn') return;

    if (opts?.expectedTurnId != null && ww.turnId != null && opts.expectedTurnId !== ww.turnId) {
      return;
    }
    
    const player = ensurePlayerInGame(game, playerId);
    if (!player.team) throw new Error('Player not assigned to a team.');

    const suspicions = ww.suspicions || ({} as Record<string, string[]>);
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
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (t) => {
    const gameDoc = await t.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;

    ensureHost(game, hostId);
    if (game.gameState !== 'board_reveal') return;

    t.update(gameRef, {
      gameState: 'final_results',
      'metrics.finalizedAt': serverTimestamp(),
    });

    clearTimer(t, gameRef);
  });
}

    