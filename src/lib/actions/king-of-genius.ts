
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import type { Game, ChallengeResult } from '@/types';

// This function is called by clients to submit their result for a challenge.
// It handles scoring and advances the game state when all results are in.
export async function submitChallengeResult(gameId: string, playerId: string, result: Omit<ChallengeResult, 'playerId' | 'team'>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'challenge_active') {
            console.log(`Player ${playerId} submitted result for inactive challenge.`);
            return; // Ignore submissions if challenge is not active
        }

        const player = game.players.find(p => p.id === playerId);
        if (!player || !player.team) throw new Error("Player or team not found");
        
        let challengeState = game.challengeState || { results: [] };
        
        // Prevent duplicate submissions
        if (challengeState.results.some((r: any) => r.playerId === playerId)) {
            return; 
        }
        
        const fullResult: ChallengeResult = {
            playerId,
            team: player.team,
            ...result,
        };

        challengeState.results = [...(challengeState.results || []), fullResult];
        
        const activePlayers = game.players.filter(p => p.status === 'alive');
        
        // Check if all active players have submitted
        if (challengeState.results.length >= activePlayers.length) {
          // All players submitted, calculate scores and end the round.
          const teamAPlayers = activePlayers.filter(p => p.team === 'A').length;
          const teamBPlayers = activePlayers.filter(p => p.team === 'B').length;

          const sortedResults = challengeState.results
            .filter((r: ChallengeResult) => r.isCorrect)
            .sort((a: ChallengeResult, b: ChallengeResult) => a.time - b.time);
          
          const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };

          sortedResults.forEach((res: ChallengeResult, index: number) => {
            const teamSize = (res.team === 'A' ? teamAPlayers : teamBPlayers) || 1;
            const points = teamSize - index;
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
          // Not all players have submitted yet, just update the state.
          transaction.update(gameRef, { challengeState });
        }
    });
}
