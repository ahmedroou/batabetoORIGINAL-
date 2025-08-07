

'use server';

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    Timestamp,
    collection,
    query,
    getDocs,
    where,
    deleteField,
    increment,
    updateDoc,
} from 'firebase/firestore';
import type { Game, Player, SnakesAndScissorsQuestion, BoardSquare } from '@/types';
import { updateLeagueScoresForGameEnd } from './user';


function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

function generateBoard(boardSize: number): BoardSquare[] {
    const board: BoardSquare[] = Array.from({ length: boardSize }, () => ({ type: 'normal' }));
    const numSnakes = Math.floor(boardSize / 12);
    const numLadders = Math.floor(boardSize / 12);

    const occupied = new Set<number>();
    occupied.add(1);
    occupied.add(boardSize);

    // Place snakes
    for (let i = 0; i < numSnakes; i++) {
        let start, end;
        do {
            start = Math.floor(Math.random() * (boardSize - 11)) + 10;
            end = Math.floor(Math.random() * (start - 5)) + 1;
        } while (occupied.has(start) || occupied.has(end));
        
        occupied.add(start);
        occupied.add(end);
        board[start - 1] = { type: 'snake', to: end };
    }

    // Place ladders
    for (let i = 0; i < numLadders; i++) {
        let start, end;
        do {
            start = Math.floor(Math.random() * (boardSize - 15)) + 2;
            end = start + Math.floor(Math.random() * (boardSize - start - 5)) + 5;
        } while (occupied.has(start) || occupied.has(end) || end >= boardSize);

        occupied.add(start);
        occupied.add(end);
        board[start - 1] = { type: 'ladder', to: end };
    }

    return board;
}


export async function updateGameSettings(gameId: string, hostId: string, settings: Partial<Game['snakesAndScissorsState']['settings']>) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, {
            'snakesAndScissorsState.settings': { ...game.snakesAndScissorsState?.settings, ...settings }
        });
    });
}


export async function startGame(gameId: string, hostId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");

        const turnOrder = shuffle(game.players.map(p => p.id));
        
        const trackLength = game.snakesAndScissorsState?.settings?.trackLength || 'medium';
        let boardSize = 50;
        if (trackLength === 'short') boardSize = 30;
        if (trackLength === 'long') boardSize = 80;

        const board = generateBoard(boardSize);

        transaction.update(gameRef, {
            gameState: 'category_selection',
            round: 1,
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
            players: game.players.map(p => ({ ...p, position: 0 })),
            'snakesAndScissorsState.turnOrder': turnOrder,
            'snakesAndScissorsState.currentTurnIndex': 0,
            'snakesAndScissorsState.board': board, 
            'snakesAndScissorsState.turnPhase': 'category_selection',
            'snakesAndScissorsState.settings.boardSize': boardSize,
        });
    });
}


export async function selectCategory(gameId: string, playerId: string, category: string): Promise<void> {
    const q = query(collection(db, "snakes_and_scissors_questions"), where("category", "==", category));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        throw new Error(`لا توجد أسئلة في قسم "${category}".`);
    }
    const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<SnakesAndScissorsQuestion, 'id'> }));
    const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const turnOrder = game.snakesAndScissorsState?.turnOrder || [];
        const currentTurnIndex = game.snakesAndScissorsState?.currentTurnIndex || 0;
        if (turnOrder[currentTurnIndex] !== playerId) {
            throw new Error("ليس دورك لاختيار الفئة.");
        }
        
        transaction.update(gameRef, {
            'snakesAndScissorsState.turnPhase': 'question',
            'snakesAndScissorsState.questionState': {
                question: randomQuestion,
                answeredBy: {},
            },
            'snakesAndScissorsState.timerEndsAt': Timestamp.fromMillis(Date.now() + 20 * 1000), 
        });
    });
}

export async function answerQuestion(gameId: string, playerId: string, answer: string): Promise<{ success: boolean; error?: string }> {
    return runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const ssState = game.snakesAndScissorsState;
        if (ssState?.turnPhase !== 'question') return { success: false, error: "ليست مرحلة الإجابة على الأسئلة." };

        const answeredBy = ssState.questionState?.answeredBy || {};
        if (answeredBy[playerId]) return { success: false, error: 'لقد أجبت بالفعل.' };

        const question = ssState.questionState?.question;
        if (!question) throw new Error("Question not found.");

        const isCorrect = question.correctAnswer === answer;
        
        const updatedAnsweredBy = {
            ...answeredBy,
            [playerId]: { answer, isCorrect }
        };

        const updateData: any = {
            'snakesAndScissorsState.questionState.answeredBy': updatedAnsweredBy,
        };
        
        const currentTurnPlayerId = ssState.turnOrder[ssState.currentTurnIndex];
        if (playerId === currentTurnPlayerId) {
            if (isCorrect) {
                 updateData['snakesAndScissorsState.turnPhase'] = 'movement';
                 updateData['snakesAndScissorsState.timerEndsAt'] = deleteField();
            } else {
                // If incorrect, move to next player's turn
                const newTurnIndex = (ssState.currentTurnIndex + 1) % ssState.turnOrder.length;
                updateData['snakesAndScissorsState.currentTurnIndex'] = newTurnIndex;
                updateData['snakesAndScissorsState.turnPhase'] = 'category_selection';
                updateData['snakesAndScissorsState.questionState'] = deleteField();
            }
        }
        
        transaction.update(gameRef, updateData);
        return { success: true };
    }).catch(e => ({ success: false, error: e.message }));
}

async function handleGameEnd(transaction: any, gameRef: any, game: Game, winners: Player[]) {
    const winnerIds = winners.map(w => w.id);
    const gameResult = { winner: winnerIds.join(', '), message: `الفائزون هم: ${winners.map(w => w.name).join(', ')}!` };

    transaction.update(gameRef, {
        gameState: 'final_results',
        gameResult: gameResult,
    });
    
    // Update scores in a separate step if needed
    const batch = writeBatch(db);
    for (const winner of winners) {
        const userRef = doc(db, 'users', winner.id);
        batch.update(userRef, {
            leaderboardPoints: increment(3),
            coins: increment(2),
            [`winCounts.${game.gameType}`]: increment(1)
        });
    }
    await batch.commit();

    // Update league scores
    await updateLeagueScoresForGameEnd({ ...game, gameResult });
}

export async function rollDice(gameId: string, playerId: string): Promise<void> {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");

        const game = gameDoc.data() as Game;
        const turnPhase = game.snakesAndScissorsState?.turnPhase;
        if (turnPhase !== 'movement') return;
        if (game.snakesAndScissorsState?.movementState?.isRolling) return;

        const diceValue = Math.floor(Math.random() * 6) + 1;

        transaction.update(gameRef, {
            'snakesAndScissorsState.movementState': {
                isRolling: true,
                diceValue: diceValue,
            }
        });

        setTimeout(() => {
            movePlayer(gameId, playerId, diceValue);
        }, 2500); 
    });
}

async function movePlayer(gameId: string, playerId: string, steps: number) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const ssState = game.snakesAndScissorsState!;

        let updatedPlayers = [...game.players];
        const playerIndex = updatedPlayers.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return;

        const player = updatedPlayers[playerIndex];
        let newPosition = (player.position || 0) + steps;
        
        const board = ssState.board;
        const boardSize = ssState.settings.boardSize;

        if (newPosition < boardSize) {
            const boardSquare = board[newPosition - 1];
            if (boardSquare && (boardSquare.type === 'snake' || boardSquare.type === 'ladder') && boardSquare.to) {
                newPosition = boardSquare.to;
            }
        }
        
        updatedPlayers[playerIndex].position = Math.min(newPosition, boardSize);
        
        const playersOnSameTile = updatedPlayers.filter(p => p.id !== playerId && p.position === updatedPlayers[playerIndex].position && p.position !== 0);

        if (playersOnSameTile.length > 0) {
            const opponent = playersOnSameTile[0]; // For now, handle collision with the first player found
            const questionsCol = collection(db, "snakes_and_scissors_questions");
            const snapshot = await getDocs(questionsCol);
            const allQuestions = snapshot.docs.map(doc => doc.data() as SnakesAndScissorsQuestion);
            const randomQuestion = allQuestions[Math.floor(Math.random() * allQuestions.length)];

            transaction.update(gameRef, {
                players: updatedPlayers,
                'snakesAndScissorsState.turnPhase': 'rps_round',
                'snakesAndScissorsState.rpsState': {
                    challengerId: playerId,
                    opponentId: opponent.id,
                    question: randomQuestion,
                    answers: {},
                }
            });
            return;
        }

        const currentTurnIndex = ssState.currentTurnIndex;
        const isLastPlayerOfRound = currentTurnIndex === ssState.turnOrder.length - 1;
        
        const finishedPlayers = updatedPlayers.filter(p => p.position >= boardSize);

        if (finishedPlayers.length > 0 && isLastPlayerOfRound) {
            await handleGameEnd(transaction, gameRef, { ...game, players: updatedPlayers }, finishedPlayers);
            return;
        }
        
        const newTurnIndex = (ssState.currentTurnIndex + 1) % ssState.turnOrder.length;

        transaction.update(gameRef, {
            players: updatedPlayers,
            'snakesAndScissorsState.currentTurnIndex': newTurnIndex,
            'snakesAndScissorsState.turnPhase': 'category_selection',
            'snakesAndScissorsState.questionState': deleteField(),
            'snakesAndScissorsState.movementState': deleteField(),
        });
    });
}


export async function answerRpsQuestion(gameId: string, playerId: string, answer: string) {
    return runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const ssState = game.snakesAndScissorsState!;
        const rpsState = ssState.rpsState;

        if (ssState.turnPhase !== 'rps_round' || !rpsState) {
            throw new Error("ليس الآن وقت التحدي.");
        }

        const isCorrect = rpsState.question.correctAnswer === answer;
        const updatedAnswers = { ...rpsState.answers, [playerId]: isCorrect };

        transaction.update(gameRef, {
            'snakesAndScissorsState.rpsState.answers': updatedAnswers
        });
        
        // Check if both players have answered
        if (updatedAnswers[rpsState.challengerId] !== undefined && updatedAnswers[rpsState.opponentId] !== undefined) {
            const challengerCorrect = updatedAnswers[rpsState.challengerId];
            const opponentCorrect = updatedAnswers[rpsState.opponentId];
            
            let updatedPlayers = [...game.players];
            let nextPhase: 'category_selection' | 'rps_round' = 'category_selection';
            let newRpsState: any = deleteField();
            
            if (challengerCorrect && !opponentCorrect) {
                const opponentIndex = updatedPlayers.findIndex(p => p.id === rpsState.opponentId);
                if (opponentIndex !== -1) {
                    updatedPlayers[opponentIndex].position = Math.max(0, (updatedPlayers[opponentIndex].position || 0) - 3);
                }
            } else if (!challengerCorrect && opponentCorrect) {
                const challengerIndex = updatedPlayers.findIndex(p => p.id === rpsState.challengerId);
                if (challengerIndex !== -1) {
                    updatedPlayers[challengerIndex].position = Math.max(0, (updatedPlayers[challengerIndex].position || 0) - 3);
                }
            } else { // Both correct or both wrong -> new question
                 const questionsCol = collection(db, "snakes_and_scissors_questions");
                 const snapshot = await getDocs(questionsCol);
                 const allQuestions = snapshot.docs.map(doc => doc.data() as SnakesAndScissorsQuestion);
                 const newRandomQuestion = allQuestions[Math.floor(Math.random() * allQuestions.length)];
                 nextPhase = 'rps_round';
                 newRpsState = {
                     ...rpsState,
                     question: newRandomQuestion,
                     answers: {}, // Reset answers for new question
                 };
            }
            
            const newTurnIndex = (ssState.currentTurnIndex + 1) % ssState.turnOrder.length;
            
            transaction.update(gameRef, {
                players: updatedPlayers,
                'snakesAndScissorsState.currentTurnIndex': newTurnIndex,
                'snakesAndScissorsState.turnPhase': nextPhase,
                'snakesAndScissorsState.rpsState': newRpsState,
            });
        }
        return { success: true };
    });
}
