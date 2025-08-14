'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge, PathTile } from '@/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Check,
  Loader2,
  BrainCircuit,
  ShieldAlert,
  X,
} from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const MEMORIZE_PER_TILE_DURATION = 400;
const PLAY_TIME_SECONDS = 20; // **تم التعديل: 20 ثانية**
const MAX_WRONG_ATTEMPTS = 3; 

type Phase = 'loading' | 'memorize' | 'play' | 'ended';

export function PathOfSurvival({
  game,
  self,
  challenge,
}: {
  game: Game;
  player: Player;
  self: Player;
  challenge: GeniusChallenge;
}) {
  const { toast } = useToast();
  const puzzle = game.challengeState?.puzzle;
  const originalPath: PathTile[] = puzzle?.path || [];
  const gridSize: number = puzzle?.gridSize || 0;

  const [phase, setPhase] = useState<Phase>('loading');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isWrongMove, setIsWrongMove] = useState<PathTile | null>(null);
  const [timeLeft, setTimeLeft] = useState(PLAY_TIME_SECONDS);
  const [memorizedPathVisual, setMemorizedPathVisual] = useState<PathTile[]>([]);
  const [playerDrawnPath, setPlayerDrawnPath] = useState<PathTile[]>([]);
  const [currentDrawStep, setCurrentDrawStep] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  const timerRef = useRef<number | null>(null);
  const memorizeIntervalRef = useRef<number | null>(null);
  const hasMemorizePhaseStarted = useRef(false);
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);
  const submittedRef = useRef(false);

  const [finalDrawnPathForFeedback, setFinalDrawnPathForFeedback] = useState<PathTile[] | null>(null);

  // refs لقيم حيّة آمنة من مشاكل الإغلاق
  const playerDrawnPathRef = useRef<PathTile[]>([]);
  const timeLeftRef = useRef(PLAY_TIME_SECONDS);

  useEffect(() => { playerDrawnPathRef.current = playerDrawnPath; }, [playerDrawnPath]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const clearMemorizeInterval = () => {
    if (memorizeIntervalRef.current) {
      clearInterval(memorizeIntervalRef.current);
      memorizeIntervalRef.current = null;
    }
  };

  const safeScore = () => {
    // عدد الخطوات الصحيحة (يشمل خانة البداية) = currentDrawStep
    // نفترض أن الخانة 0 (البداية) محسوبة عند التهيئة
    return Math.max(0, Math.min(currentDrawStep, originalPath.length));
  };

  const handleFailure = useCallback(
    async (reason: 'timeout' | 'maxWrong' | 'earlyExit' = 'timeout') => {
      if (phase === 'ended' || hasSubmitted || isSubmittingResult || submittedRef.current) return;
      submittedRef.current = true;

      setPhase('ended');
      setHasSubmitted(true);
      clearTimer();

      const timeTaken = PLAY_TIME_SECONDS - timeLeftRef.current;
      setIsSubmittingResult(true);
      try {
        await submitChallengeResult(game.id, self.id, {
          isCorrect: false,
          time: timeTaken,
          playerDrawnPath: playerDrawnPathRef.current,
          score: safeScore(),
        });
      } catch (error) {
        // إخفاق غير مانع
        console.error("Failed to submit failure result:", error);
      } finally {
        setIsSubmittingResult(false);
      }

      const msg =
        reason === 'timeout' ? 'انتهى الوقت!' :
        reason === 'maxWrong' ? 'عدد المحاولات الخاطئة تجاوز الحد.' :
        'انتهت الجولة.';
      toast({
        title: msg,
        description: 'حظًا أفضل في المرة القادمة.',
        variant: 'destructive',
      });
    },
    [phase, hasSubmitted, isSubmittingResult, game.id, self.id, toast, currentDrawStep, originalPath.length]
  );

  useEffect(() => {
    return () => {
      clearTimer();
      clearMemorizeInterval();
    };
  }, []);

  useEffect(() => {
    const myResult = game.challengeState?.results?.find((r) => r.playerId === self.id);
    if (myResult) {
      setHasSubmitted(true);
      setPhase('ended');
      hasMemorizePhaseStarted.current = false;
      setFinalDrawnPathForFeedback(myResult.playerDrawnPath || null);
      submittedRef.current = true;
    } else if (originalPath.length > 0 && gridSize > 0 && game.gameState === 'challenge_active') {
      if (!hasMemorizePhaseStarted.current) {
        setPhase('memorize');
        setMemorizedPathVisual([]);
        setPlayerDrawnPath([originalPath[0]!]); // نقطة البداية
        setCurrentDrawStep(1); // بدأنا من الخانة 0 بالفعل
        setWrongAttempts(0);
        setIsWrongMove(null);
        setTimeLeft(PLAY_TIME_SECONDS);
        hasMemorizePhaseStarted.current = true;
        setFinalDrawnPathForFeedback(null);
        submittedRef.current = false;
      }
    } else if (game.gameState === 'challenge_intro' && (originalPath.length === 0 || gridSize === 0)) {
      setPhase('loading');
      hasMemorizePhaseStarted.current = false;
      setFinalDrawnPathForFeedback(null);
      submittedRef.current = false;
    }
  }, [game.challengeState?.results, self.id, originalPath, gridSize, game.gameState]);

  // عرض/إخفاء مسار الحفظ
  useEffect(() => {
    clearMemorizeInterval();
    if (phase === 'memorize' && originalPath.length > 0) {
      setMemorizedPathVisual([]);
      let i = 0;
      const id = window.setInterval(() => {
        if (i < originalPath.length) {
          setMemorizedPathVisual((prev) => [...prev, originalPath[i]!]);
          i++;
        } else {
          clearInterval(id);
          memorizeIntervalRef.current = null;
          setTimeout(() => { setPhase('play'); }, MEMORIZE_PER_TILE_DURATION);
        }
      }, MEMORIZE_PER_TILE_DURATION);
      memorizeIntervalRef.current = id;
      return () => clearInterval(id);
    }
  }, [phase, originalPath]);

  // مؤقّت اللعب
  useEffect(() => {
    clearTimer();
    if (phase !== 'play' || hasSubmitted) return;

    const id = window.setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(id);
          timerRef.current = null;
          void handleFailure('timeout');
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);
    timerRef.current = id;

    // تحديث فوري عند الرجوع من الخلفية
    const onVis = () => { if (!document.hidden) {
      setTimeLeft((t) => t); // تحفيز إعادة الحساب البصري، والـ tick التالي سيصّحح
    }};
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(id);
      timerRef.current = null;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [phase, hasSubmitted, handleFailure]);

  const isStartTile = (x: number, y: number) =>
    originalPath && originalPath.length > 0 && originalPath[0] && originalPath[0].x === x && originalPath[0].y === y;
  const isEndTile = (x: number, y: number) =>
    originalPath &&
    originalPath.length > 0 &&
    originalPath[originalPath.length - 1] &&
    originalPath[originalPath.length - 1]!.x === x && originalPath[originalPath.length - 1]!.y === y;
  const isMemorizedVisualTile = (x: number, y: number) =>
    phase === 'memorize' && memorizedPathVisual.some((p) => p && p.x === x && p.y === y);
  const isPlayerDrawnTile = (x: number, y: number) =>
    (phase === 'play' || phase === 'ended') && playerDrawnPath.some((p) => p && p.x === x && p.y === y);
  const isWrongTile = (x: number, y: number) =>
    isWrongMove?.x === x && isWrongMove?.y === y;

  // التحقق من المربّع المتوقع التالي وفق **نفس ترتيب المسار الأصلي**
  const isNextExactTile = (x: number, y: number) => {
    const nextIndex = currentDrawStep; // لأننا بدأنا من 1
    const next = originalPath[nextIndex];
    return !!next && next.x === x && next.y === y;
  };

  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || hasSubmitted || isSubmittingResult) return;

    // منع إعادة الضغط على البداية بعد التهيئة
    if (isStartTile(x, y) && playerDrawnPath.length > 0) return;

    // يجب اتباع الترتيب الصحيح للمسار
    if (isNextExactTile(x, y)) {
      const newDrawnPath = [...playerDrawnPath, { x, y }];
      setPlayerDrawnPath(newDrawnPath);
      setIsWrongMove(null);
      const nextStep = currentDrawStep + 1;
      setCurrentDrawStep(nextStep);

      // إن وصلنا للنهاية (آخر خانة في المسار)
      if (nextStep >= originalPath.length) {
        setPhase('ended');
        setIsSubmittingResult(true);
        clearTimer();

        const timeTaken = PLAY_TIME_SECONDS - timeLeft;
        if (submittedRef.current) return;
        submittedRef.current = true;

        try {
          await submitChallengeResult(game.id, self.id, {
            isCorrect: true,
            time: timeTaken,
            playerDrawnPath: newDrawnPath,
            score: originalPath.length, // مسار مكتمل
          });
          setHasSubmitted(true);
        } catch (error) {
          console.error("Failed to submit result:", error);
          toast({
            title: 'خطأ في الإرسال!',
            description: 'حدث خطأ أثناء إرسال نتيجتك.',
            variant: 'destructive',
          });
          // نسمح بالعودة للّعب لإعادة المحاولة بالإرسال فقط إن الوقت لم ينته
          setPhase('play');
          setHasSubmitted(false);
          submittedRef.current = false;
        } finally {
          setIsSubmittingResult(false);
        }
      }
    } else {
      // حركة خاطئة: اهتزاز + إعادة تهيئة للمسار المرسوم للبداية + عدّ الأخطاء
      toast({
        title: 'مسار خاطئ!',
        description: `يجب اتباع الترتيب الصحيح للمسار. (${wrongAttempts + 1}/${MAX_WRONG_ATTEMPTS})`,
        variant: 'destructive',
        duration: 2000,
      });
      setPlayerDrawnPath([originalPath[0]!]);
      setCurrentDrawStep(1);
      setIsWrongMove({ x, y });
      setTimeout(() => setIsWrongMove(null), 500);

      setWrongAttempts((w) => {
        const next = w + 1;
        if (next >= MAX_WRONG_ATTEMPTS) {
          void handleFailure('maxWrong');
        }
        return next;
      });
    }
  };

  if (hasSubmitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
          <CardHeader>
            <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
            <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
            {isSubmittingResult && <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary mt-4" />}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (phase === 'loading' || !puzzle || originalPath.length === 0 || gridSize === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
          <CardHeader>
            <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">جاري توليد المسار أو تحميله...</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="w-full max-w-xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
          {phase === 'memorize' ? <BrainCircuit /> : <ShieldAlert />}
          {challenge.name}
        </CardTitle>
        <CardDescription>
          {phase === 'memorize'
            ? `احفظ المسار! سيختفي بعد قليل.`
            : `اتبع المسار بنفس الترتيب! لديك ${timeLeft} ثوانٍ — محاولات خاطئة: ${wrongAttempts}/${MAX_WRONG_ATTEMPTS}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        {/* شريط الوقت */}
        <div className="w-full bg-gray-800 p-2 rounded-lg">
          <div className="relative h-3 w-full bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 h-full bg-red-500"
              initial={false}
              animate={{
                width:
                  phase === 'play'
                    ? `${(timeLeft / PLAY_TIME_SECONDS) * 100}%`
                    : '100%',
              }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          </div>
        </div>

        {/* الشبكة */}
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
        >
          {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);

            const isClickable =
              phase === 'play' &&
              !isSubmittingResult &&
              // يُسمح بالنقر فقط على الخانة المتوقعة التالية أو عدم السماح بالبداية ثانية
              (currentDrawStep === 1
                ? isStartTile(x, y) && playerDrawnPath.length === 1 // منع إعادة اختيار البداية لاحقًا
                : isNextExactTile(x, y));

            const tileClasses = cn(
              'w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-md transition-all duration-200 text-xs font-bold',
              'bg-gray-800 border-2 border-gray-700',
              isClickable && 'cursor-pointer hover:bg-gray-700',
              isSubmittingResult && 'opacity-50 cursor-not-allowed',
              isMemorizedVisualTile(x, y) && 'bg-green-500',
              (phase === 'play' && isPlayerDrawnTile(x, y)) && 'bg-yellow-500',
              isWrongTile(x, y) && 'bg-red-500 animate-shake',
              isStartTile(x, y) && 'bg-blue-500',
              isEndTile(x, y) && 'bg-purple-500',
              (phase === 'ended' && finalDrawnPathForFeedback?.some(p => p.x === x && p.y === y) &&
                originalPath[currentDrawStep - 1]?.x === x && originalPath[currentDrawStep - 1]?.y === y) && 'bg-green-600'
            );

            return (
              <div
                key={`${x}-${y}`}
                className={tileClasses}
                onClick={() => isClickable && handleTileClick(x, y)}
              >
                {isStartTile(x, y) && (
                  <span className="text-white text-lg">&#x25CF;</span>
                )}
                {isEndTile(x, y) && (
                  <span className="text-white text-lg">&#x25A0;</span>
                )}
                {isWrongTile(x,y) && <X className="w-6 h-6 text-white" />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
