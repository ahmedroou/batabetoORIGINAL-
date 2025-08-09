import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';
import type { Game, Player, GameResult } from '@/types';

describe('End of Game Awards Logic', () => {

    const mockPlayers: Player[] = [
        { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 0, position: 0 },
        { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 0, position: 0 },
        { id: 'p3', name: 'Charlie', avatarId: 'a3', status: 'alive', score: 0, position: 0 },
    ];

    test('should distribute awards correctly for 1st, 2nd, and 3rd place', () => {
        const mockGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: {
                p1: 100, // 1st place
                p2: 50,  // 2nd place
                p3: 25,  // 3rd place
            },
             gameResult: { winner: 'p1', message: 'Game Over' }
        };

        const { updates, winUpdate } = calculateEndOfGameAwards(mockGame as Game);

        // --- Verify Player 1 (1st Place) ---
        expect(updates['p1']).toBeDefined();
        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p1'].coins).toBe(2);
        expect(updates['p1'].gamesPlayed).toBe(1);

        // --- Verify Player 2 (2nd Place) ---
        expect(updates['p2']).toBeDefined();
        expect(updates['p2'].leaderboardPoints).toBe(2);
        expect(updates['p2'].coins).toBe(1);
        expect(updates['p2'].gamesPlayed).toBe(1);


        // --- Verify Player 3 (3rd Place) ---
        expect(updates['p3']).toBeDefined();
        expect(updates['p3'].leaderboardPoints).toBe(1);
        expect(updates['p3'].coins).toBe(0);
        expect(updates['p3'].gamesPlayed).toBe(1);
        
        // --- Verify Win Count ---
        expect(winUpdate).toBeDefined();
        expect(winUpdate!.userId).toBe('p1');
        expect(winUpdate!.gameType).toBe('trap-answer');
    });
    
     test('should handle ties correctly (e.g., two players tied for 2nd)', () => {
        const mockGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: {
                p1: 100, // 1st place
                p2: 50,  // Tied for 2nd
                p3: 50,  // Tied for 2nd
            },
            gameResult: { winner: 'p1', message: 'Game Over' }
        };

        const { updates, winUpdate } = calculateEndOfGameAwards(mockGame as Game);

        // P1 is 1st
        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p1'].coins).toBe(2);
        expect(winUpdate!.userId).toBe('p1');

        // P2 is 2nd (tied)
        expect(updates['p2'].leaderboardPoints).toBe(2);
        expect(updates['p2'].coins).toBe(1);

        // P3 is 2nd (tied)
        expect(updates['p3'].leaderboardPoints).toBe(2);
        expect(updates['p3'].coins).toBe(1);
    });

    test('should handle team-based wins', () => {
         const teamGamePlayers: Player[] = [
            { id: 'p1', name: 'Alice', team: 'red', avatarId: 'a1', status: 'alive', score: 0, position: 0 },
            { id: 'p2', name: 'Bob', team: 'red', avatarId: 'a2', status: 'alive', score: 0, position: 0 },
            { id: 'p3', name: 'Charlie', team: 'blue', avatarId: 'a3', status: 'alive', score: 0, position: 0 },
            { id: 'p4', name: 'Dana', team: 'blue', avatarId: 'a4', status: 'alive', score: 0, position: 0 },
         ];
        const mockGame: Partial<Game> = {
            gameType: 'king-of-genius',
            players: teamGamePlayers,
            playerScores: { p1: 10, p2: 12, p3: 5, p4: 8 },
            gameResult: { winner: 'red', message: 'Red team wins!' }
        };

        const { updates, winUpdate } = calculateEndOfGameAwards(mockGame as Game);
        
        // Red team members (winners) get awards
        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p1'].coins).toBe(2);
        expect(updates['p2'].leaderboardPoints).toBe(3);
        expect(updates['p2'].coins).toBe(2);
        
        // Blue team members (losers) get no awards
        expect(updates['p3'].leaderboardPoints).toBe(0);
        expect(updates['p3'].coins).toBe(0);
        expect(updates['p4'].leaderboardPoints).toBe(0);
        expect(updates['p4'].coins).toBe(0);

        // Win counts are not handled by this function for team games, so winUpdate should be null.
        expect(winUpdate).toBeNull();
    });

    test('should register only one win per player', () => {
        const individualGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: { p1: 100, p2: 50, p3: 25 },
            gameResult: { winner: 'p1', message: 'Game Over' }
        };
        const teamGame: Partial<Game> = {
            gameType: 'word_war',
            players: mockPlayers.map(p => ({ ...p, team: p.id === 'p1' || p.id === 'p2' ? 'red' : 'blue' })),
            playerScores: { p1: 10, p2: 12, p3: 5 },
            gameResult: { winner: 'red', message: 'Red team wins!' }
        };

        const { winUpdate: individualWinUpdate } = calculateEndOfGameAwards(individualGame as Game);
        const { winUpdate: teamWinUpdate } = calculateEndOfGameAwards(teamGame as Game);

        // Individual game should have a single winner
        expect(individualWinUpdate).toBeDefined();
        expect(individualWinUpdate?.userId).toBe('p1');

        // Team game should not return an individual winner from this function
        // as team wins are handled separately to avoid double counting.
        expect(teamWinUpdate).toBeNull();
    });

});
