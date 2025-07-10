
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
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
import { updateChallengeProgress, submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const MEMORIZE_PER_TILE_DURATION = 400; // ms per tile for memorize highlight
const PLAY_TIME_SECONDS = 35;
const MAX_WRONG_ATTEMPTS = 5;

type Phase = 'loading' | 'memorize' | 'play' | 'ended';
type PathTile = { x: number; y: number };

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
  const path: PathTile[] = puzzle?.path || [];
  const gridSize: number = puzzle?.gridSize || 0;

  const [phase, setPhase] = useState<Phase>('loading');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isWrongMove, setIsWrongMove] = useState<PathTile | null>(null);
  const [timeLeft, setTimeLeft] = useState(PLAY_TIME_SECONDS);
  const [memorizedPathVisual, setMemorizedPathVisual] = useState<PathTile[]>([]);
  const [playerClickedTiles, setPlayerClickedTiles] = useState<PathTile[]>([]);
  const [internalCurrentStep, setInternalCurrentStep] = useState(0);
  const [internalWrongAttempts, setInternalWrongAttempts] = useState(0);

  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const currentStep = typeof myProgress?.currentStep === 'number' ? myProgress.currentStep : internalCurrentStep;
  const wrongAttempts = typeof myProgress?.wrongAttempts === 'number' ? myProgress.wrongAttempts : internalWrongAttempts;

  const handleFailure = useCallback(
    async (isMisstep: boolean) => {
      if (hasSubmitted) return;
      setPhase('ended');
      setHasSubmitted(true);
      const timeTaken = PLAY_TIME_SECONDS - timeLeft;
      await submitChallengeResult(game.id, self.id, {
        isCorrect: false,
        time: timeTaken,
      });
      toast({
        title: isMisstep ? 'خطوة خاطئة!' : 'انتهى الوقت!',
        description: isMisstep
          ? 'لقد ارتكبت خطأً فادحًا.'
          : 'حظًا أفضل في المرة القادمة.',
        variant: 'destructive',
      });
    },
    [hasSubmitted, timeLeft, game.id, self.id, toast]
  );
  
  useEffect(() => {
    const myResult = game.challengeState?.results?.find((r) => r.playerId === self.id);
    if (myResult) {
      setHasSubmitted(true);
      setPhase('ended');
    } else if (path.length > 0 && gridSize > 0) {
      setPhase('memorize');
      setMemorizedPathVisual([]);
      setIsWrongMove(null);
      setPlayerClickedTiles([]);
      setInternalCurrentStep(0);
      setInternalWrongAttempts(0);
      setTimeLeft(PLAY_TIME_SECONDS);
    }
  }, [game.challengeState?.results, self.id, path, gridSize]);

  useEffect(() => {
    if (phase === 'memorize' && path.length > 0) {
      // تعديل: تضمين أول مربع عند خط البداية في المسار التعريفي
      setMemorizedPathVisual([]);
      let i = 0; // نبدأ من أول مربع عند خط البداية
      const interval = setInterval(() => {
        if (i < path.length - 1) {
          setMemorizedPathVisual((prev) => [...prev, path[i]!]);
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
  }, [phase, path]);
  
  useEffect(() => {
    if (
      phase === 'play' &&
      path.length > 2 &&
      playerClickedTiles.length === 0
    ) {
      setPlayerClickedTiles([]);
      setInternalCurrentStep(1); // نبدأ من المربع الذي بعد البداية
      setInternalWrongAttempts(0);
      if (!myProgress || myProgress.currentStep !== 1 || myProgress.wrongAttempts !== 0) {
        updateChallengeProgress(game.id, self.id, { currentStep: 1, wrongAttempts: 0 });
      }
    }
  }, [phase, path, playerClickedTiles.length, game.id, self.id]);
  
  useEffect(() => {
    if (phase !== 'play' || hasSubmitted || !game.challengeState?.challengeEndsAt) return;
    
    const endTime = game.challengeState.challengeEndsAt.toMillis();
    const updateTimer = () => {
        const remaining = Math.round((endTime - Date.now()) / 1000);
        if (remaining <= 0) {
            setTimeLeft(0);
            if (!hasSubmitted) {
                handleFailure(false);
            }
            clearInterval(timer);
        } else {
            setTimeLeft(remaining);
        }
    };

    const timer = setInterval(updateTimer, 1000);
    updateTimer();

    return () => clearInterval(timer);
  }, [phase, hasSubmitted, game.challengeState?.challengeEndsAt, handleFailure]);
  

  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || hasSubmitted || !path.length) return;

    const expectedTile = path[currentStep];
    if (!expectedTile) {
      await handleFailure(true);
      return;
    }

    if (expectedTile.x === x && expectedTile.y === y) {
      setPlayerClickedTiles((prev) => [...prev, expectedTile]);
      setIsWrongMove(null);
      const isVictory = currentStep === path.length - 2; // النهاية ليست جزءًا من المسار
      if (isVictory) {
        setPhase('ended');
        setHasSubmitted(true);
        const timeTaken = PLAY_TIME_SECONDS - timeLeft;
        await submitChallengeResult(game.id, self.id, {
          isCorrect: true,
          time: timeTaken,
        });
        toast({
          title: 'نجاة!',
          description: 'لقد عبرت المسار بنجاح.',
          className: 'bg-green-100 border-green-500 text-green-700',
        });
      } else {
        setInternalCurrentStep(currentStep + 1);
        await updateChallengeProgress(game.id, self.id, {
          currentStep: currentStep + 1,
          wrongAttempts,
        });
      }
    } else if (isPathTile(x, y)) {
      // إذا كان جزءًا من المسار الصحيح ولكن ضغط عليه قبل وقته
      setIsWrongMove({ x, y });
      toast({
        title: 'خطوة خاطئة!',
        description: 'هذا جزء من المسار الصحيح ولكن ليس دوره الآن.',
        variant: 'destructive',
        duration: 2000,
      });
    } else {
      // إذا كان مربع خاطئ تمامًا
      setIsWrongMove({ x, y });
      const newWrongAttempts = wrongAttempts + 1;
      setInternalWrongAttempts(newWrongAttempts);
      if (newWrongAttempts >= MAX_WRONG_ATTEMPTS) {
        await updateChallengeProgress(game.id, self.id, {
          currentStep,
          wrongAttempts: newWrongAttempts,
        });
        await handleFailure(true);
      } else {
        await updateChallengeProgress(game.id, self.id, {
          currentStep,
          wrongAttempts: newWrongAttempts,
        });
        toast({
          title: 'محاولة خاطئة!',
          description: `تبقى لديك ${MAX_WRONG_ATTEMPTS - newWrongAttempts} محاولة.`,
          variant: 'destructive',
          duration: 2000,
        });
      }
    }
  };

  const isPathTile = (x: number, y: number) =>
    path?.some((p) => p && p.x === x && p.y === y);
  const isStartTile = (x: number, y: number) =>
    path && path.length > 0 && path[0] && path[0].x === x && path[0].y === y;
  const isEndTile = (x: number, y: number) =>
    path &&
    path.length > 0 &&
    path[path.length - 1] &&
    path[path.length - 1]!.x === x &&
    path[path.length - 1]!.y === y;
  const isMemorizedVisualTile = (x: number, y: number) =>
    phase === 'memorize' && memorizedPathVisual.some((p) => p && p.x === x && p.y === y);
  const isPlayerClickedTile = (x: number, y: number) =>
    phase === 'play' && playerClickedTiles.some((p) => p && p.x === x && p.y === y);
  const isWrongTile = (x: number, y: number) =>
    isWrongMove?.x === x && isWrongMove?.y === y;

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
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (phase === 'loading' || !puzzle || !path || gridSize === 0 || path.length === 0) {
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
            <p className="mt-4 text-muted-foreground">جاري توليد المسار...</p>
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

            const tileClasses = cn(
              'w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-md transition-all duration-200 text-xs font-bold',
              'bg-gray-800 border-2 border-gray-700',
              phase === 'play' && !isStartTile(x, y) && !isEndTile(x, y) && 'cursor-pointer hover:bg-gray-700',
              isMemorizedVisualTile(x, y) && 'bg-green-500',
              isPlayerClickedTile(x, y) && 'bg-green-600',
              isWrongTile(x, y) && 'bg-red-500',
              isStartTile(x, y) && 'bg-blue-500 cursor-not-allowed',
              isEndTile(x, y) && 'bg-purple-500 cursor-not-allowed'
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
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
