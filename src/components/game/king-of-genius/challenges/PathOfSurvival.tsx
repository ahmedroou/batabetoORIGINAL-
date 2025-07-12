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

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasMemorizePhaseStarted = useRef(false);
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);

  const [finalDrawnPathForFeedback, setFinalDrawnPathForFeedback] = useState<PathTile[] | null>(null);

  // **جديد:** refs لتخزين أحدث قيم playerDrawnPath و timeLeft
  const playerDrawnPathRef = useRef<PathTile[]>([]);
  const timeLeftRef = useRef(PLAY_TIME_SECONDS);

  // useEffect لتحديث playerDrawnPathRef
  useEffect(() => {
    playerDrawnPathRef.current = playerDrawnPath;
  }, [playerDrawnPath]);

  // useEffect لتحديث timeLeftRef
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);


  // **التعديل هنا:** جعل handleFailure أكثر استقرارًا باستخدام refs
  const handleFailure = useCallback(
    async () => {
      if (phase === 'ended' || hasSubmitted || isSubmittingResult) return;
      setPhase('ended');
      setHasSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);

      const timeTaken = PLAY_TIME_SECONDS - timeLeftRef.current; // استخدام timeLeftRef
      setIsSubmittingResult(true); 
      try {
        await submitChallengeResult(game.id, self.id, {
          isCorrect: false,
          time: timeTaken,
          playerDrawnPath: playerDrawnPathRef.current, // استخدام playerDrawnPathRef
          score: 0,
        });
      } catch (error) {
        console.error("Failed to submit failure result:", error);
      } finally {
        setIsSubmittingResult(false);
      }
      toast({
        title: 'انتهى الوقت!',
        description: 'حظًا أفضل في المرة القادمة.',
        variant: 'destructive',
      });
    },
    // الاعتماديات أصبحت أكثر استقرارًا
    [phase, hasSubmitted, isSubmittingResult, game.id, self.id, toast] 
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const myResult = game.challengeState?.results?.find((r) => r.playerId === self.id);
    if (myResult) {
      setHasSubmitted(true);
      setPhase('ended');
      hasMemorizePhaseStarted.current = false;
      setFinalDrawnPathForFeedback(myResult.playerDrawnPath || null);
    } else if (originalPath.length > 0 && gridSize > 0 && game.gameState === 'challenge_active') {
      if (!hasMemorizePhaseStarted.current) {
        setPhase('memorize');
        setMemorizedPathVisual([]);
        setPlayerDrawnPath([originalPath[0]!]); // تهيئة المسار المرسوم بنقطة البداية
        setCurrentDrawStep(0);
        setIsWrongMove(null);
        setTimeLeft(PLAY_TIME_SECONDS); 
        hasMemorizePhaseStarted.current = true;
        setFinalDrawnPathForFeedback(null);
      }
    } else if (game.gameState === 'challenge_intro' && (originalPath.length === 0 || gridSize === 0)) {
        setPhase('loading');
        hasMemorizePhaseStarted.current = false;
        setFinalDrawnPathForFeedback(null);
    }
  }, [game.challengeState?.results, self.id, originalPath, gridSize, game.gameState]);

  useEffect(() => {
    if (phase === 'memorize' && originalPath.length > 0) {
      setMemorizedPathVisual([]);
      let i = 0;
      const interval = setInterval(() => {
        if (i < originalPath.length) {
          setMemorizedPathVisual((prev) => [...prev, originalPath[i]!]);
          i++;
        } else {
          clearInterval(interval);
          setTimeout(() => {
            setPhase('play');
          }, MEMORIZE_PER_TILE_DURATION);
        }
      }, MEMORIZE_PER_TILE_DURATION);
      return () => clearInterval(interval);
    }
  }, [phase, originalPath]);

  // هذا useEffect لم يعد ضروريًا لتهيئة playerDrawnPath حيث تم نقله إلى useEffect الرئيسي
  // useEffect(() => {
  //   if (phase === 'play' && originalPath.length > 1) {
  //     if (playerDrawnPath.length === 0 && originalPath.length > 0) {
  //       setPlayerDrawnPath([originalPath[0]!]);
  //       setCurrentDrawStep(0);
  //     }
  //   }
  // }, [phase, originalPath, playerDrawnPath.length]);

  // **التعديل الرئيسي هنا:** المؤقت
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (phase !== 'play' || hasSubmitted) {
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timerRef.current!);
          handleFailure(); 
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current!);
  }, [phase, hasSubmitted, handleFailure]); // الاعتماديات مستقرة الآن

  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || hasSubmitted || isSubmittingResult) return;

    // السماح بالضغط على نقطة البداية فقط إذا كان المسار المرسوم فارغًا (أول نقرة)
    if (isStartTile(x, y) && playerDrawnPath.length > 0) return;

    // إذا كان المسار المرسوم فارغًا ونقطة البداية ليست هي المربع الذي تم النقر عليه، فهذا خطأ
    if (playerDrawnPath.length === 0 && !isStartTile(x, y)) {
      toast({
          title: 'مسار خاطئ!',
          description: 'يجب أن تبدأ من نقطة البداية.',
          variant: 'destructive',
          duration: 2000,
      });
      setIsWrongMove({x,y});
      setTimeout(() => setIsWrongMove(null), 500);
      return;
    }

    const lastDrawnTile = playerDrawnPath[playerDrawnPath.length - 1];

    const isAdjacent = lastDrawnTile && (
        (Math.abs(lastDrawnTile.x - x) === 1 && lastDrawnTile.y === y) ||
        (Math.abs(lastDrawnTile.y - y) === 1 && lastDrawnTile.x === x)
    );
    // الشرط الأول (isCorrectFirstStep) لم يعد ضروريًا بعد تعديل منطق البدء
    // حيث أننا نضمن أن playerDrawnPath يبدأ بنقطة البداية
    // والتحقق من isAdjacent سيعمل بشكل صحيح من المربع الثاني
    
    // التحقق من أن المربع الذي تم النقر عليه هو مجاور للمربع الأخير في المسار المرسوم
    // أو أنه مربع البداية إذا كان المسار المرسوم فارغًا
    if (isAdjacent || (playerDrawnPath.length === 0 && isStartTile(x,y))) {
        const newDrawnPath = [...playerDrawnPath, { x, y }];
        setPlayerDrawnPath(newDrawnPath);
        setIsWrongMove(null);

        setCurrentDrawStep(currentDrawStep + 1);

        if (isEndTile(x, y)) {
            setPhase('ended');
            setIsSubmittingResult(true);
            if (timerRef.current) clearInterval(timerRef.current);

            const timeTaken = PLAY_TIME_SECONDS - timeLeft;
            
            try {
              await submitChallengeResult(game.id, self.id, {
                  isCorrect: true,
                  time: timeTaken,
                  playerDrawnPath: newDrawnPath,
                  score: 0,
              });
              setHasSubmitted(true);
            } catch (error) {
              console.error("Failed to submit result:", error);
              toast({
                  title: 'خطأ في الإرسال!',
                  description: 'حدث خطأ أثناء إرسال نتيجتك.',
                  variant: 'destructive',
              });
              setPhase('play'); 
              setHasSubmitted(false);
            } finally {
              setIsSubmittingResult(false);
            }
        }
    } else {
        toast({
            title: 'مسار خاطئ!',
            description: 'يجب أن تتبع المسار الصحيح. ابدأ من جديد.',
            variant: 'destructive',
            duration: 2000,
        });
        if (originalPath.length > 0) {
          setPlayerDrawnPath([originalPath[0]!]);
        } else {
          setPlayerDrawnPath([]);
        }
        setCurrentDrawStep(0);
        setIsWrongMove({x,y});
        setTimeout(() => setIsWrongMove(null), 500);
    }
  };

  const isPathTile = (x: number, y: number) =>
    originalPath?.some((p) => p && p.x === x && p.y === y);
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

  const isFinalCorrectTile = (x: number, y: number) => {
    if (phase !== 'ended' || !finalDrawnPathForFeedback) return false;
    const indexInDrawn = finalDrawnPathForFeedback.findIndex(p => p.x === x && p.y === y);
    return indexInDrawn !== -1 && originalPath[indexInDrawn]?.x === x && originalPath[indexInDrawn]?.y === y;
  };

  const isFinalIncorrectTile = (x: number, y: number) => {
    if (phase !== 'ended' || !finalDrawnPathForFeedback) return false;
    const indexInDrawn = finalDrawnPathForFeedback.findIndex(p => p.x === x && p.y === y);
    return indexInDrawn !== -1 && (
        !originalPath[indexInDrawn] || 
        originalPath[indexInDrawn].x !== x || 
        originalPath[indexInDrawn].y !== y
    );
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
            : `اعبر المسار من الذاكرة! لديك ${timeLeft} ثوانٍ.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
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

        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
        >
          {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);

            const isClickable = phase === 'play' && !isSubmittingResult && (
              (playerDrawnPath.length === 0 && isStartTile(x, y)) ||
              (playerDrawnPath.length > 0 && !isStartTile(x,y))
            );
            const isNextExpectedClickable = (playerDrawnPath.length === 0 && isStartTile(x, y)) ||
                                           (playerDrawnPath.length > 0 && 
                                            ((Math.abs(playerDrawnPath[playerDrawnPath.length-1]?.x - x) === 1 && playerDrawnPath[playerDrawnPath.length-1]?.y === y) ||
                                             (Math.abs(playerDrawnPath[playerDrawnPath.length-1]?.y - y) === 1 && playerDrawnPath[playerDrawnPath.length-1]?.x === x)));


            const tileClasses = cn(
              'w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-md transition-all duration-200 text-xs font-bold',
              'bg-gray-800 border-2 border-gray-700',
              (isClickable && isNextExpectedClickable && !isSubmittingResult) && 'cursor-pointer hover:bg-gray-700',
              isSubmittingResult && 'opacity-50 cursor-not-allowed',
              isMemorizedVisualTile(x, y) && 'bg-green-500',
              
              (phase === 'play' && isPlayerDrawnTile(x, y)) && 'bg-yellow-500', 
              
              isWrongTile(x, y) && 'bg-red-500 animate-shake',
              isStartTile(x, y) && 'bg-blue-500',
              isEndTile(x, y) && 'bg-purple-500',

              (phase === 'ended' && isFinalCorrectTile(x, y)) && 'bg-green-600',
              (phase === 'ended' && isFinalIncorrectTile(x, y)) && 'bg-red-600'
            );

            return (
              <div
                key={`${x}-${y}`}
                className={tileClasses}
                onClick={() => handleTileClick(x, y)}
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
