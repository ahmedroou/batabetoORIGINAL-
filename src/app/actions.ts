'use server';

import { db } from '@/lib/firebase';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { redirect } from 'next/navigation';
import type { Player, Game } from '@/types';
import { generatePersonalizedQuestions } from '@/ai/flows/generate-personalized-questions';
import type { AiCategoryValue } from '@/data/questions';

async function generateGameId(): Promise<string> {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let id = '';
  for (let i = 0; i < 3; i++) {
    id += letters.charAt(Math.floor(Math.random() * letters.length));
    id += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  const gameDoc = await getDoc(doc(db, 'games', id));
  if (gameDoc.exists()) {
    return generateGameId(); // Retry if ID exists
  }
  return id;
}

export async function createGameRoom(playerName: string) {
  if (!playerName.trim()) {
    return { error: 'اسم اللاعب مطلوب.' };
  }
  try {
    const gameId = await generateGameId();
    const playerId = crypto.randomUUID();

    const player: Player = {
      id: playerId,
      name: playerName.trim(),
      score: 0,
    };

    const newGame: Game = {
      id: gameId,
      players: [player],
      gameState: 'lobby',
      round: 0,
      guesses: {},
      createdAt: serverTimestamp() as any,
      guessers: [],
    };

    await setDoc(doc(db, 'games', gameId), newGame);

    return { gameId, player };
  } catch(error) {
    console.error("Firebase error in createGameRoom:", error);
    if (error instanceof Error && (error.message.includes('offline') || error.message.includes('permission-denied'))) {
        return { error: 'فشل الاتصال بـ Firebase. يرجى التأكد من صحة بيانات الإعداد في ملف .env وقواعد الأمان في Firestore.' };
    }
    return { error: 'حدث خطأ غير متوقع عند إنشاء الغرفة.' };
  }
}

export async function joinGameRoom(gameId: string, playerName:string) {
    if (!playerName.trim()) {
        return { error: 'اسم اللاعب مطلوب.' };
    }
    if (!gameId.trim()) {
        return { error: 'معرف الغرفة مطلوب.' };
    }

    try {
        const gameRef = doc(db, 'games', gameId.toUpperCase());
        const gameDoc = await getDoc(gameRef);

        if (!gameDoc.exists()) {
            return { error: 'الغرفة غير موجودة. تأكد من المعرف.' };
        }
        
        const gameData = gameDoc.data() as Game;
        if (gameData.players.length >= 8) {
            return { error: 'الغرفة ممتلئة.'};
        }

        if (gameData.gameState !== 'lobby') {
            return { error: 'لا يمكن الانضمام، اللعبة بدأت بالفعل.'};
        }
        
        if (gameData.players.find(p => p.name.toLowerCase() === playerName.trim().toLowerCase())) {
            return { error: 'يوجد لاعب بنفس الاسم بالفعل.'};
        }

        const playerId = crypto.randomUUID();
        const player: Player = { id: playerId, name: playerName.trim(), score: 0 };

        await updateDoc(gameRef, {
            players: arrayUnion(player)
        });

        return { gameId, player };
    } catch(error) {
        console.error("Firebase error in joinGameRoom:", error);
        if (error instanceof Error && (error.message.includes('offline') || error.message.includes('permission-denied'))) {
             return { error: 'فشل الاتصال بـ Firebase. يرجى التأكد من صحة بيانات الإعداد في ملف .env وقواعد الأمان في Firestore.' };
        }
        return { error: 'حدث خطأ غير متوقع عند الانضمام للغرفة.' };
    }
}

export async function startGame(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, { gameState: 'category_select' });
}

export async function selectCategory(gameId: string, categoryName: string, question: string) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
        gameState: 'question',
        selectedCategory: categoryName,
        currentQuestion: question,
    });
}

export async function getAIQuestionForGame(gameId: string, category: AiCategoryValue) {
  try {
    const result = await generatePersonalizedQuestions({ category });
    if (result.question) {
        await updateDoc(doc(db, 'games', gameId), {
            gameState: 'question',
            selectedCategory: `سؤال ذكاء اصطناعي عن ${category}`,
            currentQuestion: result.question,
        });
        return { success: true };
    }
    throw new Error("Failed to get question from AI");
  } catch (error) {
    console.error(error);
    return { error: 'فشل في إنشاء السؤال. الرجاء المحاولة مرة أخرى.' };
  }
}

export async function submitAnswer(gameId: string, answer: string) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, { answererAnswer: answer });
}

export async function submitGuess(gameId: string, playerId: string, guess: string) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
        [`guesses.${playerId}`]: guess
    });
}

export async function revealResults(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, { gameState: 'results' });
}

export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);

    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) {
                throw "Game does not exist!";
            }

            const game = gameDoc.data() as Game;
            const answererAnswer = game.answererAnswer?.trim().toLowerCase();
            
            const updatedPlayers = game.players.map(player => {
                if (game.guesses[player.id]) {
                    const guess = game.guesses[player.id]?.trim().toLowerCase();
                    if (guess === answererAnswer) {
                        return { ...player, score: player.score + 10 };
                    }
                }
                return player;
            });

            transaction.update(gameRef, {
                players: updatedPlayers,
                round: game.round + 1,
                gameState: 'category_select',
                currentQuestion: null,
                selectedCategory: null,
                answererAnswer: null,
                guesses: {},
            });
        });
    } catch (e) {
        console.error("Transaction failed: ", e);
    }
}
