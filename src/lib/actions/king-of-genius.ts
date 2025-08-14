
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
import { shuffle } from './helpers';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';
import { updateLeagueScoresForGameEnd } from './user';


// --- Helpers ---
function getNextChallengeId(game: Game): string | null {
    const order = game.challengeOrder || [];
    const currentIndex = game.currentChallengeIndex ?? -1;
    if (currentIndex + 1 >= order.length) {
        return null; // No more challenges
    }
    return order[currentIndex + 1];
}


// --- Main Game Flow Actions ---

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
        
        const activePlayers = game.players.filter(p => p.status === 'alive');
        const shuffledPlayers = shuffle(activePlayers);
        const half = Math.ceil(shuffledPlayers.length / 2);
        
        const teamMap: Record<string, 'A' | 'B'> = {};
        shuffledPlayers.forEach((p, index) => {
            teamMap[p.id] = index < half ? 'A' : 'B';
        });

        const updatedPlayers = game.players.map(p => {
             if (teamMap[p.id]) {
                 return { ...p, team: teamMap[p.id] };
             }
             return p;
        });

        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function startKingOfGeniusGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can start.");
        if (game.gameState !== 'team_selection') return;

        const challengeOrder = shuffle(GENIUS_CHALLENGES.map(c => c.id));

        transaction.update(gameRef, {
            gameState: 'challenge_intro',
            challengeOrder: challengeOrder,
            currentChallengeIndex: -1, // Will be incremented to 0 by nextKingOfGenius
        });
    });
    // Immediately start the first round's intro
    await nextKingOfGenius(gameId, hostId);
}

async function prepareNextChallenge(transaction: any, gameRef: any, game: Game): Promise<void> {
    const nextChallengeId = getNextChallengeId(game);
    if (!nextChallengeId) {
        throw new Error("No more challenges left.");
    }
    const challenge = GENIUS_CHALLENGES.find(c => c.id === nextChallengeId);
    if (!challenge) throw new Error(`Challenge with id ${nextChallengeId} not found.`);

    const { puzzle } = await generateGeniusChallenge({ challengeId: nextChallengeId });
    if (!puzzle) throw new Error(`Failed to generate puzzle for challenge: ${challenge.name}`);

    transaction.update(gameRef, {
        gameState: 'challenge_intro',
        currentChallengeIndex: (game.currentChallengeIndex ?? -1) + 1,
        challengeState: {
            puzzle: puzzle,
            results: [],
            playerProgress: {},
            timerEndsAt: Timestamp.fromMillis(Date.now() + 5 * 1000)
        }
    });
}

async function beginChallenge(transaction: any, gameRef: any, game: Game): Promise<void> {
    const challengeId = game.challengeOrder?.[game.currentChallengeIndex ?? -1];
    if (!challengeId) throw new Error("Could not determine current challenge.");
    const challenge = GENIUS_CHALLENGES.find(c => c.id === challengeId);
    if (!challenge) throw new Error("Challenge data not found.");

    transaction.update(gameRef, {
        gameState: 'challenge_active',
        'challengeState.timerEndsAt': Timestamp.fromMillis(Date.now() + challenge.timeLimit * 1000),
    });
}

export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) return;

        const timerEndsAt = game.challengeState?.timerEndsAt;
        if (!timerEndsAt || timerEndsAt.toMillis() > Date.now()) {
            return;
        }

        switch (game.gameState) {
            case 'challenge_intro':
                await beginChallenge(transaction, gameRef, game);
                break;
            case 'challenge_active':
                await nextKingOfGenius(gameId, hostId, transaction);
                break;
            case 'challenge_results':
                await nextKingOfGenius(gameId, hostId, transaction);
                break;
        }
    });
}

export async function submitKingOfGeniusResult(gameId: string, playerId: string, result: Omit<ChallengeResult, 'playerId' | 'team'>) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.gameState !== 'challenge_active') return;

        const player = game.players.find(p => p.id === playerId);
        if (!player || !player.team) throw new Error("Player not found or not in a team.");
        
        // Prevent duplicate submissions
        if (game.challengeState?.results?.some(r => r.playerId === playerId)) {
            return;
        }

        const fullResult: ChallengeResult = {
            ...result,
            playerId: playerId,
            team: player.team,
        };

        transaction.update(gameRef, {
            'challengeState.results': arrayUnion(fullResult)
        });
    });
}

export async function updateKingOfGeniusProgress(gameId: string, playerId: string, progress: any) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
        [`challengeState.playerProgress.${playerId}`]: progress
    });
}

export async function nextKingOfGenius(gameId: string, hostId: string, externalTransaction?: any) {
    const gameRef = doc(db, 'games', gameId);
    const run = externalTransaction ? externalTransaction : (fn: (tx: any) => Promise<any>) => runTransaction(db, fn);

    let gameDataForLeagueUpdate: Game | null = null;

    await run(async (transaction: any) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId && game.gameState !== 'lobby') return; // Only host can advance

        // Step 1: Calculate points from previous round's results
        const lastResults = game.challengeState?.results || [];
        const teamUpdates = { A: 0, B: 0 };
        const rankPoints = [10, 5, 3, 1]; // Points for 1st, 2nd, 3rd, 4th

        const sortedResults = [...lastResults]
            .filter(r => r.isCorrect)
            .sort((a, b) => {
                if ((b.score ?? 0) !== (a.score ?? 0)) {
                    return (b.score ?? 0) - (a.score ?? 0);
                }
                return a.time - b.time;
            });
            
        sortedResults.forEach((res, index) => {
            if (res.team === 'A' || res.team === 'B') {
                const points = (rankPoints[index] || 0) + (res.score || 0);
                teamUpdates[res.team] += points;
            }
        });

        const newTeamScores = {
            A: (game.teamScores?.A || 0) + teamUpdates.A,
            B: (game.teamScores?.B || 0) + teamUpdates.B
        };
        
        transaction.update(gameRef, { teamScores: newTeamScores });

        // Step 2: Determine if game is over or next challenge
        const nextChallengeId = getNextChallengeId(game);
        if (!nextChallengeId) {
            // GAME OVER
            const winner = newTeamScores.A > newTeamScores.B ? 'A' : newTeamScores.B > newTeamScores.A ? 'B' : 'draw';
            const gameResult = {
                winner: winner === 'A' ? 'الفريق الأزرق' : winner === 'B' ? 'الفريق الأحمر' : 'تعادل',
                message: "انتهت المواجهة!"
            };
            transaction.update(gameRef, {
                gameState: 'final_results',
                gameResult: gameResult,
                'challengeState.timerEndsAt': deleteField()
            });

            // Prepare data for post-transaction league update
            gameDataForLeagueUpdate = { ...game, gameState: 'final_results', gameResult, teamScores: newTeamScores };
        } else {
            // PROCEED TO NEXT CHALLENGE
            const challenge = GENIUS_CHALLENGES.find(c => c.id === nextChallengeId);
            if (!challenge) throw new Error(`Challenge with id ${nextChallengeId} not found.`);

            const { puzzle } = await generateGeniusChallenge({ challengeId: nextChallengeId });
            if (!puzzle) throw new Error(`Failed to generate puzzle for challenge: ${challenge.name}`);

            transaction.update(gameRef, {
                gameState: 'challenge_intro',
                currentChallengeIndex: (game.currentChallengeIndex ?? -1) + 1,
                challengeState: {
                    puzzle: puzzle,
                    results: [],
                    playerProgress: {},
                    timerEndsAt: Timestamp.fromMillis(Date.now() + 5 * 1000)
                }
            });
        }
    });

    if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}
