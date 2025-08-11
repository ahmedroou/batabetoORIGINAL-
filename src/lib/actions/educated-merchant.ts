

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, collection, getDocs, query, updateDoc, arrayUnion, increment, FieldValue, deleteField, where, limit, getDoc, setDoc } from 'firebase/firestore';
import type { Game, Player, Property, EducatedMerchantQuestion, GameState } from '@/types';
import { shuffle } from './helpers';

const BOARD_SIZE = 28;
const STARTING_BALANCE = 1000;
const BASE_PROPERTY_PRICE = 100;
const MAX_PROPERTY_PRICE = 500;
const PRICE_INCREMENT = 25;
const PASS_START_BONUS = 200;
const QUESTION_TIME_SECONDS = 25;


async function getAvailableCategories(): Promise<string[]> {
    const settingsDoc = await getDoc(doc(db, 'game_settings', 'educated_merchant_categories'));
    if (settingsDoc.exists() && settingsDoc.data().list) {
        return settingsDoc.data().list;
    }
    return []; // Return empty array if no categories are set up
}

async function fetchRandomQuestionForCategory(category: string): Promise<EducatedMerchantQuestion | null> {
    const questionsCol = collection(db, "trap_answer_questions");
    const randomKey = Math.random();
    
    const q1 = query(questionsCol, where("category", "==", category), where("randomKey", ">=", randomKey), limit(1));
    let snapshot = await getDocs(q1);

    if (snapshot.empty) {
        const q2 = query(questionsCol, where("category", "==", category), where("randomKey", "<", randomKey), limit(1));
        snapshot = await getDocs(q2);
    }
    
    if (snapshot.empty) {
        console.warn(`No questions found for category: ${category}`);
        return null;
    }

    const docData = snapshot.docs[0].data();
    const correctAnswer = docData.answer;
    
    const dummyAnswers = Array.isArray(docData.dummyAnswers) && docData.dummyAnswers.length > 0 
        ? docData.dummyAnswers 
        : ['بديل ١', 'بديل ٢', 'بديل ٣'];
    
    const options = shuffle([correctAnswer, ...shuffle(dummyAnswers).slice(0, 3)]);

    return {
        id: snapshot.docs[0].id,
        question: docData.question,
        options,
        correctAnswer,
        category: docData.category
    };
}


function generateBoard(categories: string[]): Property[] {
    const board: Property[] = [];
    if(categories.length === 0) return [];
    
    const propertyPrices = Array.from({ length: (MAX_PROPERTY_PRICE - BASE_PROPERTY_PRICE) / PRICE_INCREMENT + 1 }, (_, i) => BASE_PROPERTY_PRICE + i * PRICE_INCREMENT);
    const shuffledPrices = shuffle(propertyPrices);

    for (let i = 0; i < BOARD_SIZE; i++) {
        if (i === 0) {
            board.push({ id: i, type: 'start', name: 'نقطة البداية', category: 'special', price: 0, rent: 0, ownerId: null });
        } else if (i === 7) {
             board.push({ id: i, type: 'fine', name: 'غرامة', category: 'special', price: 0, rent: 0, ownerId: null, fineAmount: 50 });
        } else if (i === 21) {
             board.push({ id: i, type: 'fine', name: 'غرامة كبيرة', category: 'special', price: 0, rent: 0, ownerId: null, fineAmount: 100 });
        } else {
             const category = categories[i % categories.length] || 'عام';
             const price = shuffledPrices[i % shuffledPrices.length] || BASE_PROPERTY_PRICE;
             board.push({ id: i, type: 'property', name: `عقار ${i}`, category, price, rent: Math.floor(price * 0.25), ownerId: null });
        }
    }
    return board;
}


export async function startGame(gameId: string, hostId: string): Promise<void> {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return;
        if (game.players.length < 2) throw new Error("The game requires at least 2 players.");
        
        const availableCategories = await getAvailableCategories();
        if (availableCategories.length === 0) {
            throw new Error("لا توجد فئات أسئلة متاحة. يرجى إضافتها من لوحة تحكم الأدمن.");
        }
        
        const board = generateBoard(availableCategories);
        const turnOrder = shuffle(game.players.map(p => p.id));
        const initialBalances = game.players.reduce((acc, p) => ({ ...acc, [p.id]: STARTING_BALANCE }), {});

        transaction.update(gameRef, {
            gameState: 'rolling',
            'educatedMerchantState.board': board,
            'educatedMerchantState.turnOrder': turnOrder,
            'educatedMerchantState.currentTurnIndex': 0,
            'educatedMerchantState.activityLog': ["بدأت اللعبة!"],
            playerScores: initialBalances,
            'players': game.players.map(p => ({ ...p, position: 0, bankruptAt: null, status: 'alive' })),
        });
    });
}

export async function rollDice(gameId: string, playerId: string): Promise<{ success: boolean; diceResult?: number; error?: string }> {
    const gameRef = doc(db, 'games', gameId);
    let diceResult = 0;
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            const es = game.educatedMerchantState;
            if (game.gameState !== 'rolling' || es?.turnOrder[es.currentTurnIndex] !== playerId) {
                throw new Error("ليس دورك لرمي النرد.");
            }

            diceResult = Math.floor(Math.random() * 5) + 1;
            
            const playerIndex = game.players.findIndex(p => p.id === playerId);
            if(playerIndex === -1) throw new Error("Player not found");
            
            let newActivityLog = [...(es.activityLog || [])];
            newActivityLog.push(`${game.players[playerIndex].name} رمى النرد وحصل على ${diceResult}.`);

            transaction.update(gameRef, {
                gameState: 'movement',
                'educatedMerchantState.lastDiceRoll': diceResult,
                'educatedMerchantState.activityLog': newActivityLog
            });
        });
        
        return { success: true, diceResult };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function handlePropertyAction(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        // --- 1. READ PHASE ---
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const es = game.educatedMerchantState;
        if (!es) throw new Error("Game state is not initialized.");

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        const player = game.players[playerIndex];
        if (!player) throw new Error("Player not found in game.");

        const oldPosition = player.position;
        const newPosition = (oldPosition + (es.lastDiceRoll || 0)) % BOARD_SIZE;
        const property = es.board.find(p => p.id === newPosition);
        if (!property) throw new Error("Property not found on board.");

        let ownerDoc: any = null;
        let ownerData: UserProfile | null = null;
        if (property.type === 'property' && property.ownerId && property.ownerId !== playerId) {
            ownerDoc = await transaction.get(doc(db, 'users', property.ownerId));
            if (ownerDoc.exists()) {
                ownerData = ownerDoc.data() as UserProfile;
            }
        }
        // --- END READ PHASE ---

        // --- 2. LOGIC PHASE (PREPARE UPDATES) ---
        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].position = newPosition;

        let newActivityLog = [...(es.activityLog || [])];
        let updatedBalances = { ...(game.playerScores || {}) };
        
        const passedStart = (oldPosition + (es.lastDiceRoll || 0)) >= BOARD_SIZE;

        if (passedStart) {
            updatedBalances[playerId] = (updatedBalances[playerId] || 0) + PASS_START_BONUS;
            newActivityLog.push(`${player.name} مر بنقطة البداية وحصل على ${PASS_START_BONUS} د.ع.`);
        }

        // --- 3. WRITE PHASE ---
        transaction.update(gameRef, { players: updatedPlayers, playerScores: updatedBalances });

        if (property.type === 'start') {
            await endTurn(gameId, playerId, transaction);
            return;
        }

        if (property.type === 'fine') {
            const fine = property.fineAmount || 0;
            newActivityLog.push(`${player.name} دفع غرامة بقيمة ${fine} د.ع.`);
            if ((updatedBalances[playerId] || 0) < fine) {
                updatedPlayers[playerIndex].status = 'bankrupt';
                updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
                newActivityLog.push(`${player.name} أفلس!`);
                transaction.update(gameRef, {
                    players: updatedPlayers,
                    'educatedMerchantState.activityLog': newActivityLog,
                    [`playerScores.${playerId}`]: 0,
                });
            } else {
                 transaction.update(gameRef, { 
                    [`playerScores.${playerId}`]: increment(-fine),
                    'educatedMerchantState.activityLog': newActivityLog,
                });
            }
            await endTurn(gameId, playerId, transaction);
            return;
        }

        if (property.type === 'property') {
            if (property.ownerId && property.ownerId !== playerId && ownerData) {
                const rent = property.rent;
                newActivityLog.push(`${player.name} دفع إيجارًا بقيمة ${rent} د.ع إلى ${ownerData.name}.`);

                if ((updatedBalances[playerId] || 0) < rent) {
                    updatedPlayers[playerIndex].status = 'bankrupt';
                    updatedPlayers[playerIndex].bankruptAt = Timestamp.now();
                    newActivityLog.push(`${player.name} أفلس!`);
                    transaction.update(gameRef, {
                        players: updatedPlayers,
                        [`playerScores.${property.ownerId}`]: increment(updatedBalances[playerId] || 0),
                        [`playerScores.${playerId}`]: 0,
                        'educatedMerchantState.activityLog': newActivityLog
                    });
                } else {
                     transaction.update(gameRef, {
                        [`playerScores.${playerId}`]: increment(-rent),
                        [`playerScores.${property.ownerId}`]: increment(rent),
                        'educatedMerchantState.activityLog': newActivityLog,
                    });
                }
                await endTurn(gameId, playerId, transaction);
            } else if (!property.ownerId) {
                transaction.update(gameRef, { 
                    gameState: 'property_action',
                    'educatedMerchantState.activityLog': newActivityLog,
                });
            } else { // Landed on own property
                newActivityLog.push(`${player.name} وقف على عقاره.`);
                transaction.update(gameRef, {'educatedMerchantState.activityLog': newActivityLog});
                await endTurn(gameId, playerId, transaction);
            }
        }
    });
}

export async function buyPropertyAttempt(gameId: string, playerId: string): Promise<{success: boolean, error?: string}> {
     const gameRef = doc(db, 'games', gameId);
     try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;
            const player = game.players.find(p => p.id === playerId);
            const property = game.educatedMerchantState?.board.find(p => p.id === player?.position);
            
            if (!property || property.type !== 'property' || property.ownerId) throw new Error("This property cannot be bought.");
            if ((game.playerScores?.[playerId] || 0) < property.price) throw new Error("You cannot afford this property.");
            
            const randomQuestion = await fetchRandomQuestionForCategory(property.category);
            
            if (!randomQuestion) {
                 throw new Error(`No questions available for category "${property.category}". The purchase cannot proceed.`);
            }

            // Deduct the full price immediately
            transaction.update(gameRef, {
                [`playerScores.${playerId}`]: increment(-property.price),
                'educatedMerchantState.activityLog': arrayUnion(`${player?.name} قرر شراء ${property.name} وخصم ${property.price} د.ع.`)
            });

            // Transition to question state
            transaction.update(gameRef, {
                gameState: 'question',
                'educatedMerchantState.currentQuestion': randomQuestion,
                'educatedMerchantState.timerEndsAt': Timestamp.fromMillis(Date.now() + QUESTION_TIME_SECONDS * 1000),
            });
        });
        return { success: true };
     } catch (error: any) {
        return { success: false, error: error.message };
     }
}

export async function answerQuestion(gameId: string, playerId: string, answer: string | null): Promise<{success: boolean, error?: string}> {
    const gameRef = doc(db, 'games', gameId);
    try {
         await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const game = gameDoc.data() as Game;

            const question = game.educatedMerchantState?.currentQuestion;
            if (!question) throw new Error("No active question.");
            
            const player = game.players.find(p => p.id === playerId);
            const property = game.educatedMerchantState?.board.find(p => p.id === player?.position);
            if(!property || property.type !== 'property') throw new Error("Player not on a buyable property.");

            const isCorrect = answer === question.correctAnswer;
            
            const propertyIndex = game.educatedMerchantState!.board.findIndex(p => p.id === property.id);
            let newActivityLog = [...(game.educatedMerchantState?.activityLog || [])];

            if (isCorrect) {
                newActivityLog.push(`${player?.name} أجاب بشكل صحيح وامتلك ${property.name}.`);
                // Money was already deducted. Just assign ownership.
                 transaction.update(gameRef, {
                    [`educatedMerchantState.board.${propertyIndex}.ownerId`]: playerId,
                    'educatedMerchantState.activityLog': newActivityLog,
                });
            } else {
                // Return only 25% of the price as a refund for incorrect answer
                const refundAmount = Math.floor(property.price * 0.25);
                newActivityLog.push(`${player?.name} أجاب بشكل خاطئ وخسر جزءًا من ماله! استرد ${refundAmount} د.ع.`);
                 transaction.update(gameRef, {
                    [`playerScores.${playerId}`]: increment(refundAmount),
                    'educatedMerchantState.activityLog': newActivityLog,
                });
            }

            transaction.update(gameRef, {
                'educatedMerchantState.currentQuestion': deleteField(),
                'educatedMerchantState.timerEndsAt': deleteField(),
            });
         });

         await new Promise(resolve => setTimeout(resolve, 2000));
         await endTurn(gameId, playerId);
         return { success: true };

    } catch (error: any) {
         return { success: false, error: error.message };
    }
}

export async function endTurn(gameId: string, playerId: string, existingTransaction?: Transaction) {
    const gameRef = doc(db, 'games', gameId);

    const logic = async (transaction: Transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const es = game.educatedMerchantState;
        if (!es) throw new Error("Game state is not initialized.");

        // Check if it's the correct player's turn to end
        const currentTurnPlayerId = es.turnOrder[es.currentTurnIndex];
        if (currentTurnPlayerId !== playerId) {
            console.warn(`Player ${playerId} tried to end turn, but it's ${currentTurnPlayerId}'s turn.`);
            return;
        }

        const nonBankruptPlayers = game.players.filter(p => p.status !== 'bankrupt');

        if (nonBankruptPlayers.length <= 1) {
            const winner = nonBankruptPlayers[0];
            transaction.update(gameRef, { 
                 gameState: 'final_results',
                 gameResult: { winner: winner?.id || 'game_over', message: 'انتهت اللعبة بإفلاس المنافسين!' },
                 'educatedMerchantState.lastDiceRoll': deleteField(),
            });
            return;
        }

        let nextIndex = (es.currentTurnIndex + 1) % es.turnOrder.length;
        let loopGuard = 0;
        while(game.players.find(p => p.id === es.turnOrder[nextIndex])?.status === 'bankrupt' && loopGuard < es.turnOrder.length * 2) {
            nextIndex = (nextIndex + 1) % es.turnOrder.length;
            loopGuard++;
        }
        
        let newRound = game.round || 1;
        if (nextIndex < es.currentTurnIndex) {
            newRound++;
        }
        
        const maxRounds = es.settings?.maxRounds || 20;
        
        if (newRound > maxRounds) {
             const finalWinner = game.players
                .filter(p => p.status !== 'bankrupt')
                .sort((a,b) => (game.playerScores?.[b.id] || 0) - (game.playerScores?.[a.id] || 0))[0];
             transaction.update(gameRef, { 
                 gameState: 'final_results',
                 gameResult: { winner: finalWinner?.id || 'game_over', message: 'انتهت الجولات!' },
                 'educatedMerchantState.lastDiceRoll': deleteField(),
             });
             return;
        }

        transaction.update(gameRef, {
            gameState: 'rolling',
            round: newRound,
            'educatedMerchantState.currentTurnIndex': nextIndex,
            'educatedMerchantState.lastDiceRoll': deleteField(),
        });
    };

    try {
        if (existingTransaction) {
            await logic(existingTransaction);
        } else {
            await runTransaction(db, logic);
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
