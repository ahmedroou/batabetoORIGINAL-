

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
import type { Game, Player, ChallengeResult, PlayerProgress, GameState } from '@/types';
import { shuffle } from './helpers';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';
import { GENIUS_CHALLENGES, GENIUS_CHALLENGE_MAP } from '@/data/genius-challenges';
import { updateLeagueScoresForGameEnd } from './user';

// --- Constants ---
const INTRO_DURATION_S = 5;
const PREPARATION_TIME_S = 5; // New state for pre-challenge setup
const RESULTS_DISPLAY_DURATION_S = 10;
const FORFEIT_TIME = 999;
const DEFAULT_POINTS_MAP = [10, 5, 3, 1];

// --- Utilities ---
const nowMs = () => Date.now();
const inSec = (seconds: number) => Timestamp.fromMillis(nowMs() + seconds * 1000);
const hasExpired = (ts?: Timestamp | null) => (ts ? ts.toMillis() <= nowMs() : true);
const findPlayerIndex = (players: Game['players'], playerId: string) => players.findIndex((p) => p.id === playerId);


// --- Team Management ---
export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;

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
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;

    if (game.hostId !== hostId) throw new Error('Only the host can randomize teams.');
    if (game.gameState !== 'team_selection') return;

    const shuffled = shuffle(game.players.map((p) => p.id));
    const half = Math.ceil(shuffled.length / 2);
    const teamById = new Map<string, 'A' | 'B'>();
    shuffled.forEach((pid, i) => teamById.set(pid, i < half ? 'A' : 'B'));

    const players = game.players.map((p) => ({ ...p, team: teamById.get(p.id) }));
    tx.update(gameRef, { players });
  });
}


// --- Game Flow ---

// This function is new, to move from Lobby to Team Selection
export async function moveToTeamSelection(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) throw new Error('Game not found.');
        const game = snap.data() as Game;
        if (game.hostId !== hostId) throw new Error('Only host can start team selection.');
        if (game.gameState !== 'lobby') return;
        
        tx.update(gameRef, { gameState: 'team_selection' });
    });
}


export async function startKingOfGeniusGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;

    if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
    if (game.players.some((p) => !p.team)) throw new Error('All players must be on a team.');
    // Can now start from team_selection phase
    if (game.gameState !== 'team_selection') return;

    const challengeOrder = shuffle(GENIUS_CHALLENGES.map((c) => c.id));
    if (challengeOrder.length === 0) throw new Error('No challenges configured.');

    tx.update(gameRef, {
      gameState: 'challenge_intro',
      currentChallengeIndex: 0,
      challengeOrder,
      teamScores: { A: 0, B: 0 },
      challengeState: {
        duration: INTRO_DURATION_S,
        timerEndsAt: inSec(INTRO_DURATION_S),
        puzzle: null,
        results: [],
        playerProgress: {},
      },
    });
  });
}

export async function handleTimeout(gameId: string, hostId: string) {
  let finalGameForLeague: Game | null = null;

  await runTransaction(db, async (tx) => {
    const gameRef = doc(db, 'games', gameId);
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;

    if (game.hostId !== hostId) return;
    if (!hasExpired(game.challengeState?.timerEndsAt)) return;

    let updates: Partial<Game> & { [key: string]: any } = {};

    switch (game.gameState) {
      case 'challenge_intro': {
        const idx = game.currentChallengeIndex ?? 0;
        const challengeId = game.challengeOrder?.[idx];
        if (!challengeId) throw new Error('Cannot find next challenge ID.');

        const { puzzle } = await generateGeniusChallenge({ challengeId });
        const duration = GENIUS_CHALLENGE_MAP.get(challengeId)?.timeLimit ?? 60;

        updates = {
          gameState: 'challenge_active',
          challengeState: { ...game.challengeState, puzzle, duration, timerEndsAt: inSec(duration), results: [] },
        };
        break;
      }

      case 'challenge_active': {
        const activePlayers = game.players.filter((p) => p.status === 'alive');
        const currentResults = game.challengeState?.results || [];
        const missing = activePlayers.filter((p) => !currentResults.some((r) => r.playerId === p.id));
        const forfeits: ChallengeResult[] = missing.map((p) => ({
          playerId: p.id, team: p.team!, isCorrect: false, time: FORFEIT_TIME, score: 0,
        }));

        const allResults = [...currentResults, ...forfeits];
        const teamScores = { ...(game.teamScores || { A: 0, B: 0 }) };
        
        allResults.filter(r => r.isCorrect)
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.time - b.time)
            .forEach((result, index) => {
                const player = game.players.find((p) => p.id === result.playerId);
                if (!player?.team) return;
                const rankPoints = DEFAULT_POINTS_MAP[index] ?? 0;
                const performancePoints = result.score ?? 0;
                teamScores[player.team] += rankPoints + performancePoints;
            });

        updates = {
          gameState: 'challenge_results',
          teamScores,
          challengeState: { ...game.challengeState, results: allResults, timerEndsAt: inSec(RESULTS_DISPLAY_DURATION_S) },
        };
        break;
      }

      case 'challenge_results': {
        const nextChallengeIndex = (game.currentChallengeIndex ?? 0) + 1;
        if (nextChallengeIndex >= (game.challengeOrder?.length || 0)) {
          const { A = 0, B = 0 } = game.teamScores || {};
          let winner: Game['gameResult']['winner'] = 'draw';
          let message = 'انتهت المواجهة بالتعادل!';
          if (A > B) { winner = 'A'; message = 'الفريق الأزرق يسحق خصمه!'; }
          else if (B > A) { winner = 'B'; message = 'الفريق الأحمر ينتصر!'; }

          updates = {
            gameState: 'final_results',
            gameResult: { winner, message },
            challengeState: { ...game.challengeState, timerEndsAt: deleteField() },
          };
          finalGameForLeague = { ...game, ...updates };
        } else {
          updates = {
            gameState: 'challenge_intro',
            currentChallengeIndex: nextChallengeIndex,
            challengeState: {
              duration: INTRO_DURATION_S,
              timerEndsAt: inSec(INTRO_DURATION_S),
              puzzle: null, results: [], playerProgress: {},
            },
          };
        }
        break;
      }
    }
    tx.update(gameRef, updates);
  });

  if (finalGameForLeague) {
    await updateLeagueScoresForGameEnd(finalGameForLeague);
  }
}


// --- Player Actions ---
export async function submitChallengeResult(
  gameId: string,
  playerId: string,
  result: Omit<ChallengeResult, 'playerId' | 'team'>
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;

    if (game.gameState !== 'challenge_active') return;

    const player = game.players.find((p) => p.id === playerId);
    if (!player?.team) return;

    if (game.challengeState?.results?.some((r) => r.playerId === playerId)) return;

    const newResult: ChallengeResult = { ...result, playerId, team: player.team };
    tx.update(gameRef, { 'challengeState.results': arrayUnion(newResult) });
  });
}

export async function updateKingOfGeniusProgress(
  gameId: string,
  playerId: string,
  progress: Partial<PlayerProgress>
) {
  const gameRef = doc(db, 'games', gameId);
  await updateDoc(gameRef, { [`challengeState.playerProgress.${playerId}`]: progress });
}

// Kept for compatibility with existing UI components if any, but the logic is now inside handleTimeout.
export async function nextKingOfGenius(gameId: string, hostId: string) {
  return handleTimeout(gameId, hostId);
}
