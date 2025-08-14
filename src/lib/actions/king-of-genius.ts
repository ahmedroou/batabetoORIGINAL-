
'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import type { Game, Player, GeniusChallenge, ChallengeResult } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';
import { updateLeagueScoresForGameEnd } from './user';
import { shuffle } from './helpers';


const CHALLENGE_INTRO_SECONDS = 5;

// ================================================================================================
// LOBBY ACTIONS
// ================================================================================================
export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B'): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'team_selection') return;

        const updatedPlayers = game.players.map(p =>
            p.id === playerId ? { ...p, team: team } : p
        );
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function randomizeTeams(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can randomize teams.");
        if (game.gameState !== 'team_selection') return;

        const shuffledPlayers = shuffle(game.players);
        const half = Math.ceil(shuffledPlayers.length / 2);

        const updatedPlayers = game.players.map(p => {
            const indexInShuffled = shuffledPlayers.findIndex(sp => sp.id === p.id);
            const team = indexInShuffled < half ? 'A' : 'B';
            return { ...p, team };
        });
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function startKingOfGeniusGame(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);

    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'team_selection') return; // Prevent re-starting
        if (game.players.some(p => !p.team)) throw new Error("All players must be on a team.");
        
        const challengeOrder = shuffle(GENIUS_CHALLENGES.map(c => c.id));
        
        transaction.update(gameRef, {
            gameState: 'challenge_intro',
            challengeOrder: challengeOrder,
            currentChallengeIndex: 0,
            teamScores: { A: 0, B: 0 },
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            challengeState: {
                timerEndsAt: Timestamp.fromMillis(Date.now() + CHALLENGE_INTRO_SECONDS * 1000)
            },
        });
    });
}

// ================================================================================================
// CORE GAME FLOW (INTERNAL)
// ================================================================================================
async function prepareNextChallenge(transaction: any, gameRef: any, game: Game) {
    const challengeIndex = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[challengeIndex];

    if (!challengeId) {
        // No more challenges, end the game
        const teamA_Score = game.teamScores?.A ?? 0;
        const teamB_Score = game.teamScores?.B ?? 0;
        let winner: 'A' | 'B' | 'draw';
        let message: string;

        if (teamA_Score > teamB_Score) {
            winner = 'A';
            message = 'انتصر الفريق الأزرق!';
        } else if (teamB_Score > teamA_Score) {
            winner = 'B';
            message = 'انتصر الفريق الأحمر!';
        } else {
            winner = 'draw';
            message = 'انتهت المباراة بالتعادل!';
        }
        
        transaction.update(gameRef, {
            gameState: 'final_results',
            gameResult: { winner, message },
            'challengeState.timerEndsAt': deleteField()
        });
        return { gameEnded: true };
    }

    const challenge = GENIUS_CHALLENGES.find(c => c.id === challengeId);
    if (!challenge) throw new Error(`Challenge with ID "${challengeId}" not found.`);

    const { puzzle } = await generateGeniusChallenge({ challengeId: challenge.id });

    transaction.update(gameRef, {
        'challengeState.puzzle': puzzle,
        'challengeState.results': [],
        'challengeState.playerProgress': {},
        'challengeState.timerEndsAt': Timestamp.fromMillis(Date.now() + CHALLENGE_INTRO_SECONDS * 1000)
    });
    return { gameEnded: false };
}


async function nextKingOfGenius(transaction: any, gameRef: any, game: Game) {
    // 1. Calculate scores from the completed round
    const results = game.challengeState?.results || [];
    const challengeIndex = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[challengeIndex];
    if (!challengeId) throw new Error("Cannot proceed, challenge ID is missing.");

    const correctSolvers = results.filter(r => r.isCorrect).sort((a, b) => a.time - b.time);
    
    const rankPointsMap = [10, 5, 3, 1];
    const teamScoreIncrements = { A: 0, B: 0 };
    
    correctSolvers.forEach((result, index) => {
        const team = result.team;
        const rankBonus = rankPointsMap[index] || 0;
        const performanceScore = result.score || 0;
        const totalPoints = rankBonus + performanceScore;
        if (team === 'A' || team === 'B') {
            teamScoreIncrements[team] += totalPoints;
        }
    });

    // 2. Prepare for the next challenge
    const nextChallengeIndex = challengeIndex + 1;
    const hasMoreChallenges = nextChallengeIndex < (game.challengeOrder?.length || 0);

    const updates: any = {
        'teamScores.A': increment(teamScoreIncrements.A),
        'teamScores.B': increment(teamScoreIncrements.B),
        currentChallengeIndex: nextChallengeIndex
    };

    if (hasMoreChallenges) {
        updates.gameState = 'challenge_intro';
        const { gameEnded } = await prepareNextChallenge(transaction, gameRef, { ...game, ...updates });
        if (gameEnded) return; // Stop if the game ended
    } else {
        // This was the last challenge, move to final results
        const finalTeamA_Score = (game.teamScores?.A ?? 0) + teamScoreIncrements.A;
        const finalTeamB_Score = (game.teamScores?.B ?? 0) + teamScoreIncrements.B;
        let winner: 'A' | 'B' | 'draw';
        let message: string;

        if (finalTeamA_Score > finalTeamB_Score) {
            winner = 'A';
            message = 'انتصر الفريق الأزرق!';
        } else if (finalTeamB_Score > finalTeamA_Score) {
            winner = 'B';
            message = 'انتصر الفريق الأحمر!';
        } else {
            winner = 'draw';
            message = 'انتهت المباراة بالتعادل!';
        }

        updates.gameState = 'final_results';
        updates.gameResult = { winner, message };
        updates['challengeState.timerEndsAt'] = deleteField();
    }
    
    transaction.update(gameRef, updates);
}

// ================================================================================================
// PLAYER ACTIONS
// ================================================================================================
export async function submitChallengeResult(gameId: string, playerId: string, result: Omit<ChallengeResult, 'playerId' | 'team'>): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'challenge_active') return;

        const player = game.players.find(p => p.id === playerId);
        if (!player || !player.team) throw new Error("Player or player's team not found.");

        const existingResult = game.challengeState?.results?.find(r => r.playerId === playerId);
        if (existingResult) return; // Player has already submitted

        const finalResult: ChallengeResult = { ...result, playerId, team: player.team };
        transaction.update(gameRef, { 'challengeState.results': arrayUnion(finalResult) });
    });
}

export async function updateKingOfGeniusProgress(gameId: string, playerId: string, progress: any): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    // This is a fire-and-forget update, so we don't need a transaction.
    await updateDoc(gameRef, {
        [`challengeState.playerProgress.${playerId}`]: progress
    });
}

// ================================================================================================
// TIMEOUT HANDLER (HOST-ONLY)
// ================================================================================================
export async function handleTimeout(gameId: string, hostId: string): Promise<void> {
    let finalGameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) return;

        const timerEndsAt = game.challengeState?.timerEndsAt;
        if (!timerEndsAt || timerEndsAt.toMillis() > Date.now()) {
            return; // Timer hasn't expired yet
        }

        switch (game.gameState) {
            case 'challenge_intro':
                const challenge = GENIUS_CHALLENGES.find(c => c.id === game.challengeOrder?.[game.currentChallengeIndex ?? 0]);
                if (!challenge) throw new Error("Challenge data not found for timeout.");
                transaction.update(gameRef, {
                    gameState: 'challenge_active',
                    'challengeState.timerEndsAt': Timestamp.fromMillis(Date.now() + challenge.timeLimit * 1000)
                });
                break;
            case 'challenge_active':
                transaction.update(gameRef, {
                    gameState: 'challenge_results',
                    'challengeState.timerEndsAt': Timestamp.fromMillis(Date.now() + 15 * 1000) // 15s for results
                });
                break;
            case 'challenge_results':
                await nextKingOfGenius(transaction, gameRef, game);
                // Check if the game is over after nextKingOfGenius updates it
                const potentiallyFinishedGame = (await transaction.get(gameRef)).data() as Game;
                if (potentiallyFinishedGame.gameState === 'final_results') {
                     finalGameDataForLeagueUpdate = potentiallyFinishedGame;
                }
                break;
            default:
                // No action for other states like lobby, final_results etc.
                break;
        }
    });

    if (finalGameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
    }
}
