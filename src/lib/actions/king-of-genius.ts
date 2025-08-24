
'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  deleteField,
  updateDoc,
  arrayUnion,
  FieldPath,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import type { Game, Player, ChallengeResult, PlayerProgress } from '@/types';
import { shuffle, safeCompareStrings } from './helpers';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';
import { GENIUS_CHALLENGES, GENIUS_CHALLENGE_MAP } from '@/data/genius-challenges';
import { updateLeagueScoresForGameEnd } from './user';

/* ------------------------------------------------------------------
 * King of Genius — Server Actions (Hardened/Refactored)
 * - Eliminates external awaits inside transactions
 * - Prevents double-advance via phaseVersion
 * - Writes only dotted fields to avoid clobbering nested state
 * - Computes result time on the server
 * - Blocks team changes outside team_selection
 * - Handles unsafe playerId keys with FieldPath
 * ------------------------------------------------------------------ */

// --- Constants ---
const INTRO_DURATION_S = 5;
const RESULTS_DISPLAY_DURATION_S = 60; // 1 minute as requested
const FORFEIT_TIME = 999; // sentinel time for forfeit (not used for ordering in correct-only)
const DEFAULT_POINTS_MAP = [10, 5, 3, 1];

// --- Utilities ---
const nowMs = () => Date.now();
const inSec = (seconds: number) => Timestamp.fromMillis(nowMs() + seconds * 1000);
const hasExpired = (ts?: Timestamp | null) => (ts ? ts.toMillis() <= nowMs() : true);
const findPlayerIndex = (players: Game['players'], playerId: string) =>
  players.findIndex((p) => p.id === playerId);
const ensure: (cond: any, msg: string) => asserts cond = (cond, msg) => { if (!cond) throw new Error(message); };
const isAlive = (p: Player) => p.status === 'alive';
const teamOf = (p?: Player | null) => (p?.team ?? undefined) as 'A' | 'B' | undefined;

function getCurrentChallengeId(game: Game): string {
  const idx = game.currentChallengeIndex ?? 0;
  const challengeId = game.challengeOrder?.[idx];
  ensure(challengeId, 'Cannot find current challenge ID.');
  return challengeId!;
}

function requireHost(game: Game, hostId: string) {
  ensure(game.hostId === hostId, 'Only the host can perform this action.');
}

function countTeams(players: Game['players']) {
  let a = 0,
    b = 0;
  for (const p of players) {
    if (p.team === 'A') a++;
    else if (p.team === 'B') b++;
  }
  return { A: a, B: b };
}

/**
 * Compute scoring for a completed challenge.
 * - Rank only correct answers by (score desc) then (time asc)
 * - Award DEFAULT_POINTS_MAP to ranks plus performance score
 */
function accumulateTeamScores(
  game: Game,
  results: ChallengeResult[],
  baseTeamScores: { A: number; B: number }
) {
  const teamScores = { ...baseTeamScores };

  results
    .filter((r) => r.isCorrect)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.time - b.time)
    .forEach((result, index) => {
      const player = game.players.find((p) => p.id === result.playerId);
      const t = teamOf(player);
      if (!t) return;
      const rankPoints = DEFAULT_POINTS_MAP[index] ?? 0;
      const performancePoints = result.score ?? 0;
      teamScores[t] += rankPoints + performancePoints;
    });

  return teamScores;
}

// ------------------------------------------------------------------
// Team Management
// ------------------------------------------------------------------

export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'Game not found.');
    const game = snap.data() as Game;

    // Prevent team changes after selection phase
    ensure(game.gameState === 'team_selection', 'Team changes are only allowed in team_selection.');

    const idx = findPlayerIndex(game.players, playerId);
    ensure(idx !== -1, 'Player not found in game.');

    const players = [...game.players];
    players[idx] = { ...players[idx], team };
    tx.update(gameRef, { players });
  });
}

export async function randomizeTeams(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'Game not found.');
    const game = snap.data() as Game;

    requireHost(game, hostId);
    ensure(game.gameState === 'team_selection', 'Teams can only be randomized in team_selection.');

    const shuffled = shuffle(game.players.map((p) => p.id));
    const half = Math.ceil(shuffled.length / 2);
    const teamById = new Map<string, 'A' | 'B'>();
    shuffled.forEach((pid, i) => teamById.set(pid, i < half ? 'A' : 'B'));

    const players = game.players.map((p) => ({ ...p, team: teamById.get(p.id) }));
    tx.update(gameRef, { players });
  });
}

// ------------------------------------------------------------------
// Game Flow
// ------------------------------------------------------------------

export async function startKingOfGeniusGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'Game not found.');
    const game = snap.data() as Game;

    requireHost(game, hostId);
    ensure(game.gameState === 'team_selection', 'Game already started.');
    ensure(!game.players.some((p) => !p.team), 'All players must be on a team.');

    const { A, B } = countTeams(game.players);
    ensure(A > 0 && B > 0, 'Both teams must have at least one player.');

    const challengeOrder = shuffle(GENIUS_CHALLENGES.map((c) => c.id));
    ensure(challengeOrder.length > 0, 'No challenges configured.');

    const startedAt = Timestamp.fromMillis(nowMs());

    tx.update(gameRef, {
      gameState: 'challenge_intro',
      currentChallengeIndex: 0,
      challengeOrder,
      teamScores: { A: 0, B: 0 },
      challengeState: {
        phaseVersion: 1,
        phase: 'intro',
        duration: INTRO_DURATION_S,
        startedAt,
        timerEndsAt: inSec(INTRO_DURATION_S),
        puzzle: null,
        results: [],
        playerProgress: {},
      },
    });
  });
}

type IntroPlan = {
  shouldAdvance: boolean;
  challengeId: string | null;
  expectedVersion: number;
  expectedIndex: number;
};

export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  let finalGameForLeague: Game | null = null;

  // -------- PHASE 1: If we're at intro and expired, plan & generate puzzle OUTSIDE the transaction
  const introPlan = await runTransaction(db, async (tx): Promise<IntroPlan> => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return { shouldAdvance: false, challengeId: null, expectedVersion: -1, expectedIndex: -1 };
    const game = snap.data() as Game;

    if (game.hostId !== hostId) return { shouldAdvance: false, challengeId: null, expectedVersion: -1, expectedIndex: -1 };
    if (game.gameState !== 'challenge_intro') return { shouldAdvance: false, challengeId: null, expectedVersion: -1, expectedIndex: -1 };
    if (!hasExpired(game.challengeState?.timerEndsAt)) return { shouldAdvance: false, challengeId: null, expectedVersion: -1, expectedIndex: -1 };

    const idx = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[idx] ?? null;
    const expectedVersion = Number(game.challengeState?.phaseVersion ?? 0);
    return { shouldAdvance: !!challengeId, challengeId, expectedVersion, expectedIndex: idx };
  });

  let generatedPuzzle: any = null;
  let activeDuration = 60;

  if (introPlan.shouldAdvance && introPlan.challengeId) {
    const meta = GENIUS_CHALLENGE_MAP.get(introPlan.challengeId);
    ensure(!!meta, `Challenge metadata missing for ${introPlan.challengeId}`);
    activeDuration = meta?.timeLimit ?? 60;

    // Generate outside the transaction to avoid long-running tx and retriggers
    const { puzzle } = await generateGeniusChallenge({ challengeId: introPlan.challengeId });
    generatedPuzzle = puzzle;
  }

  // -------- PHASE 2: Perform the necessary transition (intro->active OR active->results OR results->next/final)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;

    if (game.hostId !== hostId) return;

    // Guard against double-advance with phase + version
    const phase = game.challengeState?.phase as 'intro' | 'active' | 'results' | undefined;
    const phaseVersion = Number(game.challengeState?.phaseVersion ?? 0);
    const allPlayersDone = (game.challengeState?.results?.length ?? 0) >= (game.players?.filter(p => p.status === 'alive').length ?? 0);
    
    // Only proceed if timer expired OR all players are done in results phase
    const canProceed = hasExpired(game.challengeState?.timerEndsAt) || (game.gameState === 'challenge_results' && allPlayersDone);
    if (!canProceed) return;


    switch (game.gameState) {
      case 'challenge_intro': {
        // Validate planned transition + version
        if (!generatedPuzzle) return;
        if (phase !== 'intro' || phaseVersion !== introPlan.expectedVersion) return;
        if ((game.currentChallengeIndex ?? 0) !== introPlan.expectedIndex) return;

        const startedAt = Timestamp.fromMillis(nowMs());

        tx.update(gameRef, {
          gameState: 'challenge_active',
          'challengeState.phase': 'active',
          'challengeState.phaseVersion': phaseVersion + 1,
          'challengeState.puzzle': generatedPuzzle,
          'challengeState.duration': activeDuration,
          'challengeState.startedAt': startedAt,
          'challengeState.timerEndsAt': inSec(activeDuration),
          'challengeState.results': [],
        });
        break;
      }

      case 'challenge_active': {
        if (phase !== 'active') return;

        const activePlayers = game.players.filter(isAlive);
        const currentResults: ChallengeResult[] = Array.isArray(game.challengeState?.results)
          ? [...game.challengeState!.results]
          : [];

        const missing = activePlayers.filter((p) => !currentResults.some((r) => r.playerId === p.id));
        const forfeits: ChallengeResult[] = missing.map((p) => ({
          playerId: p.id,
          team: p.team!,
          isCorrect: false,
          time: FORFEIT_TIME,
          score: 0,
        }));

        const allResults = [...currentResults, ...forfeits];

        const teamScores = accumulateTeamScores(
          game,
          allResults,
          game.teamScores || { A: 0, B: 0 }
        );

        tx.update(gameRef, {
          gameState: 'challenge_results',
          'challengeState.phase': 'results',
          'challengeState.phaseVersion': phaseVersion + 1,
          'challengeState.results': allResults,
          'challengeState.startedAt': Timestamp.fromMillis(nowMs()),
          'challengeState.timerEndsAt': inSec(RESULTS_DISPLAY_DURATION_S),
          teamScores,
        });
        break;
      }

      case 'challenge_results': {
        if (phase !== 'results') return;

        const nextIndex = (game.currentChallengeIndex ?? 0) + 1;
        const totalChallenges = game.challengeOrder?.length ?? 0;

        if (nextIndex >= totalChallenges) {
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

          // Build sanitized copy for league updates (no deleteField sentinels)
          finalGameForLeague = {
            ...game,
            gameState: 'final_results',
            gameResult: { winner, message },
            challengeState: {
              ...game.challengeState,
              phase: 'final',
              phaseVersion: phaseVersion + 1,
              // Make sure consumers won't see a sentinel:
              timerEndsAt: null as any,
            },
          } as Game;

          tx.update(gameRef, {
            gameState: 'final_results',
            gameResult: { winner, message },
            'challengeState.phase': 'final',
            'challengeState.phaseVersion': phaseVersion + 1,
            'challengeState.timerEndsAt': deleteField(), // clear countdown in DB
          });
        } else {
          const startedAt = Timestamp.fromMillis(nowMs());
          tx.update(gameRef, {
            gameState: 'challenge_intro',
            currentChallengeIndex: nextIndex,
            'challengeState.phase': 'intro',
            'challengeState.phaseVersion': phaseVersion + 1,
            'challengeState.duration': INTRO_DURATION_S,
            'challengeState.startedAt': startedAt,
            'challengeState.timerEndsAt': inSec(INTRO_DURATION_S),
            'challengeState.puzzle': null,
            'challengeState.results': [],
            'challengeState.playerProgress': {},
          });
        }
        break;
      }
    }
  });

  // Update leagues once per match end (outside tx, with sanitized object)
  if (finalGameForLeague) {
    await updateLeagueScoresForGameEnd(finalGameForLeague);
  }
}

// ------------------------------------------------------------------
// Player Actions
// ------------------------------------------------------------------

export async function submitChallengeResult(
  gameId: string,
  playerId: string,
  rawResult: Omit<ChallengeResult, 'playerId' | 'team' | 'time'>
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    ensure(snap.exists(), 'Game not found.');
    const game = snap.data() as Game;

    if (game.gameState !== 'challenge_active') return;
    if (hasExpired(game.challengeState?.timerEndsAt)) return;

    const player = game.players.find((p) => p.id === playerId);
    ensure(player?.team, 'Player or team not found.');

    const results: ChallengeResult[] = Array.isArray(game.challengeState?.results)
      ? game.challengeState!.results
      : [];
    if (results.some((r) => r.playerId === playerId)) return; // already submitted

    // Compute time on the server based on startedAt
    const duration = Number(game.challengeState?.duration ?? 60);
    const startedAtMs = game.challengeState?.startedAt?.toMillis?.() ?? nowMs();
    const elapsedSec = Math.min(
      duration,
      Math.max(0, Math.round((nowMs() - startedAtMs) / 1000))
    );

    // Sanitize score
    const score =
      typeof (rawResult as any).score === 'number'
        ? Math.max(0, Math.floor((rawResult as any).score))
        : 0;

    const newResult: ChallengeResult = {
      ...(rawResult as any),
      score,
      time: elapsedSec,
      playerId,
      team: player.team!,
    };

    // Use arrayUnion with a unique per-player constraint (enforced by 'already submitted' check above)
    tx.update(gameRef, { 'challengeState.results': arrayUnion(newResult) });
  });
}

export async function updateChallengeProgress(
  gameId: string,
  playerId: string,
  progress: Partial<PlayerProgress>
) {
  const gameRef = doc(db, 'games', gameId);
  // Use FieldPath to handle unsafe keys in playerId
  await updateDoc(
    gameRef,
    new FieldPath('challengeState', 'playerProgress', playerId),
    progress
  );
}

/* ------------------------------------------------------------------
 * Optional: helper to safely compare strings (if you use it in UI)
 * Keeping import for safeCompareStrings from './helpers' if needed
 * ------------------------------------------------------------------ */
