import { revealCardInternal, endTurnInternal, startGameInternal } from '@/lib/actions/word-war';
import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';
import type { Game, Player, WordWarCard } from '@/types';

// Mock data creation helpers
const createMockPlayer = (id: string, team: 'red' | 'blue'): Player => ({
  id,
  name: `Player ${id}`,
  avatarId: 'avatar.png',
  status: 'alive',
  team,
  leaderboardPoints: 0,
  score: 0,
  position: 0,
});

const createMockCards = (): WordWarCard[] => {
    // 8 red, 7 blue, 7 neutral, 1 assassin, 2 red (total 9), 1 blue (total 8)
    const colors: WordWarCard['color'][] = [
        ...Array(8).fill('red'),
        ...Array(7).fill('blue'),
        ...Array(7).fill('neutral'),
        'assassin',
    ];
    // Add one extra for the starting team
    colors.push('red'); 

    const words = Array.from({ length: 23 }, (_, i) => `word${i + 1}`);
    return words.map((text, i) => ({ text, color: colors[i], revealed: false }));
};


describe('Word War - Game Logic', () => {
    let players: Player[];
    let game: Game;

    beforeEach(() => {
        players = [
            createMockPlayer('p1', 'red'),
            createMockPlayer('p2', 'red'),
            createMockPlayer('p3', 'blue'),
            createMockPlayer('p4', 'blue'),
        ];
        game = {
            id: 'test-game',
            hostId: 'p1',
            gameType: 'word_war',
            players,
            playerUids: players.map(p => p.id),
            gameState: 'guesser_turn',
            createdAt: new Date() as any,
            wordWarState: {
                settings: { turnTime: 60 },
                cards: createMockCards(),
                turn: 'red',
                guides: { red: 'p1', blue: 'p3' },
                currentHint: { word: 'test', count: 2 },
                guessesLeft: 2,
            },
        };
    });

    test('should reveal a correct card and continue the turn', () => {
        const cardIndex = 0; // Assuming the first card is red
        const { updatedGame } = revealCardInternal(game, 'p2', cardIndex);
        
        expect(updatedGame['wordWarState.cards'][cardIndex].revealed).toBe(true);
        expect(updatedGame['wordWarState.guessesLeft']).toBe(1);
        expect(updatedGame['wordWarState.turn']).toBe('red'); // Turn doesn't change
        expect(updatedGame.gameState).toBe('guesser_turn');
    });

    test('should reveal a neutral card and end the turn', () => {
        const cardIndex = 15; // Assuming index 15 is neutral
        game.wordWarState!.cards[cardIndex].color = 'neutral';
        const { updatedGame } = revealCardInternal(game, 'p2', cardIndex);

        expect(updatedGame['wordWarState.cards'][cardIndex].revealed).toBe(true);
        expect(updatedGame['wordWarState.turn']).toBe('blue'); // Turn should switch
        expect(updatedGame.gameState).toBe('guide_turn');
    });

    test('should reveal an opponent card and end the turn', () => {
        const cardIndex = 8; // Assuming index 8 is blue
        const { updatedGame } = revealCardInternal(game, 'p2', cardIndex);

        expect(updatedGame['wordWarState.cards'][cardIndex].revealed).toBe(true);
        expect(updatedGame['wordWarState.turn']).toBe('blue');
        expect(updatedGame.gameState).toBe('guide_turn');
    });

    test('should reveal the assassin card and end the game immediately', () => {
        const cardIndex = 22; // Assuming this is the assassin
        game.wordWarState!.cards[cardIndex].color = 'assassin';
        const { updatedGame, gameDataForLeague } = revealCardInternal(game, 'p2', cardIndex);

        expect(updatedGame.gameState).toBe('board_reveal');
        expect(updatedGame.gameResult).toBeDefined();
        expect(updatedGame.gameResult?.winner).toBe('blue'); // The other team wins
        expect(gameDataForLeague).not.toBeNull();
    });
    
    test('should end the game when a team reveals all their cards', () => {
        // Reveal all but one red card
        for(let i = 1; i < 9; i++) {
             game.wordWarState!.cards[i].revealed = true;
        }

        const lastRedCardIndex = 0;
        const { updatedGame, gameDataForLeague } = revealCardInternal(game, 'p2', lastRedCardIndex);
        
        expect(updatedGame.gameState).toBe('board_reveal');
        expect(updatedGame.gameResult).toBeDefined();
        expect(updatedGame.gameResult?.winner).toBe('red');
        expect(gameDataForLeague).not.toBeNull();
    });

});


describe('Word War - End of Game Awards', () => {
    test('should correctly award points and coins to the winning team', () => {
        const players: Player[] = [
            createMockPlayer('p1', 'red'), createMockPlayer('p2', 'red'),
            createMockPlayer('p3', 'blue'), createMockPlayer('p4', 'blue'),
        ];
        const mockGame: Partial<Game> = {
            gameType: 'word_war',
            players: players,
            playerScores: { p1: 10, p2: 12, p3: 5, p4: 8 },
            gameResult: { winner: 'red', message: 'Red team wins!' }
        };

        const { updates, winUpdate } = calculateEndOfGameAwards(mockGame as Game);

        // --- Red team (winners) get awards ---
        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p1'].coins).toBe(2);
        expect(updates['p2'].leaderboardPoints).toBe(3);
        expect(updates['p2'].coins).toBe(2);
        
        // --- Blue team (losers) get no awards ---
        expect(updates['p3'].leaderboardPoints).toBe(0);
        expect(updates['p3'].coins).toBe(0);
        expect(updates['p4'].leaderboardPoints).toBe(0);
        expect(updates['p4'].coins).toBe(0);
        
        // Win counts are not handled by this function for team games
        expect(winUpdate).toBeNull();
    });
});
