

'use server';

/**
 * @fileoverview Actions for "The Prison" game — GPT‑5 revamped & hardened.
 *
 * This version incorporates critical feedback on architectural issues, ensuring
 * robust, scalable, and correct behavior by adhering to Firestore best practices.
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
  where,
  orderBy,
  limit,
  FieldPath,
  serverTimestamp,
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion, JudgePrisonAnswersInput, JudgeSingleSubmissionOutput, GameState } from '@/types';
import { getPrisonJudgeResults } from '@/ai/flows/judge-prison-answers-flow';
import { updateLeagueScoresForGameEnd } from './user';
import { distributeEndOfGameAwards } from './admin/users';
import { normalizeForSignature } from './helpers';

// ————————————————————————————————————————————
// Utilities & Constants
// ————————————————————————————————————————————

const DEFAULTS = {
  answeringTime: 45,
  biddingTime: 30,
  judgingTimeout: 25,
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
  const questionsCol = collection(db, 'prison_questions');
  const randomKey = Math.random().toString(36).substring(2);

  let q = query(
    questionsCol,
    where('randomKey', '>=', randomKey),
    orderBy('randomKey'),
    limit(1)
  );
  let snap = await getDocs(q);

  if (snap.empty) {
    q = query(
      questionsCol,
      where('randomKey', '<', randomKey),
      orderBy('randomKey', 'desc'),
      limit(1)
    );
    snap = await getDocs(q);
  }
  
  if (snap.empty) {
      const allDocsSnap = await getDocs(query(questionsCol, limit(1000))); 
      if (allDocsSnap.empty) {
         return { id: 'fallback', text: 'ما هي أركان الإسلام الخمسة؟', similaritySignature: 'اركان الاسلام الخمسة' };
      }
      const randomDoc = allDocsSnap.docs[Math.floor(Math.random() * allDocsSnap.docs.length)];
      return { id: randomDoc.id, ...(randomDoc.data() as Omit<PrisonQuestion, 'id'>) };
  }

  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...(docSnap.data() as Omit<PrisonQuestion, 'id'>) };
}


const aliveOrInPrison = (p: Player) => ['alive', 'in_prison'].includes(p.status);

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
      'prisonState.aiJudgeResults': {},
      'prisonState.playerProgress': {},
      'prisonState.openAuctionSubmissions': {},
      'prisonState.timerEndsAt': tsIn(20),
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
    if (game.gameState !== 'instructions') return;

    const ps = ensurePrisonState(game);
    const question = await fetchRandomQuestion();

    tx.update(gameRef, {
      gameState: 'open_auction',
      'prisonState.currentQuestion': question,
      'prisonState.closedAuctionQuestion': deleteField(),
      'prisonState.openAuctionSubmissions': {},
      'prisonState.playerProgress': {},
      'prisonState.aiJudgeResults': {},
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
    const fieldPath = new FieldPath('prisonState', 'playerProgress', playerId, 'answers');
    await updateDoc(gameRef, fieldPath, answers);
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
      const fieldPath = new FieldPath('prisonState', 'aiJudgeResults', zero.playerId);
      await updateDoc(doc(db, 'games', gameId), fieldPath, zero);
      return;
    }

    const out = await getPrisonJudgeResults({ input: one, useProModel: usePro });
    if (out && out.results.length > 0) {
      const single = out.results[0]!;
      const fieldPath = new FieldPath('prisonState', 'aiJudgeResults', single.playerId);
      await updateDoc(doc(db, 'games', gameId), fieldPath, single);
    }
  } catch (e) {
    console.error(`AI Judging failed for player ${one.submissions[0]?.playerId} in game ${gameId}:`, e);
    const fieldPath = new FieldPath('prisonState', 'aiJudgeResults', one.submissions[0]!.playerId);
    await updateDoc(doc(db, 'games', gameId), fieldPath, {
      playerId: one.submissions[0]!.playerId,
      name: one.submissions[0]!.name,
      score: 0,
      correctAnswers: [],
      evaluation: "خطأ في الاتصال بحكم الذكاء الاصطناعي.",
    });
  }
}

export async function judgeAnswersAndProceed(gameId: string, isRejudging: boolean = false) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found for judging.');
    const game = snap.data() as Game;
    const state = game.gameState;
    if (state !== 'judging' && state !== 'rejudging') return;

    const lock = game.prisonState?.judgingLock;
    if (lock) return;

    const allSubs = game.prisonState?.openAuctionSubmissions || {};
    const expected = Object.keys(allSubs).length;

    if (expected === 0) {
      tx.update(gameRef, {
        gameState: 'results',
        'prisonState.lastRoundResult': { message: 'لا توجد إجابات لتقييمها. انتهت الجولة.', points: {} },
        stateVersion: increment(1),
      });
      return;
    }

    const runId = randId();
    ensurePrisonState(game);

    tx.update(gameRef, {
      'prisonState.judgingLock': true,
      'prisonState.judgeRunId': runId,
      'prisonState.aiJudgeResults': {},
      'prisonState.judgingExpected': expected,
      'prisonState.timerEndsAt': tsIn(DEFAULTS.judgingTimeout),
      'prisonState.activeRejudgeRequest': deleteField(), // Clear the request flag
      stateVersion: increment(1),
    });
  });

  const snap = await getDoc(gameRef);
  if (!snap.exists()) return;
  const game = snap.data() as Game;

  const allSubmissions = game.prisonState?.openAuctionSubmissions || {};

  const playerSubs = Object.entries(allSubmissions).map(([playerId, answers]) => {
    const p = game.players.find((x) => x.id === playerId);
    
    const seen = new Set<string>();
    const uniqueAnswers = (answers || []).filter(answer => {
        const normalized = normalizeForSignature(answer);
        if (seen.has(normalized) || !normalized) {
            return false;
        } else {
            seen.add(normalized);
            return true;
        }
    });

    return { playerId, name: p?.name || 'Unknown', answers: uniqueAnswers };
  });

  if (playerSubs.length === 0) {
    await updateDoc(gameRef, { gameState: 'results', 'prisonState.judgingLock': false });
    return;
  }

  for (const s of playerSubs) {
    await judgeSinglePlayerAndUpdate(
      gameId,
      {
        question: game.prisonState?.currentQuestion?.text || game.prisonState?.closedAuctionQuestion?.text || '',
        submissions: [s],
        rejudgeReason: isRejudging
          ? { name: game.prisonState?.activeRejudgeRequest?.name || 'Unknown', reason: game.prisonState?.activeRejudgeRequest?.reason || '' }
          : undefined,
      },
      isRejudging
    );
  }
}

// ————————————————————————————————————————————
// Results & Rounds
// ————————————————————————————————————————————

export async function proceedToResults(gameId: string, hostId: string) {
  let finalGameForLeagueUpdate: Game | null = null;
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', gameId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    if (game.hostId !== hostId) throw new Error('Only host can proceed to results.');

    if (!game.prisonState?.aiJudgeResults) return;

    const { updatedGame, gameDataForLeague } = await proceedToResultsInternal(game, tx);
    tx.update(ref, updatedGame);
    finalGameForLeagueUpdate = gameDataForLeague;
  });

  if (finalGameForLeagueUpdate) {
    await updateLeagueScoresForGameEnd(finalGameForLeagueUpdate);
  }
}

export async function proceedToResultsInternal(
  game: Game,
  tx: Transaction
): Promise<{ updatedGame: object; gameDataForLeague: Game | null }> {
  let updatedPlayers = [...game.players];
  const roundScores: Game['prisonState']['lastRoundResult']['points'] = {} as any;
  const aiResults = game.prisonState!.aiJudgeResults!;
  const lastResultData: Partial<Game['prisonState']['lastRoundResult']> = {};
  const submissions = game.prisonState?.openAuctionSubmissions || {};

  game.players.forEach((p) => {
    if (p.status !== 'executed' && p.status !== 'left') {
      roundScores[p.id] = { points: 0, breakdown: [] } as any;
    }
  });

  if (game.prisonState?.isRejectionJustified && game.prisonState?.judgeExplanation) {
    const rejudgerId = game.prisonState?.activeRejudgeRequest?.playerId;
    if (rejudgerId && roundScores[rejudgerId]) {
      roundScores[rejudgerId].points -= 1;
      (roundScores[rejudgerId].breakdown as any[]).push({ reason: 'اعتراض خاطئ', points: -1 });
    }
  }

  const isClosedAuction = !!game.prisonState?.auctionWinnerId;

  if (isClosedAuction) {
    const winnerId = game.prisonState!.auctionWinnerId!;
    const winnerResult = aiResults[winnerId];
    const bidAmount = game.prisonState!.highestBid || 0;
    const winnerPlayer = updatedPlayers.find((p) => p.id === winnerId)!;

    if (winnerResult && winnerResult.score >= bidAmount) {
        roundScores[winnerId]!.points += 2;
        (roundScores[winnerId]!.breakdown as any[]).push({ reason: 'فوز بالمزاد المغلق', points: 2 });
        lastResultData.message = `نجح ${winnerResult.name} في المزاد المغلق!`;
        
        if(winnerPlayer.status === 'in_prison') {
            updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? {...p, status: 'alive'} : p);
            lastResultData.freedPlayerName = winnerPlayer.name;
            lastResultData.freedPlayerAvatarId = winnerPlayer.avatarId;
            
        } else {
            roundScores[winnerId]!.points += 1;
            (roundScores[winnerId]!.breakdown as any[]).push({ reason: 'بقاء حراً', points: 1 });
        }
    } else {
        const answersMissed = Math.max(0, bidAmount - (winnerResult?.score || 0));
        const penalty = -answersMissed;
        if (penalty < 0) {
            roundScores[winnerId]!.points += penalty;
            (roundScores[winnerId]!.breakdown as any[]).push({ reason: `فشل (-${answersMissed})`, points: penalty });
        }
        updatedPlayers = updatedPlayers.map(p => p.id === winnerId ? {...p, status: 'in_prison'} : p);
        lastResultData.message = `فشل ${winnerResult?.name || 'الفائز'} في المزاد ودخل السجن!`;
    }

    game.players.forEach(p => {
        if (p.id !== winnerId && p.status === 'alive') {
             if (roundScores[p.id]) {
                roundScores[p.id]!.points += 1;
                (roundScores[p.id]!.breakdown as any[]).push({ reason: 'نجاة', points: 1 });
             }
        }
    });

  } else {
    // Open Auction scoring logic
    const finalScores = Object.values(aiResults).map((r) => ({ playerId: r.playerId, finalScore: r.score }));

    if (finalScores.length > 0) {
        finalScores.forEach(({ playerId }) => {
            const res = aiResults[playerId]!;
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
      
      const scoreValues = finalScores.map((c) => c.finalScore);
      if (scoreValues.length > 0) {
        const max = Math.max(...scoreValues);
        const min = Math.min(...scoreValues);
        const winners = finalScores.filter((c) => c.finalScore === max);
        const losers = finalScores.filter((c) => c.finalScore === min);

        let winnerMsg = '';
        let loserMsg = '';

        if (winners.length > 0 && (scoreValues.length === 1 || max > min)) {
            winners.forEach((w) => {
            const idx = updatedPlayers.findIndex((p) => p.id === w.playerId);
            const wp = updatedPlayers[idx];
            if (wp && roundScores[wp.id]) {
                winnerMsg = `الفائز بالجولة هو ${wp.name}!`;
                if (wp.status === 'in_prison') {
                updatedPlayers[idx] = {...wp, status: 'alive'};
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
            updatedPlayers[idx] = {...updatedPlayers[idx], status: 'in_prison'};
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
  }

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

  const updatedGamePartial: any = {
    players: updatedPlayers,
    playerScores: newTotals,
    gameState: 'results',
    'prisonState.lastRoundResult': finalLastRound,
    'prisonState.timerEndsAt': deleteField(),
    'prisonState.judgingLock': false,
    'prisonState.judgeRunId': deleteField(),
    'prisonState.judgingExpected': deleteField(),
    'prisonState.judgeExplanation': deleteField(),
    'prisonState.activeRejudgeRequest': deleteField(),
    stateVersion: increment(1),
  };

  const stillPlaying = updatedPlayers.filter(aliveOrInPrison).length;
  const isGameOver = stillPlaying < 2 || (game.round || 0) >= (game.prisonState?.settings.rounds || DEFAULTS.maxRounds);
  let gameDataForLeague: Game | null = null;
  
  if (isGameOver) {
    updatedGamePartial.gameState = 'final_results';
    const winnerId = Object.keys(newTotals).reduce((a, b) => (newTotals[a]! > newTotals[b]! ? a : b), Object.keys(newTotals)[0] || '');
    updatedGamePartial.gameResult = { winner: winnerId, message: 'انتهت اللعبة' };
    
    const stateForLeague = { ...game.prisonState, lastRoundResult: finalLastRound };
    delete (stateForLeague as any).timerEndsAt;
    delete (stateForLeague as any).judgingLock;

    gameDataForLeague = {
      ...game,
      players: updatedPlayers,
      playerScores: newTotals,
      gameState: 'final_results',
      gameResult: updatedGamePartial.gameResult,
      prisonState: stateForLeague,
    } as Game;
  }

  return { updatedGame: updatedGamePartial, gameDataForLeague };
}


export async function nextRound(gameId: string, hostId: string) {
  let gameDataForLeagueUpdate: Game | null = null;
  await runTransaction(db, async (tx) => {
    const gameRef = doc(db, 'games', gameId);
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    if (game.hostId !== hostId) throw new Error('Only the host can start the next round.');

    const result = await _startNextRound(tx, gameRef, game);
    if (result.isGameOver) {
      gameDataForLeagueUpdate = result.finalGame;
    }
  });

  if (gameDataForLeagueUpdate) {
    await distributeEndOfGameAwards(gameId);
    await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
  }
}

export async function handleTimeout(gameId: string, _callerId: string) {
  await tickGame(gameId);
}

export async function tickGame(gameId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId);
  let finalGameData: Game | null = null;
  let shouldJudge = false;
  let rejudge = false;
  let shouldProceedToResults = false;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const game = snap.data() as Game;
    
    if (game.gameState === 'final_results') return;
    const timerEndsAt = game.prisonState?.timerEndsAt;
    if (!timerEndsAt || timerEndsAt.toMillis() > nowMs()) return;

    tx.update(gameRef, { 'prisonState.timerEndsAt': deleteField() });
    
    switch(game.gameState) {
      case 'open_auction': {
        const submissions: Record<string, string[]> = { ...(game.prisonState?.openAuctionSubmissions || {}) };
        const activePlayers = game.players.filter(aliveOrInPrison);
        activePlayers.forEach(p => {
            if (!submissions[p.id]) {
                submissions[p.id] = game.prisonState?.playerProgress?.[p.id]?.answers || [];
            }
        });
        tx.update(gameRef, {
            'prisonState.openAuctionSubmissions': submissions,
            gameState: 'judging',
            stateVersion: increment(1),
        });
        shouldJudge = true;
        rejudge = false;
        break;
      }
      case 'closed_auction_bidding': {
        const bids = game.prisonState?.bids || {};
        if (Object.keys(bids).length === 0) {
          tx.update(gameRef, {
            gameState: 'results',
            'prisonState.lastRoundResult': { message: 'لا أحد زايد. انتهت الجولة بالتعادل.', points: {} },
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
        const ps = ensurePrisonState(game);
        tx.update(gameRef, {
          gameState: 'closed_auction_answering',
          'prisonState.auctionWinnerId': winnerId,
          'prisonState.highestBid': highestBid,
          'prisonState.timerEndsAt': tsIn(ps.settings.answeringTime || DEFAULTS.answeringTime),
          stateVersion: increment(1),
        });
        break;
      }
      case 'closed_auction_answering': {
        const winnerId = game.prisonState?.auctionWinnerId!;
        const ans = game.prisonState?.playerProgress?.[winnerId]?.answers || [];
        tx.update(gameRef, {
          'prisonState.openAuctionSubmissions': { [winnerId]: ans },
          gameState: 'judging',
          stateVersion: increment(1),
        });
        shouldJudge = true;
        rejudge = false;
        break;
      }
      case 'judging':
      case 'rejudging': {
          shouldProceedToResults = true;
          break;
      }
      case 'results': {
          const result = await _startNextRound(tx, gameRef, game);
          if(result.isGameOver) {
              finalGameData = result.finalGame;
          }
          break;
      }
      case 'instructions': {
        const q = await fetchRandomQuestion();
        tx.update(gameRef, {
          gameState: 'open_auction',
          'prisonState.currentQuestion': q,
          'prisonState.timerEndsAt': tsIn(ensurePrisonState(game).settings.answeringTime || DEFAULTS.answeringTime),
          stateVersion: increment(1),
        });
        break;
      }
    }
  });

  if (shouldJudge) {
    await judgeAnswersAndProceed(gameId, rejudge);
  }

  if (shouldProceedToResults) {
    await proceedToResults(gameId, game.hostId);
  }

  if (finalGameData) {
      await distributeEndOfGameAwards(gameId);
      await updateLeagueScoresForGameEnd(finalGameData);
  }
}


async function _startNextRound(tx: Transaction, gameRef: DocumentData, game: Game): Promise<{isGameOver: boolean, finalGame: Game | null}> {
     let isGameOver = false;
     let finalGame: Game | null = null;
     
     const currentRound = game.round || 1;
     if (currentRound >= (game.prisonState?.settings.rounds || DEFAULTS.maxRounds)) {
         isGameOver = true;
     } else {
        const nextRoundNum = currentRound + 1;
        const ps = ensurePrisonState(game);
        const question = await fetchRandomQuestion();

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

        if (alivePlayers.length < 2) {
            isGameOver = true;
        }

        if(!isGameOver) {
            tx.update(gameRef, {
                players: updatedPlayers,
                gameState: nextState,
                round: nextRoundNum,
                'prisonState.prisonHistory': newHistory,
                'prisonState.currentQuestion': nextState === 'open_auction' ? question : deleteField(),
                'prisonState.closedAuctionQuestion': nextState !== 'open_auction' ? question : deleteField(),
                'prisonState.openAuctionSubmissions': {},
                'prisonState.playerProgress': {},
                'prisonState.aiJudgeResults': {},
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
     }
     
     if (isGameOver) {
         const winnerId = Object.keys(game.playerScores || {}).reduce((a, b) => ((game.playerScores![a] || 0) > (game.playerScores![b] || 0) ? a : b), Object.keys(game.playerScores || {})[0] || '');
         const finalUpdate = {
             gameState: 'final_results' as const,
             gameResult: { winner: winnerId, message: 'انتهت اللعبة' },
             'prisonState.timerEndsAt': deleteField(),
         };
         tx.update(gameRef, finalUpdate);
         finalGame = JSON.parse(JSON.stringify({...game, ...finalUpdate}));
     }

     return { isGameOver, finalGame };
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
    if (!player || !aliveOrInPrison(player)) throw new Error("لا يمكنك المزايدة.");
    if (game.gameState !== 'closed_auction_bidding') return { success: false, error: 'انتهى وقت المزايدة.' };

    if (changeQuestion) {
      if ((game.prisonState?.questionChangersUsedBy || []).includes(playerId)) throw new Error('لقد استخدمت قدرتك على تغيير السؤال بالفعل.');

      const newQ = await fetchRandomQuestion();

      tx.update(gameRef, {
        'prisonState.closedAuctionQuestion': newQ,
        'prisonState.questionChangersUsedBy': arrayUnion(playerId),
        'prisonState.bids': {},
        'prisonState.highestBid': 0,
        'prisonState.questionChanger': player.name,
        'prisonState.timerEndsAt': tsIn(ensurePrisonState(game).settings.biddingTime || DEFAULTS.biddingTime),
        stateVersion: increment(1),
      });
      return { success: true };
    }

    const currentHighestBid = game.prisonState?.highestBid || 0;
    if (!Number.isFinite(amount) || amount <= currentHighestBid) {
      throw new Error(`يجب أن تكون مزايدتك أعلى من ${currentHighestBid}.`);
    }

    const fp = new FieldPath('prisonState', 'bids', playerId);
    tx.update(gameRef, fp, amount);
    tx.update(gameRef, 'prisonState.highestBid', amount);
    tx.update(gameRef, 'stateVersion', increment(1));

    return { success: true };
  }).catch((e: any) => ({ success: false, error: e.message }));
}

// ————————————————————————————————————————————
// Rejudge
// ————————————————————————————————————————————

export async function requestRejudge(gameId: string, playerId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const gameRef = doc(db, 'games', gameId);
  let shouldJudge = false;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('Game not found.');
    const game = snap.data() as Game;
    const player = game.players.find((p) => p.id === playerId);

    if (game.gameState !== 'results') throw new Error('لا يمكن طلب إعادة التقييم إلا بعد ظهور النتائج النهائية للجولة.');
    if ((game.prisonState?.rejudgeRequestsUsedBy || []).includes(playerId)) throw new Error('لقد استخدمت فرصتك لإعادة التقييم بالفعل.');
    if (game.prisonState?.activeRejudgeRequest) throw new Error('هناك طلب إعادة تقييم قيد التنفيذ بالفعل.');

    const requestData = { playerId, name: player?.name || 'مجهول', reason, createdAt: serverTimestamp() };

    tx.update(gameRef, {
      'prisonState.activeRejudgeRequest': requestData,
      gameState: 'rejudging',
      'prisonState.judgingLock': false,
      'prisonState.aiJudgeResults': {},
      'prisonState.timerEndsAt': tsIn(DEFAULTS.judgingTimeout),
      'prisonState.rejudgeRequestsUsedBy': arrayUnion(playerId),
      'prisonState.rejudgePendingConfirmation': true,
      stateVersion: increment(1),
    });
    shouldJudge = true;
  });

  if (shouldJudge) {
    await judgeAnswersAndProceed(gameId, true);
    await updateDoc(gameRef, {
        'prisonState.rejudgePendingConfirmation': deleteField(),
    });
  }

  return { success: true };
}
