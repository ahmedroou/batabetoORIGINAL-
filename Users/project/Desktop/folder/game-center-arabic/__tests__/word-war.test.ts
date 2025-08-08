
import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';
import type { Game, Player, WordWarCard, GameResult } from '@/types';

// --- Internal Logic from word-war.ts moved here for testing ---

function revealCardInternal(game: Game, playerId: string, cardIndex: number): { updatedGame: any, gameDataForLeague: Game | null } {
    let updatedGame: any = {};
    let gameDataForLeague: Game | null = null;
    const wwState = game.wordWarState!;
    const cards = [...wwState.cards];
    const card = cards[cardIndex];

    if (card.revealed) return { updatedGame, gameDataForLeague };

    cards[cardIndex].revealed = true;
    updatedGame['wordWarState.cards'] = cards;

    let guessesLeft = wwState.guessesLeft! - 1;
    let turnShouldEnd = false;
    let winner: GameResult | null = null;

    if (card.color === 'assassin') {
        winner = { winner: wwState.turn === 'red' ? 'blue' : 'red', message: 'تم كشف القاتل!' };
    } else if (card.color === 'neutral') {
        turnShouldEnd = true;
    } else if (card.color !== wwState.turn) {
        turnShouldEnd = true;
    }

    const redCardsLeft = cards.filter(c => c.color === 'red' && !c.revealed).length;
    const blueCardsLeft = cards.filter(c => c.color === 'blue' && !c.revealed).length;

    if (redCardsLeft === 0) {
        winner = { winner: 'red', message: 'كشف الفريق الأحمر جميع كلماته!' };
    } else if (blueCardsLeft === 0) {
        winner = { winner: 'blue', message: 'كشف الفريق الأزرق جميع كلماته!' };
    }

    if (winner) {
        updatedGame.gameState = 'board_reveal';
        updatedGame.gameResult = winner;
        gameDataForLeague = { ...game, ...updatedGame };
    } else if (turnShouldEnd || guessesLeft === 0) {
        updatedGame.gameState = 'guide_turn';
        updatedGame['wordWarState.turn'] = wwState.turn === 'red' ? 'blue' : 'red';
        updatedGame['wordWarState.guessesLeft'] = 0;
        updatedGame['wordWarState.currentHint'] = null;
    } else {
        updatedGame['wordWarState.guessesLeft'] = guessesLeft;
    }

    return { updatedGame, gameDataForLeague };
}

function endTurnInternal(game: Game) {
    const updatedGame: any = {};
    const wwState = game.wordWarState!;
    updatedGame.gameState = 'guide_turn';
    updatedGame['wordWarState.turn'] = wwState.turn === 'red' ? 'blue' : 'red';
    updatedGame['wordWarState.guessesLeft'] = 0;
    updatedGame['wordWarState.currentHint'] = null;
    return updatedGame;
}

function startGameInternal(game: Game) {
     const updatedGame: any = {};
     const teamRedPlayers = game.players.filter(p => p.team === 'red');
     const teamBluePlayers = game.players.filter(p => p.team === 'blue');

     updatedGame['wordWarState.guides'] = {
        red: teamRedPlayers[0]?.id,
        blue: teamBluePlayers[0]?.id,
     };
     updatedGame.gameState = 'preparation';
     return updatedGame;
}


// --- Jest Tests ---

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
    const colors: WordWarCard['color'][] = [
        ...Array(9).fill('red'),
        ...Array(8).fill('blue'),
        ...Array(7).fill('neutral'),
        'assassin',
    ];
    const words = Array.from({ length: 25 }, (_, i) => `word${i + 1}`);
    return words.map((text, i) => ({ text, color: colors[i], revealed: false }));
};


describe('Word War - Game Logic', () => {
    let players: Player[];
    let game: Game;

    beforeEach(() => {
        players = [
            createMockPlayer('p1', 'red'), // Guide
            createMockPlayer('p2', 'red'), // Guesser
            createMockPlayer('p3', 'blue'),// Guide
            createMockPlayer('p4', 'blue'),// Guesser
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
        expect(updatedGame['wordWarState.turn']).toBeUndefined(); // Turn doesn't change
        expect(updatedGame.gameState).toBeUndefined(); // gameState doesn't change
    });

    test('should reveal a neutral card and end the turn', () => {
        const cardIndex = 17; // Assuming index 17 is neutral
        const { updatedGame } = revealCardInternal(game, 'p2', cardIndex);

        expect(updatedGame['wordWarState.cards'][cardIndex].revealed).toBe(true);
        expect(updatedGame['wordWarState.turn']).toBe('blue'); // Turn should switch
        expect(updatedGame.gameState).toBe('guide_turn');
    });

    test('should reveal an opponent card and end the turn', () => {
        const cardIndex = 9; // Assuming index 9 is blue
        const { updatedGame } = revealCardInternal(game, 'p2', cardIndex);

        expect(updatedGame['wordWarState.cards'][cardIndex].revealed).toBe(true);
        expect(updatedGame['wordWarState.turn']).toBe('blue');
        expect(updatedGame.gameState).toBe('guide_turn');
    });

    test('should reveal the assassin card and end the game immediately', () => {
        const cardIndex = 24; // Assuming this is the assassin
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
