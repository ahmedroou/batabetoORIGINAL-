

'use server';

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
    increment,
    updateDoc,
    deleteField
} from 'firebase/firestore';
import type { Player, Game, GameState, ChallengeResult, Challenge, Decree } from '@/types';
import { 
    generateGameId
} from '@/lib/actions/helpers';
import { getPublicTrapAnswerCategories } from './admin';
import { getPlayerFromUserId } from './user';
import { getDrawAndGuessCategories } from './draw-and-guess-admin';

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
    // Simplified query to avoid the need for a composite index.
    // We fetch all games the player is in and then filter by gameState in the code.
    const playerInGamesQuery = query(gamesCollection, 
        where('playerUids', 'array-contains', userId),
    );
    const querySnapshot = await getDocs(playerInGamesQuery);
    
    if (querySnapshot.empty) {
        return;
    }

    const batch = writeBatch(db);
    
    for (const docSnap of querySnapshot.docs) {
        const game = docSnap.data() as Game;
        // Perform filtering in the backend code
        if (docSnap.id !== currentRoomId && game.gameState !== 'final_results' && game.gameState !== 'board_reveal') {
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


/**
 * Creates a new game room.
 * @param {string} userId - The ID of the user creating the room (will be the host).
 * @param {Game['gameType']} gameType - The type of game to create.
 * @param {string} avatarId - The avatar ID chosen by the user.
 * @returns {Promise<{ gameId?: string; player?: Player; error?: string }>} An object containing the game ID and player details, or an error.
 */
export async function createGameRoom(userId: string, gameType: Game['gameType'], avatarId: string) {
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
        
        const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

        let newGame: Omit<Game, 'id'> = {
            hostId: userId,
            players: [player],
            playerUids: [userId],
            gameState: 'lobby' as GameState,
            createdAt: Timestamp.now(),
            expiresAt: expiresAt,
            gameType: gameType,
            playerScores: { [player.id]: 0 },
        };
        
        if (gameType === 'king-of-genius') {
            newGame.teamScores = { A: 0, B: 0 };
        } else if (gameType === 'trap-answer') {
            const categoriesResult = await getPublicTrapAnswerCategories();
            newGame.trapAnswerState = {
                settings: {
                    categories: categoriesResult.categories || [],
                    rounds: 10,
                    answerTime: 60,
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
                guides: { red: '', blue: ''},
                turn: 'red',
            }
        } else if (gameType === 'draw-and-guess') {
             const { categories } = await getDrawAndGuessCategories(userId);
            newGame.drawAndGuessState = {
                settings: {
                    drawingTime: 120,
                    guessingTime: 120,
                    roundsPerPlayer: 2,
                },
                categories: categories || ['أمثال عامية', 'أنميات مشهورة', 'أفلام مشهورة', 'جملة مركبة'],
            };
        }

        await removePlayerFromPreviousLobbies(userId, gameId);
        await setDoc(gameRef, newGame);

        return { gameId, player };
    } catch(error) {
        const typedError = error as Error;
        console.error("Error in createGameRoom:", typedError);
        return { error: typedError.message || 'حدث خطأ غير متوقع عند إنشاء الغرفة.' };
    }
}

/**
 * Allows a user to join an existing game room.
 */
export async function joinGameRoom(gameId: string, userId: string, avatarId: string) {
    if (!userId || !gameId.trim()) {
        return { error: 'معرف المستخدم ومعرف الغرفة مطلوبان.' };
    }
    if (!avatarId) {
        return { error: 'يجب اختيار شخصية.' };
    }

    try {
        const formattedGameId = gameId.toUpperCase();
        await removePlayerFromPreviousLobbies(userId, formattedGameId); 
        
        const gameRef = doc(db, 'games', formattedGameId);
        
        const player = await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw new Error('الغرفة غير موجودة. تأكد من المعرف.');
            }
            
            const game = gameDoc.data() as Game;
            const existingPlayerIndex = game.players.findIndex(p => p.id === userId);

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

            const updateData: any = {
                players: [...game.players, newPlayer],
                playerUids: [...game.playerUids, newPlayer.id],
            };
            
            if (['trap-answer', 'prison', 'behind-the-mask', 'word_war', 'draw-and-guess'].includes(game.gameType)) {
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
 */
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

            if (game.gameState !== 'lobby') {
                if (leavingPlayer.status !== 'left') {
                    updatedPlayers[playerIndex].status = 'left';
                }
            } else {
                updatedPlayers = updatedPlayers.filter(p => p.id !== playerId);
            }
            
            const updatedPlayerUids = game.playerUids ? game.playerUids.filter(uid => uid !== playerId) : [];
            const remainingLivePlayers = updatedPlayers.filter(p => p.status !== 'left');

            if (remainingLivePlayers.length === 0 && game.gameState !== 'final_results') {
                transaction.delete(gameRef);
                return;
            }
            
            let updateData: any = { 
                players: updatedPlayers,
            };
            
            if (game.gameState === 'lobby') {
                updateData.playerUids = updatedPlayerUids;
            }

            if (game.hostId === playerId) {
                const newHost = remainingLivePlayers[0] || updatedPlayers.find(p => p.status !== 'left');
                updateData.hostId = newHost ? newHost.id : '';
            }

            if (game.gameState !== 'lobby' && game.gameState !== 'instructions' && game.gameState !== 'final_results') {
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
        return { error: 'حدث خطأ عند مغادرة الغرفة.' };
    }
}

/**
 * Kicks a player from a game lobby (only by the host).
 */
export async function kickPlayerFromLobby(gameId: string, hostId: string, playerIdToKick: string) {
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
        return { error: error.message || 'An unexpected error occurred while kicking the player.' };
    }
}

export async function setPlayerReady(gameId: string, playerId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return;
        
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].isReady = true;

        const activePlayers = updatedPlayers.filter(p => p.status !== 'left');
        const canStart = activePlayers.length >= (game.challengeDetails?.minPlayersToStart || 2);
        const allReady = canStart && activePlayers.every(p => p.isReady);
        
        if (allReady) {
            // Logic to start the specific game type
            if (game.gameType === 'king-of-genius') {
                // This is a placeholder, you'd call a function like `initializeKingOfGenius`
                 transaction.update(gameRef, { gameState: 'team_selection', players: updatedPlayers });
            } else if (game.gameType === 'trap-answer') {
                // startTrapAnswerGame logic
            }
            // Add other game types
        } else {
             transaction.update(gameRef, { players: updatedPlayers });
        }
    });
}
