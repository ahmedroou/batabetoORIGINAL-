
'use server';

/**
 * @fileoverview Actions for managing game rooms: creating, joining, leaving.
 * Refactored for clarity, type-safety, error consistency, and Firestore best practices —
 * without changing functional logic.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  runTransaction,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  increment,
} from 'firebase/firestore';
import type {
  Player,
  Game,
  GameState,
  ChallengeResult,
  Game as GameTypeAlias, // helpful aliasing for string literal types, if needed later
} from '@/types';
import { generateGameId } from '@/lib/actions/helpers';
import { getTrapAnswerCategories, getEducatedMerchantCategories } from './admin/settings';
import { getPlayerFromUserId } from './user/queries';
import { getGamePopularityStats } from './stats';


// ============================================================
// Types & Constants
// ============================================================

type CreateGameRoomResult = { gameId?: string; player?: Player; error?: string };
type JoinGameRoomResult = { gameId?: string; player?: Player; error?: string };
type LeaveGameResult = { success: boolean; error?: string };
type KickPlayerFromLobbyResult = { success: boolean; error?: string };

const LOBBY_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_PLAYERS = 8; // fallback when challenge rules are absent

// ============================================================
// Utilities
// ============================================================

const nowTs = () => Timestamp.now();
const expiresAtFromNow = (ms: number) => Timestamp.fromMillis(Date.now() + ms);
const normalizeGameId = (id: string) => id.trim().toUpperCase();

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Assigns a new host from remaining players if needed. */
function pickNewHostId(game: Game, leavingUserId: string): string {
  if (game.hostId !== leavingUserId) return game.hostId;
  const candidates = game.players.filter((p) => p.id !== leavingUserId && p.status !== 'left');
  return candidates[0]?.id ?? '';
}

/**
 * Removes a player from any previous active lobbies (not started games),
 * ensuring a user is in only one active lobby at a time.
 * If a lobby becomes empty after removal, it is deleted.
 */
async function removePlayerFromPreviousLobbies(userId: string, currentRoomId: string): Promise<void> {
  const gamesCollection = collection(db, 'games');
  // Query ONLY lobbies; started games remain untouched
  const playerInGamesQuery = query(
    gamesCollection,
    where('playerUids', 'array-contains', userId),
    where('gameState', '==', 'lobby')
  );

  const querySnapshot = await getDocs(playerInGamesQuery);
  if (querySnapshot.empty) return;

  const batch = writeBatch(db);

  for (const docSnap of querySnapshot.docs) {
    // Safeguard against acting on the room being created/joined
    if (docSnap.id === currentRoomId) continue;

    const game = docSnap.data() as Game;
    const updatedPlayers = (game.players || []).filter((p) => p.id !== userId);
    const updatedPlayerUids = (game.playerUids || []).filter((uid) => uid !== userId);

    if (updatedPlayers.length === 0) {
      batch.delete(docSnap.ref);
    } else {
      const newHostId = pickNewHostId(game, userId);
      batch.update(docSnap.ref, {
        players: updatedPlayers,
        playerUids: updatedPlayerUids,
        hostId: newHostId,
      });
    }
  }

  await batch.commit();
}

// ============================================================
// Public Actions
// ============================================================

/**
 * Creates a new game room.
 * @param userId - The ID of the user creating the room (host).
 * @param gameType - The type of game to create.
 * @param avatarId - Selected avatar ID for the host.
 */
export async function createGameRoom(
  userId: string,
  gameType: Game['gameType'],
  avatarId: string
): Promise<CreateGameRoomResult> {
  if (!isNonEmptyString(userId)) return { error: 'معرف المستخدم مطلوب.' };
  if (!isNonEmptyString(avatarId)) return { error: 'يجب اختيار شخصية.' };

  try {
    const gameId = generateGameId();
    const gameRef = doc(db, 'games', gameId);

    // Fetch player details before any write ops (keeps future transaction lean)
    const playerDetails = await getPlayerFromUserId(userId);
    const activeDecree = (playerDetails.decrees || []).find(
      (d) => d.until && new Date(d.until) > new Date()
    );

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

    const expiresAt = expiresAtFromNow(LOBBY_TTL_MS);

    const baseGame: Game = {
      id: gameId,
      hostId: userId,
      players: [player],
      playerUids: [userId],
      gameState: 'lobby' as GameState,
      createdAt: nowTs(),
      expiresAt,
      gameType,
    };

    // Clone + extend with game-type specific defaults (no logic change)
    const newGame: Game = { ...baseGame };

    if (gameType === 'king-of-genius') {
      newGame.teamScores = { A: 0, B: 0 };
    } else if (gameType === 'trap-answer') {
      const categoriesResult = await getTrapAnswerCategories();
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
        settings: { nightTime: 25, dayTime: 180 },
        night: 1,
        votes: {},
        nightActions: {},
        events: [],
        privateChats: {},
      };
    } else if (gameType === 'word_war') {
      newGame.wordWarState = {
        settings: { turnTime: 60 },
        cards: [],
        guides: { red: '', blue: '' },
        turn: 'red',
      };
    } else if (gameType === 'educated-merchant') {
      const categoriesResult = await getEducatedMerchantCategories();
      newGame.educatedMerchantState = {
        settings: { maxRounds: 20, categories: categoriesResult.categories || [] },
        board: [],
        turnOrder: [],
        currentTurnIndex: 0,
        activityLog: [],
      };
    }

    // Ensure the creator is not in any other lobby
    await removePlayerFromPreviousLobbies(userId, gameId);

    // Create game + increment popularity in a single transaction
    const statsRef = doc(db, 'game_stats', 'popularity');
    await runTransaction(db, async (tx) => {
      tx.set(statsRef, { [gameType]: increment(1) }, { merge: true });
      tx.set(gameRef, newGame);
    });

    return { gameId, player };
  } catch (error) {
    const typed = error as Error;
    console.error('Error in createGameRoom:', typed);
    return { error: typed.message || 'حدث خطأ غير متوقع عند إنشاء الغرفة.' };
  }
}

/**
 * Allows a user to join an existing game room.
 * @param gameId - The ID of the game room to join.
 * @param userId - The ID of the user joining.
 * @param avatarId - The avatar ID chosen by the user.
 * @param challengeId - Optional ID of the challenge (kept for parity; not used here).
 */
export async function joinGameRoom(
  gameId: string,
  userId: string,
  avatarId: string,
  challengeId?: string
): Promise<JoinGameRoomResult> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(gameId)) {
    return { error: 'معرف المستخدم ومعرف الغرفة مطلوبان.' };
  }
  if (!isNonEmptyString(avatarId)) return { error: 'يجب اختيار شخصية.' };

  try {
    const formattedGameId = normalizeGameId(gameId);

    // Ensure the joiner is not in any other lobby
    await removePlayerFromPreviousLobbies(userId, formattedGameId);

    // Fetch user profile early to keep the transaction tight
    const playerDetails = await getPlayerFromUserId(userId);
    const activeDecree = (playerDetails.decrees || []).find(
      (d) => d.until && new Date(d.until) > new Date()
    );

    const gameRef = doc(db, 'games', formattedGameId);

    const player = await runTransaction(db, async (tx) => {
      const gameDoc = await tx.get(gameRef);
      if (!gameDoc.exists()) throw new Error('الغرفة غير موجودة. تأكد من المعرف.');

      const game = gameDoc.data() as Game;
      const existingPlayerIndex = (game.players || []).findIndex((p) => p.id === userId);
      if (existingPlayerIndex !== -1) {
        return game.players[existingPlayerIndex];
      }

      const activePlayersCount = (game.players || []).length;
      const maxPlayers = game.challengeDetails?.minPlayersToStart
        ? game.challengeDetails.minPlayersToStart * 2
        : DEFAULT_MAX_PLAYERS;

      if (activePlayersCount >= maxPlayers) throw new Error('الغرفة ممتلئة.');
      if (game.gameState !== 'lobby') throw new Error('لا يمكن الانضمام، اللعبة بدأت بالفعل.');

      const newPlayer: Player = {
        id: playerDetails.uid,
        name: playerDetails.name,
        avatarId,
        status: 'alive',
        leaderboardPoints: playerDetails.leaderboardPoints || 0,
        score: 0,
        position: 0,
        isReady: false,
        temporaryTitle: activeDecree?.title || null,
      };

      const updatedPlayers = [...(game.players || []), newPlayer];
      const updatedPlayerUids = [...(game.playerUids || []), newPlayer.id];

      const updateData: Partial<Game> & { [key: string]: any } = {
        players: updatedPlayers,
        playerUids: updatedPlayerUids,
      };

      if (
        ['trap-answer', 'prison', 'behind-the-mask', 'word_war', 'educated-merchant'].includes(
          game.gameType
        )
      ) {
        updateData.playerScores = { ...(game.playerScores || {}), [newPlayer.id]: 0 };
      }

      tx.update(gameRef, updateData);
      return newPlayer;
    });

    return { gameId: formattedGameId, player };
  } catch (error) {
    const typed = error as Error;
    return { error: typed.message || 'حدث خطأ غير متوقع عند الانضمام للغرفة.' };
  }
}

/**
 * Allows a player to leave a game room.
 */
export async function leaveGame(gameId: string, playerId: string): Promise<LeaveGameResult> {
  const gameRef = doc(db, 'games', normalizeGameId(gameId));
  try {
    await runTransaction(db, async (tx) => {
      const gameDoc = await tx.get(gameRef);
      if (!gameDoc.exists()) return; // game already gone, nothing to do

      const game = gameDoc.data() as Game;
      const playerIndex = (game.players || []).findIndex((p) => p.id === playerId);
      if (playerIndex === -1) return; // not in game

      let updatedPlayers = [...(game.players || [])];
      const leavingPlayer = updatedPlayers[playerIndex];

      if (game.gameState !== 'lobby') {
        if (leavingPlayer.status !== 'left') {
          updatedPlayers[playerIndex] = { ...leavingPlayer, status: 'left' };
        }
      } else {
        updatedPlayers = updatedPlayers.filter((p) => p.id !== playerId);
      }

      const updatedPlayerUids = (game.playerUids || []).filter((uid) => uid !== playerId);
      const remainingLivePlayers = updatedPlayers.filter((p) => p.status === 'alive');

      if (remainingLivePlayers.length === 0 && game.gameState !== 'final_results') {
        tx.delete(gameRef);
        return;
      }

      const updateData: Partial<Game> & { [key: string]: any } = {
        players: updatedPlayers,
      };

      if (game.gameState === 'lobby') {
        updateData.playerUids = updatedPlayerUids;
      }

      if (game.hostId === playerId) {
        updateData.hostId = pickNewHostId(game, playerId);
      }

      // Auto-forfeit for specific in-progress states (preserves original behavior)
      if (
        game.gameState !== 'lobby' &&
        game.gameState !== 'instructions' &&
        game.gameState !== 'final_results'
      ) {
        if (
          game.gameType === 'king-of-genius' &&
          (game.gameState === 'challenge_active' || game.gameState === 'challenge_intro')
        ) {
          const currentResults = game.challengeState?.results || [];
          if (!currentResults.some((r) => r.playerId === playerId)) {
            const forfeitResult: ChallengeResult = {
              playerId,
              team: leavingPlayer.team || 'A',
              isCorrect: false,
              time: 999,
              score: 0,
            };
            updateData['challengeState.results'] = [...currentResults, forfeitResult];
          }
        }
      }

      tx.update(gameRef, updateData);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: 'حدث خطأ عند مغادرة الغرفة.' };
  }
}

/**
 * Kicks a player from a game lobby (host only).
 */
export async function kickPlayerFromLobby(
  gameId: string,
  hostId: string,
  playerIdToKick: string
): Promise<KickPlayerFromLobbyResult> {
  const gameRef = doc(db, 'games', normalizeGameId(gameId));
  try {
    await runTransaction(db, async (tx) => {
      const gameDoc = await tx.get(gameRef);
      if (!gameDoc.exists()) throw new Error('Game not found.');

      const game = gameDoc.data() as Game;
      if (game.hostId !== hostId) throw new Error('Only the host can kick players.');
      if (hostId === playerIdToKick) throw new Error('You cannot kick yourself.');

      const playerIndex = (game.players || []).findIndex((p) => p.id === playerIdToKick);
      if (playerIndex === -1) throw new Error('Player not found in this lobby.');

      const updatedPlayers = (game.players || []).filter((p) => p.id !== playerIdToKick);
      const updatedPlayerUids = (game.playerUids || []).filter((uid) => uid !== playerIdToKick);

      tx.update(gameRef, { players: updatedPlayers, playerUids: updatedPlayerUids });
    });

    return { success: true };
  } catch (error) {
    const typed = error as Error;
    return { success: false, error: typed.message || 'An unexpected error occurred while kicking the player.' };
  }
}

/**
 * Marks a player as ready. Starts the game automatically if all active players are ready.
 * (Game-specific start logic remains a placeholder for non-implemented titles.)
 */
export async function setPlayerReady(gameId: string, playerId: string): Promise<void> {
  const gameRef = doc(db, 'games', normalizeGameId(gameId));

  await runTransaction(db, async (tx) => {
    const gameDoc = await tx.get(gameRef);
    if (!gameDoc.exists()) throw new Error('Game not found.');

    const game = gameDoc.data() as Game;
    const playerIndex = (game.players || []).findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return; // silently ignore if not present

    const updatedPlayers = [...(game.players || [])];
    const target = updatedPlayers[playerIndex];

    if (!target.isReady) {
      updatedPlayers[playerIndex] = { ...target, isReady: true };
    }

    const activePlayers = updatedPlayers.filter((p) => p.status !== 'left');
    const canStart = activePlayers.length >= (game.challengeDetails?.minPlayersToStart || 2);
    const allReady = canStart && activePlayers.every((p) => p.isReady);

    if (allReady) {
      if (game.gameType === 'king-of-genius') {
        // Placeholder: in your codebase, call initialize function for this game type
        tx.update(gameRef, { gameState: 'team_selection', players: updatedPlayers });
      } else if (game.gameType === 'trap-answer') {
        // TODO: startTrapAnswerGame logic
        tx.update(gameRef, { players: updatedPlayers });
      } else {
        // Other game types keep existing behavior: just update readiness
        tx.update(gameRef, { players: updatedPlayers });
      }
    } else {
      tx.update(gameRef, { players: updatedPlayers });
    }
  });
}

    