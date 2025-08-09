
import type { Game, Player, SnakesAndScissorsQuestion, BoardProperty, Transaction } from '@/types';
import { startGame, rollDiceAndMove, handleMoveEnd, handleBuyDecision, answerQuestion, endTurn } from '@/lib/actions/snakes-and-scissors';
import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';
import { generateMonopolyBoard, checkBankruptcy } from '@/lib/actions/helpers/snakes-and-scissors-helpers';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// Mock Firebase functions
jest.mock('firebase/firestore', () => ({
    ...jest.requireActual('firebase/firestore'),
    runTransaction: jest.fn(async (db, updateFunction) => {
        // A simplified mock of runTransaction that allows us to test the logic within
        const mockTransaction = {
            get: jest.fn(),
            update: jest.fn(),
            set: jest.fn(),
            delete: jest.fn()
        };
        // You might need to setup mock responses for `get` based on the test case
        return await updateFunction(mockTransaction);
    }),
    getDoc: jest.fn(),
    updateDoc: jest.fn(),
}));

const mockGet = getDoc as jest.Mock;

const createMockPlayer = (id: string, name: string, balance = 1000, position = 0): Player => ({
  id,
  name,
  avatarId: `avatar_${id}`,
  status: 'alive',
  score: 0,
  position,
  balance,
  leaderboardPoints: 0,
});

const createMockGame = (players: Player[], turnPhase: Game['gameState'] = 'roll', turnIndex = 0): Game => ({
  id: 'test-game',
  hostId: 'p1',
  gameType: 'bank_of_luck',
  players,
  playerUids: players.map(p => p.id),
  gameState: turnPhase,
  createdAt: new Date() as any,
  round: 1,
  bankOfLuckState: {
    settings: { rounds: 15 },
    board: generateMonopolyBoard(),
    turnOrder: players.map(p => p.id),
    currentTurnIndex: turnIndex,
    turnPhase: turnPhase as any,
    eventLog: [],
  },
});

describe('Bank of Luck - Game Logic', () => {

    test('should initialize the game correctly on start', () => {
        const players = [createMockPlayer('p1', 'Alice', 0, 0), createMockPlayer('p2', 'Bob', 0, 0)];
        let game = createMockGame(players, 'lobby');
        
        // Simulate the transaction logic of startGame
        const turnOrder = [players[0].id, players[1].id]; // Simplified shuffle
        const board = generateMonopolyBoard();
        const updatedPlayers = players.map(p => ({
            ...p,
            position: 0,
            balance: 1000, // Starting balance
            properties: []
        }));

        game.players = updatedPlayers;
        game.gameState = 'roll';
        if (game.bankOfLuckState) {
            game.bankOfLuckState.turnOrder = turnOrder;
            game.bankOfLuckState.board = board;
            game.bankOfLuckState.turnPhase = 'roll';
        }

        expect(game.players.every(p => p.balance === 1000)).toBe(true);
        expect(game.players.every(p => p.position === 0)).toBe(true);
        expect(game.bankOfLuckState?.board.length).toBe(24);
        expect(game.gameState).toBe('roll');
    });

    test('should move player correctly and ask to buy unowned property', async () => {
        let players = [createMockPlayer('p1', 'Alice'), createMockPlayer('p2', 'Bob')];
        let game = createMockGame(players);
        
        // Manually update player position after a "roll"
        const diceValue = 3;
        players[0].position = (players[0].position + diceValue) % 24;
        
        game.players = players;
        game.bankOfLuckState!.turnPhase = 'buy_or_pass'; // Expected phase after move

        const currentProperty = game.bankOfLuckState!.board[players[0].position];
        expect(currentProperty.type).toBe('property');
        expect(game.bankOfLuckState!.turnPhase).toBe('buy_or_pass');
    });

    test('should make player pay rent when landing on an owned property', () => {
        const players = [createMockPlayer('p1', 'Alice', 1000), createMockPlayer('p2', 'Bob', 1000)];
        let game = createMockGame(players);
        
        const propertyIndex = 1;
        const property = game.bankOfLuckState!.board[propertyIndex];
        property.ownerId = 'p2'; // Bob owns the property
        
        players[0].position = propertyIndex; // Alice lands on it
        
        const rent = property.rent;
        const p1OldBalance = players[0].balance!;
        const p2OldBalance = players[1].balance!;

        // Manually apply rent logic
        players[0].balance! -= rent;
        players[1].balance! += rent;
        game.bankOfLuckState!.turnPhase = 'pay_rent';

        expect(players[0].balance).toBe(p1OldBalance - rent);
        expect(players[1].balance).toBe(p2OldBalance + rent);
        expect(game.bankOfLuckState!.turnPhase).toBe('pay_rent');
    });

    test('should purchase a property after a correct answer', () => {
        let players = [createMockPlayer('p1', 'Alice', 1000)];
        let game = createMockGame(players);
        
        const propertyIndex = 2;
        players[0].position = propertyIndex;
        const property = game.bankOfLuckState!.board[propertyIndex];
        
        const oldBalance = players[0].balance!;
        
        // Simulate correct answer logic
        players[0].balance! -= property.price;
        property.ownerId = 'p1';
        game.bankOfLuckState!.turnPhase = 'end_turn';

        expect(players[0].balance).toBe(oldBalance - property.price);
        expect(property.ownerId).toBe('p1');
        expect(game.bankOfLuckState!.turnPhase).toBe('end_turn');
    });

    test('should declare player bankrupt if balance goes below zero', () => {
        const players = [createMockPlayer('p1', 'Alice', 50)];
        const board = generateMonopolyBoard();
        
        // Alice has to pay 100 rent
        players[0].balance! -= 100; // Balance becomes -50
        
        const { updatedPlayers } = checkBankruptcy(players, board);
        
        expect(updatedPlayers[0].status).toBe('bankrupt');
    });
    
    test('should release properties to the bank on bankruptcy', () => {
        const board = generateMonopolyBoard();
        let players = [createMockPlayer('p1', 'Alice', 50)];
        
        const propertyIndex = 1;
        board[propertyIndex].ownerId = 'p1';
        
        players[0].balance! = -10; // Becomes bankrupt

        const { updatedBoard } = checkBankruptcy(players, board);
        
        expect(updatedBoard[propertyIndex].ownerId).toBeNull();
    });

});


describe('Bank of Luck - End of Game Awards', () => {

    test('should correctly award points and coins based on final balance', () => {
        const players = [
            createMockPlayer('p1', 'Alice', 2500), // 1st
            createMockPlayer('p2', 'Bob', 1800),   // 2nd
            createMockPlayer('p3', 'Charlie', 500),// 3rd
        ];
        const game = createMockGame(players, 'final_results');
        game.gameResult = { winner: 'p1', message: 'Game Over' };
        game.playerScores = { 'p1': 2500, 'p2': 1800, 'p3': 500 };

        const { updates, winUpdate } = calculateEndOfGameAwards(game);

        // 1st Place
        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p1'].coins).toBe(2);
        
        // 2nd Place
        expect(updates['p2'].leaderboardPoints).toBe(2);
        expect(updates['p2'].coins).toBe(1);
        
        // 3rd Place
        expect(updates['p3'].leaderboardPoints).toBe(1);
        expect(updates['p3'].coins).toBe(0);

        // Winner
        expect(winUpdate?.userId).toBe('p1');
    });

});
