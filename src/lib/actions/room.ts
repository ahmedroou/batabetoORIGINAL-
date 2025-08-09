"use server";

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
} from 'firebase/firestore';
import type { Player, Game, GameState, ChallengeResult, Challenge } from '@/types';
import { generateGameId } from '@/lib/actions/helpers';
import { getPublicTrapAnswerCategories } from './admin';
import { getPlayerFromUserId } from './user';
import { getDrawAndGuessCategories } from './draw-and-guess-admin';

/**
 * Removes a player from all active lobbies except the current one.
 */
async function removePlayerFromPreviousLobbies(userId: string, currentRoomId: string) {
    const gamesCollection = collection(db, 'games');
    const playerInGamesQuery = query(gamesCollection, where('playerUids', 'array-contains', userId));
    const querySnapshot = await getDocs(playerInGamesQuery);
    if (querySnapshot.empty) return;

    const batch = writeBatch(db);
    const finalStates: GameState[] = ['final_results', 'board_reveal'];

    for (const docSnap of querySnapshot.docs) {
        const gameData = docSnap.data() as Game;
        if (docSnap.id === currentRoomId || finalStates.includes(gameData.gameState)) continue;

        const updatedPlayers = gameData.players.filter(p => p.id !== userId);
        const updatedPlayerUids = gameData.playerUids.filter(uid => uid !== userId);

        if (updatedPlayers.length === 0) {
            batch.delete(docSnap.ref);
        } else {
            const newHostId = gameData.hostId === userId ? (updatedPlayers[0]?.id || '') : gameData.hostId;
            batch.update(docSnap.ref, {
                players: updatedPlayers,
                playerUids: updatedPlayerUids,
                hostId: newHostId,
            });
        }
    }
    await batch.commit();
}

/**
 * Creates a new game room.
 */
export async function createGameRoom(userId: string, gameType: Game['gameType'], avatarId: string) {
    if (!userId) return { error: 'معرف المستخدم مطلوب.' };
    if (!avatarId) return { error: 'يجب اختيار شخصية.' };

    try {
        const gameId = generateGameId();
        const gameRef = doc(db, 'games', gameId);
        const playerDetails = await getPlayerFromUserId(userId);

        const activeDecree = playerDetails.decrees?.find(d => d.until && new Date(d.until) > new Date());

        const player: Player = {
            id: playerDetails.uid,
            name: playerDetails.name,
            avatarId,
            status: 'alive',
            leaderboardPoints: playerDetails.leaderboardPoints || 0,
            score: 0,
            position: 0,
            temporaryTitle: activeDecree?.title || null,
        };

        const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

        const newGame: Omit<Game, 'id'> = {
            hostId: userId,
            players: [player],
            playerUids: [userId],
            gameState: 'lobby',
            createdAt: Timestamp.now(),
            expiresAt,
            gameType,
            playerScores: { [player.id]: 0 },
        };

        switch (gameType) {
            case 'king-of-genius':
                newGame.teamScores = { A: 0, B: 0 };
                break;
            case 'trap-answer': {
                const categoriesResult = await getPublicTrapAnswerCategories();
                newGame.trapAnswerState = {
                    settings: {
                        categories: categoriesResult.categories || [],
                        rounds: 10,
                        answerTime: 60,
                    },
                    trickStats: { trickedBy: {}, trickedOthers: {} },
                };
                break;
            }
            case 'prison':
                newGame.prisonState = {
                    settings: {
                        biddingTime: 30,
                        answeringTime: 45,
                        judgingTime: 60,
                        rounds: 10,
                    },
                };
                break;
            case 'behind-the-mask':
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
                break;
            case 'word_war':
                newGame.wordWarState = {
                    settings: {
                        turnTime: 60,
                    },
                    cards: [],
                    guides: { red: '', blue: '' },
                    turn: 'red',
                };
                break;
            case 'draw-and-guess': {
                const { categories } = await getDrawAndGuessCategories(userId);
                newGame.drawAndGuessState = {
                    settings: {
                        drawingTime: 120,
                        guessingTime: 120,
                        roundsPerPlayer: 2,
                    },
                    categories: categories || ['أمثال عامية', 'أنميات مشهورة', 'أفلام مشهورة', 'جملة مركبة'],
                };
                break;
            }
            case 'bank_of_luck':
                newGame.bankOfLuckState = {
                    settings: {
                        rounds: 15,
                    },
                    board: [],
                    turnOrder: [],
                    currentTurnIndex: 0,
                    turnPhase: 'roll',
                };
                break;
        }

        await removePlayerFromPreviousLobbies(userId, gameId);
        await setDoc(gameRef, newGame);
        return { gameId, player };
    } catch (error: any) {
        console.error('Error in createGameRoom:', error);
        return { error: error.message || 'حدث خطأ غير متوقع عند إنشاء الغرفة.' };
    }
}
