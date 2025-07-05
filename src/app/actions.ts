
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
  arrayUnion,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import type { Player, Game, ScoreMatrix, GameState, CrimeScene, ChatMessage } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';
import { generateCrimeScenario } from '@/ai/flows/generate-crime-scenario';
import { detectIdentityReveal } from '@/ai/flows/detect-identity-reveal-flow';

const TOTAL_ROUNDS = 15;

function isFirebaseError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

async function getPlayerFromUserId(userId: string): Promise<Omit<Player, 'avatarId' | 'status'>> {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
       throw new Error(`لم يتم العثور على ملف تعريف للمستخدم بالمعرف: ${userId}. تأكد من أن المستخدم قد أكمل التسجيل.`);
    }
    
    const userData = userDoc.data();
    return {
        id: userId,
        name: userData.name || 'لاعب غير معروف',
    };
}


function generateGameId(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let id = '';
  for (let i = 0; i < 3; i++) {
    id += letters.charAt(Math.floor(Math.random() * letters.length));
    id += numbers.charAt(Math.floor(Math.random() * numbers.length));
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
        console.warn(`No questions found for category: ${category}.`);
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
            coins: 5,
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


export async function createGameRoom(userId: string, gameType: 'who-am-i' | 'killer') {
  if (!userId) {
    return { error: 'معرف المستخدم مطلوب.' };
  }
  try {
    const gameId = generateGameId();
    const playerDetails = await getPlayerFromUserId(userId);
    const avatarId = getNextAvailableAvatar([]);

    let player: Player = {
      ...playerDetails,
      avatarId,
      status: 'alive',
    };
    
    let newGame: Omit<Game, 'id'>;
    
    if (gameType === 'who-am-i') {
        const questionsForGame = await getShuffledQuestions('اكتشف من انا');
        if (questionsForGame.length < TOTAL_ROUNDS) {
            return { error: `لا يوجد أسئلة كافية في قسم "اكتشف من انا" لبدء لعبة. تحتاج اللعبة إلى ${TOTAL_ROUNDS} سؤالاً على الأقل. يرجى رفع المزيد من الأسئلة من صفحة الأدمن.` };
        }

        newGame = {
          hostId: userId,
          gameType: 'who-am-i',
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
    } else { // 'killer' game type
        newGame = {
            hostId: userId,
            gameType: 'killer',
            players: [player],
            gameState: 'lobby',
            createdAt: serverTimestamp() as any,
        };
    }

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
            if (!gameDoc.exists()) throw new Error('الغرفة غير موجودة. تأكد من المعرف.');
            
            const game = gameDoc.data() as Game;
            const existingPlayer = game.players.find(p => p.id === userId);

            // Handle rejoining
            if (existingPlayer) {
                return existingPlayer;
            }
            
            // Handle new player joining
            if (game.players.length >= 8) throw new Error('الغرفة ممتلئة.');
            if (game.gameState !== 'lobby') throw new Error('لا يمكن الانضمام، اللعبة بدأت بالفعل.');

            const playerDetails = await getPlayerFromUserId(userId);
            const avatarId = getNextAvailableAvatar(game.players);
            
            const newPlayer: Player = { 
                ...playerDetails, 
                avatarId,
                status: 'alive' 
            };
            
            const updatedPlayers = [...game.players, newPlayer];

            const updateData: Partial<Game> = {
                players: updatedPlayers
            };

            if (game.gameType === 'who-am-i') {
                updateData.scoreMatrix = initializeScoreMatrix(updatedPlayers);
            }
            
            transaction.update(gameRef, updateData);
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
            const leavingPlayer = game.players.find(p => p.id === playerId);
            if (!leavingPlayer) return;

            const updatedPlayers = game.players.filter(p => p.id !== playerId);

            if (updatedPlayers.length === 0) {
                transaction.delete(gameRef);
                return;
            }
            
            const updateData: Partial<Game> = {
                players: updatedPlayers
            };

            if (game.hostId === playerId && updatedPlayers.length > 0) {
                updateData.hostId = updatedPlayers[0].id;
            }

            if (game.gameType === 'killer' && game.gameState !== 'lobby' && game.gameState !== 'aliases' && game.gameState !== 'instructions') {
                if (leavingPlayer.role === 'killer') {
                    updateData.gameState = 'ended';
                    updateData.gameResult = {
                        winner: 'detective_civilians',
                        message: `لقد غادر القاتل ${leavingPlayer.alias || leavingPlayer.name} اللعبة! المحقق والمدنيون ينتصرون!`,
                    };
                } else if (leavingPlayer.role === 'detective') {
                    updateData.gameState = 'ended';
                    updateData.gameResult = {
                        winner: 'killer',
                        message: `لقد غادر المحقق ${leavingPlayer.alias || leavingPlayer.name} اللعبة! القاتل ينتصر!`,
                    };
                }
                 transaction.update(gameRef, updateData);
                 return;
            }

            if (game.gameType === 'who-am-i') {
                updateData.scoreMatrix = initializeScoreMatrix(updatedPlayers);
            }
            
            transaction.update(gameRef, updateData);
        });
        return { success: true };
    } catch (error) {
        console.error("Error in leaveGame:", error);
        return { error: 'حدث خطأ عند مغادرة الغرفة.' };
    }
}

export async function playerReady(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'instructions') throw new Error("Not the time to be ready.");

        // Prevent adding the same player twice
        const currentReadyPlayers = game.readyPlayers || [];
        if (currentReadyPlayers.includes(playerId)) {
            return;
        }
        
        const updatedReadyPlayers = [...currentReadyPlayers, playerId];

        const updateData: Partial<Game> = {
            readyPlayers: updatedReadyPlayers,
        };

        // If all players are ready, move to the next state
        if (updatedReadyPlayers.length === game.players.length) {
            if (game.gameType === 'who-am-i') {
                updateData.gameState = 'answering';
            }
            // Clear the readyPlayers field as it's no longer needed.
            updateData.readyPlayers = deleteField() as any;
        }

        transaction.update(gameRef, updateData);
    });
}

// "Who Am I" Game Actions
export async function startWhoAmIGame(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        if (game.gameType !== 'who-am-i') throw new Error("Invalid action for this game type.");

        transaction.update(gameRef, { 
            gameState: 'instructions',
            readyPlayers: [],
            round: 0,
            currentQuestion: game.questions![0]
        });
    });
}

export async function submitAnswer(gameId: string, playerId: string, answer: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameType !== 'who-am-i') throw new Error("Invalid action for this game type.");

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

        if (game.gameType !== 'who-am-i' || !game.scoreMatrix) throw new Error("Invalid action for this game type.");
        
        const selfGuess = { [playerId]: playerId };
        const finalGuesses = { ...playerGuesses, ...selfGuess };

        const newGuesses = { ...game.guesses, [playerId]: finalGuesses };

        const updateData: any = {
            [`guesses.${playerId}`]: finalGuesses
        };

        if (Object.keys(newGuesses).length === game.players.length) {
            const newScoreMatrix = JSON.parse(JSON.stringify(game.scoreMatrix));
            for (const guesser of game.players) {
                const guessesByGuesser = newGuesses[guesser.id];
                if (guessesByGuesser) {
                    for (const subjectPlayerId in guessesByGuesser) {
                        const guessedPlayerId = guessesByGuesser[subjectPlayerId];
                        if (subjectPlayerId === guessedPlayerId) {
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

        if (game.gameType !== 'who-am-i' || typeof game.round === 'undefined' || !game.questions) throw new Error("Invalid action for this game type.");
        
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

// "Killer" Game Actions
export async function startKillerGame(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.gameType !== 'killer') throw new Error("Invalid action for this game type.");
        if (game.players.length < 4) throw new Error("تحتاج اللعبة إلى 4 لاعبين على الأقل.");

        transaction.update(gameRef, { gameState: 'instructions', readyPlayers: [] });
    });
}

export async function progressToAliases(gameId: string, userId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== userId) {
            throw new Error("فقط صاحب الغرفة يمكنه المتابعة.");
        }
        if (game.gameType !== 'killer') {
            throw new Error("إجراء غير صالح لنوع اللعبة هذا.");
        }
        if (game.gameState !== 'instructions') {
            throw new Error("لا يمكن المتابعة في هذا الوقت.");
        }

        transaction.update(gameRef, { 
            gameState: 'aliases',
            readyPlayers: deleteField() 
        });
    });
}

export async function submitAlias(gameId: string, playerId: string, alias: string) {
    if (!alias.trim()) throw new Error("الاسم المستعار مطلوب.");
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("Player not found.");

        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].alias = alias.trim();

        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function assignRoles(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.players.some(p => !p.alias)) throw new Error("ليس كل اللاعبين قد اختاروا أسماء مستعارة.");
        if (game.players.length < 4) throw new Error("تحتاج اللعبة إلى 4 لاعبين على الأقل.");

        let players = [...game.players];
        
        // Re-assign avatars to hide lobby identities
        const shuffledAvatars = [...AVATAR_IDS].sort(() => 0.5 - Math.random());
        players.forEach((player, index) => {
            player.avatarId = shuffledAvatars[index % shuffledAvatars.length];
        });

        players.sort(() => Math.random() - 0.5); // Shuffle players for role assignment

        players[0].role = 'killer';
        players[1].role = 'detective';
        players[2].role = 'witness';
        
        let playerIndex = 3;
        if (players.length >= 5) {
            players[playerIndex].role = 'accomplice';
            playerIndex++;
        }

        for (let i = playerIndex; i < players.length; i++) {
            players[i].role = 'civilian';
        }

        const crimeScene = await generateCrimeScenario({});
        
        transaction.update(gameRef, {
            players: players.sort((a,b) => a.name.localeCompare(b.name)),
            gameState: 'roles',
            crimeScene: crimeScene,
            turn: 1,
            messages: [],
            detectiveArrest: { used: false },
        });
    });
}

export async function progressToCrimeScene(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState === 'roles') {
            transaction.update(gameRef, { gameState: 'crime_scene' });
        }
    });
}


export async function detectiveMakesChoice(gameId: string, detectiveId: string, choice: 'discuss' | 'skip') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const detective = game.players.find(p => p.role === 'detective');
        if (!detective || detective.id !== detectiveId) {
            throw new Error("فقط المحقق يمكنه اتخاذ هذا القرار.");
        }

        if (choice === 'discuss') {
            transaction.update(gameRef, { gameState: 'discussion', votes: {} });
        } else { // skip
            transaction.update(gameRef, { gameState: 'night' });
        }
    });
}


export async function skipNightKill(gameId: string, killerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') throw new Error("لا يمكنك تخطي القتل الآن.");
        const killer = game.players.find(p => p.id === killerId);
        if (!killer || killer.role !== 'killer') throw new Error("لست القاتل.");
        if (game.killerSkipUsed) throw new Error("لقد استخدمت هذه الميزة بالفعل.");

        transaction.update(gameRef, {
            killerSkipUsed: true,
            gameState: 'victim_reveal',
            nightAction: { skipped: true },
            votes: {},
            messages: [],
            lastVoteResult: {},
        });
    });
}


export async function performNightKill(gameId: string, killerId: string, victimId: string, method: string, isTargetingDetective: boolean) {
    if (!victimId) {
        throw new Error("يجب اختيار ضحية.");
    }
    if (!method.trim()) {
        throw new Error("يجب تقديم أسلوب القتل.");
    }

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'night') throw new Error("لا يمكنك القتل الآن.");
        
        const killer = game.players.find(p => p.id === killerId);
        if (!killer || killer.role !== 'killer') throw new Error("لست القاتل.");
        if (killer.status !== 'alive') throw new Error("لا يمكنك القتل، لقد تم إقصائك.");

        const victimIndex = game.players.findIndex(p => p.id === victimId);
        if (victimIndex === -1) throw new Error("لم يتم العثور على الضحية.");
        const victim = game.players[victimIndex];
        if (victim.status !== 'alive') throw new Error("هذا اللاعب ليس على قيد الحياة.");
        if (victim.isImmune) throw new Error("لا يمكن استهداف هذا اللاعب مرة أخرى.");

        let updatedPlayers = [...game.players];
        let witnessInfo: Game['witnessInfo'] | undefined = undefined;
        let nightActionResult: Game['nightAction'] = {}; // Default to a quiet night

        const witness = updatedPlayers.find(p => p.role === 'witness' && p.status === 'alive');

        if (isTargetingDetective) {
            if (victim.role === 'detective') {
                // Correctly targeted the detective, they are killed.
                updatedPlayers[victimIndex].status = 'killed';
                nightActionResult = {
                    victimId,
                    method: method.trim(),
                    victimAlias: victim.alias,
                };
            } else {
                // Mistakenly targeted a non-detective as the detective. Kill fails.
                // nightAction remains empty, resulting in a "quiet night" for public.
                if (witness) {
                    witnessInfo = { 
                        killerId: killer.id, 
                        killerAlias: killer.alias || killer.name,
                        victimId: victim.id,
                        victimAlias: victim.alias || victim.name,
                        method: method.trim(),
                        reason: 'assassination_failed'
                    };
                }
            }
        } else { // Normal kill (not marked as targeting detective)
            if (victim.role === 'detective') {
                // Killer attacked detective without checking the box. Detective survives and becomes immune.
                // nightAction remains empty.
                updatedPlayers[victimIndex].isImmune = true; 

                if (witness) {
                    witnessInfo = {
                        killerId: killer.id,
                        killerAlias: killer.alias || killer.name,
                        victimId: victim.id,
                        victimAlias: victim.alias || victim.name,
                        method: method.trim(),
                        reason: 'detective_survived'
                    };
                }
            } else {
                // Normal kill on a civilian, witness, or accomplice succeeds.
                updatedPlayers[victimIndex].status = 'killed';
                nightActionResult = {
                    victimId,
                    method: method.trim(),
                    victimAlias: victim.alias,
                };
            }
        }
        
        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'victim_reveal',
            witnessInfo: witnessInfo || deleteField() as any,
            nightAction: nightActionResult,
            votes: {},
            messages: [],
            lastVoteResult: {},
        });
    });
}

export async function progressAfterVictimReveal(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'victim_reveal') return;

        const { nightAction, players } = game;
        if (!nightAction) throw new Error("Night action details are missing.");

        // If the kill was skipped, or no victim was specified (failed kill), just move to the next day.
        if (nightAction.skipped || !nightAction.victimId) {
            transaction.update(gameRef, {
                gameState: 'discussion',
                turn: (game.turn || 1) + 1,
            });
            return;
        }

        // --- A kill happened, check win conditions. ---
        let gameResult: Game['gameResult'] | undefined = undefined;
        
        const victim = players.find(p => p.id === nightAction.victimId);
        if (victim?.status === 'killed' && victim.role === 'detective') {
             gameResult = {
                winner: 'killer',
                message: `لقد نجح القاتل في اغتيال المحقق ${victim.alias}! القاتل ينتصر!`,
            };
        } else {
            const alivePlayers = players.filter(p => p.status === 'alive');
            const aliveGoodTeam = alivePlayers.filter(p => p.role === 'detective' || p.role === 'witness' || p.role === 'civilian');
            const aliveKillerTeam = alivePlayers.filter(p => p.role === 'killer' || p.role === 'accomplice');
            
            if (aliveKillerTeam.length >= aliveGoodTeam.length) {
                gameResult = {
                    winner: 'killer',
                    message: `عدد فريق القاتل أصبح مساويًا أو أكبر من الأبرياء. فريق القاتل ينتصر!`,
                };
            }
        }
        
        if (gameResult) {
            transaction.update(gameRef, {
                gameState: 'ended',
                gameResult: gameResult,
            });
        } else {
            transaction.update(gameRef, {
                gameState: 'discussion',
                turn: (game.turn || 1) + 1,
            });
        }
    });
}

export async function submitMessage(gameId: string, playerId: string, text: string, impersonating?: boolean) {
    if (!text.trim()) throw new Error("الرسالة لا يمكن أن تكون فارغة.");
    const gameRef = doc(db, 'games', gameId);
    
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || !player.alias) throw new Error("لم يتم العثور على اللاعب.");
        if (player.status === 'killed' || player.status === 'arrested') throw new Error("لا يمكنك إرسال رسائل.");

        const updateData: Partial<Game> = {};
        let message: ChatMessage;

        if (impersonating && player.role === 'accomplice' && !player.accomplicePowerUsed) {
            message = {
                senderId: player.id,
                senderAlias: "المحقق",
                isDetective: true,
                text: text.trim(),
                timestamp: Timestamp.now(),
            };
            
            const playerIndex = game.players.findIndex(p => p.id === playerId);
            const updatedPlayers = [...game.players];
            updatedPlayers[playerIndex].accomplicePowerUsed = true;
            updateData.players = updatedPlayers;
            
            const detective = game.players.find(p => p.role === 'detective');
            if (detective) {
                updateData.detectiveAlert = player.alias;
            }

        } else {
             message = {
                senderId: player.id,
                senderAlias: player.alias,
                isDetective: player.role === 'detective',
                text: text.trim(),
                timestamp: Timestamp.now(),
            };
        }

        updateData.messages = arrayUnion(message) as any;
        transaction.update(gameRef, updateData);
    });
}


export async function submitVote(gameId: string, voterId: string, votedForId: string) {
    if (!votedForId) throw new Error("يجب عليك اختيار لاعب للتصويت عليه.");

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        
        const game = gameDoc.data() as Game;
        if (game.gameState !== 'discussion') throw new Error("ليس وقت التصويت الآن.");

        const voter = game.players.find(p => p.id === voterId);
        if (!voter || (voter.status !== 'alive')) {
            throw new Error("لا يمكنك التصويت.");
        }
        
        const newVotes = { ...(game.votes || {}), [voterId]: votedForId };
        
        // Players who can vote
        const eligibleVoters = game.players.filter(p => p.status === 'alive');
        
        // If not all votes are in, just update the votes
        if (Object.keys(newVotes).length < eligibleVoters.length) {
            transaction.update(gameRef, { votes: newVotes });
            return;
        }

        // All votes are in, process the results
        const voteCounts: Record<string, number> = {};
        for (const vote of Object.values(newVotes)) {
            if (vote !== '__SKIP_VOTE__') {
                 voteCounts[vote] = (voteCounts[vote] || 0) + 1;
            }
        }
        
        let maxVotes = 0;
        let playersWithMaxVotes: string[] = [];
        for (const playerId in voteCounts) {
            if (voteCounts[playerId] > maxVotes) {
                maxVotes = voteCounts[playerId];
                playersWithMaxVotes = [playerId];
            } else if (voteCounts[playerId] === maxVotes && maxVotes > 0) {
                playersWithMaxVotes.push(playerId);
            }
        }
        
        let updatedPlayers = [...game.players];
        let nextGameState: GameState = 'voting_results';
        let lastVoteResult: Game['lastVoteResult'] = { tied: false };
        let gameEndResult: Game['gameResult'] | undefined = undefined;

        if (playersWithMaxVotes.length === 1) {
            // One player with the most votes
            const eliminatedPlayerId = playersWithMaxVotes[0];
            const eliminatedPlayerIndex = updatedPlayers.findIndex(p => p.id === eliminatedPlayerId);
            const eliminatedPlayer = updatedPlayers[eliminatedPlayerIndex];

            if (eliminatedPlayer) {
                if (eliminatedPlayer.role === 'killer') {
                    updatedPlayers[eliminatedPlayerIndex].status = 'voted_out';
                    nextGameState = 'ended';
                    gameEndResult = {
                        winner: 'detective_civilians',
                        message: `تم كشف القاتل ${eliminatedPlayer.alias}! المحقق والمدنيون ينتصرون!`,
                    };
                } else if (eliminatedPlayer.role === 'detective') {
                    updatedPlayers[eliminatedPlayerIndex].status = 'voted_out';
                    nextGameState = 'ended';
                    gameEndResult = {
                        winner: 'killer',
                        message: `تم طرد المحقق ${eliminatedPlayer.alias}! القاتل ينتصر!`,
                    };
                } else if (eliminatedPlayer.role === 'accomplice') {
                    updatedPlayers[eliminatedPlayerIndex].status = 'voted_out';
                    lastVoteResult = {
                        tied: false,
                        message: `تم كشف مساعد القاتل ${eliminatedPlayer.alias}! التحقيق مستمر.`
                    };
                } else { // Civilian or Witness
                    lastVoteResult = {
                        tied: false,
                        message: `الشخص الذي تم التصويت لإقصائه ليس القاتل. التحقيق مستمر.`
                    };
                }
            }
        } else {
            // This covers ties and cases where no one was voted for.
            lastVoteResult = { tied: true };
            if (playersWithMaxVotes.length > 1) {
                lastVoteResult.message = 'حدث تعادل في الأصوات! لا أحد سيغادر هذه الجولة.';
            } else { // 0 players with max votes (everyone skipped)
                lastVoteResult.message = 'لم يتم التصويت لإقصاء أي لاعب في هذه الجولة.';
            }
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: nextGameState,
            lastVoteResult: lastVoteResult,
            gameResult: gameEndResult || deleteField() as any,
        });
    });
}

export async function detectiveArrest(gameId: string, detectiveId: string, suspectId: string) {
    if (!suspectId) throw new Error("يجب اختيار مشتبه به للاعتقال.");

    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const detective = game.players.find(p => p.id === detectiveId);
        if (!detective || detective.role !== 'detective' || detective.status !== 'alive') {
            throw new Error("فقط المحقق الحي يمكنه تنفيذ الاعتقال.");
        }
        if (game.detectiveArrest?.used) {
            throw new Error("لقد استخدمت قدرة الاعتقال بالفعل.");
        }
        
        const suspectIndex = game.players.findIndex(p => p.id === suspectId);
        if (suspectIndex === -1) throw new Error("المشتبه به غير موجود.");
        
        let updatedPlayers = [...game.players];
        const suspect = updatedPlayers[suspectIndex];
        if(suspect.status !== 'alive') throw new Error("لا يمكن اعتقال لاعب غير حي.");

        let gameResult: Game['gameResult'];
        let nextGameState: GameState = 'ended';

        if (suspect.role === 'killer') {
            updatedPlayers[suspectIndex].status = 'arrested';
            gameResult = {
                winner: 'detective_civilians',
                message: `اعتقال صائب! المحقق ${detective.alias} قبض على القاتل ${suspect.alias}. انتصار ساحق!`,
            }
        } else if (suspect.role === 'accomplice') {
            updatedPlayers[suspectIndex].status = 'arrested';
            gameResult = {
                winner: 'detective_civilians', // This is still a win for detective team
                message: `تم القبض على الدنيء الذي يساعد القاتل! تستمر مطاردة القاتل الحقيقي.`,
            }
            nextGameState = 'discussion'; // The game continues
        } else { // Civilian or Witness
            updatedPlayers[suspectIndex].status = 'arrested';
            gameResult = {
                winner: 'killer',
                message: `اعتقال خاطئ! المحقق ${detective.alias} قبض على البريء ${suspect.alias}. القاتل ينتصر!`,
            }
        }

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: nextGameState,
            gameResult: gameResult,
            'detectiveArrest.used': true,
        });
    });
}

export async function continueToNextNight(gameId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'voting_results') throw new Error("لا يمكن بدء الليلة التالية الآن.");
        
        const alivePlayers = game.players.filter(p => p.status === 'alive');
        const aliveGoodTeam = alivePlayers.filter(p => p.role === 'detective' || p.role === 'witness' || p.role === 'civilian');
        const aliveKillerTeam = alivePlayers.filter(p => p.role === 'killer' || p.role === 'accomplice');
        
        if (aliveKillerTeam.length >= aliveGoodTeam.length) {
             transaction.update(gameRef, {
                gameState: 'ended',
                gameResult: {
                    winner: 'killer',
                    message: `عدد فريق القاتل أصبح مساويًا أو أكبر من الأبرياء. فريق القاتل ينتصر!`,
                }
             });
        } else {
             transaction.update(gameRef, {
                gameState: 'night',
                turn: (game.turn || 1) + 1,
                nightAction: {},
                votes: {},
                lastVoteResult: {},
                messages: [],
                detectiveAlert: deleteField() as any, // Clear the alert
            });
        }
    });
}


// Admin Actions
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

export async function countQuestions(criteria: { category?: string; searchTerm?: string; all?: boolean }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.all) {
        return { error: 'يجب تحديد معيار للعد.' };
    }

    try {
        const questionsCol = collection(db, 'questions');
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(questionsCol);
            count = querySnapshot.size;
        } else if (criteria.category) {
            const q = query(questionsCol, where('category', '==', criteria.category.trim()));
            const querySnapshot = await getDocs(q);
            count = querySnapshot.size;
        } else if (criteria.searchTerm) {
            const searchTerm = criteria.searchTerm.trim();
            const querySnapshot = await getDocs(questionsCol);
            querySnapshot.forEach(doc => {
                const text = doc.data().text as string;
                if (text && text.includes(searchTerm)) {
                    count++;
                }
            });
        }
        
        return { success: true, count };
    } catch (error) {
        console.error("Error counting questions:", error);
        return { error: 'حدث خطأ أثناء عد الأسئلة.' };
    }
}

export async function deleteQuestions(criteria: { category?: string; searchTerm?: string; all?: boolean }) {
    if (!criteria.category && !criteria.searchTerm && !criteria.all) {
        return { error: 'يجب تحديد معيار للحذف.' };
    }

    try {
        const batch = writeBatch(db);
        const questionsCol = collection(db, 'questions');
        let count = 0;

        if (criteria.all) {
            const querySnapshot = await getDocs(questionsCol);
            if (querySnapshot.empty) return { success: true, count: 0, message: 'قاعدة البيانات فارغة بالفعل.' };
            querySnapshot.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });
        } else if (criteria.category) {
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

export async function setFailedDetectiveAnimation(videoDataUri: string) {
    try {
        if (!videoDataUri.startsWith('data:video')) {
            return { error: 'ملف غير صالح. الرجاء رفع ملف فيديو.' };
        }
        // Firestore documents have a 1 MiB (1,048,576 bytes) limit.
        const MAX_DOC_SIZE = 1048576;
        if (videoDataUri.length > MAX_DOC_SIZE) {
            return { error: 'فشل الرفع. حجم الفيديو كبير جدًا بعد تحويله (يتجاوز 1 ميجابايت). حاول استخدام فيديو أصغر حجمًا.' };
        }

        const settingsRef = doc(db, 'game_settings', 'animations');
        await setDoc(settingsRef, { failedDetectiveVideoUrl: videoDataUri }, { merge: true });
        return { success: true };
    } catch (error) {
        console.error("Error setting custom animation:", error);
        if (isFirebaseError(error)) {
             // Firestore throws 'invalid-argument' when the 1MiB document size limit is exceeded.
            if (error.code === 'invalid-argument') {
                return { error: 'فشل الرفع. تجاوز حجم الفيديو الحد الأقصى المسموح به في قاعدة البيانات (1 ميجابايت) بعد المعالجة. الرجاء استخدام فيديو أصغر.' };
            }
            if (error.code === 'permission-denied') {
                return { error: 'فشل الرفع: ليس لديك الصلاحية للكتابة. تحقق من قواعد أمان Firestore.' };
            }
            return { error: `فشل الرفع بسبب خطأ في Firebase: ${error.message} (Code: ${error.code})` };
        }
        return { error: 'حدث خطأ غير متوقع أثناء حفظ الفيديو.' };
    }
}

export async function removeFailedDetectiveAnimation() {
    try {
        const settingsRef = doc(db, 'game_settings', 'animations');
        await updateDoc(settingsRef, {
            failedDetectiveVideoUrl: deleteField()
        });
        return { success: true };
    } catch (error) {
        console.error("Error removing custom animation:", error);
        if (isFirebaseError(error)) {
            if (error.code === 'permission-denied') {
                return { error: 'فشل الحذف: ليس لديك الصلاحية للكتابة. تحقق من قواعد أمان Firestore.' };
            }
            return { error: `فشل الحذف بسبب خطأ في Firebase: ${error.message} (Code: ${error.code})` };
        }
        return { error: 'حدث خطأ غير متوقع أثناء حذف الفيديو.' };
    }
}

export async function getFailedDetectiveAnimation() {
    try {
        const docRef = doc(db, 'game_settings', 'animations');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { success: true, url: docSnap.data().failedDetectiveVideoUrl || null };
        }
        return { success: true, url: null };
    } catch (error) {
        console.error("Error getting custom animation:", error);
        return { error: 'حدث خطأ أثناء جلب الفيديو.' };
    }
}
