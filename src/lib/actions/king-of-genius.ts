'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  deleteField,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import type { Game, ChallengeResult, PlayerProgress } from '@/types';
import { shuffle } from './helpers';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';
import { GENIUS_CHALLENGES, GENIUS_CHALLENGE_MAP } from '@/data/genius-challenges';
import { updateLeagueScoresForGameEnd } from './user';

/**
 * NOTE TO MAINTAINERS
 * -------------------
 * - This file is a drop‑in replacement: same imports/exports & signatures.
 * - Improvements: stronger guards, idempotency, safer team shuffling (no reordering of players array),
 *   consistent timers, compact utilities, clearer comments, and predictable scoring.
 * - No changes required in other files.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Tunables
// ──────────────────────────────────────────────────────────────────────────────
const INTRO_DURATION_S = 5;
const RESULTS_DISPLAY_DURATION_S = 10;
const DEFAULT_POINTS_MAP = [10, 5, 3, 1];
const FORFEIT_TIME = 999; // used when player misses a challenge

// ──────────────────────────────────────────────────────────────────────────────
// Small utilities (local only)
// ──────────────────────────────────────────────────────────────────────────────
const nowMs = () => Date.now();
const inSec = (sec: number) => Timestamp.fromMillis(nowMs() + sec * 1000);
const hasExpired = (ts?: Timestamp | null) => (ts ? ts.toMillis() <= nowMs() : true);

function assert<T>(value: T | undefined | null, message = 'Unexpected missing value'): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

function findPlayerIndex(players: Game['players'], playerId: string) {
  return players.findIndex((p) => p.id === playerId);
}

// ──────────────────────────────────────────────────────────────────────────────
// Team Management
// ──────────────────────────────────────────────────────────────────────────────
export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = snap.data() as Game | undefined;
    if (!game) throw new Error('Game not found.');

    const idx = findPlayerIndex(game.players, playerId);
    if (idx === -1) throw new Error('Player not found in game.');

    const players = [...game.players];
    players[idx] = { ...players[idx], team };

    tx.update(gameRef, { players });
  });
}

export async function randomizeTeams(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = snap.data() as Game | undefined;
    if (!game) throw new Error('Game not found.');

    if (game.hostId !== hostId) throw new Error('Only the host can randomize teams.');
    if (game.gameState !== 'team_selection') return; // idempotent guard

    // Shuffle a copy of IDs, then assign teams BACK onto the original array order
    const shuffled = shuffle(game.players.map((p) => p.id));
    const half = Math.ceil(shuffled.length / 2);

    const teamById = new Map<string, 'A' | 'B'>();
    shuffled.forEach((pid, i) => teamById.set(pid, i < half ? 'A' : 'B'));

    const players = game.players.map((p) => ({ ...p, team: teamById.get(p.id) }));
    tx.update(gameRef, { players });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Challenge Flow Helpers
// ──────────────────────────────────────────────────────────────────────────────
async function _prepareNextChallenge(game: Game): Promise<Partial<Game>> {
  const currentChallengeIndex = game.currentChallengeIndex ?? -1;
  const nextChallengeIndex = currentChallengeIndex + 1;

  if (nextChallengeIndex >= (game.challengeOrder?.length || 0)) {
    return _finalizeGame(game);
  }

  return {
    gameState: 'challenge_intro',
    currentChallengeIndex: nextChallengeIndex,
    challengeState: {
      duration: INTRO_DURATION_S,
      challengeEndsAt: inSec(INTRO_DURATION_S),
      puzzle: null,
      results: [],
      playerProgress: {},
    },
  };
}

function _finalizeGame(game: Game): Partial<Game> {
  const { A = 0, B = 0 } = game.teamScores || {};
  let winner: Game['gameResult']['winner'] = 'draw';
  let message = 'انتهت المواجهة بالتعادل!';

  if (A > B) {
    winner = 'A';
    message = 'الفريق الأزرق يسحق خصمه!';
  } else if (B > A) {
    winner = 'B';
    message = 'الفريق الأحمر ينتصر!';
  }

  return {
    gameState: 'final_results',
    gameResult: { winner, message },
    challengeState: {
      ...game.challengeState,
      // ensure any ticking timer is cleared in final results
      timerEndsAt: deleteField() as any,
    },
  };
}

async function _calculateScoresAndProceed(game: Game): Promise<Partial<Game>> {
  const results = game.challengeState?.results || [];
  const teamScores = { ...(game.teamScores || { A: 0, B: 0 }) };

  // Sort: highest score first, then lowest time
  const sortedResults = results
    .filter((r) => r.isCorrect)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.time - b.time);

  sortedResults.forEach((result, index) => {
    const player = game.players.find((p) => p.id === result.playerId);
    if (!player?.team) return;

    const rankPoints = DEFAULT_POINTS_MAP[index] ?? 0;
    const performancePoints = result.score ?? 0;
    teamScores[player.team] += rankPoints + performancePoints;
  });

  const nextChallengeUpdates = await _prepareNextChallenge(game);
  return {
    gameState: 'challenge_results',
    teamScores,
    challengeState: {
      ...game.challengeState,
      // keep current results visible for a short time window
      timerEndsAt: inSec(RESULTS_DISPLAY_DURATION_S),
    },
    ...nextChallengeUpdates, // queued state for next step
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Game Flow (Public API)
// ──────────────────────────────────────────────────────────────────────────────
export async function startKingOfGeniusGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = snap.data() as Game | undefined;
    if (!game) throw new Error('Game not found.');

    if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
    if (game.players.some((p) => !p.team)) throw new Error('All players must be on a team.');
    if (game.gameState !== 'team_selection') return; // idempotent call

    // Build challenge order from registered challenges
    const challengeOrder = shuffle(GENIUS_CHALLENGES.map((c) => c.id));
    if (challengeOrder.length === 0) throw new Error('No challenges configured.');

    const first = await _prepareNextChallenge({ ...game, currentChallengeIndex: -1, challengeOrder } as Game);

    tx.update(gameRef, {
      ...first,
      challengeOrder,
      teamScores: { A: 0, B: 0 },
    });
  });
}

export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  let finalForLeague: Game | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = snap.data() as Game | undefined;
    if (!game) return; // exit silently for robustness

    if (game.hostId !== hostId) return; // only host explicitly advances timers

    // If we still have time left, do nothing
    if (!hasExpired(game.challengeState?.timerEndsAt ?? null)) return;

    let updates: Partial<Game> = {};

    switch (game.gameState) {
      case 'challenge_intro': {
        const idx = game.currentChallengeIndex ?? 0;
        const challengeId = game.challengeOrder?.[idx];
        if (!challengeId) throw new Error('Cannot find next challenge ID.');

        const { puzzle } = await generateGeniusChallenge({ challengeId });
        const duration = GENIUS_CHALLENGE_MAP.get(challengeId)?.timeLimit ?? 60;

        updates = {
          gameState: 'challenge_active',
          challengeState: {
            ...game.challengeState,
            puzzle,
            duration,
            timerEndsAt: inSec(duration),
          },
        };
        break;
      }

      case 'challenge_active': {
        const activePlayers = game.players.filter((p) => p.status === 'alive');
        const currentResults = game.challengeState?.results || [];

        // Any alive player with no result forfeits
        const missing = activePlayers.filter((p) => !currentResults.some((r) => r.playerId === p.id));
        const forfeits: ChallengeResult[] = missing.map((p) => ({
          playerId: p.id,
          team: p.team!,
          isCorrect: false,
          time: FORFEIT_TIME,
          score: 0,
        }));

        const aggregated = [...currentResults, ...forfeits];
        const tempGame = { ...game, challengeState: { ...game.challengeState, results: aggregated } } as Game;

        updates = await _calculateScoresAndProceed(tempGame);
        if (updates.gameState === 'final_results') {
          finalForLeague = { ...game, ...updates } as Game;
        }
        break;
      }

      case 'challenge_results': {
        updates = await _prepareNextChallenge(game);
        if (updates.gameState === 'final_results') {
          finalForLeague = { ...game, ...updates } as Game;
        }
        break;
      }

      default: {
        // Defensive: if an unsupported state times out, just clear timer to avoid loops
        updates = { challengeState: { ...game.challengeState, timerEndsAt: deleteField() as any } };
        break;
      }
    }

    tx.update(gameRef, updates);
  });

  if (finalForLeague) {
    await updateLeagueScoresForGameEnd(finalForLeague);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Player Actions
// ──────────────────────────────────────────────────────────────────────────────
export async function submitChallengeResult(
  gameId: string,
  playerId: string,
  result: Omit<ChallengeResult, 'playerId' | 'team'>
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    const game = snap.data() as Game | undefined;
    if (!game) throw new Error('Game not found.');

    // Accept results only while active
    if (game.gameState !== 'challenge_active') return;

    const player = game.players.find((p) => p.id === playerId);
    if (!player?.team) return;

    // Idempotent: ignore duplicates
    if (game.challengeState?.results?.some((r) => r.playerId === playerId)) return;

    const newResult: ChallengeResult = { ...result, playerId, team: player.team };
    tx.update(gameRef, { 'challengeState.results': arrayUnion(newResult) });
  });
}

export async function updateChallengeProgress(
  gameId: string,
  playerId: string,
  progress: Partial<PlayerProgress>
) {
  const gameRef = doc(db, 'games', gameId);
  // Shallow merge of per‑player progress without touching others
  await updateDoc(gameRef, {
    [`challengeState.playerProgress.${playerId}`]: progress,
  });
}
