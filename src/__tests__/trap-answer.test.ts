

import { calculateTrapAnswerScores } from '@/lib/actions/helpers/trap-answer-helpers';
import type { Game, Player, TrapQuestion } from '@/types';
import { calculateEndOfGameAwards } from '@/lib/actions/user/awards';


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
            p1: 'طوكيو', // Correct guess (+2)
            p2: 'نارا',  // Guessed p1's answer, was tricked by p1
            p3: 'سابورو',// Guessed p2's answer, was tricked by p2
            p4: 'هيروشيما'// Guessed p3's answer, was tricked by p3
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses, [], ['طوكيو', 'نارا', 'سابورو', 'هيروشيما', 'فوكوكا']);

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

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses, [], ['طوكيو', 'يوكوهاما', 'كيوتو', 'أوكيناوا', 'جينزا']);

        expect(roundScores['p1'].points).toBe(1); // Alice tricked Dana
        expect(roundScores['p2'].points).toBe(4); // Bob guessed correctly (+2) and tricked Alice and Charlie (+1 each) = 4
        expect(roundScores['p3'].points).toBe(0); // Charlie was tricked
        expect(roundScores['p4'].points).toBe(0); // Dana was tricked
    });

    // Scenario 3: Player votes for their own trap answer and gets penalized.
    test('should penalize a player for voting for their own answer', () => {
        const playerAnswers = { p1: 'كوبي', p2: 'ناغويا', p3: 'تشيبا', p4: 'سaitama' };
        const playerGuesses = {
            p1: 'كوبي', // Alice voted for her own answer, gets -1
            p2: 'طوكيو',
            p3: 'طوكيو',
            p4: 'طوكيو',
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses, [], ['طوكيو', 'كوبي', 'ناغويا', 'تشيبا', 'سaitama']);

        expect(roundScores['p1'].points).toBe(-1); // Penalty for self-vote
        expect(roundScores['p2'].points).toBe(2);
        expect(roundScores['p3'].points).toBe(2);
        expect(roundScores['p4'].points).toBe(2);
    });

    // Scenario 4: A complex round with multiple events.
    test('should correctly calculate scores in a complex scenario', () => {
        const playerAnswers = { p1: 'كيوتو', p2: 'أوساكا', p3: 'كيوتو', p4: 'سيدني' }; // p1 and p3 gave similar answers
        const playerGuesses = {
            p1: 'طوكيو',   // Alice guessed correctly (+2) + Bob's vote (+1) = 3
            p2: 'كيوتو',    // Bob was tricked by both Alice and Charlie
            p3: 'كيوتو',    // Charlie voted for his own similar answer (-1) + Bob's vote (+1) = 0
            p4: 'أوساكا'    // Dana was tricked by Bob
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses, [], ['طوكيو', 'كيوتو', 'أوساكا', 'سيدني']);

        // Alice: Correct guess (+2) + Bob's vote (+1) = 3
        expect(roundScores['p1'].points).toBe(3); 
        // Bob: Tricked Dana (+1) = 1
        expect(roundScores['p2'].points).toBe(1); 
        // Charlie: Voted for own answer (-1) + Bob's vote (+1) = 0
        expect(roundScores['p3'].points).toBe(0);
        // Dana: Was tricked by Bob
        expect(roundScores['p4'].points).toBe(0);
    });
    
    test('should award zero points to a player who times out on guessing and identify them', () => {
        const playerAnswers = { p1: 'إجابة مفخخة', p2: 'إجابة أخرى' };
        const playerGuesses = {
            p1: 'طوكيو',         // p1 guesses correctly
            p2: '__TIMEOUT__'   // p2 times out
        };
        const { roundScores, resultsByAnswer, timedOutGuesserIds } = calculateTrapAnswerScores(
            mockPlayers.slice(0, 2),
            mockQuestion,
            playerAnswers,
            playerGuesses,
            [],
            ['طوكيو', 'إجابة مفخخة', 'إجابة أخرى']
        );

        // p1 gets 2 points for correct guess
        expect(roundScores['p1'].points).toBe(2);
        // p2 gets 0 points for timing out
        expect(roundScores['p2'].points).toBe(0);
        
        // Ensure no guesserId is added for the timeout player in the results
        resultsByAnswer.forEach(ans => {
            expect(ans.guesserIds).not.toContain('p2');
        });
        
        // Ensure the player is correctly added to the timed out list
        expect(timedOutGuesserIds).toContain('p2');
        expect(timedOutGuesserIds).not.toContain('p1');
    });

    test('should handle players who time out on submitting a trap answer', () => {
        const playerAnswers = { 
            p1: 'فخ أليس', // Alice submits a trap
            p2: null,       // Bob times out and submits nothing
            p3: 'فخ تشارلي'
        };
        const playerGuesses = {
            p1: 'طوكيو',       // Alice guesses correctly (+2)
            p2: 'فخ أليس',    // Bob gets tricked by Alice
            p3: 'طوكيو',       // Charlie guesses correctly (+2)
            p4: 'فخ تشارلي' // Dana gets tricked by Charlie
        };

        const { roundScores, resultsByAnswer } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses, [], ['طوكيو', 'فخ أليس', 'فخ تشارلي']);

        // Alice: Correct guess (+2) + Bob's vote (+1) = 3
        expect(roundScores['p1'].points).toBe(3);
        // Bob: Was tricked, gets 0 points.
        expect(roundScores['p2'].points).toBe(0);
        // Charlie: Correct guess (+2) + Dana's vote (+1) = 3
        expect(roundScores['p3'].points).toBe(3);
        // Dana: Was tricked, gets 0 points.
        expect(roundScores['p4'].points).toBe(0);

        // Ensure Bob's (null) answer is not in the final list of options
        const answerTexts = resultsByAnswer.map(r => r.text);
        expect(answerTexts).not.toContain(null);
        expect(answerTexts).toContain('فخ أليس');
        expect(answerTexts).toContain('فخ تشارلي');
    });

    // Test case where a player votes for their own answer AND another player also votes for it.
    test('should handle self-vote penalty and external trick points correctly', () => {
        const playerAnswers = { p1: 'نارا', p2: 'سابورو' };
        const playerGuesses = {
            p1: 'نارا',  // Alice votes for her own answer (-1 point)
            p2: 'نارا',  // Bob votes for Alice's answer (+1 for Alice)
        };

        const { roundScores } = calculateTrapAnswerScores(mockPlayers.slice(0, 2), mockQuestion, playerAnswers, playerGuesses, [], ['طوكيو', 'نارا', 'سابورو']);

        // Alice gets -1 for self-vote and +1 for tricking Bob. Net score = 0
        expect(roundScores['p1'].points).toBe(0);
        expect(roundScores['p1'].breakdown).toContainEqual({ reason: 'صوّت لنفسه', points: -1 });
        expect(roundScores['p1'].breakdown).toContainEqual({ reason: 'خدع Bob', points: 1 });
        
        // Bob was tricked by Alice
        expect(roundScores['p2'].points).toBe(0);
    });

    test('should display all answer options in the results, even dummy ones', () => {
        const playerAnswers = { p1: 'نارا' }; // Alice submits a trap
        const playerGuesses = { 
            p1: 'طوكيو', // Alice guesses correctly
            p2: 'كيوتو', // Bob guesses a dummy answer
            p3: 'أوساكا',// Charlie guesses another dummy answer
            p4: 'نارا'  // Dana guesses Alice's trap
        };
        const displayed = ['طوكيو', 'كيوتو', 'أوساكا', 'نارا'];
        const { resultsByAnswer } = calculateTrapAnswerScores(mockPlayers, mockQuestion, playerAnswers, playerGuesses, [], displayed);
        
        const displayedAnswerTexts = resultsByAnswer.map(r => r.text);
        
        // Check for all expected answers
        expect(displayedAnswerTexts).toContain('طوكيو'); // Correct answer
        expect(displayedAnswerTexts).toContain('كيوتو'); // Dummy answer
        expect(displayedAnswerTexts).toContain('أوساكا'); // Dummy answer
        expect(displayedAnswerTexts).toContain('نارا');   // Player's trap answer
    });
});

describe('Trap Answer Game - End of Game Awards', () => {

    const mockPlayers: Player[] = [
        { id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 0, position: 0 },
        { id: 'p2', name: 'Bob', avatarId: 'a2', status: 'alive', score: 0, position: 0 },
        { id: 'p3', name: 'Charlie', avatarId: 'a3', status: 'alive', score: 0, position: 0 },
        { id: 'p4', name: 'Dana', avatarId: 'a4', status: 'alive', score: 0, position: 0 },
    ];

    test('should distribute awards correctly for 1st, 2nd, and 3rd place', () => {
        const mockGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: {
                p1: 100, // 1st
                p2: 50,  // 2nd
                p3: 25,  // 3rd
                p4: 10   // 4th
            },
            trapAnswerState: {
                settings: { rounds: 10, categories: [], answerTime: 60 }
            },
            gameResult: { winner: 'p1', message: 'Game Over' }
        };

        const { updates, winUpdate } = calculateEndOfGameAwards(mockGame as Game, []);

        expect(updates['p1']?.leaderboardPoints).toBe(3);
        expect(updates['p1']?.coins).toBe(2);
        expect(winUpdate?.userId).toBe('p1');

        expect(updates['p2']?.leaderboardPoints).toBe(2);
        expect(updates['p2']?.coins).toBe(1);
        
        expect(updates['p3']?.leaderboardPoints).toBe(1);
        expect(updates['p3']?.coins).toBe(0);
        
        expect(updates['p4']?.leaderboardPoints).toBe(0);
        expect(updates['p4']?.coins).toBe(0);
    });

    test('should handle ties correctly', () => {
        const mockGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: {
                p1: 100, // 1st
                p2: 50,  // Tied for 2nd
                p3: 50,  // Tied for 2nd
                p4: 10   // 4th
            },
             trapAnswerState: {
                settings: { rounds: 10, categories: [], answerTime: 60 }
            },
            gameResult: { winner: 'p1', message: 'Game Over' }
        };

        const { updates, winUpdate } = calculateEndOfGameAwards(mockGame as Game, []);

        expect(updates['p1'].leaderboardPoints).toBe(3);
        expect(updates['p2'].leaderboardPoints).toBe(2);
        expect(updates['p3'].leaderboardPoints).toBe(2);
        expect(updates['p4'].leaderboardPoints).toBe(0);
        expect(winUpdate?.userId).toBe('p1');
    });

    test('should award special "Cunning Deceiver" bonus point', () => {
         const mockGame: Partial<Game> = {
            gameType: 'trap-answer',
            players: mockPlayers,
            playerScores: {
                p1: 100, // 1st
                p2: 50,  // 2nd
                p3: 25,  // 3rd
                p4: 10,
            },
            trapAnswerState: {
                trickStats: {
                    trickedOthers: { 'p1': ['p2', 'p3', 'p4'] }, // p1 tricked 3 people
                    trickedBy: {}
                },
                settings: { rounds: 10, categories: [], answerTime: 60 }
            },
            gameResult: { winner: 'p1', message: 'Game Over' }
        };

        const { updates, specialAwards } = calculateEndOfGameAwards(mockGame as Game, []);

        // p1 gets 3 points for 1st place + 1 bonus point
        expect(updates['p1'].leaderboardPoints).toBe(3 + 1);
        expect(specialAwards?.cunningDeceiver?.playerId).toBe('p1');
    });
});

describe('Trap Answer Game - Away Player Feature', () => {
    const mockPlayers: Player[] = [{ id: 'p1', name: 'Alice', avatarId: 'a1', status: 'alive', score: 10, position: 0 }];
    const mockQuestion: TrapQuestion = { id: 'q1', question: 'Q', answer: 'A' };

    test('should correctly identify a player who was away during the round', () => {
        const awayPlayerIds = ['p1'];
        
        const { awayPlayerIdsDuringRound } = calculateTrapAnswerScores(
            mockPlayers,
            mockQuestion,
            {},
            {},
            awayPlayerIds,
            []
        );

        expect(awayPlayerIdsDuringRound).toBeDefined();
        expect(awayPlayerIdsDuringRound).toContain('p1');
    });
});

    