

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, getDoc, Timestamp, deleteField, updateDoc } from 'firebase/firestore';
import type { Game, Player, ChallengeResult, PlayerProgress, PathTile } from '@/types';
import { GENIUS_CHALLENGES, GENIUS_CHALLENGE_MAP } from '@/data/genius-challenges';
import { updateLeagueScoresForGameEnd } from './user';
import { generateGeniusChallenge } from './admin';
import { shuffle } from './helpers';
import { arrayUnion } from 'firebase/firestore';


const INTRO_COUNTDOWN_SECONDS = 5;

// =================================================================================================
// MAIN GAME FLOW ACTIONS (Called by Client Components)
// =================================================================================================

/**
 * Starts the "King of Genius" game. Only the host can perform this action.
 * This function simply prepares the game state for the first challenge intro.
 * @param gameId - The ID of the game to start.
 * @param hostId - The ID of the user starting the game, who must be the host.
 */
export async function startKingOfGeniusGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId.toUpperCase());

    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
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

/**
 * Handles all timed events in the game. This is the central function for automatic state transitions.
 * It's called by the host when a timer expires.
 * @param gameId - The ID of the game.
 * @param hostId - The ID of the host player.
 */
export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId.toUpperCase());
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) return;

        const timerEndsAt = game.challengeState?.timerEndsAt;
        if (!timerEndsAt || Date.now() < timerEndsAt.toMillis()) {
            return; // Timer hasn't expired yet server-side.
        }

        switch(game.gameState) {
            case 'challenge_intro':
                // The intro is over. Generate the puzzle and start the challenge.
                await _prepareAndStartChallenge(transaction, gameRef, game);
                break;
            case 'challenge_active':
                // The time for the challenge is up. End the round and show results.
                await _endChallengeAndShowResults(transaction, gameRef, game);
                break;
            case 'challenge_results':
                // Time to view results is over. Proceed to the next challenge or end the game.
                await _advanceFromResults(transaction, gameRef, game);
                break;
        }
    });
}

// =================================================================================================
// INTERNAL HELPER FUNCTIONS (Called within transactions)
// =================================================================================================

/**
 * Prepares the next challenge by generating a puzzle and updating the game state.
 * @param transaction - The Firestore transaction object.
 * @param gameRef - Reference to the game document.
 * @param game - The current game data.
 */
async function _prepareAndStartChallenge(transaction: Transaction, gameRef: any, game: Game) {
    const challengeIndex = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[challengeIndex];
    if (!challengeId) {
        throw new Error("No more challenges left or challenge order is missing.");
    }

    const { puzzle } = await generateGeniusChallenge({ challengeId });
    const currentPuzzles = game.puzzles || [];
    currentPuzzles[challengeIndex] = JSON.stringify(puzzle);

    const challengeDetails = GENIUS_CHALLENGE_MAP.get(challengeId);
    const duration = challengeDetails?.timeLimit || 90;
    const challengeEndsAt = Timestamp.fromMillis(Date.now() + duration * 1000);

    const initialProgress: Record<string, PlayerProgress> = {};
    game.players.forEach(p => {
        if (p.status === 'alive') {
            initialProgress[p.id] = { currentProblemIndex: 0, wrongAttempts: 0 };
        }
    });

    transaction.update(gameRef, {
        puzzles: currentPuzzles,
        gameState: 'challenge_active',
        'challengeState.puzzle': puzzle,
        'challengeState.duration': duration,
        'challengeState.challengeEndsAt': challengeEndsAt,
        'challengeState.results': [],
        'challengeState.playerProgress': initialProgress,
    });
}

/**
 * Ends the active challenge, forces submissions for non-responsive players, and moves to results.
 * @param transaction - The Firestore transaction object.
 * @param gameRef - Reference to the game document.
 * @param game - The current game data.
 */
async function _endChallengeAndShowResults(transaction: Transaction, gameRef: any, game: Game) {
    const activePlayers = game.players.filter(p => p.status === 'alive');
    const submittedPlayers = game.challengeState?.results?.map(r => r.playerId) || [];
    const missingSubmissions = activePlayers.filter(p => !submittedPlayers.includes(p.id));

    const resultsToAdd = missingSubmissions.map(p => ({
        playerId: p.id,
        team: p.team!,
        isCorrect: false,
        time: (game.challengeState?.duration || 90) + 1,
        score: 0
    }));

    const allResults = [...(game.challengeState?.results || []), ...resultsToAdd];

    const sortedCorrectResults = allResults.filter(r => r.isCorrect).sort((a, b) => {
        if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
        return a.time - b.time;
    });

    const pointsMap = [10, 5, 3, 1];
    const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };

    sortedCorrectResults.forEach((res, index) => {
        let totalPointsForPlayer = (pointsMap[index] || 0) + (res.score || 0);
        if (totalPointsForPlayer > 0 && res.team) {
            newScores[res.team] = (newScores[res.team] || 0) + totalPointsForPlayer;
        }
    });

    transaction.update(gameRef, {
        teamScores: newScores,
        gameState: 'challenge_results',
        'challengeState.results': allResults,
        'challengeState.timerEndsAt': Timestamp.fromMillis(Date.now() + 15 * 1000)
    });
}

/**
 * Advances the game from the results screen to the next challenge intro or ends the game.
 * @param transaction - The Firestore transaction object.
 * @param gameRef - Reference to the game document.
 * @param game - The current game data.
 */
async function _advanceFromResults(transaction: Transaction, gameRef: any, game: Game) {
    const nextIndex = (game.currentChallengeIndex ?? 0) + 1;
        
    if (nextIndex >= (game.challengeOrder?.length || 0)) {
        // End of game
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
        
        transaction.update(gameRef, {
            gameState: 'final_results',
            gameResult,
            'challengeState.timerEndsAt': deleteField()
        });
        
        const finalGameData = { ...game, gameState: 'final_results', gameResult };
        // We cannot await this inside a transaction, so we do it after.
        // This is a known pattern for post-transaction side effects.
        // The responsibility is on the caller of this function's parent.
    } else {
        // Proceed to next challenge intro
        transaction.update(gameRef, {
            currentChallengeIndex: nextIndex,
            gameState: 'challenge_intro',
            'challengeState.playerProgress': {},
            'challengeState.results': [],
            'challengeState.puzzle': deleteField(),
            'challengeState.timerEndsAt': Timestamp.fromMillis(Date.now() + INTRO_COUNTDOWN_SECONDS * 1000)
        });
    }
}


// =================================================================================================
// PLAYER-INITIATED ACTIONS (Not part of the main game flow timer)
// =================================================================================================

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
