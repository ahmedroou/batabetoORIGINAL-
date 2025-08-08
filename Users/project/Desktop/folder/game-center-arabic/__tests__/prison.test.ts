import { proceedToResultsInternal } from '@/lib/actions/prison';
import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';
import type { Game, Player, Transaction, GameState } from '@/types';
import { Timestamp } from 'firebase/firestore';

// Mock the transaction object as it's not used in the pure logic part of the function
const mockTransaction = {} as Transaction;

// --- Internal Logic from prison.ts moved here for testing ---

async function handleTimeoutInternal(game: Game): Promise<Partial<Game>> {
    const updatedGameState: Partial<Game> = {};
    
    if (game.gameState === 'open_auction') {
        const submissions: Record<string, string[]> = { ...(game.prisonState?.openAuctionSubmissions || {}) };
        const activePlayers = game.players.filter(p => p.status === 'alive');
        
        activePlayers.forEach(p => {
            if (!submissions[p.id]) {
                 submissions[p.id] = game.prisonState?.playerProgress?.[p.id]?.answers || [];
            }
        });

        updatedGameState.prisonState = { ...game.prisonState, openAuctionSubmissions: submissions };
        updatedGameState.gameState = 'judging';
        
    } else if (game.gameState === 'closed_auction_bidding') {
      const bids = game.prisonState?.bids || {};
      if (Object.keys(bids).length === 0) {
        updatedGameState.gameState = 'results';
        updatedGameState.prisonState = { ...game.prisonState, lastRoundResult: { message: "لا أحد زايد. انتهت الجولة بالتعادل.", points: {} } };
        return updatedGameState;
      }

      let winnerId = '';
      let highestBid = 0;
      Object.entries(bids).forEach(([playerId, bid]) => {
        if (bid > highestBid) {
          highestBid = bid;
          winnerId = playerId;
        }
      });
      
      updatedGameState.gameState = 'closed_auction_answering';
      updatedGameState.prisonState = { ...game.prisonState, auctionWinnerId: winnerId, highestBid: highestBid };

    } else if (game.gameState === 'closed_auction_answering') {
      const winnerId = game.prisonState!.auctionWinnerId!;
      const winnerAnswers = game.prisonState!.playerProgress?.[winnerId]?.answers || [];
      
      updatedGameState.prisonState = { 
          ...game.prisonState, 
          openAuctionSubmissions: { [winnerId]: winnerAnswers } 
      };
      updatedGameState.gameState = 'judging';
    }
    
    return updatedGameState;
}


describe('The Prison Game - Round Logic', () => {

    // A base mock game state to be used in tests
    const createMockGame = (players: Player[], roundScores: Record<string, number>, playerStatuses: Record<string, Player['status']>): Partial<Game> => {
        const gamePlayers = players.map(p => ({ ...p, status: playerStatuses[p.id] || 'alive' }));
        return {
            round: 1,
            players: gamePlayers,
            playerScores: gamePlayers.reduce((acc, p) => ({ ...acc, [p.id]: 10 }), {}), // Start with 10 points each
            prisonState: {
                aiJudgeResults: Object.entries(roundScores).map(([playerId, score]) => ({
                    playerId,
                    name: players.find(p => p.id === playerId)?.name || 'Unknown',
                    score,
                    correctAnswers: [],
                    evaluation: ''
                })),
                openAuctionSubmissions: Object.entries(roundScores).reduce((acc, [playerId, score]) => ({
                     ...acc, 
                     [playerId]: Array(score).fill("answer") 
                }), {}),
            }
        };
    };

    const mockPlayers: Player[] = [
        { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 0, position: 0 },
        { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 0, position: 0 },
        { id: 'p3', name: 'Charlie', avatarId: 'a3', status: 'alive', score: 0, position: 0 },
        { id: 'p4', name: 'Dana', avatarId: 'a4', status: 'in_prison', score: 0, position: 0 },
    ];

    test('should correctly assign points and jail status in an Open Auction', async () => {
        // P1 wins, P3 loses, P2 survives, P4 is already in prison
        const mockGame = createMockGame(
            mockPlayers,
            { p1: 10, p2: 5, p3: 2 }, // Scores from AI judge
            { p1: 'alive', p2: 'alive', p3: 'alive', p4: 'in_prison' }
        ) as Game;

        const { updatedGame } = await proceedToResultsInternal(mockGame, mockTransaction);
        
        // --- Assertions ---

        // Player 1 (Winner) should get +3 points for winning
        expect(updatedGame.playerScores.p1).toBe(10 + 3); 
        expect(updatedGame.players.find(p => p.id === 'p1')?.status).toBe('alive');

        // Player 2 (Survivor) should get +1 point for surviving
        expect(updatedGame.playerScores.p2).toBe(10 + 1);
        expect(updatedGame.players.find(p => p.id === 'p2')?.status).toBe('alive');

        // Player 3 (Loser) should get 0 points and go to prison
        expect(updatedGame.playerScores.p3).toBe(10 + 0); 
        expect(updatedGame.players.find(p => p.id === 'p3')?.status).toBe('in_prison');

        // Player 4 (Already in prison) should lose 1 point
        expect(updatedGame.playerScores.p4).toBe(10 - 1);
        expect(updatedGame.players.find(p => p.id === 'p4')?.status).toBe('in_prison');
    });

    test('should free a player from prison if they win the auction', async () => {
        // P4 wins while in prison, P2 loses
        const mockGame = createMockGame(
            mockPlayers,
            { p1: 5, p2: 2, p4: 10 },
            { p1: 'alive', p2: 'alive', p3: 'alive', p4: 'in_prison' }
        ) as Game;

        const { updatedGame } = await proceedToResultsInternal(mockGame, mockTransaction);

        // Player 4 (Winner) should be freed and get +2 points
        expect(updatedGame.players.find(p => p.id === 'p4')?.status).toBe('alive');
        expect(updatedGame.playerScores.p4).toBe(10 + 2);

        // Player 2 (Loser) should be jailed
        expect(updatedGame.players.find(p => p.id === 'p2')?.status).toBe('in_prison');
    });

    test('should handle tie in auction correctly (no winner/loser)', async () => {
        // P1 and P2 tie for the win, P3 and P4 tie for the loss. No one should be jailed.
         const mockGame = createMockGame(
            mockPlayers.slice(0, 4),
            { p1: 10, p2: 10, p3: 5, p4: 5 },
            { p1: 'alive', p2: 'alive', p3: 'alive', p4: 'alive' }
        ) as Game;

        const { updatedGame } = await proceedToResultsInternal(mockGame, mockTransaction);
        
        // All players should still be 'alive'
        expect(updatedGame.players.every(p => p.status === 'alive')).toBe(true);
        // Tie message should be set
        expect(updatedGame.prisonState.lastRoundResult.message).toContain('انتهى المزاد بالتعادل');
    });

     test('should apply penalty for wrong answers', async () => {
         const mockGameWithSubmissions = {
            ...createMockGame(
                mockPlayers,
                { p1: 5 }, // P1 got 5 correct
                { p1: 'alive' }
            ),
            prisonState: {
                ...createMockGame(mockPlayers, {p1: 5}, {p1: 'alive'}).prisonState,
                // P1 submitted 8 answers total, 3 were wrong
                openAuctionSubmissions: { p1: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] } 
            }
         } as Game;

        const { updatedGame } = await proceedToResultsInternal(mockGameWithSubmissions, mockTransaction);
        
        // 3 wrong answers -> floor(3/2) = 1 point penalty.
        // P1 is the winner (+3) and has a penalty (-1)
        const expectedScore = 10 + 3 - 1;
        expect(updatedGame.playerScores.p1).toBe(expectedScore);
        expect(updatedGame.prisonState.lastRoundResult.points.p1.breakdown).toContainEqual({ reason: 'إجابات خاطئة', points: -1 });
     });

});

describe('The Prison Game - Timeout Logic', () => {
    const mockPlayers: Player[] = [
        { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 0, position: 0 },
        { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 0, position: 0 },
    ];
    
    test('should automatically submit player progress when open_auction timer ends', async () => {
        const game: Partial<Game> = {
            gameState: 'open_auction',
            players: mockPlayers,
            prisonState: {
                playerProgress: {
                    p1: { answers: ['a', 'b'] }, // p1 is answering
                    p2: { answers: ['c'] }        // p2 is also answering
                },
                 openAuctionSubmissions: {}
            }
        };

        const updatedGame = await handleTimeoutInternal(game as Game);
        
        expect(updatedGame.gameState).toBe('judging');
        expect(updatedGame.prisonState.openAuctionSubmissions.p1).toEqual(['a', 'b']);
        expect(updatedGame.prisonState.openAuctionSubmissions.p2).toEqual(['c']);
    });
    
    test('should determine winner and move to answering phase when closed_auction_bidding timer ends', async () => {
        const game: Partial<Game> = {
            gameState: 'closed_auction_bidding',
            players: mockPlayers,
            prisonState: {
                bids: { p1: 10, p2: 15 } // p2 is the highest bidder
            }
        };
        const updatedGame = await handleTimeoutInternal(game as Game);
        
        expect(updatedGame.gameState).toBe('closed_auction_answering');
        expect(updatedGame.prisonState.auctionWinnerId).toBe('p2');
        expect(updatedGame.prisonState.highestBid).toBe(15);
    });

});


describe('The Prison Game - End of Game Awards', () => {

    const mockPlayers: Player[] = [
        { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 0, position: 0 },
        { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 0, position: 0 },
        { id: 'p3', name: 'Charlie', avatarId: 'a3', status: 'alive', score: 0, position: 0 },
    ];

    test('should correctly distribute awards for 1st, 2nd, and 3rd place at the end of the game', () => {
        const mockGame: Partial<Game> = {
            gameType: 'prison',
            players: mockPlayers,
            playerScores: {
                p1: 150, // 1st place
                p2: 95,  // 2nd place
                p3: 40,  // 3rd place
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
        expect(winUpdate!.gameType).toBe('prison');
    });

    test('should correctly handle ties in final scores', () => {
        const mockGame: Partial<Game> = {
            gameType: 'prison',
            players: mockPlayers,
            playerScores: {
                p1: 150, // 1st place
                p2: 95,  // Tied for 2nd
                p3: 95,  // Tied for 2nd
            },
            gameResult: { winner: 'p1', message: 'Game Over' }
        };

        const { updates, winUpdate } = calculateEndOfGameAwards(mockGame as Game);

        // Player 1 is 1st
        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p1'].coins).toBe(2);
        expect(winUpdate!.userId).toBe('p1');

        // Player 2 is 2nd (tied)
        expect(updates['p2'].leaderboardPoints).toBe(2);
        expect(updates['p2'].coins).toBe(1);

        // Player 3 is 2nd (tied)
        expect(updates['p3'].leaderboardPoints).toBe(2);
        expect(updates['p3'].coins).toBe(1);
    });
    
    test('should correctly register a win for the first-place player', () => {
        const mockGame: Partial<Game> = {
            gameType: 'prison',
            players: mockPlayers,
            playerScores: { p1: 100, p2: 50, p3: 25 },
            gameResult: { winner: 'p1', message: 'Game Over' },
        };

        const { winUpdate } = calculateEndOfGameAwards(mockGame as Game);

        expect(winUpdate).toBeDefined();
        expect(winUpdate!.userId).toBe('p1');
        expect(winUpdate!.gameType).toBe('prison');
    });

});
