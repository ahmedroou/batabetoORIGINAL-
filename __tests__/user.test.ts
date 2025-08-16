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

        const { data: { updates, winUpdate } } = calculateEndOfGameAwards(mockGame as Game, []);

        // --- Verify Player 1 (1st Place) ---
        expect(updates['p1']).toBeDefined();
        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p1'].coins).toBe(2);
        expect(updates['p1'].gamesPlayed).toEqual({ 'trap-answer': 1 });

        // --- Verify Player 2 (2nd Place) ---
        expect(updates['p2']).toBeDefined();
        expect(updates['p2'].leaderboardPoints).toBe(2);
        expect(updates['p2'].coins).toBe(1);
        expect(updates['p2'].gamesPlayed).toEqual({ 'trap-answer': 1 });


        // --- Verify Player 3 (3rd Place) ---
        expect(updates['p3']).toBeDefined();
        expect(updates['p3'].leaderboardPoints).toBe(1);
        expect(updates['p3'].coins).toBe(0);
        expect(updates['p3'].gamesPlayed).toEqual({ 'trap-answer': 1 });
        
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

        const { data: { updates, winUpdate } } = calculateEndOfGameAwards(mockGame as Game, []);

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

        const { data: { updates, winUpdate } } = calculateEndOfGameAwards(mockGame as Game, []);
        
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

});
