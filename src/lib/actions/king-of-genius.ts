

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, getDoc, Timestamp, deleteField } from 'firebase/firestore';
import type { Game, Player, ChallengeResult, PlayerProgress, GridPosition, PathTile } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';
import { updateLeagueScoresForGameEnd } from './user';
import { generateGeniusChallenge } from './admin';

const STARTING_POINTS_MAZE = 10;
const INTRO_COUNTDOWN_SECONDS = 5;


export async function updateChallengeProgress(
  gameId: string,
  playerId: string,
  progress: Partial<PlayerProgress>
) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  try {
    await runTransaction(db, async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists()) throw new Error('Game not found.');
      const game = gameDoc.data() as Game;

      if (game.gameState !== 'challenge_active') {
        console.warn(`Attempted to update progress for player ${playerId} in game ${gameId} during inactive state: ${game.gameState}`);
        return;
      }

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

export async function progressToTeamSelection(gameId: string, userId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== userId) {
      throw new Error("فقط صاحب الغرفة يمكنه بدء اللعبة.");
    }
    
    if (game.gameState === 'lobby') {
      transaction.update(gameRef, { gameState: 'team_selection' });
    }
  });
}

export async function startKingOfGeniusGame(gameId: string, userId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== userId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء اللعبة.');
    }

    if (game.gameState !== 'team_selection') {
      console.warn(`Game ${gameId} is not in 'team_selection' state. Current state: ${game.gameState}. Skipping start.`);
      return;
    }

    const activePlayers = game.players.filter((p) => p.status === 'alive');
    if (activePlayers.some((p) => !p.team)) {
      throw new Error('يجب على جميع اللاعبين اختيار فريق أولاً.');
    }

    const teamA = activePlayers.filter((p) => p.team === 'A');
    const teamB = activePlayers.filter((p) => p.team === 'B');
    if (teamA.length !== teamB.length) {
      throw new Error('يجب أن تكون الفرق متوازنة.');
    }
    if (teamA.length === 0 || teamB.length === 0) {
      throw new Error('لا يمكن بدء اللعبة بفرق فارغة.');
    }

    const shuffledChallenges = [...GENIUS_CHALLENGES].sort(
      () => 0.5 - Math.random()
    );
    const challengeOrder = shuffledChallenges.map((c) => c.id);
    
    const puzzlePromises = challengeOrder.map(challengeId => 
        generateGeniusChallenge({ challengeId })
    );
    const puzzleResults = await Promise.all(puzzlePromises);
    
    const puzzlesAsString = puzzleResults.map(res => JSON.stringify(res.puzzle));
    
    const firstChallengeId = challengeOrder[0];
    let firstChallengeDuration = 90; // Default
    if (firstChallengeId === 'quick_math') {
        firstChallengeDuration = 60;
    }
    if (firstChallengeId === 'code_breaker') {
        firstChallengeDuration = 45;
    }
    if (firstChallengeId === 'hidden_maze') {
        firstChallengeDuration = 40;
    }
    if (firstChallengeId === 'smart_grid_puzzle') {
        firstChallengeDuration = 120;
    }

    const challengeEndsAt = Timestamp.fromMillis(Date.now() + (firstChallengeDuration + INTRO_COUNTDOWN_SECONDS) * 1000);

    transaction.update(gameRef, {
      gameState: 'challenge_intro',
      challengeOrder,
      puzzles: puzzlesAsString,
      currentChallengeIndex: 0,
      teamScores: { A: 0, B: 0 },
      challengeState: {
          duration: firstChallengeDuration,
          challengeEndsAt,
      },
    });
  });
}

export async function beginChallenge(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء التحدي.');
    }

    if (game.gameState !== 'challenge_intro') {
      console.warn(`Game ${gameId} is not in 'challenge_intro' state. Current state: ${game.gameState}. Skipping begin challenge.`);
      return;
    }
    
    const challengeIndex = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[challengeIndex];
    if (!challengeId) {
        throw new Error("لم يتم العثور على التحدي التالي في القائمة.");
    }

    const puzzleString = game.puzzles?.[challengeIndex];
    if (!puzzleString) {
        throw new Error(`فشل تحميل لغز للتحدي: ${challengeId}. اللغز غير موجود في قائمة الألغاز المولدة مسبقًا.`);
    }

    const puzzle = JSON.parse(puzzleString);

    const initialProgress: Record<string, PlayerProgress> = {};
    game.players.forEach(p => {
        if (p.status === 'alive') {
            initialProgress[p.id] = { currentStep: 0, wrongAttempts: 0 }; 
        }
    });
    
    const updateData: any = { 
        gameState: 'challenge_active',
        'challengeState.puzzle': puzzle,
        'challengeState.results': [],
        'challengeState.playerProgress': initialProgress,
    };

    transaction.update(gameRef, updateData);
  });
}


export async function submitKingOfGeniusResult(
  gameId: string,
  playerId: string,
  result: Omit<ChallengeResult, 'playerId' | 'team'> & { playerDrawnPath?: PathTile[] }
) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) {
      throw new Error('اللعبة غير موجودة.');
    }
    let game = gameDoc.data() as Game;

    if (game.gameState !== 'challenge_active') {
      console.warn(`Player ${playerId} attempted to submit result in game ${gameId} during invalid state: ${game.gameState}. Skipping submission.`);
      return;
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player?.team) {
      console.warn(`Player ${playerId} has no team in game ${gameId}. Skipping submission.`);
      return;
    }

    let currentResults = game.challengeState?.results || [];
    if (currentResults.some((r) => r.playerId === playerId)) {
      console.warn(`Player ${playerId} already submitted result for game ${gameId}. Skipping duplicate submission.`);
      return;
    }
    
    const newResult: ChallengeResult = {
      playerId,
      team: player.team,
      isCorrect: result.isCorrect,
      time: result.time,
      score: result.score || 0,
      playerDrawnPath: result.playerDrawnPath || [], 
    };

    const updatedResults = [...currentResults, newResult];

    let teamScores = { ...(game.teamScores || { A: 0, B: 0 }) };
    const activePlayers = game.players.filter((p) => p.status === 'alive');
    
    const updateData: any = {
      'challengeState.results': updatedResults,
    };

    if (updatedResults.length >= activePlayers.length) {
      const sortedCorrectResults = updatedResults
        .filter((r) => r.isCorrect)
        .sort((a, b) => {
          if ((b.score ?? 0) !== (a.score ?? 0)) {
            return (b.score ?? 0) - (a.score ?? 0);
          }
          return a.time - b.time;
        });

      const pointsMap = [10, 5, 3, 2];
      const newScores = { ...teamScores };

      sortedCorrectResults.forEach((res, index) => {
        let totalPointsForPlayer = 0;
        const rankBonus = pointsMap[index] || 0;
        totalPointsForPlayer += rankBonus;
        totalPointsForPlayer += res.score || 0;
        if (totalPointsForPlayer > 0) {
          newScores[res.team] = (newScores[res.team] || 0) + totalPointsForPlayer;
        }
      });

      updateData.teamScores = newScores;
      updateData.gameState = 'challenge_results';
      updateData['challengeState.playerProgress'] = deleteField();
    }

    transaction.update(gameRef, updateData);
  });
}


export async function nextKingOfGenius(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  let gameDataForLeagueUpdate: Game | null = null;

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء الجولة التالية.');
    }
    if (game.gameState !== 'challenge_results') {
      console.warn(`Game ${gameId} is not in 'challenge_results' state. Current state: ${game.gameState}. Skipping next challenge.`);
      return;
    }

    const nextIndex = (game.currentChallengeIndex ?? 0) + 1;

    if (nextIndex >= (game.challengeOrder?.length || 0)) {
      let winner: Game['gameResult']['winner'] = 'draw';
      let message = 'انتهت المواجهة بالتعادل!';
      const teamAScore = game.teamScores?.A || 0;
      const teamBScore = game.teamScores?.B || 0;

      if (teamAScore > teamBScore) {
        winner = 'red';
        message = 'الفريق الأحمر يسحق الفريق الأزرق!';
      } else if (teamBScore > teamAScore) {
        winner = 'blue';
        message = 'الفريق الأزرق يتغلب على الفريق الأحمر!';
      }
      
      const gameResult = { winner, message };
      
      gameDataForLeagueUpdate = { ...game, gameResult, teamScores: { A: teamAScore, B: teamBScore } };
      
      transaction.update(gameRef, {
        gameState: 'final_results',
        gameResult,
      });
    } else {
        const nextChallengeId = game.challengeOrder?.[nextIndex];
        let nextChallengeDuration = 90; // Default
        if (nextChallengeId === 'quick_math') {
            nextChallengeDuration = 60;
        }
        if (nextChallengeId === 'code_breaker') {
            nextChallengeDuration = 45;
        }
        if (nextChallengeId === 'hidden_maze') {
            nextChallengeDuration = 40;
        }
        if (nextChallengeId === 'smart_grid_puzzle') {
            nextChallengeDuration = 120;
        }

        const challengeEndsAt = Timestamp.fromMillis(Date.now() + (nextChallengeDuration + INTRO_COUNTDOWN_SECONDS) * 1000);

        transaction.update(gameRef, {
            currentChallengeIndex: nextIndex,
            gameState: 'challenge_intro',
            challengeState: {
                duration: nextChallengeDuration,
                challengeEndsAt,
                playerProgress: {},
                results: [],
                puzzle: {},
            },
        });
    }
  });

  if (gameDataForLeagueUpdate) {
      await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
  }
}

export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
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

export async function restartKingOfGeniusChallenge(gameId: string, hostId: string): Promise<void> {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) {
      throw new Error('فقط صاحب الغرفة يمكنه إعادة الجولة.');
    }

    if (game.gameState !== 'challenge_results') {
      throw new Error('لا يمكن إعادة الجولة إلا بعد انتهائها.');
    }

    const currentChallengeIndex = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[currentChallengeIndex];
    if (!challengeId) {
      throw new Error('لم يتم العثور على التحدي الحالي لإعادته.');
    }

    const { puzzle } = await generateGeniusChallenge({ challengeId });
    const puzzlesAsString = [...(game.puzzles || [])];
    puzzlesAsString[currentChallengeIndex] = JSON.stringify(puzzle);

    let challengeDuration = 90; // Default
    if (challengeId === 'quick_math') {
        challengeDuration = 60;
    }
    if (challengeId === 'code_breaker') {
        challengeDuration = 45;
    }
    if (challengeId === 'hidden_maze') {
        challengeDuration = 40;
    }
    if (challengeId === 'smart_grid_puzzle') {
        challengeDuration = 120;
    }
    
    const challengeEndsAt = Timestamp.fromMillis(Date.now() + (challengeDuration + INTRO_COUNTDOWN_SECONDS) * 1000);

    transaction.update(gameRef, {
      puzzles: puzzlesAsString,
      gameState: 'challenge_intro',
      'challengeState.duration': challengeDuration,
      'challengeState.challengeEndsAt': challengeEndsAt,
      'challengeState.playerProgress': {},
      'challengeState.results': [],
      'challengeState.puzzle': {},
    });
  });
}
