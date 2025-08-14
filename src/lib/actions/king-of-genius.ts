'use server';

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  deleteField,
  updateDoc,
} from 'firebase/firestore';
import type { Game, Player, ChallengeResult, PlayerProgress, GeniusChallenge } from '@/types';
import { shuffle } from './helpers';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';
import { GENIUS_CHALLENGES, GENIUS_CHALLENGE_MAP } from '@/data/genius-challenges';
import { updateLeagueScoresForGameEnd } from './user';


const INTRO_DURATION_S = 5;

// --- Team Management ---

export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found in game.");

        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].team = team;

        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function randomizeTeams(gameId: string, hostId: string) {
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
             if (indexInShuffled === -1) return p;
             const team = indexInShuffled < half ? 'A' : 'B';
             return { ...p, team };
        });

        transaction.update(gameRef, { players: updatedPlayers });
    });
}

// --- Game Flow ---

async function _prepareNextChallenge(game: Game): Promise<Partial<Game>> {
    const currentChallengeIndex = game.currentChallengeIndex ?? -1;
    const nextChallengeIndex = currentChallengeIndex + 1;
    
    if (nextChallengeIndex >= (game.challengeOrder?.length || 0)) {
        // No more challenges, end the game
        const teamAScore = game.teamScores?.A || 0;
        const teamBScore = game.teamScores?.B || 0;
        let winner: Game['gameResult']['winner'] = 'draw';
        let message = "انتهت المواجهة بالتعادل!";
        if (teamAScore > teamBScore) {
            winner = 'A';
            message = "الفريق الأزرق يسحق خصمه!";
        } else if (teamBScore > teamAScore) {
            winner = 'B';
            message = "الفريق الأحمر ينتصر!";
        }

        return {
            gameState: 'final_results',
            gameResult: { winner, message },
            challengeState: {
                ...game.challengeState,
                timerEndsAt: deleteField() as any,
            },
        };
    }
    
    // Prepare for the next challenge intro
    return {
        gameState: 'challenge_intro',
        currentChallengeIndex: nextChallengeIndex,
        challengeState: {
            duration: INTRO_DURATION_S, // Duration for the intro
            challengeEndsAt: Timestamp.fromMillis(Date.now() + INTRO_DURATION_S * 1000),
            puzzle: null, // Clear old puzzle
            results: [],
            playerProgress: {},
        },
    };
}


export async function startKingOfGeniusGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.some(p => !p.team)) throw new Error("All players must be on a team.");
        if (game.gameState !== 'team_selection') return; // Idempotency check

        const challengeOrder = shuffle(GENIUS_CHALLENGES.map(c => c.id));
        
        // Prepare the first challenge state by calling the helper
        const firstChallengeUpdates = await _prepareNextChallenge({ ...game, currentChallengeIndex: -1, challengeOrder });

        transaction.update(gameRef, {
            ...firstChallengeUpdates,
            challengeOrder: challengeOrder,
            teamScores: { A: 0, B: 0 },
        });
    });
}


async function _calculateScoresAndProceed(game: Game): Promise<Partial<Game>> {
    const results = game.challengeState?.results || [];
    const pointsMap = [10, 5, 3, 1];
    const teamScores = { ...(game.teamScores || { A: 0, B: 0 }) };

    const sortedResults = results.filter(r => r.isCorrect).sort((a, b) => {
        if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
        return a.time - b.time;
    });

    sortedResults.forEach((result, index) => {
        const player = game.players.find(p => p.id === result.playerId);
        if (!player?.team) return;

        const rankPoints = pointsMap[index] ?? 0;
        const performancePoints = result.score ?? 0;
        teamScores[player.team] += (rankPoints + performancePoints);
    });

    const resultsDisplayDuration = 10;
    
    const nextChallengeUpdates = await _prepareNextChallenge(game);

    return {
        gameState: 'challenge_results',
        teamScores,
        challengeState: {
            ...game.challengeState,
            timerEndsAt: Timestamp.fromMillis(Date.now() + resultsDisplayDuration * 1000),
        },
        ...nextChallengeUpdates, // This will be applied after the results phase
    };
}


export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    let finalGameDataForLeagueUpdate: Game | null = null;
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) return;
        const timerEndsAt = game.challengeState?.timerEndsAt?.toMillis();
        if (timerEndsAt && Date.now() < timerEndsAt) return;

        let updates: Partial<Game> = {};

        switch (game.gameState) {
            case 'challenge_intro': {
                const challengeId = game.challengeOrder?.[game.currentChallengeIndex ?? 0];
                if (!challengeId) {
                    throw new Error("Cannot find next challenge ID.");
                }
                const { puzzle } = await generateGeniusChallenge({ challengeId });
                const currentChallenge = GENIUS_CHALLENGE_MAP.get(challengeId);
                const duration = currentChallenge?.timeLimit ?? 60;
                
                updates = {
                    gameState: 'challenge_active',
                    challengeState: {
                        ...game.challengeState,
                        puzzle: puzzle,
                        timerEndsAt: Timestamp.fromMillis(Date.now() + duration * 1000),
                        duration: duration
                    }
                };
                break;
            }
            case 'challenge_active': {
                const activePlayers = game.players.filter(p => p.status === 'alive');
                const currentResults = game.challengeState?.results || [];
                const playersWhoDidNotFinish = activePlayers.filter(p => !currentResults.some(r => r.playerId === p.id));
                const forfeitResults: ChallengeResult[] = playersWhoDidNotFinish.map(p => ({
                    playerId: p.id,
                    team: p.team!,
                    isCorrect: false,
                    time: 999,
                    score: 0,
                }));
                
                const allResults = [...currentResults, ...forfeitResults];
                const tempUpdatedGame = { ...game, challengeState: { ...game.challengeState, results: allResults } } as Game;
                
                updates = await _calculateScoresAndProceed(tempUpdatedGame);
                 if(updates.gameState === 'final_results') {
                     finalGameDataForLeagueUpdate = { ...game, ...updates };
                 }

                break;
            }
            case 'challenge_results': {
                updates = await _prepareNextChallenge(game);
                if (updates.gameState === 'final_results') {
                    finalGameDataForLeagueUpdate = { ...game, ...updates };
                }
                break;
            }
        }
        
        transaction.update(gameRef, updates);
    });

    if (finalGameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(finalGameDataForLeagueUpdate);
    }
}


// --- Player Actions ---
export async function submitChallengeResult(gameId: string, playerId: string, result: Omit<ChallengeResult, 'playerId' | 'team'>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const player = game.players.find(p => p.id === playerId);
        if (!player?.team) return;

        if (game.challengeState?.results?.some(r => r.playerId === playerId)) return;

        const newResult: ChallengeResult = { ...result, playerId, team: player.team };
        
        transaction.update(gameRef, { 'challengeState.results': arrayUnion(newResult) });
    });
}

export async function updateChallengeProgress(gameId: string, playerId: string, progress: Partial<PlayerProgress>) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
        [`challengeState.playerProgress.${playerId}`]: progress
    });
}