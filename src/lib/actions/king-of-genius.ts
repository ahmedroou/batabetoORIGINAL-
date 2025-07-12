'use server'; // هذا التوجيه يضمن أن الكود يعمل على الخادم

import { db } from '@/lib/firebase'; // استيراد مثيل قاعدة بيانات Firestore
import { doc, runTransaction, getDoc, Timestamp, deleteField } from 'firebase/firestore';
import type { Game, Player, ChallengeResult, PlayerProgress, GridPosition } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges'; // بيانات التحديات
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge'; // دالة لتوليد الألغاز

const STARTING_POINTS_MAZE = 10; // نقاط بدء تحدي المتاهة (غير مستخدمة حاليًا في PathOfSurvival)
const INTRO_COUNTDOWN_SECONDS = 5; // مدة العد التنازلي قبل بدء التحدي الفعلي

/**
 * تحديث تقدم لاعب معين في التحدي الحالي.
 * هذه الدالة تُستدعى بشكل متكرر من الواجهة الأمامية لتحديث حالة اللاعب.
 * @param gameId معرف اللعبة.
 * @param playerId معرف اللاعب.
 * @param progress كائن يحتوي على التحديثات الجزئية لتقدم اللاعب.
 */
export async function updateChallengeProgress(
  gameId: string,
  playerId: string,
  progress: Partial<PlayerProgress>
) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  try {
    await runTransaction(db, async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists()) throw new Error('Game not found.');
      const game = gameDoc.data() as Game;

      // السماح بتحديثات التقدم فقط خلال مرحلة التحدي النشطة
      if (game.gameState !== 'challenge_active') {
        // يمكن تسجيل هذا كتحذير إذا كان يحدث كثيرًا بشكل غير متوقع
        console.warn(`Attempted to update progress for player ${playerId} in game ${gameId} during inactive state: ${game.gameState}`);
        return;
      }

      const playerProgress = game.challengeState?.playerProgress || {};
      const currentProgress = playerProgress[playerId] || {};
      
      const newProgress = { ...currentProgress, ...progress };

      transaction.update(gameRef, {
        [`challengeState.playerProgress.${playerId}`]: newProgress,
      });
    });
  } catch (error) {
    // يتم تسجيل الخطأ على الخادم فقط، حيث أن هذه العملية "fire-and-forget" من منظور العميل
    console.error(`Error updating progress for player ${playerId}:`, error);
  }
}

/**
 * نقل حالة اللعبة إلى مرحلة اختيار الفريق.
 * @param gameId معرف اللعبة.
 */
export async function progressToTeamSelection(gameId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;
    if (game.gameState === 'lobby') {
      transaction.update(gameRef, { gameState: 'instructions' });
    }
  });
}

/**
 * بدء لعبة "King of Genius" الفعلية بعد اختيار الفرق.
 * تتضمن توليد جميع الألغاز مقدمًا.
 * @param gameId معرف اللعبة.
 * @param userId معرف المستخدم الذي بدأ اللعبة (المضيف).
 */
export async function startKingOfGeniusGame(gameId: string, userId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    // التحقق من صلاحيات المضيف
    if (game.hostId !== userId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء اللعبة.');
    }

    // التحقق من حالة اللعبة
    if (game.gameState !== 'instructions') {
      console.warn(`Game ${gameId} is not in 'instructions' state. Current state: ${game.gameState}. Skipping start.`);
      return; // منع البدء المتعدد أو البدء من حالة خاطئة
    }

    // التحقق من اللاعبين والفرق
    const activePlayers = game.players.filter((p) => p.status === 'alive');
    if (activePlayers.some((p) => !p.team)) {
      throw new Error('يجب على جميع اللاعبين اختيار فريق أولاً.');
    }

    const teamA = activePlayers.filter((p) => p.team === 'A');
    const teamB = activePlayers.filter((p) => p.team === 'B');
    if (teamA.length !== teamB.length) {
      throw new Error('يجب أن تكون الفرق متوازنة.');
    }
    if (teamA.length === 0) {
      throw new Error('لا يمكن بدء اللعبة بفرق فارغة.');
    }

    // خلط ترتيب التحديات
    const shuffledChallenges = [...GENIUS_CHALLENGES].sort(
      () => 0.5 - Math.random()
    );
    const challengeOrder = shuffledChallenges.map((c) => c.id);
    
    // توليد جميع الألغاز مقدمًا لتجنب التأخير أثناء اللعب
    const puzzlePromises = challengeOrder.map(challengeId => 
        generateGeniusChallenge({ challengeId })
    );
    const puzzleResults = await Promise.all(puzzlePromises);
    
    // تحويل الألغاز إلى سلاسل نصية لتخزينها في Firestore (لتجنب مشاكل المصفوفات المتداخلة)
    const puzzlesAsString = puzzleResults.map(res => JSON.stringify(res.puzzle));
    
    // إعداد التحدي الأول
    const firstChallengeId = challengeOrder[0];
    let firstChallengeDuration = 90; // مدة افتراضية
    if (firstChallengeId === 'hidden_maze') {
        firstChallengeDuration = 40;
    }
    if (firstChallengeId === 'path_of_survival') {
        firstChallengeDuration = 20; // المدة المحددة للعبة Path of Survival
    }
    if (firstChallengeId === 'smart_grid_puzzle') {
        firstChallengeDuration = 120;
    }

    const challengeEndsAt = Timestamp.fromMillis(Date.now() + (firstChallengeDuration + INTRO_COUNTDOWN_SECONDS) * 1000);

    // تحديث حالة اللعبة لبدء التحدي الأول
    transaction.update(gameRef, {
      gameState: 'challenge_intro', // تبدأ بمرحلة المقدمة
      challengeOrder,
      puzzles: puzzlesAsString, // تخزين جميع الألغاز المولدة كسلاسل
      currentChallengeIndex: 0,
      teamScores: { A: 0, B: 0 },
      challengeState: {
          duration: firstChallengeDuration,
          challengeEndsAt,
          // لا نضع اللغز هنا مباشرة، بل يتم تحميله في beginChallenge
          // playerProgress و results يتم تهيئتهما في beginChallenge
      },
    });
  });
}

/**
 * بدء التحدي الفعلي بعد مرحلة المقدمة والعد التنازلي.
 * يقوم بتحميل اللغز المناسب للتحدي الحالي.
 * @param gameId معرف اللعبة.
 * @param hostId معرف المضيف للتحقق من الصلاحيات.
 */
export async function beginChallenge(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء التحدي.');
    }

    if (game.gameState !== 'challenge_intro') {
      // تجنب بدء نفس التحدي مرتين أو البدء من حالة خاطئة
      console.warn(`Game ${gameId} is not in 'challenge_intro' state. Current state: ${game.gameState}. Skipping begin challenge.`);
      return;
    }
    
    const challengeIndex = game.currentChallengeIndex ?? 0;
    const challengeId = game.challengeOrder?.[challengeIndex];
    if (!challengeId) {
        throw new Error("لم يتم العثور على التحدي التالي في القائمة.");
    }

    const puzzleString = game.puzzles?.[challengeIndex];
    if (!puzzleString) {
        throw new Error(`فشل تحميل لغز للتحدي: ${challengeId}. اللغز غير موجود في قائمة الألغاز المولدة مسبقًا.`);
    }

    // تحليل اللغز من السلسلة النصية إلى كائن JSON
    const puzzle = JSON.parse(puzzleString);

    const initialProgress: Record<string, PlayerProgress> = {};
    // تهيئة تقدم جميع اللاعبين مسبقًا لتجنب حالات السباق
    game.players.forEach(p => {
        if (p.status === 'alive') {
            // **التعديل هنا:** بدء currentStep من 1 بدلاً من 0
            initialProgress[p.id] = { currentStep: 1, wrongAttempts: 0 }; 
        }
    });

    // تحديث حالة اللعبة إلى "نشطة" وتحميل اللغز وتهيئة التقدم والنتائج
    transaction.update(gameRef, { 
        gameState: 'challenge_active',
        'challengeState.puzzle': puzzle, // تحميل اللغز هنا
        'challengeState.results': [],
        'challengeState.playerProgress': initialProgress,
    });
  });
}

/**
 * التحقق من حل لاعب لتحدي Smart Grid Puzzle.
 * @param gameId معرف اللعبة.
 * @param playerId معرف اللاعب.
 * @param userAnswers إجابات اللاعب.
 */
export async function checkSmartGridSolution(gameId: string, playerId: string, userAnswers: Record<string, string>) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  try {
    const result = await runTransaction(db, async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists()) throw new Error('Game not found.');
      const game = gameDoc.data() as Game;

      const playerProgress = game.challengeState?.playerProgress?.[playerId] || {};
      if (playerProgress.checkUsed) {
        throw new Error('لقد استخدمت ميزة التحقق بالفعل.');
      }
      
      const puzzle = game.challengeState?.puzzle;
      const solution = puzzle?.solution;
      const nodes = puzzle?.nodes;

      if (!solution || !nodes) {
        throw new Error('Puzzle data is missing.');
      }
      
      const correctCells: GridPosition[] = [];
      const incorrectCells: GridPosition[] = [];

      nodes.forEach((node: any) => {
        if (node.value === null) { // فقط الخلايا التي يجب على اللاعب ملؤها
          const key = `${node.r}-${node.c}`;
          const userAnswerStr = userAnswers[key];
          const correctAnswer = solution[node.r]?.[node.c];
          
          if (userAnswerStr && userAnswerStr !== '') {
            const userAnswer = parseInt(userAnswerStr, 10);
            if (!isNaN(userAnswer)) {
                if (userAnswer === correctAnswer) {
                    correctCells.push({ r: node.r, c: node.c });
                } else {
                    incorrectCells.push({ r: node.r, c: node.c });
                }
            }
          }
        }
      });
      
      const checkResult = { correctCells, incorrectCells };

      transaction.update(gameRef, {
        [`challengeState.playerProgress.${playerId}.checkUsed`]: true,
        [`challengeState.playerProgress.${playerId}.lastCheckResult`]: checkResult,
      });

      return checkResult;
    });
    return { success: true, checkResult: result };
  } catch (error: any) {
    console.error(`Error checking solution for player ${playerId}:`, error);
    return { success: false, error: error.message || 'An unknown error occurred.' };
  }
}

/**
 * إرسال النتيجة النهائية للاعب في التحدي الحالي.
 * @param gameId معرف اللعبة.
 * @param playerId معرف اللاعب.
 * @param result كائن يحتوي على نتيجة اللاعب (صحيح/خطأ، وقت، نقاط).
 */
export async function submitChallengeResult(
  gameId: string,
  playerId: string,
  result: Omit<ChallengeResult, 'playerId' | 'team'>
) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) {
      throw new Error('اللعبة غير موجودة.');
    }
    let game = gameDoc.data() as Game;

    // السماح بالإرسال حتى لو كانت حالة اللعبة قد تغيرت إلى 'challenge_results' بواسطة لاعب آخر
    // هذا يمنع حالة السباق حيث يتم تجاهل إرسال صالح للاعب
    if (game.gameState !== 'challenge_active' && game.gameState !== 'challenge_results') {
      console.warn(`Player ${playerId} attempted to submit result in game ${gameId} during invalid state: ${game.gameState}. Skipping submission.`);
      return;
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player?.team) {
      console.warn(`Player ${playerId} has no team in game ${gameId}. Skipping submission.`);
      return;
    }

    let currentResults = game.challengeState?.results || [];
    // منع الإرسالات المكررة من نفس اللاعب لنفس التحدي
    if (currentResults.some((r) => r.playerId === playerId)) {
      console.warn(`Player ${playerId} already submitted result for game ${gameId}. Skipping duplicate submission.`);
      return;
    }
    
    const finalScore = result.score || 0; // التأكد من وجود نقاط

    const newResult: ChallengeResult = {
      playerId,
      team: player.team,
      isCorrect: result.isCorrect,
      time: result.time,
      score: finalScore,
    };

    const updatedResults = [...currentResults, newResult];

    const updateData: any = {
      'challengeState.results': updatedResults,
    };

    const activePlayers = game.players.filter((p) => p.status === 'alive');

    // التحقق مما إذا كان جميع اللاعبين النشطين قد أرسلوا نتائجهم
    if (updatedResults.length >= activePlayers.length) {
        const sortedCorrectResults = updatedResults
            .filter((r) => r.isCorrect) // فقط النتائج الصحيحة تحسب للنقاط الإضافية
            .sort((a, b) => {
                // الفرز الأساسي: حسب النقاط (تنازلي)
                if ((b.score ?? 0) !== (a.score ?? 0)) {
                    return (b.score ?? 0) - (a.score ?? 0);
                }
                // الفرز الثانوي: حسب الوقت (تصاعدي) لكسر التعادل
                return a.time - b.time;
            });

        const pointsMap = [10, 5, 3, 1]; // نقاط إضافية بناءً على الترتيب
        const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };

        sortedCorrectResults.forEach((res, index) => {
            let totalPointsForPlayer = 0;
            const rankBonus = pointsMap[index] || 0; // الحصول على نقاط الترتيب
            totalPointsForPlayer += rankBonus;
            totalPointsForPlayer += res.score || 0; // إضافة النقاط الأساسية من التحدي نفسه
            
            if (totalPointsForPlayer > 0) {
                newScores[res.team] = (newScores[res.team] || 0) + totalPointsForPlayer;
            }
        });

      updateData.teamScores = newScores;
      updateData.gameState = 'challenge_results'; // الانتقال إلى مرحلة عرض النتائج
      // يمكن هنا أيضًا مسح playerProgress إذا لم تعد هناك حاجة له
      updateData['challengeState.playerProgress'] = deleteField(); // مسح التقدم بعد انتهاء التحدي
    }

    transaction.update(gameRef, updateData);
  });
}

/**
 * الانتقال إلى التحدي التالي أو إنهاء اللعبة إذا كانت جميع التحديات قد اكتملت.
 * @param gameId معرف اللعبة.
 * @param hostId معرف المضيف للتحقق من الصلاحيات.
 */
export async function nextChallenge(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId.toUpperCase());

  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;

    if (game.hostId !== hostId) {
      throw new Error('فقط صاحب الغرفة يمكنه بدء الجولة التالية.');
    }
    if (game.gameState !== 'challenge_results') {
      console.warn(`Game ${gameId} is not in 'challenge_results' state. Current state: ${game.gameState}. Skipping next challenge.`);
      return;
    }

    const nextIndex = (game.currentChallengeIndex ?? 0) + 1;

    if (nextIndex >= (game.challengeOrder?.length || 0)) {
      // جميع التحديات قد اكتملت، تحديد الفائز النهائي
      let winner: Game['gameResult']['winner'] = 'تعادل';
      let message = 'انتهت المواجهة بالتعادل!';
      const teamAScore = game.teamScores?.A || 0;
      const teamBScore = game.teamScores?.B || 0;

      if (teamAScore > teamBScore) {
        winner = 'الفريق الأزرق';
        message = 'الفريق الأزرق يسحق الفريق الوردي!';
      } else if (teamBScore > teamAScore) {
        winner = 'الفريق الأحمر';
        message = 'الفريق الوردي يتغلب على الفريق الأزرق!';
      }
      transaction.update(gameRef, {
        gameState: 'final_results',
        gameResult: { winner, message },
      });
    } else {
      // الانتقال إلى التحدي التالي
        const nextChallengeId = game.challengeOrder?.[nextIndex];
        let nextChallengeDuration = 90; // مدة افتراضية
        if (nextChallengeId === 'hidden_maze') {
            nextChallengeDuration = 40;
        }
        if (nextChallengeId === 'path_of_survival') {
            nextChallengeDuration = 20;
        }
        if (nextChallengeId === 'smart_grid_puzzle') {
            nextChallengeDuration = 120;
        }

        const challengeEndsAt = Timestamp.fromMillis(Date.now() + (nextChallengeDuration + INTRO_COUNTDOWN_SECONDS) * 1000);

        // إعادة تهيئة challengeState للتحدي الجديد
        // يتم مسح اللغز السابق والنتائج والتقدم
        transaction.update(gameRef, {
            currentChallengeIndex: nextIndex,
            gameState: 'challenge_intro', // العودة إلى مرحلة المقدمة للتحدي الجديد
            challengeState: {
                duration: nextChallengeDuration,
                challengeEndsAt,
                playerProgress: {}, // تهيئة تقدم اللاعبين للتحدي الجديد
                results: [], // تهيئة النتائج للتحدي الجديد
                puzzle: {}, // مسح اللغز السابق (سيتم تحميل اللغز الجديد في beginChallenge)
            },
        });
    }
  });
}

/**
 * السماح للاعب باختيار فريق.
 * @param gameId معرف اللعبة.
 * @param playerId معرف اللاعب.
 * @param team الفريق المختار ('A' أو 'B').
 */
export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
  const gameRef = doc(db, 'games', gameId.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists()) throw new Error('اللعبة غير موجودة.');
    const game = gameDoc.data() as Game;
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error('اللاعب غير موجود.');

    const activePlayers = game.players.filter(p => p.status === 'alive');
    const teamPlayers = activePlayers.filter(p => p.team === team);
    const maxTeamSize = Math.ceil(activePlayers.length / 2); // ضمان توازن الفرق

    if (teamPlayers.length >= maxTeamSize) {
        const currentPlayerInTeam = teamPlayers.some(p => p.id === playerId);
        if (!currentPlayerInTeam) {
            throw new Error('هذا الفريق ممتلئ.');
        }
    }
    
    const updatedPlayers = [...game.players];
    updatedPlayers[playerIndex].team = team;

    transaction.update(gameRef, { players: updatedPlayers });
  });
}
