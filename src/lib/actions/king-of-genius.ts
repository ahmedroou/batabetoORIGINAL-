
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, getDoc } from 'firebase/firestore';
import type { Game, Player, ChallengeResult } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';

export async function startKingOfGeniusGame(gameId: string) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const dbGame = gameDoc.data() as Game;

    const activePlayers = dbGame.players.filter((p) => p.status === 'alive');
    if (activePlayers.length < 2) {
      throw new Error('تحتاج إلى لاعبين على الأقل لبدء اللعبة.');
    }

    transaction.update(gameRef, {
      gameState: 'team_selection',
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

    if (game.gameState === 'challenge_intro') {
      transaction.update(gameRef, { gameState: 'challenge_active' });
    }
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
      const nextChallengeId = game.challengeOrder?.[nextIndex];
      if (!nextChallengeId) throw new Error('التحدي التالي غير موجود.');

      const { puzzle } = await generateGeniusChallenge({
        challengeId: nextChallengeId,
      });
      if (!puzzle) {
        throw new Error(
          `Failed to generate a puzzle for challenge: ${nextChallengeId}`
        );
      }

      transaction.update(gameRef, {
        currentChallengeIndex: nextIndex,
        gameState: 'challenge_intro',
        challengeState: { puzzle, results: [] },
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

export async function startGame(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);
  const { puzzle } = await generateGeniusChallenge({
    challengeId: 'code_breaker',
  });
  if (!puzzle?.secretCode) {
    throw new Error('Failed to generate a puzzle for the game.');
  }

  const shuffledChallenges = [...GENIUS_CHALLENGES].sort(
    () => 0.5 - Math.random()
  );
  const challengeOrder = shuffledChallenges.map((c) => c.id);

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const dbGame = gameDoc.data() as Game;

    if (dbGame.hostId !== hostId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء اللعبة.');
    }

    const activePlayers = dbGame.players.filter((p) => p.status === 'alive');
    if (activePlayers.some((p) => !p.team))
      throw new Error('يجب على جميع اللاعبين اختيار فريق أولاً.');

    const teamA = activePlayers.filter((p) => p.team === 'A');
    const teamB = activePlayers.filter((p) => p.team === 'B');
    if (teamA.length !== teamB.length)
      throw new Error('يجب أن تكون الفرق متوازنة.');
    if (teamA.length === 0)
      throw new Error('لا يمكن بدء اللعبة بفرق فارغة.');

    transaction.update(gameRef, {
      gameState: 'challenge_intro',
      challengeOrder,
      currentChallengeIndex: 0,
      teamScores: { A: 0, B: 0 },
      challengeState: { puzzle, results: [] },
    });
  });
}
