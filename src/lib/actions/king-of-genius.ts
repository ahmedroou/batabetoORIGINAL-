
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player, ChallengeResult } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';

function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length, randomIndex;
  while (currentIndex > 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    const game = gameDoc.data() as Game;

    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found.");
    
    const updatedPlayers = [...game.players];
    const playerToUpdate = updatedPlayers[playerIndex];

    const activePlayers = updatedPlayers.filter(p => p.status === 'alive');
    const targetTeamPlayers = activePlayers.filter(p => p.team === team && p.id !== playerId);
    const maxTeamSize = activePlayers.length > 0 ? Math.ceil(activePlayers.length / 2) : 0;


    if (maxTeamSize > 0 && targetTeamPlayers.length >= maxTeamSize) {
      throw new Error("This team is full for the current number of players.");
    }
    
    playerToUpdate.team = team;
    
    transaction.update(gameRef, { players: updatedPlayers });
  });
}

export async function startGeniusGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can start the game.");
        }
        
        const activePlayers = game.players.filter(p => p.status === 'alive');
        const teamA = activePlayers.filter(p => p.team === 'A');
        const teamB = activePlayers.filter(p => p.team === 'B');
        const unassigned = activePlayers.filter(p => p.team !== 'A' && p.team !== 'B');

        if (unassigned.length > 0 || teamA.length === 0 || teamB.length === 0 || teamA.length !== teamB.length) {
            throw new Error("الفرق غير مكتملة أو غير متوازنة. يجب أن يكون عدد اللاعبين في كل فريق متساوٍ، ولا يوجد لاعبون بدون فريق.");
        }

        const shuffledChallenges = shuffle(GENIUS_CHALLENGES.map(c => c.id));
        
        transaction.update(gameRef, { 
            gameState: 'challenge_intro',
            teamScores: { A: 0, B: 0 },
            challengeOrder: shuffledChallenges,
            currentChallengeIndex: 0,
            challengeState: null,
        });
    });
}

export async function submitChallengeResult(gameId: string, playerId: string, result: ChallengeResult) {
  const gameRef = doc(db, 'games', gameId);
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error("Game not found.");
    const game = gameDoc.data() as Game;

    const player = game.players.find(p => p.id === playerId);
    if (!player || !player.team) throw new Error("Player or team not found");
    
    let challengeState = game.challengeState || { results: [] };
    challengeState.results = [...(challengeState.results || []), { playerId, team: player.team, ...result }];
    
    const activePlayers = game.players.filter(p => p.status === 'alive');
    
    if (challengeState.results.length === activePlayers.length) {
      // All players submitted, calculate scores
      const teamAPlayers = activePlayers.filter(p => p.team === 'A').length;
      const teamBPlayers = activePlayers.filter(p => p.team === 'B').length;

      const sortedResults = challengeState.results
        .filter((r: ChallengeResult) => r.isCorrect)
        .sort((a: ChallengeResult, b: ChallengeResult) => a.time - b.time);
      
      const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };

      sortedResults.forEach((res: ChallengeResult, index: number) => {
        const points = (res.team === 'A' ? teamAPlayers : teamBPlayers) - index;
        if (points > 0) {
            newScores[res.team] = (newScores[res.team] || 0) + points;
        }
      });
      
      transaction.update(gameRef, { 
        challengeState,
        teamScores: newScores,
        gameState: 'challenge_results',
      });

    } else {
      transaction.update(gameRef, { challengeState });
    }
  });
}


export async function nextChallenge(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) {
            throw new Error("Only the host can start the next round.");
        }

        const nextIndex = (game.currentChallengeIndex || 0) + 1;

        if (nextIndex >= (game.challengeOrder?.length || 0)) {
            transaction.update(gameRef, { gameState: 'final_results' });
        } else {
            transaction.update(gameRef, {
                currentChallengeIndex: nextIndex,
                gameState: 'challenge_intro',
                challengeState: null,
            });
        }
    });
}
