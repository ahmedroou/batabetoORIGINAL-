/**
 * @fileoverview Actions specific to the "Rope of Salvation" game.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
} from 'firebase/firestore';
import type { Game } from '@/types';

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
        
        transaction.update(gameRef, { 
            gameState: 'map_view',
        });
    });
}
