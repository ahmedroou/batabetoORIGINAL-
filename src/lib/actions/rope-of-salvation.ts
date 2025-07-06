
/**
 * @fileoverview Actions specific to the "Rope of Salvation" game.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
} from 'firebase/firestore';
import type { Game, MapTile, ChallengeType } from '@/types';

// Helper to generate the game map
function generateMap(rows: number, cols: number): MapTile[] {
    const map: MapTile[] = [];
    const challengeTypes: ChallengeType[] = ['intelligence', 'memory', 'description', 'symbols', 'timing'];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const tile: MapTile = { id: `${r}-${c}`, type: 'challenge' };
            const rand = Math.random();

            if (c === 0 || c === cols - 1) { // First and last columns are safe
                tile.type = 'safe';
            } else if (rand < 0.15) { // 15% chance for a safe zone
                tile.type = 'safe';
            } else if (rand < 0.25) { // 10% chance for a power-up
                tile.type = 'powerup';
                // This would be where you assign a specific power-up type if needed
            } else { // 75% chance for a challenge
                tile.type = 'challenge';
                tile.challengeType = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
            }
            map.push(tile);
        }
    }
    return map;
}


export async function progressToTeamSelection(gameId: string, userId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== userId) {
            throw new Error("فقط صاحب الغرفة يمكنه المتابعة.");
        }
        if (game.gameType !== 'rope-of-salvation') {
            throw new Error("إجراء غير صالح لنوع اللعبة هذا.");
        }
        
        transaction.update(gameRef, { 
            gameState: 'team_selection',
        });
    });
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

        const targetTeamPlayers = updatedPlayers.filter(p => p.team === team && p.id !== playerId);
        if (targetTeamPlayers.length >= 2) {
            throw new Error("هذا الفريق ممتلئ.");
        }
        
        playerToUpdate.team = team;
        
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function startRopeOfSalvationGame(gameId: string, userId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== userId) {
            throw new Error("فقط صاحب الغرفة يمكنه بدء اللعبة.");
        }
        
        const teamA = game.players.filter(p => p.team === 'A');
        const teamB = game.players.filter(p => p.team === 'B');

        if (teamA.length !== 2 || teamB.length !== 2) {
            throw new Error("يجب أن يحتوي كل فريق على لاعبين اثنين لبدء اللعبة.");
        }

        const rows = 6;
        const cols = 12;
        const gameMap = generateMap(rows, cols);
        
        transaction.update(gameRef, { 
            gameState: 'map_view',
            mapDimensions: { rows, cols },
            map: gameMap,
            teamAPosition: { row: 2, col: 0 },
            teamBPosition: { row: 3, col: 0 },
            collapsePosition: -1,
            activeTeam: 'A',
            teamAScore: 0,
            teamBScore: 0,
            teamAHealth: 100,
            teamBHealth: 100,
            teamAPowerups: { telescope: true, compass: true, gps: true, hint: true },
            teamBPowerups: { telescope: true, compass: true, gps: true, hint: true },
            currentChallenge: null,
        });
    });
}
