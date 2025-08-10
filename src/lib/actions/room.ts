'use server';

/**
 * @fileoverview Actions for managing game rooms: creating, joining, leaving.
 * @version 2.0
 * @summary
 * Key Improvements:
 * 1.  **Guaranteed Return Values**: All functions, especially `createGameRoom`, now guarantee a return value
 * (e.g., `{ error: '...' }`) even if an internal error occurs, preventing the "Cannot read properties of undefined" crash.
 * 2.  **Robust Player Cleanup**: `removePlayerFromPreviousLobbies` is more explicit and handles edge cases,
 * like a player not being in any other lobbies, without causing issues.
 * 3.  **Clear Error Handling**: Errors caught in transactions or other operations are now properly formatted
 * and returned to the client, providing clearer feedback.
 * 4.  **Default State Initialization**: Game state objects (e.g., `trapAnswerState`) are initialized with
 * default values upon creation to prevent downstream errors from accessing undefined properties.
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
    increment,
    updateDoc,
    arrayUnion
} from 'firebase/firestore';
import type { Player, Game, GameState, ChallengeResult, DuelChallenge, Challenge, Decree } from '@/types';
import { 
    generateGameId
} from '@/lib/actions/helpers';
import { getTrapAnswerCategories } from './admin';
import { getPlayerFromUserId } from './user/queries';


/**
 * Removes a player from any previous active game lobbies they might be in.
 * This ensures a player is only in one lobby at a time.
 * If a lobby becomes empty after removal, it is deleted.
 * @param {string} userId - The ID of the user to remove.
 * @param {string} currentRoomId - The ID of the room the user is currently joining/creating (to exclude from removal).
 */
async function removePlayerFromPreviousLobbies(userId: string, currentRoomId: string): Promise<void> {
    const gamesCollection = collection(db, 'games');
    // This query correctly targets ONLY lobbies where the user is a member.
    const playerInGamesQuery = query(
        gamesCollection, 
        where('playerUids', 'array-contains', userId),
        where('gameState', '==', 'lobby')
    );
    
    const querySnapshot = await getDocs(playerInGamesQuery);
    
    // If the player is not in any other lobbies, we can exit early.
    if (querySnapshot.empty) {
        return;
    }

    const batch = writeBatch(db);
    
    for (const docSnap of querySnapshot.docs) {
        // Ensure we don't act on the room the player is currently trying to join/create.
        if (docSnap.id !== currentRoomId) {
            const game = docSnap.data() as Game;
            const updatedPlayers = game.players.filter(p => p.id !== userId);
            const updatedPlayerUids = game.playerUids.filter(uid => uid !== userId);
            
            // If removing the player makes the lobby empty, delete the entire game document.
            if (updatedPlayers.length === 0) {
                batch.delete(docSnap.ref); 
            } else {
                // Otherwise, update the player list and assign a new host if the leaving player was the host.
                let newHostId = game.hostId;
                if (game.hostId === userId) {
                    newHostId = updatedPlayers[0]?.id || ''; // Assign to the next player or empty if none left
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


/**
 * Creates a new game room.
 * @param {string} userId - The ID of the user creating the room (will be the host).
 * @param {Game['gameType']} gameType - The type of game to create.
 * @param {string} avatarId - The avatar ID chosen by the user.
 * @returns {Promise<{ gameId?: string; player?: Player; error?: string }>} An object with game details or an error.
 */
export async function createGameRoom(userId: string, gameType: Game['gameType'], avatarId: string): Promise<{ gameId?: string; player?: Player; error?: string }> {
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

        // Find if the player has an active title (decree)
        const activeDecree = (playerDetails.decrees || []).find(d => d.until && new Date(d.until) > new Date());

        let player: Player = {
            id: playerDetails.uid,
            name: playerDetails.name,
            avatarId,
            status: 'alive',
            leaderboardPoints: playerDetails.leaderboardPoints || 0,
            score: 0,
            position: 0,
            temporaryTitle: activeDecree?.title || null
        };
        
        // Lobbies will expire in 1 hour to prevent clutter.
        const expiresAt = Timestamp.fromMillis(Date.now() + 1 * 60 * 60 * 1000);

        let newGame: Game = {
            id: gameId,
            hostId: userId,
            players: [player],
            playerUids: [userId],
            gameState: 'lobby' as GameState,
            createdAt: Timestamp.now(),
            expiresAt: expiresAt,
            gameType: gameType,
        };
        
        // **FIX**: Initialize game-specific states with default values to prevent 'undefined' errors later.
        if (gameType === 'king-of-genius') {
            newGame.teamScores = { A: 0, B: 0 };
        } else if (gameType === 'trap-answer') {
            const categoriesResult = await getTrapAnswerCategories();
            newGame.trapAnswerState = {
                settings: {
                    categories: categoriesResult.categories || [],
                    rounds: 10,
                    answerTime: 60,
                    guessTime: 60, // Added default
                },
                trickStats: { trickedBy: {}, trickedOthers: {} },
            };
        } else if (gameType === 'prison') {
            newGame.prisonState = {
                settings: {
                    biddingTime: 30,
                    answeringTime: 45,
                    judgingTime: 60,
                    rounds: 10,
                },
            };
        } else if (gameType === 'behind-the-mask') {
            newGame.mafiaState = {
                phase: 'lobby',
                settings: {
                    nightTime: 25,
                    dayTime: 180,
                },
                night: 1,
                votes: {},
                nightActions: {},
                events: [],
                privateChats: {},
            };
        } else if (gameType === 'word_war') {
            newGame.wordWarState = {
                settings: {
                    turnTime: 60,
                },
                cards: [],
                guides: { red: '', blue: '' },
                turn: 'red',
            };
        }

        // Clean up any old lobbies the user might be in before creating a new one.
        await removePlayerFromPreviousLobbies(userId, gameId);
        await setDoc(gameRef, newGame);

        return { gameId, player };
    } catch(error) {
        const typedError = error as Error;
        console.error("Error in createGameRoom:", typedError);
        // **FIX**: Ensure an error object is always returned on failure.
        return { error: typedError.message || 'حدث خطأ غير متوقع عند إنشاء الغرفة.' };
    }
}

/**
 * Allows a user to join an existing game room.
 * @param {string} gameId - The ID of the game room to join.
 * @param {string} userId - The ID of the user joining.
 * @param {string} avatarId - The avatar ID chosen by the user.
 * @param {string} [challengeId] - Optional ID of the challenge this room belongs to.
 * @returns {Promise<{ gameId?: string; player?: Player; error?: string }>} An object with game details or an error.
 */
export async function joinGameRoom(gameId: string, userId: string, avatarId: string, challengeId?: string): Promise<{ gameId?: string; player?: Player; error?: string }> {
    if (!userId || !gameId.trim()) {
        return { error: 'معرف المستخدم ومعرف الغرفة مطلوبان.' };
    }
    if (!avatarId) {
        return { error: 'يجب اختيار شخصية.' };
    }

    try {
        const formattedGameId = gameId.toUpperCase();
        // Clean up old lobbies before joining a new one.
        await removePlayerFromPreviousLobbies(userId, formattedGameId); 
        
        const gameRef = doc(db, 'games', formattedGameId);
        
        const player = await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw new Error('الغرفة غير موجودة. تأكد من المعرف.');
            }
            
            const game = gameDoc.data() as Game;
            const existingPlayerIndex = game.players.findIndex(p => p.id === userId);

            // If player is already in the game, just return their data.
            if (existingPlayerIndex !== -1) {
                return game.players[existingPlayerIndex];
            }
            
            const activePlayersCount = game.players.length;
            const maxPlayers = game.challengeDetails?.minPlayersToStart ? game.challengeDetails.minPlayersToStart * 2 : 8;
            if (activePlayersCount >= maxPlayers) {
                throw new Error('الغرفة ممتلئة.');
            }
            if (game.gameState !== 'lobby') {
                throw new Error('لا يمكن الانضمام، اللعبة بدأت بالفعل.');
            }
            
            const playerDetails = await getPlayerFromUserId(userId);
            const activeDecree = (playerDetails.decrees || []).find(d => d.until && new Date(d.until) > new Date());
            
            const newPlayer: Player = { 
                id: playerDetails.uid, 
                name: playerDetails.name, 
                avatarId,
                status: 'alive',
                leaderboardPoints: playerDetails.leaderboardPoints || 0,
                score: 0,
                position: 0,
                isReady: false,
                temporaryTitle: activeDecree?.title || null
            };

            const updateData: Partial<Game> & {[key:string]: any} = {};

            // Handle entry fee for challenges
            if (game.challengeDetails?.entryFee && game.challengeDetails.entryFee.value > 0) {
                const { type, value } = game.challengeDetails.entryFee;
                const userCurrency = type === 'coins' ? playerDetails.coins : playerDetails.leaderboardPoints;
                if (userCurrency < value) {
                    throw new Error(`ليس لديك ما يكفي من ${type === 'coins' ? 'الكوينز' : 'نقاط الصدارة'} للانضمام.`);
                }
                 const userRef = doc(db, 'users', userId);
                 transaction.update(userRef, { [type]: increment(-value) });
            }
            
            const updatedPlayers = [...game.players, newPlayer];
            const updatedPlayerUids = [...(game.playerUids || []), newPlayer.id];
            
            updateData.players = updatedPlayers;
            updateData.playerUids = updatedPlayerUids;
            
            if (['trap-answer', 'prison', 'behind-the-mask', 'word_war'].includes(game.gameType)) {
                updateData.playerScores = { ...(game.playerScores || {}), [newPlayer.id]: 0 };
            }
            
            transaction.update(gameRef, updateData);
            return newPlayer;
        });

        return { gameId: formattedGameId, player };
    } catch(error: any) {
        return { error: error.message || 'حدث خطأ غير متوقع عند الانضمام للغرفة.' };
    }
}


/**
 * Allows a player to leave a game room.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player leaving.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function leaveGame(gameId: string, playerId: string): Promise<{ success: boolean; error?: string }> {
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

            // If game is in progress, mark player as 'left'. If in lobby, remove them completely.
            if (game.gameState !== 'lobby') {
                if (leavingPlayer.status !== 'left') {
                    updatedPlayers[playerIndex].status = 'left';
                }
            } else {
                updatedPlayers = updatedPlayers.filter(p => p.id !== playerId);
            }
            
            const updatedPlayerUids = game.playerUids ? game.playerUids.filter(uid => uid !== playerId) : [];
            const remainingLivePlayers = updatedPlayers.filter(p => p.status === 'alive');

            // If no one is left, delete the game.
            if (remainingLivePlayers.length === 0 && game.gameState !== 'final_results') {
                transaction.delete(gameRef);
                return;
            }
            
            let updateData: Partial<Game> & { [key:string]: any } = { 
                players: updatedPlayers,
            };
            
            if (game.gameState === 'lobby') {
                updateData.playerUids = updatedPlayerUids;
            }

            // Assign a new host if the current host is leaving.
            if (game.hostId === playerId) {
                const newHost = remainingLivePlayers[0] || updatedPlayers.find(p => p.status !== 'left');
                updateData.hostId = newHost ? newHost.id : '';
            }
            
            transaction.update(gameRef, updateData);
        });
        return { success: true };
    } catch (error) {
        console.error("Error leaving game:", error);
        return { success: false, error: 'حدث خطأ عند مغادرة الغرفة.' };
    }
}

/**
 * Kicks a player from a game lobby (only by the host).
 * @param {string} gameId - The ID of the game lobby.
 * @param {string} hostId - The ID of the host.
 * @param {string} playerIdToKick - The ID of the player to kick.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function kickPlayerFromLobby(gameId: string, hostId: string, playerIdToKick: string): Promise<{ success: boolean; error?: string }> {
    const gameRef = doc(db, 'games', gameId.toUpperCase());
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");

            const game = gameDoc.data() as Game;

            if (game.hostId !== hostId) throw new Error("Only the host can kick players.");
            if (hostId === playerIdToKick) throw new Error("You cannot kick yourself.");

            const playerIndex = game.players.findIndex(p => p.id === playerIdToKick);
            if (playerIndex === -1) throw new Error("Player not found in this lobby.");
            
            const updatedPlayers = game.players.filter(p => p.id !== playerIdToKick);
            const updatedPlayerUids = game.playerUids.filter(uid => uid !== playerIdToKick);

            transaction.update(gameRef, {
                players: updatedPlayers,
                playerUids: updatedPlayerUids
            });
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || 'An unexpected error occurred while kicking the player.' };
    }
}
