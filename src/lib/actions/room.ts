

/**
 * @fileoverview Actions for managing game rooms: creating, joining, leaving.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  deleteField,
} from 'firebase/firestore';
import type { Player, Game, GameState, ChallengeResult } from '@/types';
import { 
    generateGameId, 
    getPlayerFromUserId, 
    isFirebaseError,
} from './helpers';
import { getTrapAnswerCategories } from './admin';

async function removePlayerFromPreviousLobbies(userId: string, currentRoomId: string) {
    const gamesCollection = collection(db, 'games');
    const playerInGamesQuery = query(gamesCollection, 
        where('playerUids', 'array-contains', userId),
        where('gameState', '==', 'lobby')
    );
    const querySnapshot = await getDocs(playerInGamesQuery);
    
    if (querySnapshot.empty) return;

    const batch = writeBatch(db);
    
    for (const docSnap of querySnapshot.docs) {
        if (docSnap.id !== currentRoomId) {
            const game = docSnap.data() as Game;
            const updatedPlayers = game.players.filter(p => p.id !== userId);
            const updatedPlayerUids = game.playerUids.filter(uid => uid !== userId);
            
            if (updatedPlayers.length === 0) {
                 batch.delete(docSnap.ref); 
            } else {
                 let newHostId = game.hostId;
                 if (game.hostId === userId) {
                     newHostId = updatedPlayers[0]?.id || '';
                 }
                 batch.update(docSnap.ref, { 
                    players: updatedPlayers,
                    playerUids: updatedPlayerUids,
                    hostId: newHostId 
                });
            }
        }
    }
    await batch.commit();
}


export async function createGameRoom(userId: string, gameType: 'killer' | 'king-of-genius' | 'the-slap-game' | 'trap-answer', avatarId: string) {
  if (!userId) {
    return { error: 'معرف المستخدم مطلوب.' };
  }
  if (!avatarId) {
    return { error: 'يجب اختيار شخصية.' };
  }
  try {
    const gameId = generateGameId();
    const gameRef = doc(db, 'games', gameId);
    const playerDetails = await getPlayerFromUserId(userId);

    // Ensure all required fields for a Player are initialized.
    let player: Player = {
      id: playerDetails.id,
      name: playerDetails.name,
      avatarId,
      status: 'alive',
      leaderboardPoints: playerDetails.leaderboardPoints || 0, // Ensure this is not undefined
      score: 0, // Initialize score
    };
    
    const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000); 

    let newGame: Omit<Game, 'id'> = {
        hostId: userId,
        players: [player],
        playerUids: [userId],
        gameState: 'lobby' as GameState,
        createdAt: Timestamp.now(),
        expiresAt: expiresAt,
        gameType: gameType,
    };
    
    if (gameType === 'the-slap-game') {
        newGame.round = 1;
        newGame.playerScores = { [player.id]: 0 };
    } else if (gameType === 'king-of-genius') {
        newGame.teamScores = { A: 0, B: 0 };
    } else if (gameType === 'killer') {
    } else if (gameType === 'trap-answer') {
        const categoriesResult = await getTrapAnswerCategories();
        if(!categoriesResult.success || !categoriesResult.categories) {
            throw new Error("Failed to load game categories.");
        }

        newGame.round = 0;
        newGame.playerScores = { [player.id]: 0 };
        newGame.trapAnswerState = {
            settings: {
                categories: categoriesResult.categories,
                rounds: 10,
                answerTime: 60,
            }
        };
    }

    await removePlayerFromPreviousLobbies(userId, gameId);
    await setDoc(gameRef, newGame);

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

export async function joinGameRoom(gameId: string, userId: string, avatarId: string) {
    if (!userId || !gameId.trim()) {
        return { error: 'معرف المستخدم ومعرف الغرفة مطلوبان.' };
    }
     if (!avatarId) {
        return { error: 'يجب اختيار شخصية.' };
    }

    try {
        await removePlayerFromPreviousLobbies(userId, gameId.toUpperCase());
        
        const gameRef = doc(db, 'games', gameId.toUpperCase());
        
        const player = await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error('الغرفة غير موجودة. تأكد من المعرف.');
            
            const game = gameDoc.data() as Game;
            const existingPlayerIndex = game.players.findIndex(p => p.id === userId);

            if (existingPlayerIndex !== -1) {
                // If player is rejoining, just return their data.
                return game.players[existingPlayerIndex];
            }
            
            const activePlayersCount = game.players.length;
            const maxPlayers = 8;
            if (activePlayersCount >= maxPlayers) throw new Error('الغرفة ممتلئة.');
            if (game.gameState !== 'lobby') throw new Error('لا يمكن الانضمام، اللعبة بدأت بالفعل.');
            
            const playerDetails = await getPlayerFromUserId(userId);
            
            const newPlayer: Player = { 
                id: playerDetails.id, 
                name: playerDetails.name, 
                avatarId,
                status: 'alive',
                leaderboardPoints: playerDetails.leaderboardPoints || 0,
                score: 0,
            };
            
            const updatedPlayers = [...game.players, newPlayer];
            const updatedPlayerUids = [...(game.playerUids || []), newPlayer.id];

            const updateData: Partial<Game> = {
                players: updatedPlayers,
                playerUids: updatedPlayerUids,
            };

            if (game.gameType === 'the-slap-game' || game.gameType === 'trap-answer') {
                updateData.playerScores = { ...(game.playerScores || {}), [newPlayer.id]: 0 };
            }
            
            transaction.update(gameRef, updateData);
            return newPlayer;
        });

        return { gameId: gameId.toUpperCase(), player };
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
            
            let updatedPlayers = [...game.players];
            const leavingPlayer = updatedPlayers[playerIndex];

            // In-game logic: Mark player as 'left' instead of removing them
            if (game.gameState !== 'lobby') {
                 if (leavingPlayer.status !== 'left') {
                    updatedPlayers[playerIndex].status = 'left';
                 }
            } else {
                // Lobby logic: Remove player completely
                updatedPlayers = updatedPlayers.filter(p => p.id !== playerId);
            }
            
            const updatedPlayerUids = game.playerUids ? game.playerUids.filter(uid => uid !== playerId) : [];

            if (updatedPlayers.length === 0) {
                transaction.delete(gameRef);
                return;
            }
            
            let updateData: Partial<Game> & { [key:string]: any } = { 
                players: updatedPlayers,
            };
            
            // If player is removed from lobby, also remove from UIDs list
            if (game.gameState === 'lobby') {
                updateData.playerUids = updatedPlayerUids;
            }

            // Handle host leaving
            if (game.hostId === playerId) {
                const newHost = updatedPlayers.find(p => p.status === 'alive');
                updateData.hostId = newHost ? newHost.id : updatedPlayers[0]?.id || '';
            }

            if (game.gameState !== 'lobby') {
                if (game.gameType === 'killer' && game.gameState !== 'instructions') {
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
                    const currentResults = game.challengeState?.results || [];
                     if (!currentResults.some(r => r.playerId === playerId)) {
                        const forfeitResult: ChallengeResult = {
                            playerId: playerId,
                            team: leavingPlayer.team || 'A', 
                            isCorrect: false,
                            time: 999, 
                            score: 0,
                        };
                        updateData['challengeState.results'] = [...currentResults, forfeitResult];
                    }
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

export async function kickPlayerFromLobby(gameId: string, hostId: string, playerIdToKick: string) {
    const gameRef = doc(db, 'games', gameId.toUpperCase());
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");

            const game = gameDoc.data() as Game;

            if (game.hostId !== hostId) {
                throw new Error("Only the host can kick players.");
            }
            if (game.gameState !== 'lobby') {
                throw new Error("Players can only be kicked from the lobby.");
            }
            if (hostId === playerIdToKick) {
                 throw new Error("You cannot kick yourself.");
            }

            const playerIndex = game.players.findIndex(p => p.id === playerIdToKick);
            if (playerIndex === -1) {
                throw new Error("Player not found in this lobby.");
            }
            
            const updatedPlayers = game.players.filter(p => p.id !== playerIdToKick);
            const updatedPlayerUids = game.playerUids.filter(uid => uid !== playerIdToKick);

            transaction.update(gameRef, {
                players: updatedPlayers,
                playerUids: updatedPlayerUids
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error in kickPlayerFromLobby:", error);
        return { error: error.message || 'An unexpected error occurred while kicking the player.' };
    }
}
