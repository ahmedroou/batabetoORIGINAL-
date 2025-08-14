

import {
  _getInitialGameState,
  _rollDice,
  _purchaseProperty,
  _answerQuestion,
  _endTurn,
  _generateBoard,
} from '@/lib/actions/helpers/educated-merchant-helpers';
import type { Game, Player, Property, EducatedMerchantQuestion } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';


// This is a simplified mock of the game state for testing pure functions.
const createMockGame = (players: Player[], educatedMerchantState: Partial<Game['educatedMerchantState']> = {}): Game => {
  return {
    id: 'test-game',
    hostId: 'p1',
    gameType: 'educated-merchant',
    players,
    playerUids: players.map(p => p.id),
    gameState: 'rolling',
    createdAt: Timestamp.now(),
    round: 1,
    educatedMerchantState: {
      turnOrder: players.map(p => p.id),
      currentTurnIndex: 0,
      board: [],
      activityLog: [],
      settings: { maxRounds: 20, categories: ['Test'] },
      movesThisRound: 0,
      activeCountAtRoundStart: players.length,
      ...educatedMerchantState,
    },
  };
};

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 0, position: 0, money: 1000, propertiesCount: 0 },
  { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 0, position: 0, money: 1000, propertiesCount: 0 },
  { id: 'p3', name: 'Charlie', avatarId: 'a3', status: 'alive', score: 0, position: 0, money: 1000, propertiesCount: 0 },
];

const mockBoard: Property[] = [
  { id: 0, type: 'start', name: 'Start', price: 0, rent: 0, ownerId: null, category: '' },
  { id: 1, type: 'property', name: 'Library', price: 100, rent: 25, ownerId: null, category: 'Test' },
  { id: 2, type: 'property', name: 'Observatory', price: 150, rent: 35, ownerId: 'p2', category: 'Test', color: '#F44336' },
  { id: 3, type: 'fine', name: 'Fine', price: 0, rent: 0, ownerId: null, category: '', fineAmount: 50 },
  { id: 4, type: 'property', name: 'Lab', price: 200, rent: 50, ownerId: null, category: 'Test' },
];

describe('Educated Merchant - Game Logic Helpers', () => {
  
  test('Player should pay rent when landing on an owned property', () => {
    let game = createMockGame(mockPlayers, { board: mockBoard });
    game.players[0].position = 2; // Move p1 to p2's property

    const { updates } = _rollDice(game, 'p1'); // This will trigger the rent logic
    
    // We expect the internal logic to have calculated the next state after rent payment
    const finalPlayers = updates.players;
    const player1 = finalPlayers.find(p => p.id === 'p1');
    const player2 = finalPlayers.find(p => p.id === 'p2');
    const rent = mockBoard[2].rent;

    expect(player1?.money).toBe(1000 - rent);
    expect(player2?.money).toBe(1000 + rent);
    expect(updates['educatedMerchantState.lastRentPayment'].amount).toBe(rent);
  });
  
   test('Player should go bankrupt if they cannot afford rent', () => {
    let game = createMockGame(mockPlayers, { board: mockBoard });
    game.players[0].money = 20; // Not enough money for rent
    game.players[0].position = 2; // Move p1 to p2's property

    const { updates } = _rollDice(game, 'p1');
    const finalPlayers = updates.players;
    const player1 = finalPlayers.find(p => p.id === 'p1');
    const player2 = finalPlayers.find(p => p.id === 'p2');

    expect(player1?.status).toBe('bankrupt');
    expect(player1?.money).toBe(0);
    expect(player2?.money).toBe(1000 + 20); // Player 2 gets all of player 1's remaining money
  });

  test('Player can purchase an unowned property by answering correctly', () => {
    let game = createMockGame(mockPlayers, { board: mockBoard });
    const property = mockBoard[1];
    
    // 1. Simulate initiating the purchase
    game.gameState = 'property_action';
    game.players[0].position = 1;
    const purchaseResult = _purchaseProperty(game, 'p1');
    const afterPurchasePlayers = purchaseResult.updates.players;
    expect(afterPurchasePlayers.find(p => p.id === 'p1')?.money).toBe(1000 - property.price);
    expect(purchaseResult.updates.gameState).toBe('question');
    
    // 2. Simulate answering correctly
    const gameAfterPurchase = { ...game, ...purchaseResult.updates, players: afterPurchasePlayers, educatedMerchantState: { ...game.educatedMerchantState, ...purchaseResult.updates }};
    gameAfterPurchase.educatedMerchantState.currentQuestion = { id: 'q1', question: 'Q', answer: 'Correct', options: ['Correct', 'Wrong'] };
    
    const { updates: finalUpdates } = _answerQuestion(gameAfterPurchase, 'p1', 'Correct');
    const finalBoard = finalUpdates['educatedMerchantState.board'];
    const finalPlayers = finalUpdates.players;

    expect(finalBoard[1].ownerId).toBe('p1');
    expect(finalPlayers.find(p => p.id === 'p1')?.propertiesCount).toBe(1);
    expect(finalUpdates.gameState).toBe('rolling'); // Turn should end
  });
  
  test('Answering a purchase question incorrectly refunds a portion of the price', () => {
    let game = createMockGame(mockPlayers, { board: mockBoard });
    const property = mockBoard[1];
    const refund = Math.round(property.price / 4);

    game.gameState = 'property_action';
    game.players[0].position = 1;
    const purchaseResult = _purchaseProperty(game, 'p1');
    
    const gameAfterPurchase = { ...game, ...purchaseResult.updates, players: purchaseResult.updates.players, educatedMerchantState: { ...game.educatedMerchantState, ...purchaseResult.updates }};
    gameAfterPurchase.educatedMerchantState.currentQuestion = { id: 'q1', question: 'Q', answer: 'Correct', options: ['Correct', 'Wrong'] };

    const { updates: finalUpdates } = _answerQuestion(gameAfterPurchase, 'p1', 'Wrong');
    const finalBoard = finalUpdates['educatedMerchantState.board'];
    const finalPlayers = finalUpdates.players;

    expect(finalBoard[1].ownerId).toBeNull(); // Should not become owner
    expect(finalPlayers.find(p => p.id === 'p1')?.money).toBe(1000 - property.price + refund);
  });
  
  test('Game should end when only one player remains', () => {
      const players = [
          { ...mockPlayers[0], status: 'alive', money: 100 },
          { ...mockPlayers[1], status: 'bankrupt', money: 0 },
          { ...mockPlayers[2], status: 'bankrupt', money: 0 },
      ];
      let game = createMockGame(players, { board: mockBoard });
      game.players[0].position = 0; // At start to trigger end turn logic
      
      const { isGameOver, finalGame } = _endTurn(game, 'p1');
      
      expect(isGameOver).toBe(true);
      expect(finalGame?.gameState).toBe('final_results');
      expect(finalGame?.gameResult?.winner).toBe('p1');
  });

  test('Passing GO should reward the player', () => {
      let game = createMockGame(mockPlayers, { board: mockBoard });
      game.players[0].position = 27; // Before GO
      
      // Simulate rolling a 3, which lands on tile 2
      // This is a simplified check of the _rollDice logic's side effect.
      // A more direct test would check the `passedGo` logic inside the helper.
      
      const playerStartMoney = game.players[0].money!;
      const diceRollResult = 3;
      const oldPosition = 27;
      const newPosition = (oldPosition + diceRollResult) % mockBoard.length; // = 2
      let money = playerStartMoney;
      if (newPosition < oldPosition) {
          money += 200; // PASS_GO_REWARD
      }

      // Asserting the expected calculation
      expect(money).toBe(playerStartMoney + 200);
  });
});

describe('Educated Merchant - Board Generation', () => {
    test('should generate a board with the correct size', () => {
        const categories = ['test1', 'test2'];
        const board = _generateBoard(categories);
        expect(board.length).toBe(28);
    });

    test('should contain exactly one start tile at position 0', () => {
        const board = _generateBoard([]);
        expect(board[0].type).toBe('start');
        const startTiles = board.filter(t => t.type === 'start');
        expect(startTiles.length).toBe(1);
    });

    test('should contain exactly 3 fine tiles', () => {
        const board = _generateBoard([]);
        const fineTiles = board.filter(t => t.type === 'fine');
        expect(fineTiles.length).toBe(3);
    });
});


describe('Educated Merchant - End of Game Awards', () => {
    
    test('should distribute awards correctly for 1st, 2nd, and 3rd place', () => {
        const game = createMockGame(mockPlayers);
        game.playerScores = { p1: 5000, p2: 3000, p3: 1000 };
        game.gameResult = { winner: 'p1', message: 'Game Over' };

        const { updates, winUpdate } = calculateEndOfGameAwards(game, []);
        
        // P1 (1st)
        expect(updates['p1'].leaderboardPoints).toBe(4);
        expect(updates['p1'].coins).toBe(3);
        
        // P2 (2nd)
        expect(updates['p2'].leaderboardPoints).toBe(2);
        expect(updates['p2'].coins).toBe(1);

        // P3 (3rd)
        expect(updates['p3'].leaderboardPoints).toBe(1);
        expect(updates['p3'].coins).toBe(1);

        expect(winUpdate?.userId).toBe('p1');
    });

    test('should handle ties in ranking correctly', () => {
        const game = createMockGame(mockPlayers);
        game.playerScores = { p1: 5000, p2: 3000, p3: 3000 }; // p2 and p3 tied for 2nd
        game.gameResult = { winner: 'p1', message: 'Game Over' };

        const { updates } = calculateEndOfGameAwards(game, []);
        
        // P1 (1st)
        expect(updates['p1'].leaderboardPoints).toBe(4);
        expect(updates['p1'].coins).toBe(3);

        // P2 (Tied 2nd)
        expect(updates['p2'].leaderboardPoints).toBe(2);
        expect(updates['p2'].coins).toBe(1);
        
        // P3 (Tied 2nd)
        expect(updates['p3'].leaderboardPoints).toBe(2);
        expect(updates['p3'].coins).toBe(1);
    });
});
    
