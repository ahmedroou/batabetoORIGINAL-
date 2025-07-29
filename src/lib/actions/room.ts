

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
import type { Player, Game, GameState, ChallengeResult, MafiaRole } from '@/types';
import { 
    getPlayerFromUserId, 
    isFirebaseError,
} from '@/lib/actions/helpers';
import { getTrapAnswerCategories } from './admin';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { generateGameId } from './helpers';

/**
 * Removes a player from any previous active games they might be in,
 * ensuring a player is only in one active game at a time.
 * If a lobby becomes empty after removal, it is deleted.
 * @param {string} userId - The ID of the user to remove.
 * @param {string} currentRoomId - The ID of the room the user is currently joining/creating (to exclude from removal).
 * @returns {Promise<void>}
 */
async function removePlayerFromPreviousLobbies(userId: string, currentRoomId: string) {
    const gamesCollection = collection(db, 'games');
    // Query for games where the user is a player and the game is active (not in lobby or final results)
    const playerInGamesQuery = query(gamesCollection, 
        where('playerUids', 'array-contains', userId),
        where('gameState', 'in', ['team_selection', 'challenge_intro', 'challenge_active', 'challenge_results', 'category-selection', 'answer-submission', 'guessing', 'round-results', 'instructions', 'open_auction', 'closed_auction_bidding', 'closed_auction_answering', 'judging', 'rejudging', 'results', 'role_reveal', 'night', 'discussion', 'voting', 'voting_results'])
    );
    const querySnapshot = await getDocs(playerInGamesQuery);
    
    if (querySnapshot.empty) {
        return; // No previous games found
    }

    const batch = writeBatch(db); // Use a batch for atomic updates
    
    for (const docSnap of querySnapshot.docs) {
        // Only remove from other games, not the current one
        if (docSnap.id !== currentRoomId) {
            const game = docSnap.data() as Game;
            const updatedPlayers = game.players.filter(p => p.id !== userId);
            const updatedPlayerUids = game.playerUids.filter(uid => uid !== userId);
            
            if (updatedPlayers.length === 0) {
                // If the game becomes empty, delete it
                batch.delete(docSnap.ref); 
            } else {
                let newHostId = game.hostId;
                // If the leaving player was the host, assign a new host (first player in updated list)
                if (game.hostId === userId) {
                    newHostId = updatedPlayers[0]?.id || ''; // Assign first player as new host, or empty if no players
                }
                batch.update(docSnap.ref, { 
                    players: updatedPlayers,
                    playerUids: updatedPlayerUids,
                    hostId: newHostId 
                });
            }
        }
    }
    await batch.commit(); // Commit all batched operations
}


/**
 * Creates a new game room.
 * @param {string} userId - The ID of the user creating the room (will be the host).
 * @param {'king-of-genius' | 'trap-answer' | 'prison' | 'mafia'} gameType - The type of game to create.
 * @param {string} avatarId - The avatar ID chosen by the user.
 * @returns {Promise<{ gameId?: string; player?: Player; error?: string }>} An object containing the game ID and player details, or an error.
 */
export async function createGameRoom(userId: string, gameType: 'king-of-genius' | 'trap-answer' | 'prison' | 'mafia', avatarId: string) {
    if (!userId) {
        return { error: 'معرف المستخدم مطلوب.' };
    }
    if (!avatarId) {
        return { error: 'يجب اختيار شخصية.' };
    }
    try {
        const gameId = generateGameId(); // Generate a unique game ID
        const gameRef = doc(db, 'games', gameId);
        const playerDetails = await getPlayerFromUserId(userId); // Fetch player details

        // Initialize the host player
        let player: Player = {
            id: playerDetails.uid,
            name: playerDetails.name,
            avatarId,
            status: 'alive', // Initial status
            lastActiveAt: Timestamp.now(),
            leaderboardPoints: playerDetails.leaderboardPoints || 0,
            score: 0, // Initial score
        };
        
        const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000); // Game expires in 1 hour if inactive

        // Base game object structure
        let newGame: Omit<Game, 'id'> = {
            hostId: userId,
            players: [player],
            playerUids: [userId],
            gameState: 'lobby' as GameState, // Initial game state
            createdAt: Timestamp.now(),
            expiresAt: expiresAt,
            gameType: gameType,
        };
        
        // Game-type specific initializations
        if (gameType === 'king-of-genius') {
            newGame.teamScores = { A: 0, B: 0 };
        } else if (gameType === 'trap-answer') {
            const categoriesResult = await getTrapAnswerCategories(); // Fetch categories for Trap Answer game
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
        } else if (gameType === 'prison') {
            newGame.round = 0; // Prison game starts at round 0, increments to 1 in startPrisonGame
            newGame.playerScores = { [player.id]: 0 }; // Initialize scores for all players
            newGame.prisonState = {
                settings: { // Default settings for Prison game
                    biddingTime: 30,
                    answeringTime: 45,
                    judgingTime: 60,
                    rounds: 10,
                },
            };
        } else if (gameType === 'mafia') {
            newGame.round = 0;
            newGame.mafiaState = {
                 settings: {
                    nightDuration: 70,
                    discussionDuration: 120,
                    votingDuration: 60,
                }
            }
        }

        // Remove player from any other lobbies before creating a new one
        await removePlayerFromPreviousLobbies(userId, gameId);
        await setDoc(gameRef, newGame); // Create the new game document

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

/**
 * Allows a user to join an existing game room.
 * @param {string} gameId - The ID of the game room to join.
 * @param {string} userId - The ID of the user joining.
 * @param {string} avatarId - The avatar ID chosen by the user.
 * @returns {Promise<{ gameId?: string; player?: Player; error?: string }>} An object containing the game ID and player details, or an error.
 */
export async function joinGameRoom(gameId: string, userId: string, avatarId: string) {
    if (!userId || !gameId.trim()) {
        return { error: 'معرف المستخدم ومعرف الغرفة مطلوبان.' };
    }
    if (!avatarId) {
        return { error: 'يجب اختيار شخصية.' };
    }

    try {
        // Ensure gameId is uppercase for consistency (as generated IDs are uppercase)
        const formattedGameId = gameId.toUpperCase();
        // Remove player from any other lobbies before joining this one
        await removePlayerFromPreviousLobbies(userId, formattedGameId); 
        
        const gameRef = doc(db, 'games', formattedGameId);
        
        const player = await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw new Error('الغرفة غير موجودة. تأكد من المعرف.');
            }
            
            const game = gameDoc.data() as Game;
            const existingPlayerIndex = game.players.findIndex(p => p.id === userId);

            // If player is already in the game, return their existing details
            if (existingPlayerIndex !== -1) {
                return game.players[existingPlayerIndex];
            }
            
            const activePlayersCount = game.players.length;
            const maxPlayers = 8; // Maximum players allowed in a room
            if (activePlayersCount >= maxPlayers) {
                throw new Error('الغرفة ممتلئة.');
            }
            if (game.gameState !== 'lobby') {
                throw new Error('لا يمكن الانضمام، اللعبة بدأت بالفعل.');
            }
            
            const playerDetails = await getPlayerFromUserId(userId);
            
            // Create new player object
            const newPlayer: Player = { 
                id: playerDetails.uid, 
                name: playerDetails.name, 
                avatarId,
                status: 'alive',
                lastActiveAt: Timestamp.now(),
                leaderboardPoints: playerDetails.leaderboardPoints || 0,
                score: 0,
            };
            
            const updatedPlayers = [...game.players, newPlayer];
            const updatedPlayerUids = [...(game.playerUids || []), newPlayer.id];

            const updateData: Partial<Game> = {
                players: updatedPlayers,
                playerUids: updatedPlayerUids,
            };

            // Initialize player score for relevant game types
            if (game.gameType === 'trap-answer' || game.gameType === 'prison') {
                updateData.playerScores = { ...(game.playerScores || {}), [newPlayer.id]: 0 };
            }
            
            transaction.update(gameRef, updateData);
            return newPlayer;
        });

        return { gameId: formattedGameId, player };
    } catch(error: any) {
        console.error("Error in joinGameRoom:", error);
        return { error: error.message || 'حدث خطأ غير متوقع عند الانضمام للغرفة.' };
    }
}


/**
 * Allows a player to leave a game room.
 * Handles player status updates, host transfer, and game ending conditions.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player leaving.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function leaveGame(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                return; // Game already deleted or not found
            }

            const game = gameDoc.data() as Game;
            const playerIndex = game.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) {
                return; // Player not found in this game
            }
            
            let updatedPlayers = [...game.players];
            const leavingPlayer = updatedPlayers[playerIndex];

            // If game is in lobby, remove player completely. Otherwise, mark as 'left'.
            if (game.gameState !== 'lobby') {
                if (leavingPlayer.status !== 'left') { // Prevent redundant updates
                    updatedPlayers[playerIndex].status = 'left';
                }
            } else {
                updatedPlayers = updatedPlayers.filter(p => p.id !== playerId);
            }
            
            const updatedPlayerUids = game.playerUids ? game.playerUids.filter(uid => uid !== playerId) : [];
            const remainingLivePlayers = updatedPlayers.filter(p => p.status === 'alive'); // Players who are still actively playing

            // If no live players remain, delete the game
            if (remainingLivePlayers.length === 0) {
                transaction.delete(gameRef);
                return;
            }
            
            let updateData: Partial<Game> & { [key:string]: any } = { 
                players: updatedPlayers,
            };
            
            // Only update playerUids if the game is in lobby (as players are fully removed)
            if (game.gameState === 'lobby') {
                updateData.playerUids = updatedPlayerUids;
            }

            // If the leaving player was the host, assign a new host
            if (game.hostId === playerId) {
                // Prioritize alive players, then any remaining players (e.g., in_prison)
                const newHost = remainingLivePlayers[0] || updatedPlayers.find(p => p.status !== 'left');
                updateData.hostId = newHost ? newHost.id : '';
            }

            // Handle game-specific end conditions when a player leaves mid-game
            if (game.gameState !== 'lobby' && game.gameState !== 'instructions' && game.gameState !== 'final_results') {
                
                if (game.gameType === 'king-of-genius' && (game.gameState === 'challenge_active' || game.gameState === 'challenge_intro')) {
                    const currentResults = game.challengeState?.results || [];
                    // If the leaving player hasn't submitted a result for the current challenge, add a forfeit result
                    if (!currentResults.some(r => r.playerId === playerId)) {
                        const forfeitResult: ChallengeResult = {
                            playerId: playerId,
                            team: leavingPlayer.team || 'A', // Default to 'A' if team not set
                            isCorrect: false,
                            time: 999, // High time for forfeit
                            score: 0,
                        };
                        updateData['challengeState.results'] = [...currentResults, forfeitResult];
                    }
                }

                if (game.gameType === 'prison') {
                    // For Prison game, if active contestants drop below 2, end the game
                    const activeContestants = updatedPlayers.filter(p => p.role === 'contestant' && p.status !== 'left' && p.status !== 'executed');
                    if (activeContestants.length < 2) {
                        updateData.gameState = 'final_results';
                        updateData.gameResult = {
                            winner: 'judge_left', // Re-using this to signify game end due to insufficient players
                            message: `انتهت اللعبة لمغادرة معظم اللاعبين.`,
                        };
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

/**
 * Kicks a player from a game lobby (only by the host).
 * @param {string} gameId - The ID of the game lobby.
 * @param {string} hostId - The ID of the host.
 * @param {string} playerIdToKick - The ID of the player to kick.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function kickPlayerFromLobby(gameId: string, hostId: string, playerIdToKick: string) {
    const gameRef = doc(db, 'games', gameId.toUpperCase());
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw new Error("Game not found.");
            }

            const game = gameDoc.data() as Game;

            if (game.hostId !== hostId) {
                throw new Error("Only the host can kick players.");
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


/**
 * Updates a player's last active timestamp in a game.
 * This helps in tracking player presence and identifying inactive players.
 * @param {string} gameId - The ID of the game.
 * @param {string} playerId - The ID of the player.
 * @returns {Promise<void>}
 */
export async function updatePlayerActivity(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                return; // Game might have ended or been deleted
            }

            const game = gameDoc.data() as Game;
            const playerIndex = game.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) {
                return; // Player not found in this game
            }
            
            const updatedPlayers = [...game.players];
            updatedPlayers[playerIndex].lastActiveAt = Timestamp.now(); // Update timestamp
            
            transaction.update(gameRef, { players: updatedPlayers });
        });
    } catch (error) {
        console.warn(`Could not update activity for player ${playerId} in game ${gameId}:`, error);
    }
}

    