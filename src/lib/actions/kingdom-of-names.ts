

'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  type Transaction,
  type DocumentData,
  type DocumentReference,
  updateDoc,
} from 'firebase/firestore';
import type { Game, Player, KingdomOfNamesState } from '@/types';
import { shuffle } from './helpers';
import { CATEGORIES, LETTERS } from '@/data/kingdom-of-names';
import { distributeEndOfGameAwards } from './admin/users';

/**
 * ===============================
 *  Kingdom of Names — Server API
 * ===============================
 *
 * Goals of this refactor (logic preserved):
 * - Stronger typing & safer Firestore field updates.
 * - Consistent phase handling (no mixing with gameState).
 * - Robust Arabic normalization (hamzāt/ḥarakāt/tatweel) for letter checks.
 * - 95% similarity clustering (Levenshtein ratio) for duplicate detection per category.
 * - Settings are merged with defaults and persisted in state on each round.
 * - Race-safe voting/results calculation within a single transaction.
 * - Defensive checks and small ergonomics.
 */

// =============================
// Constants & Utilities
// =============================

const GAME_DEFAULTS = {
  rounds: 7,
  roundTime: 60,
  votingTime: 45,
  resultsTime: 20,
};

const ensure: (condition: any, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const tsFromNowS = (seconds: number) => Timestamp.fromMillis(Date.now() + seconds * 1000);

const getActivePlayers = (game: Game) => game.players.filter((p) => p.status !== 'left');

const mergeSettings = (partial?: KingdomOfNamesState['settings']) => ({
  ...GAME_DEFAULTS,
  ...(partial || {}),
});

const pickCategoriesForRound = (count = 6) => shuffle([...CATEGORIES]).slice(0, count);

// Arabic normalization helpers
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g; // tanwīn + tashkīl + Qur'anic marks
const TATWEEL = /\u0640/g;
function normalizeArabic(text: string): string {
  return text
    .replace(TATWEEL, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[يى]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .toLowerCase();
}

function startsWithLetter(word: string | undefined, letter: string): boolean {
  if (!word) return false;
  const w = normalizeArabic(word);
  const l = normalizeArabic(letter);
  if (!w.length || !l.length) return false;
  return w[0] === l[0];
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarityRatio(a: string, b: string): number {
  const na = normalizeArabic(a);
  const nb = normalizeArabic(b);
  const maxLen = Math.max(na.length, nb.length) || 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen; // 1 = identical, 0 = totally different
}

// Cluster answers by >= threshold similarity (greedy, good enough for this use-case)
function clusterBySimilarity(items: { playerId: string; answer: string }[], threshold = 0.95) {
  const groups: { rep: string; members: { playerId: string; answer: string }[] }[] = [];
  for (const item of items) {
    const idx = groups.findIndex((g) => similarityRatio(g.rep, item.answer) >= threshold);
    if (idx === -1) {
      groups.push({ rep: item.answer, members: [item] });
    } else {
      groups[idx]!.members.push(item);
    }
  }
  return groups;
}

// =============================
// Public API
// =============================

export async function startGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    ensure(game.hostId === hostId, 'فقط المضيف يمكنه بدء اللعبة.');

    const active = getActivePlayers(game);
    ensure(active.length >= 2, 'اللعبة تحتاج لاعبين اثنين على الأقل.');

    const turnOrder = shuffle(active.map((p) => p.id));
    const settings = mergeSettings(game.kingdomOfNamesState?.settings);

    tx.update(gameRef, {
      gameState: 'playing', // kept for legacy consumers
      'kingdomOfNamesState.phase': 'playing',
      'kingdomOfNamesState.settings': settings,
      'kingdomOfNamesState.currentRound': 1,
      'kingdomOfNamesState.turnOrder': turnOrder,
      'kingdomOfNamesState.letter': LETTERS[Math.floor(Math.random() * LETTERS.length)],
      'kingdomOfNamesState.categories': pickCategoriesForRound(6),
      'kingdomOfNamesState.playerAnswers': {},
      'kingdomOfNamesState.playerProgress': {},
      'kingdomOfNamesState.votes': {},
      'kingdomOfNamesState.results': {},
      'kingdomOfNamesState.timerEndsAt': tsFromNowS(settings.roundTime),
      playerScores: active.reduce<Record<string, number>>((acc, p) => {
        acc[p.id] = 0;
        return acc;
      }, {}),
    });
  });
}

export async function updatePlayerProgress(
  gameId: string,
  playerId: string,
  answers: Record<string, string>
) {
  const gameRef = doc(db, 'games', gameId);
  // Optional guard: only keep answers for current round categories
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return; // silent no-op is fine
    const game = snap.data() as Game;
    const cats = game.kingdomOfNamesState?.categories || [];
    const sanitized: Record<string, string> = {};
    for (const c of cats) if (answers[c]) sanitized[c] = answers[c];

    tx.update(gameRef, {
      [`kingdomOfNamesState.playerProgress.${playerId}.answers`]: sanitized,
    });
  });
}

export async function submitAnswers(
  gameId: string,
  playerId: string,
  answers: Record<string, string>
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    const state = game.kingdomOfNamesState!;

    ensure(state.phase === 'playing', 'ليست مرحلة اللعب.');

    const categoriesForRound = state.categories || [];
    const isSubmissionComplete = categoriesForRound.every((cat) => answers[cat] && answers[cat].trim() !== '');
    ensure(isSubmissionComplete, 'يجب تعبئة جميع الحقول قبل الإرسال.');

    // Build the final answers snapshot at the moment of first submit
    const finalAnswers: Record<string, Record<string, string>> = {
      ...(state.playerAnswers || {}),
      [playerId]: answers,
    };

    const activePlayers = getActivePlayers(game);
    for (const p of activePlayers) {
      if (p.id !== playerId && !finalAnswers[p.id]) {
        finalAnswers[p.id] = state.playerProgress?.[p.id]?.answers || {};
      }
    }

    const settings = mergeSettings(state.settings);

    tx.update(gameRef, {
      'kingdomOfNamesState.playerAnswers': finalAnswers,
      'kingdomOfNamesState.phase': 'voting',
      'kingdomOfNamesState.timerEndsAt': tsFromNowS(settings.votingTime),
      gameState: 'voting', // keep legacy in sync
    });
  });
}

export async function submitVotes(
  gameId: string,
  playerId: string,
  votes: Record<string, 'correct' | 'incorrect'>
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    const state = game.kingdomOfNamesState!;
    ensure(state.phase === 'voting', 'ليست مرحلة التصويت.');

    const playerVotes = { ...(state.votes || {}), [playerId]: votes } as KingdomOfNamesState['votes'];

    const activePlayers = getActivePlayers(game);
    const allVoted = activePlayers.every((p) => !!playerVotes[p.id]);

    // Persist the new votes first
    tx.update(gameRef, {
      'kingdomOfNamesState.votes': playerVotes,
    });

    if (allVoted) {
      // Calculate results using the in-memory votes snapshot to avoid stale reads
      _calculateAndEnterResults(tx, gameRef, game, { votes: playerVotes });
    }
  });
}

export async function nextRound(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  let isGameOver = false;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    ensure(game.hostId === hostId, 'فقط المضيف يمكنه بدء الجولة التالية.');

    const state = game.kingdomOfNamesState!;
    const settings = mergeSettings(state.settings);
    const nextRoundNum = (state.currentRound || 0) + 1;

    if (nextRoundNum > settings.rounds) {
      isGameOver = true;
      // Winner id (first max wins, ties keep first found — UI can show full ranking)
      const winnerId = Object.keys(game.playerScores || {}).reduce((a, b) =>
        (game.playerScores![a] || 0) >= (game.playerScores![b] || 0) ? a : b
      );

      tx.update(gameRef, {
        gameState: 'final_results',
        'kingdomOfNamesState.phase': 'final_results',
        gameResult: { winner: winnerId, message: 'انتهت اللعبة! هذا هو الترتيب النهائي.' },
      });
    } else {
      tx.update(gameRef, {
        'kingdomOfNamesState.phase': 'playing',
        'kingdomOfNamesState.settings': settings, // keep persisted
        'kingdomOfNamesState.currentRound': nextRoundNum,
        'kingdomOfNamesState.letter': LETTERS[Math.floor(Math.random() * LETTERS.length)],
        'kingdomOfNamesState.categories': pickCategoriesForRound(6),
        'kingdomOfNamesState.playerAnswers': {},
        'kingdomOfNamesState.playerProgress': {},
        'kingdomOfNamesState.votes': {},
        'kingdomOfNamesState.results': {},
        'kingdomOfNamesState.timerEndsAt': tsFromNowS(settings.roundTime),
        gameState: 'playing',
      });
    }
  });

  if (isGameOver) {
    await distributeEndOfGameAwards(gameId);
  }
}

export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'اللعبة غير موجودة.');
    const game = snap.data() as Game;
    ensure(game.hostId === hostId, 'فقط المضيف يمكنه التحكم بالمؤقّت.');

    const state = game.kingdomOfNamesState!;

    if (state.phase === 'voting') {
      _calculateAndEnterResults(tx, gameRef, game);
      return;
    }

    if (state.phase === 'playing') {
      const finalAnswers = { ...(state.playerAnswers || {}) } as KingdomOfNamesState['playerAnswers'];
      const active = getActivePlayers(game);
      for (const p of active) {
        if (!finalAnswers[p.id]) {
          finalAnswers[p.id] = state.playerProgress?.[p.id]?.answers || {};
        }
      }
      const settings = mergeSettings(state.settings);
      tx.update(gameRef, {
        'kingdomOfNamesState.playerAnswers': finalAnswers,
        'kingdomOfNamesState.phase': 'voting',
        'kingdomOfNamesState.timerEndsAt': tsFromNowS(settings.votingTime),
        gameState: 'voting',
      });
      return;
    }

    // If already in results/final_results, do nothing.
  });
}

// =============================
// Internal — results calculation
// =============================

function _calculateAndEnterResults(
  tx: Transaction,
  gameRef: DocumentReference<DocumentData>,
  game: Game,
  overrides?: Partial<KingdomOfNamesState>
) {
  const state = game.kingdomOfNamesState!;
  const effectiveState: KingdomOfNamesState = {
    ...state,
    ...(overrides || {}),
  } as KingdomOfNamesState;

  const { results, addedPoints } = calculateResults(game.players, effectiveState);

  const newPlayerScores = { ...(game.playerScores || {}) } as Record<string, number>;
  for (const [pId, pts] of Object.entries(addedPoints)) {
    newPlayerScores[pId] = (newPlayerScores[pId] || 0) + pts;
  }

  const settings = mergeSettings(effectiveState.settings);

  tx.update(gameRef, {
    'kingdomOfNamesState.phase': 'results',
    'kingdomOfNamesState.results': results,
    'kingdomOfNamesState.timerEndsAt': tsFromNowS(settings.resultsTime),
    playerScores: newPlayerScores,
    gameState: 'results',
  });
}

function calculateResults(players: Player[], state: KingdomOfNamesState) {
  const submissions = state.playerAnswers || {};
  const votes = state.votes || {};
  const letter = state.letter!;

  const results: {
    scores: Record<string, { points: number; breakdown: { reason: string; points: number }[] }>
    answers: { playerId: string; category: string; answer: string; points: number; reason: string }[]
  } = { scores: {}, answers: [] };

  const activeIds = new Set(players.filter((p) => p.status !== 'left').map((p) => p.id));
  for (const p of players) results.scores[p.id] = { points: 0, breakdown: [] };

  const validByCategory: Record<string, { playerId: string; answer: string }[]> = {};
  const answerScores: Record<string, { points: number; reason: string }> = {};

  for (const playerId in submissions) {
    if (!activeIds.has(playerId)) continue;
    const entry = submissions[playerId] || {};
    for (const category in entry) {
      const answer = (entry as Record<string, string>)[category];

      if (!answer || !startsWithLetter(answer, letter)) {
        answerScores[`${playerId}-${category}`] = { points: 0, reason: 'حرف خاطئ أو إجابة فارغة' };
        continue;
      }

      let incorrectVotes = 0;
      for (const voterId in votes) {
        if (voterId === playerId) continue;
        if (votes[voterId]?.[`${playerId}-${category}`] === 'incorrect') incorrectVotes++;
      }
      if (votes[playerId]?.[`${playerId}-${category}`] === 'incorrect') incorrectVotes = 2;

      if (incorrectVotes >= 2) {
        answerScores[`${playerId}-${category}`] = { points: 0, reason: 'رفض اللاعبون' };
        continue;
      }

      if (!validByCategory[category]) validByCategory[category] = [];
      validByCategory[category]!.push({ playerId, answer });
    }
  }

  const THRESHOLD = 0.95;
  for (const category in validByCategory) {
    const list = validByCategory[category]!;
    const groups = clusterBySimilarity(list, THRESHOLD);

    for (const g of groups) {
      const isUnique = g.members.length === 1;
      const points = isUnique ? 10 : 5;
      const reason = isUnique ? 'إجابة فريدة' : 'إجابة مكررة (≥95% تشابه)';
      for (const m of g.members) {
        answerScores[`${m.playerId}-${category}`] = { points, reason };
      }
    }
  }

  const addedPoints: Record<string, number> = {};

  for (const key in answerScores) {
    const [playerId, category] = key.split('-');
    const { points, reason } = answerScores[key]!;
    const answerText = submissions[playerId!]?.[category!] || '';

    if (!results.scores[playerId!]) results.scores[playerId!] = { points: 0, breakdown: [] };
    results.scores[playerId!]!.points += points;
    results.scores[playerId!]!.breakdown.push({ reason, points });
    results.answers.push({ playerId: playerId!, category: category!, answer: answerText, points, reason });

    addedPoints[playerId!] = (addedPoints[playerId!] || 0) + points;
  }

  return { results, addedPoints };
}
