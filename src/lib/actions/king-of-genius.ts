
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, getDoc, Timestamp, deleteField } from 'firebase/firestore';
import type { Game, Player, ChallengeResult, PlayerProgress, GridPosition } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';

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

      // Only allow progress updates during the active challenge phase
      if (game.gameState !== 'challenge_active') return;

      const playerProgress = game.challengeState?.playerProgress || {};
      const currentProgress = playerProgress[playerId] || {};
      
      const newProgress = { ...currentProgress, ...progress };

      transaction.update(gameRef, {
        [`challengeState.playerProgress.${playerId}`]: newProgress,
      });
    });
  } catch (error) {
    // It's a fire-and-forget, so we just log the error server-side
    console.error(`Error updating progress for player ${playerId}:`, error);
  }
}

export async function progressToTeamSelection(gameId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;
    if (game.gameState === 'lobby') {
      transaction.update(gameRef, { gameState: 'instructions' });
    }
  });
}

// This function is called from the team selection screen to start the actual challenges.
export async function startKingOfGeniusGame(gameId: string, userId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

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
    
    // Generate all puzzles upfront
    const puzzlePromises = challengeOrder.map(challengeId => 
        generateGeniusChallenge({ challengeId })
    );
    const puzzleResults = await Promise.all(puzzlePromises);
    
    // Stringify puzzles to avoid nested array issue in Firestore
    const puzzlesAsString = puzzleResults.map(res => JSON.stringify(res.puzzle));
    
    // Prepare for the first challenge
    const firstChallengeId = challengeOrder[0];
    let firstChallengeDuration = 90; // Default time
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
      puzzles: puzzlesAsString, // Store all generated puzzles as strings
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
      // Avoid starting the same challenge twice
      return;
    }
    
    const challengeIndex = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[challengeIndex];
    if (!challengeId) {
        throw new Error("لم يتم العثور على التحدي التالي في القائمة.");
    }

    const puzzleString = game.puzzles?.[challengeIndex];
    if (!puzzleString) {
        throw new Error(`فشل تحميل لغز للتحدي: ${challengeId}.`);
    }

    const puzzle = JSON.parse(puzzleString);

    const initialProgress: Record<string, PlayerProgress> = {};
    // Pre-initialize progress for all players to avoid race conditions
    game.players.forEach(p => {
        if (p.status === 'alive') {
            initialProgress[p.id] = {}; // Initialize with an empty object
        }
    });

    transaction.update(gameRef, { 
        gameState: 'challenge_active',
        'challengeState.puzzle': puzzle,
        'challengeState.results': [],
        'challengeState.playerProgress': initialProgress,
    });
  });
}

export async function checkSmartGridSolution(gameId: string, playerId: string, userAnswers: Record<string, string>) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  try {
    const result = await runTransaction(db, async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists()) throw new Error('Game not found.');
      const game = gameDoc.data() as Game;

      const playerProgress = game.challengeState?.playerProgress?.[playerId] || {};
      if (playerProgress.checkUsed) {
        throw new Error('لقد استخدمت ميزة التحقق بالفعل.');
      }
      
      const puzzle = game.challengeState?.puzzle;
      const solution = puzzle?.solution;
      const nodes = puzzle?.nodes;

      if (!solution || !nodes) {
        throw new Error('Puzzle data is missing.');
      }
      
      const correctCells: GridPosition[] = [];
      const incorrectCells: GridPosition[] = [];

      nodes.forEach((node: any) => {
        if (node.value === null) {
          const key = `${node.r}-${node.c}`;
          const userAnswerStr = userAnswers[key];
          const correctAnswer = solution[node.r]?.[node.c];
          
          if (userAnswerStr && userAnswerStr !== '') {
            const userAnswer = parseInt(userAnswerStr, 10);
            if (!isNaN(userAnswer)) {
                if (userAnswer === correctAnswer) {
                    correctCells.push({ r: node.r, c: node.c });
                } else {
                    incorrectCells.push({ r: node.r, c: node.c });
                }
            }
          }
        }
      });
      
      const checkResult = { correctCells, incorrectCells };

      transaction.update(gameRef, {
        [`challengeState.playerProgress.${playerId}.checkUsed`]: true,
        [`challengeState.playerProgress.${playerId}.lastCheckResult`]: checkResult,
      });

      return checkResult;
    });
    return { success: true, checkResult: result };
  } catch (error: any) {
    console.error(`Error checking solution for player ${playerId}:`, error);
    return { error: error.message || 'An unknown error occurred.' };
  }
}


export async function submitChallengeResult(
  gameId: string,
  playerId: string,
  result: Omit<ChallengeResult, 'playerId' | 'team'>
) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) {
      throw new Error('اللعبة غير موجودة.');
    }
    let game = gameDoc.data() as Game;

    // Allow submission even if gameState has changed to 'challenge_results' by another player
    // This prevents a race condition where a player's valid submission is ignored
    if (game.gameState !== 'challenge_active' && game.gameState !== 'challenge_results') {
      return;
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player?.team) {
      return;
    }

    let currentResults = game.challengeState?.results || [];
    // Prevent duplicate submissions
    if (currentResults.some((r) => r.playerId === playerId)) {
      return;
    }
    
    const finalScore = result.score || 0;

    const newResult: ChallengeResult = {
      playerId,
      team: player.team,
      isCorrect: result.isCorrect,
      time: result.time,
      score: finalScore,
    };

    const updatedResults = [...currentResults, newResult];

    const updateData: any = {
      'challengeState.results': updatedResults,
    };

    const activePlayers = game.players.filter((p) => p.status === 'alive');

    // Check if all active players have submitted their results
    if (updatedResults.length >= activePlayers.length) {
        const sortedCorrectResults = updatedResults
            .filter((r) => r.isCorrect)
            .sort((a, b) => {
                // Primary sort: by score (descending)
                if ((b.score ?? 0) !== (a.score ?? 0)) {
                    return (b.score ?? 0) - (a.score ?? 0);
                }
                // Secondary sort: by time (ascending) for tie-breaking
                return a.time - b.time;
            });

        const pointsMap = [10, 5, 3, 1]; // Rank-based bonus points
        const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };

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
    }

    transaction.update(gameRef, updateData);
  });
}

export async function nextChallenge(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

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
        winner = 'الفريق الأحمر';
        message = 'الفريق الوردي يتغلب على الفريق الأزرق!';
      }
      transaction.update(gameRef, {
        gameState: 'final_results',
        gameResult: { winner, message },
      });
    } else {
        const nextChallengeId = game.challengeOrder?.[nextIndex];
        let nextChallengeDuration = 90; // Default time
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
