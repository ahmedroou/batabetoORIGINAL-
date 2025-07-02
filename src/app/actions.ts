
import { db, auth } from '@/lib/firebase';
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
  query,
  where,
} from 'firebase/firestore';
import type { Player, Game, ScoreMatrix } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';

const TOTAL_ROUNDS = 15;

function isFirebaseError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

async function getPlayerFromUserId(userId: string): Promise<Omit<Player, 'avatarId'>> {
    const userDocRef = doc(db, 'users', userId);
    let userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.uid === userId) {
            const name = currentUser.displayName || 'لاعب جديد';
            const email = currentUser.email;
            if (!email) {
                throw new Error("لا يمكن العثور على البريد الإلكتروني للمستخدم الحالي.");
            }
            const result = await createUserProfile(userId, name, email);
            if (result.error) {
                 throw new Error(result.error);
            }
            userDoc = await getDoc(userDocRef);
            if (!userDoc.exists()) {
                throw new Error("فشل إنشاء الملف الشخصي بعد المحاولة.");
            }
        } else {
            throw new Error("لم يتم العثور على ملف تعريف المستخدم.");
        }
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

async function getShuffledQuestions(category: string): Promise<string[]> {
    const questionsQuery = query(collection(db, 'questions'), where("category", "==", category));
    const questionsSnapshot = await getDocs(questionsQuery);

    let questions: string[] = [];
     if (questionsSnapshot.empty) {
        console.warn(`No questions found for category: ${category}. Seeding default questions for 'اكتشف من انا'.`);
        if (category === 'اكتشف من انا') {
            const defaultQuestions: {text: string, category: string}[] = [
                { text: 'ما هي وظيفة أحلامي التي لم أخبر بها أحداً؟', category: 'اكتشف من انا' },
                { text: 'ما هو الشيء الذي أفتخر به سراً؟', category: 'اكتشف من انا' },
                { text: 'ما هو الشيء الذي يخيفني أكثر من أي شيء آخر؟', category: 'اكتشف من انا' },
                { text: 'ما هو الفيلم الذي يمكنني مشاهدته مراراً وتكراراً؟', category: 'اكتشف من انا' },
                { text: 'ما هي الموهبة الخفية التي أمتلكها؟', category: 'اكتشف من انا' },
                { text: 'لو كان بإمكاني السفر إلى أي مكان في العالم الآن، أين سأذهب؟', category: 'اكتشف من انا' },
                { text: 'ما هو الشيء الذي يزعجني بشدة ولكنني لا أظهره؟', category: 'اكتشف من انا' },
                { text: 'ما هي الذكرى المفضلة لدي من طفولتي؟', category: 'اكتشف من انا' },
                { text: 'ما هو الشيء الذي يمكن أن يجعلني أبتسم دائمًا؟', category: 'اكتشف من انا' },
                { text: 'من هو بطلي الخارق المفضل؟', category: 'اكتشف من انا' },
                { text: 'ما هو أغرب طعام أكلته وأحببته؟', category: 'اكتشف من انا' },
                { text: 'ما هي الأغنية التي تصف حالتي المزاجية الآن؟', category: 'اكتشف من انا' },
                { text: 'لو كان بإمكاني تناول العشاء مع أي شخصية تاريخية، من ستكون؟', category: 'اكتشف من انا' },
                { text: 'ما هو أفضل كتاب قرأته؟', category: 'اكتشف من انا' },
                { text: 'ما هو الشيء الذي لا يمكنني العيش بدونه؟', category: 'اكتشف من انا' },
                { text: 'ما هو الشيء الذي أفعله للاسترخاء بعد يوم طويل؟', category: 'اكتشف من انا' },
                { text: 'ما هي العادة السيئة التي أتمنى التخلص منها؟', category: 'اكتشف من انا' },
                { text: 'ما هي الصفة التي أبحث عنها في الصديق؟', category: 'اكتشف من انا' },
                { text: 'ما هو أكبر درس تعلمته في الحياة حتى الآن؟', category: 'اكتشف من انا' },
                { text: 'لو كنت حيوانًا، ماذا سأكون؟', category: 'اكتشف من انا' },
                { text: 'ما هو الشيء الذي أنا سيء فيه بشكل مضحك؟', category: 'اكتشف من انا' },
                { text: 'ما هو المكان الذي أشعر فيه بالسلام التام؟', category: 'اكتشف من انا' },
                { text: 'ما هو الشيء الذي أؤجل القيام به دائمًا؟', category: 'اكتشف من انا' },
                { text: 'ما هي النكتة المفضلة لدي؟', category: 'اكتشف من انا' },
                { text: 'ما هي المغامرة التالية التي أحلم بالقيام بها؟', category: 'اكتشف من انا' }
            ];
            
            const batch = writeBatch(db);
            defaultQuestions.forEach(question => {
                const docRef = doc(collection(db, 'questions'));
                batch.set(docRef, question);
            });
            await batch.commit();
            console.log("Default questions for 'اكتشف من انا' seeded to Firestore.");
            questions = defaultQuestions.map(q => q.text);
        }
    } else {
        questions = questionsSnapshot.docs.map(doc => doc.data().text as string);
    }
    
    // Shuffle and slice
    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, TOTAL_ROUNDS);
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

export async function createUserProfile(userId: string, name: string, email: string) {
    if (!name.trim()) {
        return { error: 'الاسم مطلوب.' };
    }
    try {
        await setDoc(doc(db, 'users', userId), {
            name: name.trim(),
            email: email,
            createdAt: serverTimestamp(),
            isAdmin: false,
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

    const questionsForGame = await getShuffledQuestions('اكتشف من انا');
    if (questionsForGame.length < TOTAL_ROUNDS) {
        return { error: `لا يوجد أسئلة كافية في قسم "اكتشف من انا" لبدء لعبة. تحتاج اللعبة إلى ${TOTAL_ROUNDS} سؤالاً على الأقل. يرجى رفع المزيد من الأسئلة من صفحة الأدمن.` };
    }


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
        return { error: `فشل الاتصال بـ Firebase. (${error.code || 'غير معروف'})` };
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

export async function uploadQuestionsFromJson(questions: { text: string; category: string }[]) {
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return { error: 'ملف JSON غير صالح أو فارغ.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'questions');

        questions.forEach(question => {
            if (question && typeof question.text === 'string' && question.text.trim() !== '' && typeof question.category === 'string' && question.category.trim() !== '') {
                const docRef = doc(questionsCol);
                batch.set(docRef, { 
                    text: question.text.trim(),
                    category: question.category.trim()
                });
            }
        });

        await batch.commit();
        return { success: true, count: questions.length };
    } catch (error) {
        console.error("Error uploading questions:", error);
        return { error: 'حدث خطأ أثناء رفع الأسئلة.' };
    }
}

export async function deleteQuestions(criteria: { category?: string; searchTerm?: string }) {
    if (!criteria.category && !criteria.searchTerm) {
        return { error: 'يجب تحديد معيار للحذف.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'questions');
        let count = 0;

        if (criteria.category) {
            const q = query(questionsCol, where('category', '==', criteria.category.trim()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                return { success: true, count: 0, message: 'لم يتم العثور على أسئلة في هذا القسم.' };
            }
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });
        } else if (criteria.searchTerm) {
            const searchTerm = criteria.searchTerm.trim();
            // Firestore doesn't support native substring search. Fetch all, filter, then batch delete.
            const querySnapshot = await getDocs(questionsCol);
            querySnapshot.forEach(doc => {
                const text = doc.data().text as string;
                if (text && text.includes(searchTerm)) {
                    batch.delete(doc.ref);
                    count++;
                }
            });
             if (count === 0) {
                return { success: true, count: 0, message: 'لم يتم العثور على أسئلة تحتوي على هذا النص.' };
            }
        }

        await batch.commit();
        return { success: true, count };
    } catch (error) {
        console.error("Error deleting questions:", error);
        return { error: 'حدث خطأ أثناء حذف الأسئلة.' };
    }
}
