import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import type { Player, Game, ScoreMatrix } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';

const TOTAL_ROUNDS = 15;

function isFirebaseError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

async function getPlayerFromUserId(userId: string): Promise<Omit<Player, 'avatarId'>> {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
        throw new Error("لم يتم العثور على ملف تعريف المستخدم.");
    }
    const userData = userDoc.data();
    return {
        id: userId,
        name: userData.name || 'لاعب غير معروف',
    };
}


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

function getNextAvailableAvatar(players: Player[]): string {
  const usedAvatars = new Set(players.map(p => p.avatarId));
  const availableAvatar = AVATAR_IDS.find(id => !usedAvatars.has(id));
  return availableAvatar || AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

async function getShuffledQuestions(): Promise<string[]> {
    const questionsCol = collection(db, 'questions');
    const questionsSnapshot = await getDocs(questionsCol);

    let questions: string[] = [];
    if (questionsSnapshot.empty) {
        console.log("Questions collection is empty. Seeding with default questions...");
        const defaultQuestions: string[] = [
            'ما هي وظيفة أحلامي التي لم أخبر بها أحداً؟',
            'ما هو الشيء الذي أفتخر به سراً؟',
            'ما هو الشيء الذي يخيفني أكثر من أي شيء آخر؟',
            'ما هو الفيلم الذي يمكنني مشاهدته مراراً وتكراراً؟',
            'ما هي الموهبة الخفية التي أمتلكها؟',
            'لو كان بإمكاني السفر إلى أي مكان في العالم الآن، أين سأذهب؟',
            'ما هو الشيء الذي يزعجني بشدة ولكنني لا أظهره؟',
            'ما هي الذكرى المفضلة لدي من طفولتي؟',
            'ما هو الشيء الذي يمكن أن يجعلني أبتسم دائمًا؟',
            'من هو بطلي الخارق المفضل؟',
            'ما هو أغرب طعام أكلته وأحببته؟',
            'ما هي الأغنية التي تصف حالتي المزاجية الآن؟',
            'لو كان بإمكاني تناول العشاء مع أي شخصية تاريخية، من ستكون؟',
            'ما هو أفضل كتاب قرأته؟',
            'ما هو الشيء الذي لا يمكنني العيش بدونه؟',
            'ما هو الشيء الذي أفعله للاسترخاء بعد يوم طويل؟',
            'ما هي العادة السيئة التي أتمنى التخلص منها؟',
            'ما هي الصفة التي أبحث عنها في الصديق؟',
            'ما هو أكبر درس تعلمته في الحياة حتى الآن؟',
            'لو كنت حيوانًا، ماذا سأكون؟',
            'ما هو الشيء الذي أنا سيء فيه بشكل مضحك؟',
            'ما هو المكان الذي أشعر فيه بالسلام التام؟',
            'ما هو الشيء الذي أؤجل القيام به دائمًا؟',
            'ما هي النكتة المفضلة لدي؟',
            'ما هي المغامرة التالية التي أحلم بالقيام بها؟'
        ];
        
        const batch = writeBatch(db);
        defaultQuestions.forEach(questionText => {
            const docRef = doc(collection(db, 'questions'));
            batch.set(docRef, { text: questionText });
        });
        await batch.commit();
        console.log("Default questions seeded to Firestore.");
        questions = defaultQuestions;
    } else {
        questions = questionsSnapshot.docs.map(doc => doc.data().text as string);
    }
    
    return [...questions].sort(() => 0.5 - Math.random()).slice(0, TOTAL_ROUNDS);
}

function initializeScoreMatrix(players: Player[]): ScoreMatrix {
    const matrix: ScoreMatrix = {};
    for (const player of players) {
        matrix[player.id] = {};
        for (const otherPlayer of players) {
            if (player.id !== otherPlayer.id) {
                matrix[player.id][otherPlayer.id] = 0;
            }
        }
    }
    return matrix;
}

export async function createUserProfile(userId: string, name: string) {
    if (!name.trim()) {
        return { error: 'الاسم مطلوب.' };
    }
    try {
        await setDoc(doc(db, 'users', userId), {
            name: name.trim(),
            createdAt: serverTimestamp(),
        });
        return { success: true };
    } catch (error) {
        console.error("Firebase error in createUserProfile:", error);
        if (isFirebaseError(error)) {
            return { error: 'فشل إنشاء الملف الشخصي بسبب خطأ في Firebase.' };
        }
        return { error: 'حدث خطأ غير متوقع عند إنشاء الملف الشخصي.' };
    }
}


export async function createGameRoom(userId: string) {
  if (!userId) {
    return { error: 'معرف المستخدم مطلوب.' };
  }
  try {
    const gameId = await generateGameId();
    const playerDetails = await getPlayerFromUserId(userId);

    const avatarId = getNextAvailableAvatar([]);

    const player: Player = {
      ...playerDetails,
      avatarId,
    };

    const questionsForGame = await getShuffledQuestions();

    const newGame: Omit<Game, 'id'> = {
      players: [player],
      gameState: 'lobby',
      round: 0,
      questions: questionsForGame,
      currentQuestion: '',
      answers: {},
      guesses: {},
      scoreMatrix: initializeScoreMatrix([player]),
      createdAt: serverTimestamp() as any,
    };

    await setDoc(doc(db, 'games', gameId), newGame);

    return { gameId, player };
  } catch(error) {
    console.error("Firebase error in createGameRoom:", error);
    if (isFirebaseError(error)) {
        return { error: `فشل الاتصال بـ Firebase. (${error.code || error.message})` };
    }
    const typedError = error as Error;
    return { error: typedError.message || 'حدث خطأ غير متوقع عند إنشاء الغرفة.' };
  }
}

export async function joinGameRoom(gameId: string, userId: string) {
    if (!userId || !gameId.trim()) {
        return { error: 'معرف المستخدم ومعرف الغرفة مطلوبان.' };
    }

    try {
        const gameRef = doc(db, 'games', gameId.toUpperCase());
        
        const player = await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);

            if (!gameDoc.exists()) {
                throw new Error('الغرفة غير موجودة. تأكد من المعرف.');
            }
            
            const game = gameDoc.data() as Game;
            if (game.players.length >= 8) {
                throw new Error('الغرفة ممتلئة.');
            }
            if (game.gameState !== 'lobby') {
                throw new Error('لا يمكن الانضمام، اللعبة بدأت بالفعل.');
            }
            if (game.players.find(p => p.id === userId)) {
                throw new Error('أنت بالفعل في هذه الغرفة.');
            }

            const playerDetails = await getPlayerFromUserId(userId);
            const avatarId = getNextAvailableAvatar(game.players);
            const newPlayer: Player = { ...playerDetails, avatarId };
            
            const updatedPlayers = [...game.players, newPlayer];
            const updatedMatrix = initializeScoreMatrix(updatedPlayers);

            transaction.update(gameRef, { 
                players: updatedPlayers,
                scoreMatrix: updatedMatrix
            });

            return newPlayer;
        });

        return { gameId, player };
    } catch(error: any) {
        console.error("Error in joinGameRoom:", error);
        return { error: error.message || 'حدث خطأ غير متوقع عند الانضمام للغرفة.' };
    }
}

export async function leaveGame(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    try {
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) return;

            const game = gameDoc.data() as Game;
            const updatedPlayers = game.players.filter(p => p.id !== playerId);

            if (updatedPlayers.length === 0) {
                transaction.delete(gameRef);
            } else {
                 const updatedMatrix = initializeScoreMatrix(updatedPlayers);
                 // Note: this resets scores, which is simpler than filtering.
                transaction.update(gameRef, { 
                    players: updatedPlayers,
                    scoreMatrix: updatedMatrix
                });
            }
        });
        return { success: true };
    } catch (error) {
        console.error("Error in leaveGame:", error);
        return { error: 'حدث خطأ عند مغادرة الغرفة.' };
    }
}

export async function startGame(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        transaction.update(gameRef, { 
            gameState: 'answering',
            round: 0,
            currentQuestion: game.questions[0]
        });
    });
}

export async function submitAnswer(gameId: string, playerId: string, answer: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const newAnswers = { ...game.answers, [playerId]: answer };
        
        const updateData: Partial<Omit<Game, 'id'>> = {
            answers: newAnswers
        };

        if (Object.keys(newAnswers).length === game.players.length) {
            updateData.gameState = 'guessing';
        }

        transaction.update(gameRef, updateData);
    });
}

export async function submitGuesses(gameId: string, playerId: string, playerGuesses: Record<string, string>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const newGuesses = { ...game.guesses, [playerId]: playerGuesses };

        const updateData: any = {
            [`guesses.${playerId}`]: playerGuesses
        };

        if (Object.keys(newGuesses).length === game.players.length) {
            // All players have submitted their guesses, calculate scores for the round
            const newScoreMatrix = JSON.parse(JSON.stringify(game.scoreMatrix));
            for (const guesser of game.players) {
                const guessesByGuesser = newGuesses[guesser.id]; // Guesses made by this player
                if (guessesByGuesser) {
                    for (const subjectPlayerId in guessesByGuesser) {
                        const guessedPlayerId = guessesByGuesser[subjectPlayerId];
                        if (subjectPlayerId === guessedPlayerId) {
                            // Correct guess!
                            if (!newScoreMatrix[guesser.id]) newScoreMatrix[guesser.id] = {};
                            newScoreMatrix[guesser.id][subjectPlayerId] = (newScoreMatrix[guesser.id][subjectPlayerId] || 0) + 1;
                        }
                    }
                }
            }
            updateData.scoreMatrix = newScoreMatrix;
            updateData.gameState = 'round_results';
        }

        transaction.update(gameRef, updateData);
    });
}

export async function nextRound(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const nextRound = game.round + 1;
        
        if (nextRound >= TOTAL_ROUNDS) {
            transaction.update(gameRef, { gameState: 'final_results' });
        } else {
            transaction.update(gameRef, {
                round: nextRound,
                currentQuestion: game.questions[nextRound],
                gameState: 'answering',
                answers: {},
                guesses: {},
            });
        }
    });
}

export async function uploadQuestionsFromJson(questions: string[]) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'questions');

        questions.forEach(questionText => {
            if (typeof questionText === 'string' && questionText.trim() !== '') {
                const docRef = doc(questionsCol);
                batch.set(docRef, { text: questionText.trim() });
            }
        });

        await batch.commit();
        return { success: true, count: questions.length };
    } catch (error) {
        console.error("Error uploading questions:", error);
        return { error: 'حدث خطأ أثناء رفع الأسئلة.' };
    }
}
