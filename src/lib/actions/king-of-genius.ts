

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, getDoc, Timestamp, deleteField, updateDoc } from 'firebase/firestore';
import type { Game, Player, ChallengeResult, PlayerProgress, GridPosition, PathTile } from '@/types';
import { GENIUS_CHALLENGES, GENIUS_CHALLENGE_MAP } from '@/data/genius-challenges';
import { updateLeagueScoresForGameEnd } from './user';
import { generateGeniusChallenge } from './admin';
import { shuffle } from './helpers';
import { arrayUnion } from 'firebase/firestore';


const INTRO_COUNTDOWN_SECONDS = 5;


export async function updateKingOfGeniusProgress(
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

export async function randomizeTeams(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId.toUpperCase());
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can randomize teams.");
        if (game.gameState !== 'team_selection') throw new Error("Can only randomize teams now.");

        const activePlayers = game.players.filter(p => p.status !== 'left');
        const shuffledPlayers = shuffle(activePlayers);
        const half = Math.ceil(shuffledPlayers.length / 2);
        
        const playerTeamMap: Record<string, 'A' | 'B'> = {};
        shuffledPlayers.forEach((p, index) => {
            playerTeamMap[p.id] = index < half ? 'A' : 'B';
        });

        const updatedPlayers = game.players.map(p => {
             if (playerTeamMap[p.id]) {
                 return { ...p, team: playerTeamMap[p.id] };
             }
             return p;
        });

        transaction.update(gameRef, { players: updatedPlayers });
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
    if (game.gameState !== 'team_selection') return;

    const activePlayers = game.players.filter((p) => p.status === 'alive');
    if (activePlayers.some((p) => !p.team)) throw new Error('يجب على جميع اللاعبين اختيار فريق أولاً.');

    const teamA = activePlayers.filter((p) => p.team === 'A');
    const teamB = activePlayers.filter((p) => p.team === 'B');
    if (teamA.length < 1 || teamB.length < 1 || teamA.length !== teamB.length) {
      throw new Error('يجب أن تكون الفرق متوازنة وتحتوي على لاعب واحد على الأقل.');
    }

    const shuffledChallenges = [...GENIUS_CHALLENGES].sort(() => 0.5 - Math.random());
    const challengeOrder = shuffledChallenges.map((c) => c.id);
    
    const introEndsAt = Timestamp.fromMillis(Date.now() + INTRO_COUNTDOWN_SECONDS * 1000);

    transaction.update(gameRef, {
      gameState: 'challenge_intro',
      challengeOrder,
      puzzles: [],
      currentChallengeIndex: 0,
      teamScores: { A: 0, B: 0 },
      'challengeState.timerEndsAt': introEndsAt,
      'challengeState.puzzle': deleteField(),
      'challengeState.results': [],
      'challengeState.playerProgress': {},
    });
  });
}

// Generates puzzle for the current index and prepares the game state for the intro countdown.
async function prepareNextChallenge(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId.toUpperCase());
    const gameDoc = await getDoc(gameRef);
    if(!gameDoc.exists()) throw new Error("Game not found during puzzle generation.");
    const game = gameDoc.data() as Game;

    const challengeIndex = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[challengeIndex];
    if (!challengeId) {
        throw new Error("No more challenges left or challenge order is missing.");
    }
    
    // Generate the puzzle outside of a transaction to avoid timeout issues.
    const { puzzle } = await generateGeniusChallenge({ challengeId });
    const puzzleString = JSON.stringify(puzzle);

    // Update the game with the generated puzzle in a new transaction/update.
    await runTransaction(db, async (transaction) => {
        const docToUpdate = await transaction.get(gameRef);
        if (!docToUpdate.exists()) return;

        const currentPuzzles = docToUpdate.data()?.puzzles || [];
        currentPuzzles[challengeIndex] = puzzleString;

        const challengeDetails = GENIUS_CHALLENGE_MAP.get(challengeId);
        const duration = challengeDetails?.timeLimit || 90;

        // The intro has already finished, so we set the timer for the active phase.
        const challengeEndsAt = Timestamp.fromMillis(Date.now() + duration * 1000);

        transaction.update(gameRef, {
            puzzles: currentPuzzles,
            'challengeState.puzzle': puzzle,
            'challengeState.duration': duration,
            'challengeState.challengeEndsAt': challengeEndsAt,
        });
    });
}


// Transitions the game state from 'intro' to 'active'
async function beginChallenge(gameId: string, hostId: string, transaction: Transaction) {
    const gameRef = doc(db, 'games', gameId.toUpperCase());
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) throw new Error('فقط صاحب الغرفة يمكنه بدء التحدي.');
    if (game.gameState !== 'challenge_intro') return;
    
    const challengeIndex = game.currentChallengeIndex ?? 0;
    const puzzleString = game.puzzles?.[challengeIndex];
    if (!puzzleString) {
        throw new Error(`فشل تحميل لغز للتحدي.`);
    }

    const puzzle = JSON.parse(puzzleString);
    const initialProgress: Record<string, PlayerProgress> = {};
    game.players.forEach(p => {
        if (p.status === 'alive') {
            initialProgress[p.id] = { currentProblemIndex: 0, wrongAttempts: 0 }; 
        }
    });
    
    transaction.update(gameRef, { 
        gameState: 'challenge_active',
        'challengeState.puzzle': puzzle,
        'challengeState.results': [],
        'challengeState.playerProgress': initialProgress,
    });
}

export async function submitChallengeResult(
  gameId: string,
  playerId: string,
  result: Omit<ChallengeResult, 'playerId' | 'team'> & { playerDrawnPath?: PathTile[] }
) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    let game = gameDoc.data() as Game;

    if (game.gameState !== 'challenge_active') return;

    const player = game.players.find((p) => p.id === playerId);
    if (!player?.team) return;

    let currentResults = game.challengeState?.results || [];
    if (currentResults.some((r) => r.playerId === playerId)) return;
    
    const newResult: ChallengeResult = {
      playerId,
      team: player.team,
      isCorrect: result.isCorrect,
      time: result.time,
      score: result.score || 0,
      playerDrawnPath: result.playerDrawnPath || [], 
    };

    transaction.update(gameRef, {
        'challengeState.results': arrayUnion(newResult)
    });
  });
}

async function advanceFromActive(game: Game, transaction: Transaction) {
    const results = game.challengeState?.results || [];
    
    const sortedCorrectResults = results
        .filter((r) => r.isCorrect)
        .sort((a, b) => {
            if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
            return a.time - b.time;
        });

    const pointsMap = [10, 5, 3, 1];
    const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };

    sortedCorrectResults.forEach((res, index) => {
        let totalPointsForPlayer = (pointsMap[index] || 0) + (res.score || 0);
        if (totalPointsForPlayer > 0) {
            newScores[res.team] = (newScores[res.team] || 0) + totalPointsForPlayer;
        }
    });

    transaction.update(doc(db, 'games', game.id), {
        teamScores: newScores,
        gameState: 'challenge_results',
        'challengeState.timerEndsAt': Timestamp.fromMillis(Date.now() + 15 * 1000)
    });
}

async function advanceToFinalResults(game: Game, transaction: Transaction): Promise<Game> {
    let winner: Game['gameResult']['winner'] = 'draw';
    let message = 'انتهت المواجهة بالتعادل!';
    const teamAScore = game.teamScores?.A || 0;
    const teamBScore = game.teamScores?.B || 0;

    if (teamAScore > teamBScore) {
        winner = 'A';
        message = 'الفريق الأزرق يسحق الفريق الأحمر!';
    } else if (teamBScore > teamAScore) {
        winner = 'B';
        message = 'الفريق الأحمر يتغلب على الفريق الأزرق!';
    }
  
    const gameResult = { winner, message };
    
    transaction.update(doc(db, 'games', game.id), {
        gameState: 'final_results',
        gameResult,
        'challengeState.timerEndsAt': deleteField()
    });
    
    return { ...game, gameState: 'final_results', gameResult };
}

async function advanceToNextChallengeIntro(game: Game, transaction: Transaction) {
    const nextIndex = (game.currentChallengeIndex ?? 0) + 1;
    transaction.update(doc(db, 'games', game.id), {
        currentChallengeIndex: nextIndex,
        gameState: 'challenge_intro',
        'challengeState.playerProgress': {},
        'challengeState.results': [],
        'challengeState.puzzle': {},
        'challengeState.timerEndsAt': Timestamp.fromMillis(Date.now() + INTRO_COUNTDOWN_SECONDS * 1000)
    });
}

export async function nextKingOfGenius(gameId: string, hostId: string) {
    let gameDataForLeagueUpdate: Game | null = null;
    let requiresNextChallengePrep = false;

    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId || game.gameState !== 'challenge_results') return;

        const nextIndex = (game.currentChallengeIndex ?? 0) + 1;
        if (nextIndex >= (game.challengeOrder?.length || 0)) {
            gameDataForLeagueUpdate = await advanceToFinalResults(game, transaction);
        } else {
            await advanceToNextChallengeIntro(game, transaction);
            requiresNextChallengePrep = true;
        }
    });

    if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
    
    if (requiresNextChallengePrep) {
        await prepareNextChallenge(gameId, hostId);
    }
}


export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId.toUpperCase());
    
    try {
        let gameDataForLeagueUpdate: Game | null = null;
        let requiresNextChallengePrep = false;

        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;
            const game = gameDoc.data() as Game;
            
            if (game.hostId !== hostId) return;

            if (!game.challengeState?.timerEndsAt || Date.now() < game.challengeState.timerEndsAt.toMillis()) {
                return;
            }
            
            if (game.gameState === 'challenge_intro') {
                await beginChallenge(gameId, hostId, transaction);
            } else if (game.gameState === 'challenge_active') {
                const activePlayers = game.players.filter(p => p.status === 'alive');
                const submittedPlayers = game.challengeState?.results?.map(r => r.playerId) || [];
                const missingSubmissions = activePlayers.filter(p => !submittedPlayers.includes(p.id));

                if (missingSubmissions.length > 0) {
                    const resultsToAdd = missingSubmissions.map(p => ({
                        playerId: p.id,
                        team: p.team!,
                        isCorrect: false,
                        time: (game.challengeState?.duration || 90) + 1,
                        score: 0
                    }));
                    transaction.update(gameRef, {'challengeState.results': arrayUnion(...resultsToAdd) });
                }
                
                const updatedGameDoc = await transaction.get(gameRef);
                const updatedGame = updatedGameDoc.data() as Game;
                await advanceFromActive(updatedGame, transaction);

            } else if (game.gameState === 'challenge_results') {
                const nextIndex = (game.currentChallengeIndex ?? 0) + 1;
                if (nextIndex >= (game.challengeOrder?.length || 0)) {
                    gameDataForLeagueUpdate = await advanceToFinalResults(game, transaction);
                } else {
                    await advanceToNextChallengeIntro(game, transaction);
                    requiresNextChallengePrep = true;
                }
            }
        });

        // Run these heavy operations *after* the main transaction
        if (gameDataForLeagueUpdate) {
            await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
        }

        if (requiresNextChallengePrep) {
             await prepareNextChallenge(gameId, hostId);
        }

    } catch(error) {
        console.error("Error in handleTimeout:", error);
    }
}
