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
import type { Player, Game, GameState } from '@/types';
import { 
    generateGameId, 
    getPlayerFromUserId, 
    getNextAvailableAvatar, 
    isFirebaseError,
    initializeScoreMatrix 
} from './helpers';

export async function createGameRoom(userId: string, gameType: 'who-am-i' | 'killer' | 'rope-of-salvation') {
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
            const existingPlayer = game.players.find(p => p.id === userId);

            if (existingPlayer) {
                return existingPlayer;
            }
            
            const maxPlayers = game.gameType === 'rope-of-salvation' ? 4 : 8;
            if (game.players.length >= maxPlayers) throw new Error('الغرفة ممتلئة.');
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
            const leavingPlayer = game.players.find(p => p.id === playerId);
            if (!leavingPlayer) return;

            const updatedPlayers = game.players.filter(p => p.id !== playerId);
            const updatedPlayerUids = game.playerUids?.filter(uid => uid !== playerId) ?? [];


            if (updatedPlayers.length === 0) {
                transaction.delete(gameRef);
                return;
            }
            
            const updateData: Partial<Game> = {
                players: updatedPlayers,
                playerUids: updatedPlayerUids,
            };

            if (game.hostId === playerId && updatedPlayers.length > 0) {
                updateData.hostId = updatedPlayers[0].id;
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
                 transaction.update(gameRef, updateData);
                 return;
            }

            if (game.gameType === 'who-am-i') {
                updateData.scoreMatrix = initializeScoreMatrix(updatedPlayers);
            }
            
            if (game.gameType === 'rope-of-salvation') {
                 if (leavingPlayer.team) {
                    const remainingPlayersInTeam = updatedPlayers.filter(p => p.team === leavingPlayer.team);
                    // This logic might need expansion depending on game rules if a whole team leaves.
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
