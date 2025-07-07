

'use client';

import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import type { Game, ChallengeResult, Player } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';


// --- Puzzle Generation Logic ---

// For FindTheMistake
const generateMistakePattern = () => {
    const start = Math.floor(Math.random() * 10) + 1;
    const increment = Math.floor(Math.random() * 5) + 2;
    const length = 6;
    const sequence = Array.from({ length }, (_, i) => start + i * increment);
    const mistakeIndex = Math.floor(Math.random() * (length -1)) + 1; // not the first one
    const mistakeOffset = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 2) + 1);
    sequence[mistakeIndex] += mistakeOffset;
    if (sequence[mistakeIndex] === sequence[mistakeIndex-1] + increment || sequence[mistakeIndex] === sequence[mistakeIndex-1] - increment) {
      sequence[mistakeIndex] += mistakeOffset * 2;
    }
    return { sequence, mistakeIndex };
};

// For CodeBreaker
const generateCode = (length: number): string[] => {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const code = [];
  while (code.length < length) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    code.push(digits[randomIndex]);
  }
  return code;
};

// For FalseMemory
const itemPool = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍋', '🍍', '🍑', '🍒', '🥝', '🥑', '🍆', '🥕', '🌽', '🌶️'];
const generateMemorySequence = (length: number) => {
    const shuffled = [...itemPool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, length);
};
const getMemoryTestItem = (sequence: string[]) => {
    const shouldBeInSequence = Math.random() > 0.5;
    if (shouldBeInSequence) {
        return { item: sequence[Math.floor(Math.random() * sequence.length)], wasInSequence: true };
    } else {
        const notInSequence = itemPool.filter(item => !sequence.includes(item));
        return { item: notInSequence[Math.floor(Math.random() * notInSequence.length)], wasInSequence: false };
    }
};

// For CipherShift
const ciphers = [
    { type: 'Caesar', shift: 3, hint: 'إزاحة قيصرية بمقدار 3' },
    { type: 'Reverse', hint: 'الكلمة معكوسة' },
];
const words = ['REACT', 'GENKIT', 'FIREBASE', 'CHALLENGE'];
const generateCipher = () => {
    const word = words[Math.floor(Math.random() * words.length)];
    const cipher = ciphers[Math.floor(Math.random() * ciphers.length)];
    let encrypted = '';
    
    if (cipher.type === 'Caesar' && cipher.shift) {
        encrypted = word.split('').map(char => String.fromCharCode(char.charCodeAt(0) + cipher.shift!)).join('');
    } else if (cipher.type === 'Reverse') {
        encrypted = word.split('').reverse().join('');
    }

    return { plaintext: word, encrypted, hint: cipher.hint };
};

// For PathOfSurvival
const generateSurvivalPath = () => {
  const GRID_SIZE = 5;
  const path = [];
  let currentX = GRID_SIZE - 1;
  let currentY = 0;

  path.push({ x: currentX, y: currentY });

  while (currentX > 0 || currentY < GRID_SIZE - 1) {
    const canMoveLeft = currentX > 0;
    const canMoveDown = currentY < GRID_SIZE - 1;
    
    if (!canMoveLeft && !canMoveDown) break;

    const shouldMoveDown = canMoveDown && (Math.random() > 0.5 || !canMoveLeft);

    if (shouldMoveDown) {
      currentY++;
    } else {
      currentX--;
    }
    path.push({ x: currentX, y: currentY });
  }
  return path;
};


function getInitialChallengeState(challengeId: string | undefined): Game['challengeState'] {
    const state: Game['challengeState'] = { results: [] };
    
    switch (challengeId) {
        case 'find_the_mistake':
             state.puzzles = Array.from({ length: 5 }, () => generateMistakePattern());
            break;
        case 'code_breaker':
            state.secretCode = generateCode(4);
            break;
        case 'false_memory':
            const sequence = generateMemorySequence(6);
            state.puzzle = { sequence, testItem: getMemoryTestItem(sequence) };
            break;
        case 'cipher_shift':
            state.puzzle = generateCipher();
            break;
        case 'path_of_survival':
            state.puzzle = generateSurvivalPath();
            break;
    }
    return state;
}


export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const currentGame = gameDoc.data() as Game;

        const activePlayers = currentGame.players.filter(p => p.status === 'alive');
        const teamAPlayers = activePlayers.filter(p => p.team === 'A');
        const teamBPlayers = activePlayers.filter(p => p.team === 'B');
        const maxTeamSize = Math.ceil(activePlayers.length / 2);

        if (team === 'A' && teamAPlayers.length >= maxTeamSize && !teamAPlayers.some(p => p.id === playerId)) throw new Error("الفريق الأزرق ممتلئ.");
        if (team === 'B' && teamBPlayers.length >= maxTeamSize && !teamBPlayers.some(p => p.id === playerId)) throw new Error("الفريق الوردي ممتلئ.");

        const playerIndex = currentGame.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found.");
        
        const updatedPlayers = [...currentGame.players];
        updatedPlayers[playerIndex].team = team;
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can start the game.");

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (activePlayers.some(p => !p.team)) throw new Error("يجب على جميع اللاعبين اختيار فريق أولاً.");
        
        const teamA = activePlayers.filter(p => p.team === 'A');
        const teamB = activePlayers.filter(p => p.team === 'B');
        if (teamA.length !== teamB.length) throw new Error("يجب أن تكون الفرق متوازنة.");
        if (teamA.length === 0) throw new Error("لا يمكن بدء اللعبة بفرق فارغة.");

        const shuffledChallenges = [...GENIUS_CHALLENGES].sort(() => 0.5 - Math.random());
        const challengeOrder = shuffledChallenges.map(c => c.id);

        const firstChallengeId = challengeOrder[0];
        const initialChallengeState = getInitialChallengeState(firstChallengeId);

        transaction.update(gameRef, {
            gameState: 'challenge_intro',
            challengeOrder,
            currentChallengeIndex: 0,
            teamScores: { A: 0, B: 0 },
            challengeState: initialChallengeState,
        });
    });
}

export async function submitChallengeResult(gameId: string, playerId: string, result: Omit<ChallengeResult, 'playerId' | 'team'>) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            
            const game = gameDoc.data() as Game;

            if (game.gameState !== 'challenge_active') {
                return;
            }

            const player = game.players.find(p => p.id === playerId);
            if (!player || !player.team) throw new Error("Player or team not found for this action.");

            const currentResults = game.challengeState?.results || [];
            
            if (currentResults.some(r => r.playerId === playerId)) {
                return;
            }

            const newResult: ChallengeResult = { playerId, team: player.team, ...result };
            const updatedResults = [...currentResults, newResult];
            
            const newChallengeState = {
                ...(game.challengeState || {}),
                results: updatedResults,
            };

            const activePlayers = game.players.filter(p => p.status === 'alive');
            
            if (updatedResults.length >= activePlayers.length) {
                const teamAPlayersCount = activePlayers.filter(p => p.team === 'A').length;
                const teamBPlayersCount = activePlayers.filter(p => p.team === 'B').length;

                const sortedResults = updatedResults
                    .filter(r => r.isCorrect)
                    .sort((a, b) => a.time - b.time);
                
                const currentScores = game.teamScores || { A: 0, B: 0 };
                const newScores = { ...currentScores };

                sortedResults.forEach((res, index) => {
                    const teamSize = res.team === 'A' ? teamAPlayersCount : teamBPlayersCount;
                    const points = Math.max(0, teamSize - index);

                    if (points > 0) {
                        newScores[res.team] = (newScores[res.team] || 0) + points;
                    }
                });

                transaction.update(gameRef, { 
                    challengeState: newChallengeState,
                    teamScores: newScores,
                    gameState: 'challenge_results',
                });
            } else {
                transaction.update(gameRef, { 
                    'challengeState.results': updatedResults 
                });
            }
        });
    } catch (error) {
        console.error("Error submitting challenge result:", error);
        throw new Error("Failed to submit your result. Please try again.");
    }
}

export async function nextChallenge(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only host can proceed.");

        const nextIndex = (game.currentChallengeIndex || 0) + 1;
        
        if (nextIndex >= (game.challengeOrder?.length || 0)) {
            let winner: Game['gameResult']['winner'] = 'تعادل';
            let message = "انتهت المواجهة بالتعادل!";
            const teamAScore = game.teamScores?.A || 0;
            const teamBScore = game.teamScores?.B || 0;

            if (teamAScore > teamBScore) {
                winner = 'الفريق الأزرق';
                message = "الفريق الأزرق يسحق الفريق الوردي!";
            } else if (teamBScore > teamAScore) {
                winner = 'الفريق الأحمر';
                message = "الفريق الوردي يتغلب على الفريق الأزرق!";
            }

            transaction.update(gameRef, { 
                gameState: 'final_results',
                gameResult: { winner, message }
            });
        } else {
            const nextChallengeId = game.challengeOrder?.[nextIndex];
            const initialChallengeState = getInitialChallengeState(nextChallengeId);
            
            transaction.update(gameRef, {
                currentChallengeIndex: nextIndex,
                gameState: 'challenge_intro',
                challengeState: initialChallengeState,
            });
        }
    });
}
