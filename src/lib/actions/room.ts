
/**
 * @fileoverview Actions for managing game rooms: creating, joining, leaving.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type { Player, Game, GameState, ChallengeResult } from '@/types';
import { 
    generateGameId, 
    getPlayerFromUserId, 
    getNextAvailableAvatar, 
    isFirebaseError,
    initializeScoreMatrix 
} from './helpers';

export async function createGameRoom(userId: string, gameType: 'who-am-i' | 'killer' | 'king-of-genius' | 'the-slap-game') {
  if (!userId) {
    return { error: 'معرف المستخدم مطلوب.' };
  }
  try {
    const gameId = generateGameId();
    const playerDetails = await getPlayerFromUserId(userId);
    const avatarId = getNextAvailableAvatar([]);

    let player: Player = {
      ...playerDetails,
      avatarId,
      status: 'alive',
    };
    
    const newGame: Omit<Game, 'id'> = {
        hostId: userId,
        players: [player],
        playerUids: [userId],
        gameState: 'lobby' as GameState,
        createdAt: serverTimestamp() as any,
        gameType: gameType,
    };
    
    if (gameType === 'who-am-i') {
        newGame.round = 0;
        newGame.scoreMatrix = initializeScoreMatrix([player]);
    }

     if (gameType === 'the-slap-game') {
        newGame.round = 1;
        newGame.playerScores = { [player.id]: 0 };
    }


    await setDoc(doc(db, 'games', gameId), newGame);
    return { gameId, player };
  } catch(error) {
    console.error("Firebase error in createGameRoom:", error);
    if (isFirebaseError(error)) {
        return { error: `فشل الاتصال بـ Firebase. (${error.code || 'غير معروف'})` };
    }
    const typedError = error as Error;
    return { error: typedError.message || 'حدث خطأ غير متوقع عند إنشاء الغرفة.' };
  }
}

export async function joinGameRoom(gameId: string, userId: string) {
    if (!userId || !gameId.trim()) {
        return { error: 'معرف المستخدم ومعرف الغرفة مطلوبان.' };
    }

    try {
        const gameRef = doc(db, 'games', gameId.toUpperCase());
        
        const player = await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error('الغرفة غير موجودة. تأكد من المعرف.');
            
            const game = gameDoc.data() as Game;
            const existingPlayerIndex = game.players.findIndex(p => p.id === userId);

            // Player is already in the game, handle re-connection or re-joining
            if (existingPlayerIndex !== -1) {
                const player = game.players[existingPlayerIndex];
                if (player.status === 'left') {
                    const updatedPlayers = [...game.players];
                    updatedPlayers[existingPlayerIndex].status = 'alive';
                    transaction.update(gameRef, { players: updatedPlayers });
                    return updatedPlayers[existingPlayerIndex];
                }
                return player; // Already in game and not 'left'
            }
            
            // This is a brand new player
            const activePlayersCount = game.players.filter(p => p.status !== 'left').length;
            const maxPlayers = 8;
            if (activePlayersCount >= maxPlayers) throw new Error('الغرفة ممتلئة.');
            if (game.gameState !== 'lobby') throw new Error('لا يمكن الانضمام، اللعبة بدأت بالفعل.');

            const playerDetails = await getPlayerFromUserId(userId);
            const avatarId = getNextAvailableAvatar(game.players);
            
            const newPlayer: Player = { 
                ...playerDetails, 
                avatarId,
                status: 'alive' 
            };
            
            const updatedPlayers = [...game.players, newPlayer];
            const updatedPlayerUids = [...(game.playerUids || []), newPlayer.id];

            const updateData: Partial<Game> = {
                players: updatedPlayers,
                playerUids: updatedPlayerUids,
            };

            if (game.gameType === 'who-am-i') {
                updateData.scoreMatrix = initializeScoreMatrix(updatedPlayers);
            }

            if (game.gameType === 'the-slap-game') {
                updateData.playerScores = { ...(game.playerScores || {}), [newPlayer.id]: 0 };
            }
            
            transaction.update(gameRef, updateData);
            return newPlayer;
        });

        return { gameId, player };
    } catch(error: any) {
        console.error("Error in joinGameRoom:", error);
        return { error: error.message || 'حدث خطأ غير متوقع عند الانضمام للغرفة.' };
    }
}


export async function leaveGame(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;

            const game = gameDoc.data() as Game;
            const playerIndex = game.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) return; 

            const updatedPlayers = [...game.players];
            const leavingPlayer = updatedPlayers[playerIndex];

            if (leavingPlayer.status === 'left') return;
            
            leavingPlayer.status = 'left';

            const activePlayers = updatedPlayers.filter(p => p.status !== 'left');
            if (activePlayers.length === 0) {
                transaction.delete(gameRef);
                return;
            }
            
            const updateData: Partial<Game> = { players: updatedPlayers };

            if (game.hostId === playerId && activePlayers.length > 0) {
                updateData.hostId = activePlayers[0].id;
            }

            if (game.gameType === 'killer' && game.gameState !== 'lobby' && game.gameState !== 'preparation') {
                if (leavingPlayer.role === 'killer') {
                    updateData.gameState = 'ended';
                    updateData.gameResult = {
                        winner: 'detective_civilians',
                        message: `لقد غادر القاتل ${leavingPlayer.alias || leavingPlayer.name} اللعبة! المحقق والمدنيون ينتصرون!`,
                    };
                } else if (leavingPlayer.role === 'detective') {
                    updateData.gameState = 'ended';
                    updateData.gameResult = {
                        winner: 'killer',
                        message: `لقد غادر المحقق ${leavingPlayer.alias || leavingPlayer.name} اللعبة! القاتل ينتصر!`,
                    };
                }
            }

            if (game.gameType === 'king-of-genius' && (game.gameState === 'challenge_active' || game.gameState === 'challenge_intro')) {
                // If a player leaves during a challenge, they forfeit.
                const currentResults = game.challengeState?.results || [];
                 if (!currentResults.some(r => r.playerId === playerId)) {
                    const forfeitResult: ChallengeResult = {
                        playerId: playerId,
                        team: leavingPlayer.team || 'A', // Assign a default team if none exists
                        isCorrect: false,
                        time: 999, // A high time to indicate forfeit
                        score: 0,
                    };
                    updateData['challengeState.results'] = [...currentResults, forfeitResult];
                }
            }
            
            transaction.update(gameRef, updateData);
        });
        return { success: true };
    } catch (error) {
        console.error("Error in leaveGame:", error);
        return { error: 'حدث خطأ عند مغادرة الغرفة.' };
    }
}
