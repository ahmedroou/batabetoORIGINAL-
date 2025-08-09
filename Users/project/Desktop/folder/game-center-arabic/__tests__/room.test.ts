import { createGameRoom, joinGameRoom, leaveGame, kickPlayerFromLobby } from '@/lib/actions/room';
import { getPlayerFromUserId } from '@/lib/actions/user/queries';
import { db } from '@/lib/firebase';
import { doc, getDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import type { Game, Player } from '@/types';

// Mock the dependencies
jest.mock('@/lib/actions/user/queries');
const mockedGetPlayerFromUserId = getPlayerFromUserId as jest.Mock;

const mockPlayerProfile: UserProfile = {
  uid: 'testUser1',
  name: 'Tester',
  avatarId: 'Avatar01.png',
  email: 'test@test.com',
  coins: 100,
  leaderboardPoints: 50,
  isAdmin: false,
  isEditor: false,
  diamonds: 0,
  unlockedAvatars: ['Avatar01.png'],
  gamesPlayed: 0,
  trophies: 0,
};

// --- Test Suite for Room Management ---
describe('Room Management', () => {

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Setup mock implementation for getPlayerFromUserId
    mockedGetPlayerFromUserId.mockResolvedValue(mockPlayerProfile);
  });
  
  afterAll(async () => {
      // Clean up any created games
      const q = query(collection(db, "games"), where("hostId", "==", "testUser1"));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
  });

  // Test 1: Successful room creation
  test('should create a new game room successfully', async () => {
    const result = await createGameRoom('testUser1', 'trap-answer', 'Avatar01.png');
    
    expect(result.error).toBeUndefined();
    expect(result.gameId).toBeDefined();
    expect(result.player).toBeDefined();

    const gameId = result.gameId!;
    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await getDoc(gameRef);

    expect(gameDoc.exists()).toBe(true);

    const gameData = gameDoc.data() as Game;

    // Verify game data
    expect(gameData.hostId).toBe('testUser1');
    expect(gameData.gameType).toBe('trap-answer');
    expect(gameData.gameState).toBe('lobby');
    expect(gameData.players.length).toBe(1);
    expect(gameData.playerUids).toContain('testUser1');
    
    // Verify player data
    const player = gameData.players[0];
    expect(player.id).toBe('testUser1');
    expect(player.name).toBe('Tester');
    expect(player.avatarId).toBe('Avatar01.png');
    
    // Verify game-specific state
    expect(gameData.trapAnswerState).toBeDefined();
    expect(gameData.trapAnswerState?.settings.rounds).toBe(10); // Default value
  });

  // Test 2: Joining an existing room
  test('should allow a new player to join an existing lobby', async () => {
    // First, create a room
    const createResult = await createGameRoom('testUser1', 'trap-answer', 'Avatar01.png');
    const gameId = createResult.gameId!;
    
    const newUserProfile: UserProfile = { ...mockPlayerProfile, uid: 'testUser2', name: 'Joiner' };
    mockedGetPlayerFromUserId.mockResolvedValue(newUserProfile);
    
    const joinResult = await joinGameRoom(gameId, 'testUser2', 'Avatar02.png');
    
    expect(joinResult.error).toBeUndefined();
    expect(joinResult.gameId).toBe(gameId);

    const gameRef = doc(db, 'games', gameId);
    const gameDoc = await getDoc(gameRef);
    const gameData = gameDoc.data() as Game;

    expect(gameData.players.length).toBe(2);
    expect(gameData.playerUids).toContain('testUser2');
    const joinedPlayer = gameData.players.find(p => p.id === 'testUser2');
    expect(joinedPlayer).toBeDefined();
    expect(joinedPlayer?.name).toBe('Joiner');
  });

  // Test 3: Player leaving a lobby
  test('should allow a player to leave a lobby', async () => {
    // Create a room with two players
    const createResult = await createGameRoom('testUser1', 'trap-answer', 'Avatar01.png');
    const gameId = createResult.gameId!;
    const newUserProfile: UserProfile = { ...mockPlayerProfile, uid: 'testUser2', name: 'Joiner' };
    mockedGetPlayerFromUserId.mockResolvedValue(newUserProfile);
    await joinGameRoom(gameId, 'testUser2', 'Avatar02.png');
    
    // Player 2 leaves
    const leaveResult = await leaveGame(gameId, 'testUser2');
    expect(leaveResult.success).toBe(true);

    const gameDoc = await getDoc(doc(db, 'games', gameId));
    const gameData = gameDoc.data() as Game;

    expect(gameData.players.length).toBe(1);
    expect(gameData.playerUids).not.toContain('testUser2');
    expect(gameData.players.find(p => p.id === 'testUser2')).toBeUndefined();
  });
  
   // Test 4: Kicking a player from a lobby
   test('should allow the host to kick a player from a lobby', async () => {
        const createResult = await createGameRoom('testUser1', 'trap-answer', 'Avatar01.png');
        const gameId = createResult.gameId!;
        const newUserProfile: UserProfile = { ...mockPlayerProfile, uid: 'testUser2', name: 'Kicky' };
        mockedGetPlayerFromUserId.mockResolvedValue(newUserProfile);
        await joinGameRoom(gameId, 'testUser2', 'Avatar02.png');

        // Host kicks player 2
        const kickResult = await kickPlayerFromLobby(gameId, 'testUser1', 'testUser2');
        expect(kickResult.success).toBe(true);

        const gameDoc = await getDoc(doc(db, 'games', gameId));
        const gameData = gameDoc.data() as Game;
        expect(gameData.players.length).toBe(1);
        expect(gameData.playerUids).not.toContain('testUser2');
   });

});
