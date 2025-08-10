

import { calculateTrapAnswerScores } from '@/lib/actions/trap-answer';
import type { Player, TrapQuestion } from '@/types';


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
    
    test('should correctly identify players who did not answer', () => {
        const playerAnswers = { p1: 'إجابة مفخخة' }; // Only p1 answers
        const playerGuesses = {
            p1: 'طوكيو', // p1 guesses correctly
            // p2, p3, p4 do not guess
        };

        const { roundScores, resultsByAnswer, timedOutGuesserIds } = calculateTrapAnswerScores(
            mockPlayers,
            mockQuestion,
            playerAnswers,
            playerGuesses
        );

        // p1 gets 2 points for correct guess
        expect(roundScores['p1'].points).toBe(2);
        // Other players get 0
        expect(roundScores['p2']?.points).toBe(0);
        expect(roundScores['p3']?.points).toBe(0);
        expect(roundScores['p4']?.points).toBe(0);

        // Check if timed out guessers are correctly identified
        // In this test setup, players who don't have an entry in `playerGuesses` are considered timed out.
        // The logic for `timedOutGuesserIds` is based on the `__TIMEOUT__` flag, which is handled in the server action.
        // This test will verify the scoring part, assuming the server action correctly marks non-guessers.
        const correctAns = resultsByAnswer.find(r => r.isCorrect);
        expect(correctAns?.guesserIds).toContain('p1');
        expect(correctAns?.guesserIds).not.toContain('p2');
        expect(correctAns?.guesserIds).not.toContain('p3');
        expect(correctAns?.guesserIds).not.toContain('p4');
    });

    test('should award zero points to a player who times out', () => {
        const playerAnswers = { p1: 'إجابة مفخخة', p2: 'إجابة أخرى' };
        const playerGuesses = {
            p1: 'طوكيو',         // p1 guesses correctly
            p2: '__TIMEOUT__'   // p2 times out
        };
        const { roundScores, resultsByAnswer } = calculateTrapAnswerScores(
            mockPlayers.slice(0, 2),
            mockQuestion,
            playerAnswers,
            playerGuesses
        );

        // p1 gets 2 points for correct guess
        expect(roundScores['p1'].points).toBe(2);
        // p2 gets 0 points for timing out
        expect(roundScores['p2'].points).toBe(0);
        
        // Ensure no guesserId is added for the timeout player
        resultsByAnswer.forEach(ans => {
            expect(ans.guesserIds).not.toContain('p2');
        });
    });

});

    


