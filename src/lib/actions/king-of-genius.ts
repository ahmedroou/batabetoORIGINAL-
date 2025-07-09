
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, getDoc, Timestamp } from 'firebase/firestore';
import type { Game, Player, ChallengeResult, PlayerProgress } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';

export async function updateChallengeProgress(
  gameId: string,
  playerId: string,
  progress: Partial<PlayerProgress>
) {
  const gameRef = doc(db, 'games', gameId);
  try {
    await runTransaction(db, async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists()) throw new Error('Game not found.');
      const game = gameDoc.data() as Game;

      if (game.gameState !== 'challenge_active') return;

      const playerProgress = game.challengeState?.playerProgress || {};
      const currentProgress = playerProgress[playerId] || {};
      
      const newProgress = { ...currentProgress, ...progress };

      transaction.update(gameRef, {
        [`challengeState.playerProgress.${playerId}`]: newProgress,
      });
    });
  } catch (error) {
    console.error(`Error updating progress for player ${playerId}:`, error);
  }
}

export async function progressToTeamSelection(gameId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;
    if (game.gameState === 'lobby') {
      transaction.update(gameRef, { gameState: 'team_selection' });
    }
  });
}

// This function is called from the team selection screen to start the actual challenges.
export async function startKingOfGeniusGame(gameId: string, userId: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    const activePlayers = game.players.filter((p) => p.status === 'alive');
    if (activePlayers.some((p) => !p.team)) {
      throw new Error('يجب على جميع اللاعبين اختيار فريق أولاً.');
    }

    const teamA = activePlayers.filter((p) => p.team === 'A');
    const teamB = activePlayers.filter((p) => p.team === 'B');
    if (teamA.length !== teamB.length) {
      throw new Error('يجب أن تكون الفرق متوازنة.');
    }
    if (teamA.length === 0) {
      throw new Error('لا يمكن بدء اللعبة بفرق فارغة.');
    }

    const shuffledChallenges = [...GENIUS_CHALLENGES].sort(
      () => 0.5 - Math.random()
    );
    const challengeOrder = shuffledChallenges.map((c) => c.id);
    
    transaction.update(gameRef, {
      gameState: 'challenge_intro',
      challengeOrder,
      currentChallengeIndex: 0,
      teamScores: { A: 0, B: 0 },
      challengeState: {}, // Clear previous challenge state
    });
  });
}

export async function beginChallenge(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء التحدي.');
    }

    if (game.gameState !== 'challenge_intro') {
      // Avoid starting the same challenge twice
      return;
    }
    
    const challengeId = game.challengeOrder?.[game.currentChallengeIndex || 0];
    if (!challengeId) {
        throw new Error("لم يتم العثور على التحدي التالي في القائمة.");
    }

    let durationInSeconds = 90; // Default for Quick Math & Code Breaker
    if (challengeId === 'path_of_survival') {
      durationInSeconds = 3 + 15; // 3s memorize, 15s play
    }
    if (challengeId === 'cipher_shift') {
      durationInSeconds = 15;
    }

    const { puzzle } = await generateGeniusChallenge({
      challengeId: challengeId,
    });
    if (!puzzle) {
      throw new Error(
        `فشل توليد لغز للتحدي: ${challengeId}`
      );
    }

    const challengeEndsAt = Timestamp.fromMillis(Date.now() + durationInSeconds * 1000);

    transaction.update(gameRef, { 
        gameState: 'challenge_active',
        challengeState: {
            puzzle,
            results: [],
            challengeEndsAt,
            playerProgress: {},
        }
    });
  });
}

export async function submitChallengeResult(
  gameId: string,
  playerId: string,
  result: Omit<ChallengeResult, 'playerId' | 'team'>
) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) {
      throw new Error('اللعبة غير موجودة.');
    }
    let game = gameDoc.data() as Game;

    if (game.gameState !== 'challenge_active') {
      return;
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player?.team) {
      return;
    }

    let currentResults = game.challengeState?.results || [];
    if (currentResults.some((r) => r.playerId === playerId)) {
      return;
    }

    const newResult: ChallengeResult = {
      playerId,
      team: player.team,
      ...result,
    };

    const updatedResults = [...currentResults, newResult];

    const updateData: any = {
      'challengeState.results': updatedResults,
    };

    const activePlayers = game.players.filter((p) => p.status === 'alive');

    if (updatedResults.length >= activePlayers.length) {
      const sortedCorrectResults = updatedResults
        .filter((r) => r.isCorrect)
        .sort((a, b) => a.time - b.time);

      const pointsMap = [10, 5, 3, 1];
      const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };

      sortedCorrectResults.forEach((res, index) => {
        const points = pointsMap[index] || 0;
        if (points > 0) {
          newScores[res.team] = (newScores[res.team] || 0) + points;
        }
      });

      updateData.teamScores = newScores;
      updateData.gameState = 'challenge_results';
    }

    transaction.update(gameRef, updateData);
  });
}

export async function nextChallenge(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء الجولة التالية.');
    }
    if (game.gameState !== 'challenge_results') {
      return;
    }

    const nextIndex = (game.currentChallengeIndex ?? 0) + 1;

    if (nextIndex >= (game.challengeOrder?.length || 0)) {
      let winner: Game['gameResult']['winner'] = 'تعادل';
      let message = 'انتهت المواجهة بالتعادل!';
      const teamAScore = game.teamScores?.A || 0;
      const teamBScore = game.teamScores?.B || 0;

      if (teamAScore > teamBScore) {
        winner = 'الفريق الأزرق';
        message = 'الفريق الأزرق يسحق الفريق الوردي!';
      } else if (teamBScore > teamAScore) {
        winner = 'الفريق الوردي';
        message = 'الفريق الوردي يتغلب على الفريق الأزرق!';
      }
      transaction.update(gameRef, {
        gameState: 'final_results',
        gameResult: { winner, message },
      });
    } else {
      transaction.update(gameRef, {
        currentChallengeIndex: nextIndex,
        gameState: 'challenge_intro',
        challengeState: {},
      });
    }
  });
}

export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error('اللاعب غير موجود.');

    const activePlayers = game.players.filter(p => p.status === 'alive');
    const teamPlayers = activePlayers.filter(p => p.team === team);
    const maxTeamSize = Math.ceil(activePlayers.length / 2);

    if (teamPlayers.length >= maxTeamSize) {
        const currentPlayerInTeam = teamPlayers.some(p => p.id === playerId);
        if (!currentPlayerInTeam) {
            throw new Error('هذا الفريق ممتلئ.');
        }
    }
    
    const updatedPlayers = [...game.players];
    updatedPlayers[playerIndex].team = team;

    transaction.update(gameRef, { players: updatedPlayers });
  });
}
