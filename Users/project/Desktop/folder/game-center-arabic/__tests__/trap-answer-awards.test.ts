
import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';
import type { Game, Player } from '@/types';

describe('Trap Answer Game - End of Game Awards', () => {
    const mockPlayers: Player[] = [
        { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 20, position: 0 },
        { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 15, position: 0 },
        { id: 'p3', name: 'Charlie', avatarId: 'a3', status: 'alive', score: 10, position: 0 },
        { id: 'p4', name: 'Dana', avatarId: 'a4', status: 'alive', score: 5, position: 0 },
    ];

    test('should correctly award "Cunning Deceiver" and "Deceived Fool"', () => {
        const mockGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: { p1: 20, p2: 15, p3: 10, p4: 5 },
            gameResult: { winner: 'p1', message: 'Game Over' },
            trapAnswerState: {
                trickStats: {
                    // p1 tricked p2 and p3 (2 times) -> Cunning Deceiver
                    trickedOthers: { p1: ['p2', 'p3'] },
                    // p4 was tricked by p2 and p3 (2 times) -> Deceived Fool
                    trickedBy: { p4: ['p2', 'p3'] }
                }
            }
        };

        const { updates, specialAwards } = calculateEndOfGameAwards(mockGame as Game);

        // --- Verify Cunning Deceiver Award ---
        expect(specialAwards?.cunningDeceiver).toBeDefined();
        expect(specialAwards?.cunningDeceiver?.playerId).toBe('p1');
        expect(specialAwards?.cunningDeceiver?.count).toBe(2);
        // p1 gets 3 points for 1st place + 1 bonus point for the award = 4
        expect(updates['p1'].leaderboardPoints).toBe(4); 

        // --- Verify Deceived Fool Award ---
        expect(specialAwards?.deceivedFool).toBeDefined();
        expect(specialAwards?.deceivedFool?.playerId).toBe('p4');
        expect(specialAwards?.deceivedFool?.count).toBe(2);
        // p4 gets 0 points for 4th place and no bonus points
        expect(updates['p4'].leaderboardPoints).toBe(0);

        // Other players should get their normal awards
        expect(updates['p2'].leaderboardPoints).toBe(2); // 2nd place
        expect(updates['p3'].leaderboardPoints).toBe(1); // 3rd place
    });

    test('should handle cases where there is no clear fool or deceiver', () => {
         const mockGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: { p1: 20, p2: 15, p3: 10, p4: 5 },
            gameResult: { winner: 'p1', message: 'Game Over' },
            trapAnswerState: {
                trickStats: { // No one tricked anyone
                    trickedOthers: {},
                    trickedBy: {}
                }
            }
        };
        const { updates, specialAwards } = calculateEndOfGameAwards(mockGame as Game);
        
        expect(specialAwards?.cunningDeceiver).toBeNull();
        expect(specialAwards?.deceivedFool).toBeNull();
        // Points should be standard
        expect(updates['p1'].leaderboardPoints).toBe(3);
    });
    
    test('should handle ties in deception/foolishness counts', () => {
        const mockGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: { p1: 20, p2: 15, p3: 10, p4: 5 },
            gameResult: { winner: 'p1', message: 'Game Over' },
            trapAnswerState: {
                trickStats: {
                    // p1 and p2 both tricked one player
                    trickedOthers: { p1: ['p3'], p2: ['p4'] },
                    // p3 and p4 were both tricked once
                    trickedBy: { p3: ['p1'], p4: ['p2'] }
                }
            }
        };

        const { specialAwards } = calculateEndOfGameAwards(mockGame as Game);

        // One of them should be chosen, but not both.
        expect(specialAwards?.cunningDeceiver).not.toBeNull();
        expect(specialAwards?.deceivedFool).not.toBeNull();
        // The test ensures the function doesn't crash and picks one of the tied players.
        expect(['p1', 'p2']).toContain(specialAwards?.cunningDeceiver?.playerId);
        expect(['p3', 'p4']).toContain(specialAwards?.deceivedFool?.playerId);
    });

});
