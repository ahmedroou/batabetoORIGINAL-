

/**
 * @fileoverview Actions for "The Prison" game — GPT‑5 revamped.
 *
 * أهداف النسخة:
 * - منع توقف اللعبة بغياب اللاعبين: نظام مؤقتات شامل + server tick idempotent يمكن لأي عميل استدعاؤه.
 * - صلابة أعلى للمعاملات وتجنب التضارب عبر أقفال خفيفة (judgingLock) ونسخة حالة stateVersion.
 * - تحققات ودمج إعدادات مع حدود منطقية + قيم افتراضية.
 * - تحكم كامل بدورة الحياة: instructions → open_auction | closed_auction_bidding → closed_auction_answering → judging → results → nextRound | final_results.
 * - مرونة الحكم: حساب النتائج حتى لو لم تصل كل مخرجات الذكاء الاصطناعي، مع مهلة judgingTimeout.
 * - واجهة قديمة متوافقة: أبقينا الدوال الموجودة ووفّرنا دوال جديدة مثل tickGame().
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  collection,
  query,
  getDocs,
  getDoc,
  Timestamp,
  deleteField,
  arrayUnion,
  increment,
  type Transaction,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion, JudgePrisonAnswersInput, JudgeSingleSubmissionOutput, GameState } from '@/types';
import { judgePrisonAnswers as getPrisonJudgeResults } from '@/ai/flows/judge-prison-answers-flow';
import { updateLeagueScoresForGameEnd } from './user';
import { distributeEndOfGameAwards } from './admin/users';
import { normalizeForSignature } from './helpers';

// ————————————————————————————————————————————
// Utilities
// ————————————————————————————————————————————

const DEFAULTS = {
  answeringTime: 45, // seconds
  biddingTime: 30, // seconds
  judgingTimeout: 25, // seconds to wait before proceeding with partial results
  maxRounds: 10,
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const nowMs = () => Date.now();
const tsIn = (sec: number) => Timestamp.fromMillis(nowMs() + sec * 1000);
const isExpired = (ts?: Timestamp | null) => !ts || ts.toMillis() <= nowMs();
const randId = () => Math.random().toString(36).slice(2, 10);

function ensurePrisonState(game: Game) {
  const settings = game.prisonState?.settings || ({} as NonNullable<Game['prisonState']>['settings']);
  const safeSettings = {
    ...settings,
    answeringTime: clamp(Number(settings?.answeringTime ?? DEFAULTS.answeringTime), 10, 180),
    biddingTime: clamp(Number(settings?.biddingTime ?? DEFAULTS.biddingTime), 5, 120),
    rounds: clamp(Number(settings?.rounds ?? DEFAULTS.maxRounds), 1, 50),
  };
  return {
    ...game.prisonState,
    settings: safeSettings,
  } as NonNullable<Game['prisonState']>;
}

async function fetchRandomQuestion(): Promise<PrisonQuestion> {
  const q = query(collection(db, 'prison_questions'));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('لا توجد أسئلة للعبة السجن.');
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PrisonQuestion, 'id'>) }));
  const idx = Math.floor(Math.random() * items.length);
  return items[idx] as PrisonQuestion;
}

function aliveOrInPrison(p: Player) {
  return p.status === 'alive' || p.status === 'in_prison';
}

// ————————————————————————————————————————————
// Settings
// ————————————————————————————————————————————

export async function updatePrisonSettings(
  gameId: string,
  hostId: string,
  settings: Game['prisonState']['settings']
) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;
    if (game.hostId !== hostId) throw new Error('Only the host can change settings.');
    if (game.gameState !== 'lobby') throw new Error('Settings can only be changed in the lobby.');

    const merged = ensurePrisonState({ ...game, prisonState: { ...game.prisonState, settings } } as Game).settings;
    tx.update(gameRef, { 'prisonState.settings': merged });
  });
}

// ————————————————————————————————————————————
// Game Lifecycle
// ————————————————————————————————————————————

export async function startPrisonGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;
    if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
    if ((game.players || []).length < 2) throw new Error('The game requires at least 2 players.');

    const updatedPlayers = game.players.map((p) => ({ ...p, role: 'contestant' as const, status: 'alive' as Player['status'] }));
    const ps = ensurePrisonState(game);

    tx.update(gameRef, {
      players: updatedPlayers,
      gameState: 'instructions',
      round: 1,
      stateVersion: increment(1),
      playerScores: updatedPlayers.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {} as Record<string, number>),
      'prisonState.settings': ps.settings,
      'prisonState.prisonHistory': updatedPlayers.reduce(
        (a, p) => ({ ...a, [p.id]: { inPrison: 0, roundsWithoutWinningAuction: 0 } }),
        {}
      ),
      'prisonState.rejudgeRequestsUsedBy': [],
      'prisonState.judgingLock': false,
      'prisonState.judgeRunId': deleteField(),
      'prisonState.aiJudgeResults': [],
      'prisonState.playerProgress': {},
      'prisonState.openAuctionSubmissions': {},
      'prisonState.timerEndsAt': tsIn(20), // تعليمات قصيرة؛ الواجهة تعرض العداد
    });
  });
}

export async function proceedFromInstructions(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');
    const game = gameDoc.data() as Game;
    if (game.hostId !== hostId) throw new Error('Only host can proceed from instructions.');
    if (game.gameState !== 'instructions') return; // idempotent

    const ps = ensurePrisonState(game);
    const question = await fetchRandomQuestion();

    tx.update(gameRef, {
      gameState: 'open_auction',
      'prisonState.currentQuestion': question,
      'prisonState.closedAuctionQuestion': deleteField(),
      'prisonState.openAuctionSubmissions': {},
      'prisonState.playerProgress': {},
      'prisonState.aiJudgeResults': [],
      'prisonState.timerEndsAt': tsIn(ps.settings.answeringTime || DEFAULTS.answeringTime),
      stateVersion: increment(1),
    });
  });
}

// ————————————————————————————————————————————
// Live Progress & Submissions
// ————————————————————————————————————————————

export async function updateOpenAuctionProgress(gameId: string, playerId: string, answers: string[]) {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const gameDoc = await tx.get(gameRef);
      if (!gameDoc.exists()) return;
      const game = gameDoc.data() as Game;
      if (game.gameState !== 'open_auction' && game.gameState !== 'closed_auction_answering') return;
      tx.update(gameRef, { [`prisonState.playerProgress.${playerId}.answers`]: answers });
    });
  } catch (e) {
    console.error('Error updating open auction progress:', e);
  }
}

export async function submitClosedAuctionAnswer(
  gameId: string,
  playerId: string,
  answers: string[]
): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const gameDoc = await tx.get(gameRef);
      if (!gameDoc.exists()) throw new Error('Game not found.');
      const game = gameDoc.data() as Game;
      if (game.gameState !== 'closed_auction_answering') return;
      if (game.prisonState?.auctionWinnerId !== playerId) throw new Error('لست الفائز بالمزاد.');

      tx.update(gameRef, {
        'prisonState.openAuctionSubmissions': { [playerId]: answers },
        'prisonState.timerEndsAt': deleteField(),
        gameState: 'judging',
        stateVersion: increment(1),
      });
    });
    return { success: true };
  } catch (e: any) {
    console.error('Error submitting closed auction answer:', e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}

// ————————————————————————————————————————————
// Judging
// ————————————————————————————————————————————

async function judgeSinglePlayerAndUpdate(gameId: string, one: JudgePrisonAnswersInput, usePro: boolean) {
  try {
    const submission = one.submissions[0];
    if (!submission || !submission.answers || submission.answers.length === 0) {
      const zero: JudgeSingleSubmissionOutput = {
        playerId: submission?.playerId || 'unknown',
        name: submission?.name || 'Unknown',
        correctAnswers: [],
        score: 0,
        evaluation: 'لم يقدم اللاعب أي إجابات.',
      };
      await updateDoc(doc(db, 'games', gameId), { 'prisonState.aiJudgeResults': arrayUnion(zero) });
      return;
    }

    const out = await getPrisonJudgeResults({ input: one, useProModel: usePro });
    if (out && out.results.length > 0) {
      const single = out.results[0];
      await updateDoc(doc(db, 'games', gameId), { 'prisonState.aiJudgeResults': arrayUnion(single) });
    }
  } catch (e) {
    console.error('judgeSinglePlayerAndUpdate error:', e);
  }
}

export async function judgeAnswersAndProceed(gameId: string, isRejudging: boolean = false) {
  const gameRef = doc(db, 'games', gameId);

  // Guard & initialize judging session
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found for judging.');
    const game = snap.data() as Game;
    const state = game.gameState;
    if (state !== 'judging' && state !== 'rejudging') return;

    const lock = game.prisonState?.judgingLock;
    if (lock) return; // already running

    const allSubs = game.prisonState?.openAuctionSubmissions || {};
    const expected = Object.keys(allSubs).length;

    // If no submissions, go straight to results instead of judging
    if (expected === 0) {
      tx.update(gameRef, {
        gameState: 'results',
        'prisonState.lastRoundResult': { message: 'لا توجد إجابات لتقييمها. انتهت الجولة.', points: {} },
        stateVersion: increment(1),
      });
      return;
    }

    const runId = randId();
    const ps = ensurePrisonState(game);

    tx.update(gameRef, {
      'prisonState.judgingLock': true,
      'prisonState.judgeRunId': runId,
      'prisonState.aiJudgeResults': [],
      'prisonState.judgingExpected': expected,
      'prisonState.timerEndsAt': tsIn(DEFAULTS.judgingTimeout),
      stateVersion: increment(1),
    });
  });

  // Fetch snapshot outside of transaction
  const snap = await getDoc(gameRef);
  if (!snap.exists()) return;
  const game = snap.data() as Game;

  const allSubmissions = game.prisonState?.openAuctionSubmissions || {};

  // Pre-process submissions to remove duplicates before sending to AI
  const playerSubs = Object.entries(allSubmissions).map(([playerId, answers]) => {
    const p = game.players.find((x) => x.id === playerId);
    const uniqueAnswers = Array.from(new Set(answers.map(normalizeForSignature))).map(originalAnswer => {
        return answers.find(ans => normalizeForSignature(ans) === originalAnswer)!;
    });

    return { playerId, name: p?.name || 'Unknown', answers: uniqueAnswers };
  });


  if (playerSubs.length === 0) {
    // This case is now handled in the transaction, but kept as a defensive measure.
    await updateDoc(gameRef, { gameState: 'results' });
    return;
  }

  // Run judgers in parallel; results append via arrayUnion
  await Promise.allSettled(
    playerSubs.map((s) =>
      judgeSinglePlayerAndUpdate(
        gameId,
        {
          question: game.prisonState?.currentQuestion?.text || game.prisonState?.closedAuctionQuestion?.text || '',
          submissions: [s],
          rejudgeReason: isRejudging
            ? { name: game.prisonState?.activeRejudgeRequest?.name || 'Unknown', reason: game.prisonState?.activeRejudgeRequest?.reason || '' }
            : undefined,
        },
        isRejudging
      )
    )
  );
}

// ————————————————————————————————————————————
// Results & Rounds
// ————————————————————————————————————————————

export async function proceedToResults(gameId: string, hostId: string) {
  let finalGameDataForLeagueUpdate: Game | null = null;
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', gameId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    if (game.hostId !== hostId) throw new Error('Only host can proceed to results.');

    // Allow proceeding if results are empty, to handle the no-submissions case.
    if (!game.prisonState?.aiJudgeResults) return;

    const { updatedGame, gameDataForLeague } = await proceedToResultsInternal(game, tx);
    tx.update(ref, updatedGame);
    finalGameDataForLeagueUpdate = gameDataForLeague;
  });

  if (finalGameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
  }
}

export async function proceedToResultsInternal(
  game: Game,
  transaction: Transaction
): Promise<{ updatedGame: object; gameDataForLeague: Game | null }> {
  let updatedPlayers = [...game.players];
  const roundScores: Game['prisonState']['lastRoundResult']['points'] = {} as any;
  const aiResults = game.prisonState!.aiJudgeResults!;
  const lastResultData: Partial<Game['prisonState']['lastRoundResult']> = {};
  const submissions = game.prisonState?.openAuctionSubmissions || {};

  // Initialize round points for all non-executed/left players
  game.players.forEach((p) => {
    if (p.status !== 'executed' && p.status !== 'left') {
      roundScores[p.id] = { points: 0, breakdown: [] } as any;
    }
  });

  // Handle re-judge penalty
  if (game.prisonState?.isRejectionJustified && game.prisonState?.judgeExplanation) {
    const rejudgerId = game.prisonState?.rejudgeRequestsUsedBy?.slice(-1)[0];
    if (rejudgerId && roundScores[rejudgerId]) {
      roundScores[rejudgerId].points -= 1;
      (roundScores[rejudgerId].breakdown as any[]).push({ reason: 'اعتراض خاطئ', points: -1 } as any);
    }
  }

  const isClosedAuction = !!game.prisonState?.auctionWinnerId;

  if (isClosedAuction) {
    const winnerId = game.prisonState!.auctionWinnerId!;
    const winnerResult = aiResults.find((r) => r.playerId === winnerId);
    const bidAmount = game.prisonState!.highestBid || 0;
    const winnerPlayer = updatedPlayers.find((p) => p.id === winnerId)!;

    if (winnerResult && winnerResult.score >= bidAmount) {
        // --- Closed Auction WIN ---
        roundScores[winnerId]!.points += 2; // Base win
        (roundScores[winnerId]!.breakdown as any[]).push({ reason: 'فوز بالمزاد المغلق', points: 2 });
        lastResultData.message = `نجح ${winnerResult.name} في المزاد المغلق!`;
        
        if(winnerPlayer.status === 'in_prison') {
            updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? {...p, status: 'alive'} : p);
            lastResultData.freedPlayerName = winnerPlayer.name;
            lastResultData.freedPlayerAvatarId = winnerPlayer.avatarId;
        } else {
            // If they weren't in prison, they get an extra survival point.
            roundScores[winnerId]!.points += 1;
            (roundScores[winnerId]!.breakdown as any[]).push({ reason: 'بقاء حراً', points: 1 });
        }
    } else {
        // --- Closed Auction FAIL ---
        const answersMissed = Math.max(0, bidAmount - (winnerResult?.score || 0));
        const penalty = -answersMissed;
        if (penalty < 0) {
            roundScores[winnerId]!.points += penalty;
            (roundScores[winnerId]!.breakdown as any[]).push({ reason: 'فشل في المزاد', points: penalty });
        }
        updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? {...p, status: 'in_prison'} : p);
        lastResultData.message = `فشل ${winnerResult?.name || 'الفائز'} في المزاد ودخل السجن!`;
    }

    // Award survival points to everyone else who was not involved
    game.players.forEach(p => {
        if (p.id !== winnerId && p.status === 'alive') {
             roundScores[p.id]!.points += 1;
             (roundScores[p.id]!.breakdown as any[]).push({ reason: 'نجاة', points: 1 });
        }
    });

  } else {
    // --- Open Auction ---
    const finalScores = aiResults.map((r) => ({ playerId: r.playerId, finalScore: r.score }));

    if (finalScores.length > 0) {
      // Penalty for incorrect answers
      finalScores.forEach(({ playerId }) => {
        const res = aiResults.find((r) => r.playerId === playerId)!;
        const totalSubmitted = (submissions?.[playerId] || []).length;
        const incorrect = Math.max(0, totalSubmitted - (res?.score || 0));
        if (incorrect > 0) {
          const penalty = -Math.floor(incorrect / 2);
          if (penalty < 0 && roundScores[playerId]) {
            roundScores[playerId]!.points += penalty;
            (roundScores[playerId]!.breakdown as any[]).push({ reason: 'إجابات خاطئة', points: penalty });
          }
        }
      });

      const values = finalScores.map((c) => c.finalScore);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const winners = finalScores.filter((c) => c.finalScore === max);
      const losers = finalScores.filter((c) => c.finalScore === min);

      let winnerMsg = '';
      let loserMsg = '';

      if (winners.length > 0 && (values.length === 1 || max > min)) {
        winners.forEach((w) => {
          const idx = updatedPlayers.findIndex((p) => p.id === w.playerId);
          const wp = updatedPlayers[idx];
          if (wp && roundScores[wp.id]) {
            winnerMsg = `الفائز بالجولة هو ${wp.name}!`;
            if (wp.status === 'in_prison') {
              updatedPlayers[idx].status = 'alive';
              lastResultData.freedPlayerName = wp.name;
              lastResultData.freedPlayerAvatarId = wp.avatarId;
              winnerMsg += ' وتم تحريره!';
              roundScores[w.playerId]!.points += 2;
              (roundScores[w.playerId]!.breakdown as any[]).push({ reason: 'فوز وتحرير', points: 2 });
            } else {
              roundScores[w.playerId]!.points += 3;
              (roundScores[w.playerId]!.breakdown as any[]).push({ reason: 'فوز بالمزاد', points: 3 });
            }
          }
        });
      }

      if (losers.length === 1 && max > min) {
        const lId = losers[0].playerId;
        const idx = updatedPlayers.findIndex((p) => p.id === lId);
        if (idx !== -1 && updatedPlayers[idx].status === 'alive') {
          updatedPlayers[idx].status = 'in_prison';
          loserMsg = `الخاسر هو ${updatedPlayers[idx].name} وسيدخل السجن.`;
        }
      }

      lastResultData.message = [winnerMsg, loserMsg].filter(Boolean).join(' ');
      if (!lastResultData.message) lastResultData.message = 'انتهى المزاد بالتعادل!';

      finalScores.forEach(({ playerId }) => {
        const isW = winners.some((w) => w.playerId === playerId) && max > min;
        const isL = losers.length === 1 && losers[0].playerId === playerId && max > min;
        if (!isW && !isL && updatedPlayers.find((p) => p.id === playerId)?.status === 'alive') {
           if (roundScores[playerId]) {
                roundScores[playerId]!.points += 1;
                (roundScores[playerId]!.breakdown as any[]).push({ reason: 'نجاة', points: 1 });
            }
        }
      });
    }
  }

  // Apply prison penalty for those still in prison after all other logic
  updatedPlayers.forEach((p) => {
    if (p.status === 'in_prison' && roundScores[p.id]) {
      roundScores[p.id]!.points -= 1;
      (roundScores[p.id]!.breakdown as any[]).push({ reason: 'عقوبة السجن', points: -1 });
    }
  });

  const newTotals = { ...(game.playerScores || {}) } as Record<string, number>;
  Object.entries(roundScores).forEach(([pid, data]) => {
    if ((data as any).points !== 0 && newTotals[pid] !== undefined) {
      newTotals[pid] = (newTotals[pid] || 0) + (data as any).points;
    }
  });

  const finalLastRound = {
    message: lastResultData.message || 'انتهت الجولة.',
    points: roundScores,
    ...lastResultData,
  } as Game['prisonState']['lastRoundResult'];

  let updatedGame: any = {
    players: updatedPlayers,
    playerScores: newTotals,
    gameState: 'results',
    'prisonState.lastRoundResult': finalLastRound,
    'prisonState.timerEndsAt': deleteField(),
    'prisonState.judgingLock': false,
    'prisonState.judgeRunId': deleteField(),
    'prisonState.judgingExpected': deleteField(),
    'prisonState.judgeExplanation': deleteField(),
    stateVersion: increment(1),
  };

  let gameDataForLeague: Game | null = null;
  const stillPlaying = updatedPlayers.filter(aliveOrInPrison).length;
  const isGameOver = stillPlaying < 2 || (game.round || 0) >= (game.prisonState?.settings.rounds || DEFAULTS.maxRounds);
  if (isGameOver) {
    updatedGame.gameState = 'final_results';
    const winnerId = Object.keys(newTotals).reduce((a, b) => (newTotals[a] > newTotals[b] ? a : b), Object.keys(newTotals)[0] || '');
    updatedGame.gameResult = { winner: winnerId, message: 'انتهت اللعبة' };
    gameDataForLeague = { ...game, ...updatedGame };
  }

  return { updatedGame, gameDataForLeague };
}

export async function nextRound(gameId: string, hostId: string) {
  let gameDataForLeagueUpdate: Game | null = null;
  await runTransaction(db, async (tx) => {
    const gameRef = doc(db, 'games', gameId);
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    if (game.hostId !== hostId) throw new Error('Only the host can start the next round.');

    const currentRound = game.round || 1;
    let updatedPlayers = [...game.players];
    const newHistory = { ...(game.prisonState?.prisonHistory || {}) } as any;
    const roundWinners = Object.keys(game.prisonState?.lastRoundResult?.points || {}).filter(
      (id) => (game.prisonState?.lastRoundResult?.points[id].points || 0) > 1
    );

    for (const p of updatedPlayers) {
      if (p.status === 'executed' || p.status === 'left') continue;
      const h = newHistory[p.id] || { inPrison: 0, roundsWithoutWinningAuction: 0 };
      h.inPrison = p.status === 'in_prison' ? (h.inPrison || 0) + 1 : 0;
      h.roundsWithoutWinningAuction = roundWinners.includes(p.id) ? 0 : (h.roundsWithoutWinningAuction || 0) + 1;
      if (h.inPrison >= 5) p.status = 'executed';
      if (h.roundsWithoutWinningAuction >= 5 && p.status === 'alive') {
        p.status = 'in_prison';
        h.roundsWithoutWinningAuction = 0;
      }
      newHistory[p.id] = h;
    }

    const ps = ensurePrisonState(game);
    const question = await fetchRandomQuestion();

    const alivePlayers = updatedPlayers.filter(aliveOrInPrison);
    const inPrison = updatedPlayers.filter((p) => p.status === 'in_prison');

    let nextState: GameState;
    let timerSec: number;

    if (inPrison.length === 0) {
      nextState = 'open_auction';
      timerSec = ps.settings.answeringTime || DEFAULTS.answeringTime;
    } else if (inPrison.length > 0 && inPrison.length < alivePlayers.length) {
      nextState = 'closed_auction_bidding';
      timerSec = ps.settings.biddingTime || DEFAULTS.biddingTime;
    } else {
      nextState = 'open_auction';
      timerSec = ps.settings.answeringTime || DEFAULTS.answeringTime;
    }

    const isGameOver = alivePlayers.length < 2 || (game.round || 0) >= (game.prisonState?.settings.rounds || DEFAULTS.maxRounds);
    if(isGameOver) {
        const winnerId = Object.keys(game.playerScores || {}).reduce((a, b) => ((game.playerScores![a] || 0) > (game.playerScores![b] || 0) ? a : b), Object.keys(game.playerScores || {})[0] || '');
        const finalUpdate = {
             gameState: 'final_results' as const,
             gameResult: { winner: winnerId, message: 'انتهت اللعبة' },
             'prisonState.timerEndsAt': deleteField(),
             stateVersion: increment(1),
        };
        tx.update(gameRef, finalUpdate);
        gameDataForLeagueUpdate = {...game, ...finalUpdate};
        return;
    }


    tx.update(gameRef, {
      players: updatedPlayers,
      gameState: nextState,
      round: currentRound + 1,
      'prisonState.prisonHistory': newHistory,
      'prisonState.currentQuestion': nextState === 'open_auction' ? question : deleteField(),
      'prisonState.closedAuctionQuestion': nextState !== 'open_auction' ? question : deleteField(),
      'prisonState.openAuctionSubmissions': {},
      'prisonState.playerProgress': {},
      'prisonState.aiJudgeResults': [],
      'prisonState.lastRoundResult': deleteField(),
      'prisonState.auctionWinnerId': deleteField(),
      'prisonState.highestBid': deleteField(),
      'prisonState.bids': {},
      'prisonState.activeRejudgeRequest': deleteField(),
      'prisonState.judgingLock': false,
      'prisonState.judgeRunId': deleteField(),
      'prisonState.judgingExpected': deleteField(),
      'prisonState.timerEndsAt': tsIn(timerSec),
      stateVersion: increment(1),
    });
  });

  if (gameDataForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
  }
}

// ————————————————————————————————————————————
// Bidding
// ————————————————————————————————————————————

export async function submitBid(gameId: string, playerId: string, amount: number, changeQuestion?: boolean) {
  const gameRef = doc(db, 'games', gameId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    const player = game.players.find(p => p.id === playerId);
    if (!player) throw new Error("Player not found");

    if (game.gameState !== 'closed_auction_bidding') return { success: false, error: 'انتهى وقت المزايدة.' };

    if (changeQuestion) {
      if ((game.prisonState?.questionChangersUsedBy || []).includes(playerId)) throw new Error('لقد استخدمت قدرتك على تغيير السؤال بالفعل.');

      const questionsCol = collection(db, 'prison_questions');
      const s = await getDocs(query(questionsCol));
      if (s.empty) throw new Error('لا توجد أسئلة كافية لتغيير السؤال.');
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const newQ = list[Math.floor(Math.random() * list.length)];

      tx.update(gameRef, {
        'prisonState.closedAuctionQuestion': newQ,
        'prisonState.questionChangersUsedBy': arrayUnion(playerId),
        // Reset auction state
        'prisonState.bids': {},
        'prisonState.highestBid': 0,
        'prisonState.questionChanger': player.name,
        // Reset timer
        'prisonState.timerEndsAt': tsIn(ensurePrisonState(game).settings.biddingTime || DEFAULTS.biddingTime),
        stateVersion: increment(1),
      });
      return { success: true };
    }

    const currentHighestBid = game.prisonState?.highestBid || 0;
    if (!Number.isFinite(amount) || amount <= currentHighestBid) {
      throw new Error(`يجب أن تكون مزايدتك أعلى من ${currentHighestBid}.`);
    }

    tx.update(gameRef, {
      [`prisonState.bids.${playerId}`]: amount,
      'prisonState.highestBid': amount,
      stateVersion: increment(1),
    });

    return { success: true };
  }).catch((e: any) => ({ success: false, error: e.message }));
}

// ————————————————————————————————————————————
// Timeouts & Self-Driving Tick
// ————————————————————————————————————————————

/**
 * خادم مؤقت/نبض — يمكن لأي عميل استدعاؤه لتقدم اللعبة آلياً عند انتهاء المؤقتات أو نقص المدخلات.
 * Idempotent: لا يسبب تعارضًا عند الاستدعاء المتكرر.
 */
export async function tickGame(gameId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);

  // خطوة 1: انتقالات معتمدة على الوقت/الحالة
  let proceedToLeagueUpdate: Game | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;
    const ps = ensurePrisonState(game);

    // لا نفعل شيئاً إن كان انتهى بالفعل
    if (game.gameState === 'final_results') return;

    // أي حالة بلا timerEndsAt سنحافظ عليها كما هي (بعض الواجهات قد تدفع الإجراءات يدويًا)
    const expired = isExpired(game.prisonState?.timerEndsAt);

    if (game.gameState === 'open_auction' && expired) {
        const submissions: Record<string, string[]> = { ...(game.prisonState?.openAuctionSubmissions || {}) };
        const activePlayers = game.players.filter(p => p.status === 'alive');
        activePlayers.forEach(p => {
            // Only add if not already submitted
            if (!submissions[p.id]) {
                submissions[p.id] = game.prisonState?.playerProgress?.[p.id]?.answers || [];
            }
        });

        tx.update(gameRef, {
            'prisonState.openAuctionSubmissions': submissions,
            gameState: 'judging',
            'prisonState.timerEndsAt': deleteField(),
            stateVersion: increment(1),
        });
        return;
    }

    if (game.gameState === 'closed_auction_bidding' && expired) {
      const bids = game.prisonState?.bids || {};
      if (Object.keys(bids).length === 0) {
        tx.update(gameRef, {
          gameState: 'results',
          'prisonState.lastRoundResult': { message: 'لا أحد زايد. انتهت الجولة بالتعادل.', points: {} },
          'prisonState.timerEndsAt': deleteField(),
          stateVersion: increment(1),
        });
        return;
      }
      let winnerId = '';
      let highestBid = 0;
      for (const [pid, bid] of Object.entries(bids as Record<string, number>)) {
        if (bid > highestBid) {
          highestBid = bid;
          winnerId = pid;
        }
      }
      tx.update(gameRef, {
        gameState: 'closed_auction_answering',
        'prisonState.auctionWinnerId': winnerId,
        'prisonState.highestBid': highestBid,
        'prisonState.timerEndsAt': tsIn(ps.settings.answeringTime || DEFAULTS.answeringTime),
        stateVersion: increment(1),
      });
      return;
    }

    if (game.gameState === 'closed_auction_answering' && expired) {
      const winnerId = game.prisonState?.auctionWinnerId!;
      const ans = game.prisonState?.playerProgress?.[winnerId]?.answers || [];
      tx.update(gameRef, {
        'prisonState.openAuctionSubmissions': { [winnerId]: ans },
        'prisonState.timerEndsAt': deleteField(),
        gameState: 'judging',
        stateVersion: increment(1),
      });
      return;
    }

    if ((game.gameState === 'judging' || game.gameState === 'rejudging')) {
      // إذا لم يبدأ التحكيم بعد، ابدأه. إذا انتهت مهلة التحكيم، أكمل بالنتائج المتاحة.
      const lock = game.prisonState?.judgingLock;
      const expected = game.prisonState?.judgingExpected ?? Object.keys(game.prisonState?.openAuctionSubmissions || {}).length;
      const have = game.prisonState?.aiJudgeResults?.length || 0;

      if (!lock) {
        // ابدأ التحكيم
        tx.update(gameRef, {
          'prisonState.judgingLock': true,
          'prisonState.judgeRunId': randId(),
          'prisonState.aiJudgeResults': [],
          'prisonState.judgingExpected': expected,
          'prisonState.timerEndsAt': tsIn(DEFAULTS.judgingTimeout),
          stateVersion: increment(1),
        });
        return; // سيقوم العميل باستدعاء judgeAnswersAndProceed بعد ذلك، أو يمكن استدعاؤه مباشرة من واجهتكم.
      }

      // قيد التحكيم: إذا اكتملت النتائج أو انتهت المهلة، ننتقل للنتائج.
      if (have >= expected || expired) {
        const { updatedGame, gameDataForLeague } = await proceedToResultsInternal(game, tx);
        tx.update(gameRef, updatedGame);
        proceedToLeagueUpdate = gameDataForLeague;
      }
      return;
    }

    if (game.gameState === 'results' && expired) {
      // بعد النتائج، نتحول تلقائيا للجولة التالية (أو النهاية إذا انتهت الجولات)
      const still = game.players.filter(aliveOrInPrison).length;
      const roundsCap = game.prisonState?.settings.rounds || DEFAULTS.maxRounds;
      if (still < 2 || (game.round || 0) >= roundsCap) {
        // انهِ اللعبة فوراً
        const totals = game.playerScores || {};
        const winnerId = Object.keys(totals).reduce((a, b) => (totals[a] > totals[b] ? a : b), Object.keys(totals)[0] || '');
        tx.update(gameRef, {
          gameState: 'final_results',
          gameResult: { winner: winnerId, message: 'انتهت اللعبة' },
          'prisonState.timerEndsAt': deleteField(),
          stateVersion: increment(1),
        });
        proceedToLeagueUpdate = { ...(game as any), gameState: 'final_results' } as Game;
      } else {
        // مثل nextRound ولكن بلا شرط هوست
        const updatedPlayers = [...game.players];
        const newHistory = { ...(game.prisonState?.prisonHistory || {}) } as any;
        const roundWinners = Object.keys(game.prisonState?.lastRoundResult?.points || {}).filter(
          (id) => (game.prisonState?.lastRoundResult?.points[id].points || 0) > 1
        );

        for (const p of updatedPlayers) {
          if (p.status === 'executed' || p.status === 'left') continue;
          const h = newHistory[p.id] || { inPrison: 0, roundsWithoutWinningAuction: 0 };
          h.inPrison = p.status === 'in_prison' ? (h.inPrison || 0) + 1 : 0;
          h.roundsWithoutWinningAuction = roundWinners.includes(p.id) ? 0 : (h.roundsWithoutWinningAuction || 0) + 1;
          if (h.inPrison >= 5) p.status = 'executed';
          if (h.roundsWithoutWinningAuction >= 5 && p.status === 'alive') {
            p.status = 'in_prison';
            h.roundsWithoutWinningAuction = 0;
          }
          newHistory[p.id] = h;
        }

        const question = await fetchRandomQuestion();
        const alivePlayers = updatedPlayers.filter(aliveOrInPrison);
        const inPrison = updatedPlayers.filter((p) => p.status === 'in_prison');

        let nextState: GameState;
        let timerSec: number;

        if (inPrison.length === 0) {
          nextState = 'open_auction';
          timerSec = ensurePrisonState(game).settings.answeringTime || DEFAULTS.answeringTime;
        } else if (inPrison.length > 0 && inPrison.length < alivePlayers.length) {
          nextState = 'closed_auction_bidding';
          timerSec = ensurePrisonState(game).settings.biddingTime || DEFAULTS.biddingTime;
        } else {
          nextState = 'open_auction';
          timerSec = ensurePrisonState(game).settings.answeringTime || DEFAULTS.answeringTime;
        }

        tx.update(gameRef, {
          players: updatedPlayers,
          gameState: nextState,
          round: (game.round || 1) + 1,
          'prisonState.prisonHistory': newHistory,
          'prisonState.currentQuestion': nextState === 'open_auction' ? question : deleteField(),
          'prisonState.closedAuctionQuestion': nextState !== 'open_auction' ? question : deleteField(),
          'prisonState.openAuctionSubmissions': {},
          'prisonState.playerProgress': {},
          'prisonState.aiJudgeResults': [],
          'prisonState.lastRoundResult': deleteField(),
          'prisonState.auctionWinnerId': deleteField(),
          'prisonState.highestBid': deleteField(),
          'prisonState.bids': {},
          'prisonState.activeRejudgeRequest': deleteField(),
          'prisonState.judgingLock': false,
          'prisonState.judgeRunId': deleteField(),
          'prisonState.judgingExpected': deleteField(),
          'prisonState.timerEndsAt': tsIn(timerSec),
          stateVersion: increment(1),
        });
      }
      return;
    }

    if (game.gameState === 'instructions' && expired) {
      const q = await fetchRandomQuestion();
      tx.update(gameRef, {
        gameState: 'open_auction',
        'prisonState.currentQuestion': q,
        'prisonState.timerEndsAt': tsIn(ensurePrisonState(game).settings.answeringTime || DEFAULTS.answeringTime),
        stateVersion: increment(1),
      });
      return;
    }
  });

  if (proceedToLeagueUpdate) {
    await updateLeagueScoresForGameEnd(proceedToLeagueUpdate);
  }
}

// Back-compat wrapper
export async function handleTimeout(gameId: string, _callerId: string) {
  // أصبح الآن بلا حاجة للتحقّق من هوية المضيف — أي عميل يستطيع تفعيل tick
  await tickGame(gameId);
}

// ————————————————————————————————————————————
// Rejudge
// ————————————————————————————————————————————

export async function requestRejudge(gameId: string, playerId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    const player = game.players.find((p) => p.id === playerId);

    if (game.gameState !== 'judging') throw new Error('لا يمكن طلب إعادة التقييم إلا بعد ظهور النتائج الأولية.');
    if ((game.prisonState?.rejudgeRequestsUsedBy || []).includes(playerId)) throw new Error('لقد استخدمت فرصتك لإعادة التقييم بالفعل.');
    if (game.prisonState?.activeRejudgeRequest) throw new Error('هناك طلب إعادة تقييم قيد التنفيذ بالفعل.');

    const requestData = { playerId, name: player?.name || 'مجهول', reason };

    tx.update(gameRef, {
      'prisonState.activeRejudgeRequest': requestData,
      'prisonState.rejudgeRequestsUsedBy': arrayUnion(playerId),
      gameState: 'rejudging',
      'prisonState.judgingLock': false, // فتح القفل لدورة تحكيم جديدة
      'prisonState.aiJudgeResults': [],
      'prisonState.timerEndsAt': tsIn(DEFAULTS.judgingTimeout),
      stateVersion: increment(1),
    });
  });

  // يمكن للعميل/السيرفر استدعاء الحكم مباشرة أو الاعتماد على tick/واجهة المستخدم
  await judgeAnswersAndProceed(gameId, true);
  return { success: true };
}
