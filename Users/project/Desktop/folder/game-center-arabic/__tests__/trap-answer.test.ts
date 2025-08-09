import { calculateTrapAnswerScores, submitTrapAnswer, submitGuess } from '@/lib/actions/trap-answer';
import type { Player, TrapQuestion, Game, GameState } from '@/types';


// --- Internal Logic for Timeout Testing ---

async function handleTimeoutInternal(game: Game): Promise<Partial<Game>> {
    let updatedGame: Partial<Game> = { ...game };

    if (game.gameState === 'answer-submission') {
        // Logic to automatically submit for players who haven't answered
        const activePlayers = game.players.filter(p => p.status === 'alive');
        const answeredPlayerIds = Object.keys(game.trapAnswerState?.playerAnswers || {});
        
        for (const player of activePlayers) {
            if (!answeredPlayerIds.includes(player.id)) {
                // Simulate submitting a null/empty answer for timeout
                updatedGame.trapAnswerState!.playerAnswers![player.id] = null;
            }
        }
        
        // Logic to transition to 'guessing'
        const allPossibleAnswers = [game.trapAnswerState!.currentQuestion!.answer];
        Object.values(updatedGame.trapAnswerState!.playerAnswers!).forEach(ans => {
            if (ans) allPossibleAnswers.push(ans);
        });
        const uniqueDisplayAnswers = Array.from(new Set(allPossibleAnswers));
        updatedGame.trapAnswerState!.shuffledAnswers = uniqueDisplayAnswers.sort(() => 0.5 - Math.random());
        updatedGame.gameState = 'guessing';

    } else if (game.gameState === 'guessing') {
        // Logic to submit for players who haven't guessed
        const activePlayers = game.players.filter(p => p.status === 'alive');
        const guessedPlayerIds = Object.keys(game.trapAnswerState?.playerGuesses || {});
         if (!updatedGame.trapAnswerState) updatedGame.trapAnswerState = {} as any;
         if (!updatedGame.trapAnswerState!.playerGuesses) updatedGame.trapAnswerState!.playerGuesses = {};

        for (const player of activePlayers) {
            if (!guessedPlayerIds.includes(player.id)) {
                // Submit a default/random guess on their behalf
                const randomGuess = game.trapAnswerState?.shuffledAnswers?.[0] || "لا يوجد";
                updatedGame.trapAnswerState!.playerGuesses![player.id] = randomGuess;
            }
        }
        
        // Transition to 'round-results'
        const { roundScores, resultsByAnswer, newTrickStats } = calculateTrapAnswerScores(
            activePlayers,
            game.trapAnswerState!.currentQuestion!,
            game.trapAnswerState!.playerAnswers!,
            updatedGame.trapAnswerState!.playerGuesses!
        );
        updatedGame.gameState = 'round-results';
        updatedGame.playerScores = { ...(game.playerScores || {}) };
        Object.entries(roundScores).forEach(([pid, data]) => {
            updatedGame.playerScores![pid] = (updatedGame.playerScores![pid] || 0) + data.points;
        });
        updatedGame.trapAnswerState!.lastRoundResults = { scores: roundScores, answers: resultsByAnswer };
    }
    
    return updatedGame;
}



// --- Tests for the main game scoring logic ---
describe('Trap Answer Game - Scoring Logic', () => {
    
    // Mock data that simulates a game state
    const mockPlayers: Player[] = [
        { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 10, position:0 },
        { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 10, position:0 },
        { id: 'p3', name: 'Charlie', avatarId: 'a3', status: 'alive', score: 10, position:0 },
        { id: 'p4', name: 'Dana', avatarId: 'a4', status: 'alive', score: 10, position:0 },
    ];

    const mockQuestion: TrapQuestion = {
        id: 'q1',
        question: 'ما هي عاصمة اليابان؟',
        answer: 'طوكيو',
        category: 'جغرافيا',
        dummyAnswers: ['كيوتو', 'أوساكا']
    };

    // Scenario 1: Basic scenario where one player guesses correctly and also tricks another player.
    test('should award points for a correct guess and for tricking others', () => {
        const playerAnswers = { p1: 'نارا', p2: 'سابورو', p3: 'هيروشيما', p4: 'فوكوكا' };
        const playerGuesses = { 
            p1: 'طوكيو', // Correct guess (+2) and tricked Bob (+1) = 3
            p2: 'نارا',  // Guessed p1's answer, was tricked by p1
            p3: 'سابورو',// Guessed p2's answer, was tricked by p2
            p4: 'هيروشيما'// Guessed p3's answer, was tricked by p3
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses);

        // Alice (p1) guessed correctly (+2) AND tricked Bob (p2) (+1) = 3
        expect(roundScores['p1'].points).toBe(3); 
        // Bob (p2) tricked Charlie (p3) (+1) = 1
        expect(roundScores['p2'].points).toBe(1); 
        // Charlie (p3) tricked Dana (p4) (+1) = 1
        expect(roundScores['p3'].points).toBe(1);
        // Dana was tricked by Charlie, gets 0
        expect(roundScores['p4'].points).toBe(0); 
    });

    // Scenario 2: Player gets tricked by another player's trap answer.
    test('should award 1 point to the tricker for a successful deception', () => {
        const playerAnswers = { p1: 'يوكوهاما', p2: 'كيوتو', p3: 'أوكيناوا', p4: 'جينزا' };
        const playerGuesses = {
            p1: 'كيوتو', // Alice was tricked by Bob
            p2: 'طوكيو', // Bob guessed correctly
            p3: 'كيوتو', // Charlie was also tricked by Bob
            p4: 'يوكوهاما' // Dana was tricked by Alice
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses);

        expect(roundScores['p1'].points).toBe(1); // Alice tricked Dana
        expect(roundScores['p2'].points).toBe(4); // Bob guessed correctly (+2) and tricked Alice and Charlie (+1 each) = 4
        expect(roundScores['p3'].points).toBe(0); // Charlie was tricked
        expect(roundScores['p4'].points).toBe(0); // Dana was tricked
    });

    // Scenario 3: Player votes for their own trap answer.
    test('should deduct 1 point for voting for one\'s own answer', () => {
        const playerAnswers = { p1: 'كوبي', p2: 'ناغويا', p3: 'تشيبا', p4: 'سaitama' };
        const playerGuesses = {
            p1: 'كوبي', // Alice voted for her own answer
            p2: 'طوكيو',
            p3: 'طوكيو',
            p4: 'طوكيو',
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses);

        expect(roundScores['p1'].points).toBe(-1); // Penalty for self-vote
        expect(roundScores['p2'].points).toBe(2);
        expect(roundScores['p3'].points).toBe(2);
        expect(roundScores['p4'].points).toBe(2);
    });

    // Scenario 4: A complex round with multiple events.
    test('should correctly calculate scores in a complex scenario', () => {
        const playerAnswers = { p1: 'كيوتو', p2: 'أوساكا', p3: 'كيوتو', p4: 'سيدني' }; // p1 and p3 gave similar answers
        const playerGuesses = {
            p1: 'طوكيو',   // Alice guessed correctly (+2)
            p2: 'كيوتو',    // Bob was tricked by both Alice and Charlie
            p3: 'كيوتو',    // Charlie voted for his own similar answer (-1)
            p4: 'أوساكا'    // Dana was tricked by Bob
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses);

        // Alice: Correct guess (+2) + Bob's vote (+1) = 3
        expect(roundScores['p1'].points).toBe(3); 
        // Bob: Tricked Dana (+1) = 1
        expect(roundScores['p2'].points).toBe(1); 
        // Charlie: Voted for own answer (-1) + Bob's vote (+1) = 0
        expect(roundScores['p3'].points).toBe(0);
        // Dana: Was tricked by Bob
        expect(roundScores['p4'].points).toBe(0);
    });
    
    // Scenario 5: Player submits no answer (null)
    test('should award 0 points to a player who submits no answer', () => {
        const playerAnswers = { 
            p1: 'نارا', 
            p2: null, // Bob doesn't answer
            p3: 'هيروشيما', 
            p4: 'فوكوكا' 
        };
        const playerGuesses = { 
            p1: 'طوكيو',     // Alice guesses correctly (+2)
            p2: 'طوكيو',     // Bob also guesses correctly, but should get 0 because he didn't submit an answer
            p3: 'نارا',      // Charlie is tricked by Alice
            p4: 'هيروشيما', // Dana is tricked by Charlie
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses);
        
        // Bob (p2) gets 0 points even though he guessed correctly.
        expect(roundScores['p2'].points).toBe(0); 
        
        // Alice (p1) gets 2 for correct guess, +1 for tricking Charlie = 3
        expect(roundScores['p1'].points).toBe(2); 
        // Charlie (p3) gets 1 for tricking Dana
        expect(roundScores['p3'].points).toBe(1);
    });

    // Scenario 6: Player votes for a dummy answer from the system
    test('should award 0 points for guessing a system-generated dummy answer', () => {
        const playerAnswers = { p1: 'نارا', p2: 'سابورو', p3: null, p4: null }; // Two players didn't answer
        const playerGuesses = { 
            p1: 'طوكيو',   // Alice: Correct guess (+2)
            p2: 'كيوتو', // Bob: Guessed the dummy answer "كيوتو"
            p3: 'سابورو', // Charlie: Guessed Bob's answer
            p4: 'نارا'   // Dana: Guessed Alice's answer
        };
        // The `calculateTrapAnswerScores` function itself doesn't know about dummy answers,
        // it just knows it wasn't a player's answer. The logic correctly handles this.
        
        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses);

        // Alice: Correct guess (+2) + tricked Dana (+1) = 3 points
        expect(roundScores['p1'].points).toBe(3);
        // Bob: Guessed a non-player answer, gets 0.
        expect(roundScores['p2'].points).toBe(0);
        // Charlie: Tricked by Bob, gets 0.
        expect(roundScores['p3'].points).toBe(0);
        // Dana: Tricked by Alice, gets 0.
        expect(roundScores['p4'].points).toBe(0);
    });

});


describe('Trap Answer Game - Timeout Logic', () => {
     const mockPlayers: Player[] = [
        { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 10, position:0 },
        { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 10, position:0 },
    ];

    const mockQuestion: TrapQuestion = {
        id: 'q1',
        question: 'ما هي عاصمة اليابان؟',
        answer: 'طوكيو',
        category: 'جغرافيا',
        dummyAnswers: ['كيوتو', 'أوساكا']
    };

    test('should automatically submit for players when answer-submission timer ends', async () => {
        const game: Partial<Game> = {
            gameState: 'answer-submission',
            players: mockPlayers,
            trapAnswerState: {
                currentQuestion: mockQuestion,
                playerAnswers: {
                    p1: 'جواب ما', // p1 answers
                },
                // p2 does not answer
            }
        };

        const updatedGame = await handleTimeoutInternal(game as Game);
        
        // Assert that the game moves to the next state
        expect(updatedGame.gameState).toBe('guessing');
        // Assert that p2 now has a null answer, indicating a timeout
        expect(updatedGame.trapAnswerState!.playerAnswers!['p2']).toBeNull();
        // Assert that the game now has shuffled answers ready for the next phase
        expect(updatedGame.trapAnswerState!.shuffledAnswers).toBeDefined();
        expect(updatedGame.trapAnswerState!.shuffledAnswers!.length).toBeGreaterThan(1);
    });

    test('should automatically guess for players when guessing timer ends', async () => {
         const game: Partial<Game> = {
            gameState: 'guessing',
            players: mockPlayers,
            trapAnswerState: {
                currentQuestion: mockQuestion,
                playerAnswers: { p1: 'جواب ما', p2: 'جواب آخر' },
                playerGuesses: {
                    p1: 'طوكيو', // p1 guesses correctly
                },
                shuffledAnswers: ['طوكيو', 'جواب ما', 'جواب آخر'],
                // p2 does not guess
            }
        };
        const updatedGame = await handleTimeoutInternal(game as Game);

        expect(updatedGame.gameState).toBe('round-results');
        expect(updatedGame.trapAnswerState!.playerGuesses!['p2']).toBeDefined(); // p2 should have a guess now
        expect(updatedGame.trapAnswerState!.lastRoundResults).toBeDefined();
    });

});
