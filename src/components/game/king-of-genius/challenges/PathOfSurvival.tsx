
'use client';

import { useState, useEffect, useCallback } from 'react';
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

const MEMORIZE_PER_TILE_DURATION = 400; // milliseconds per tile for sequential highlight
const PLAY_TIME_SECONDS = 20;
const MAX_WRONG_ATTEMPTS = 3;

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

  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const currentStep = myProgress?.currentStep || 0;
  const wrongAttempts = myProgress?.wrongAttempts || 0;

  const handleFailure = useCallback(
    async (isMisstep: boolean) => {
      if (phase === 'ended' || hasSubmitted) return;
      setPhase('ended');
      setHasSubmitted(true);
      const timeTaken = isMisstep ? PLAY_TIME_SECONDS - timeLeft : PLAY_TIME_SECONDS;
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
    [phase, hasSubmitted, timeLeft, game.id, self.id, toast]
  );

  useEffect(() => {
    const myResult = game.challengeState?.results?.find(
      (r) => r.playerId === self.id
    );
    if (myResult) {
      setHasSubmitted(true);
      setPhase('ended');
    } else if (path.length > 0 && gridSize > 0) {
      setPhase('memorize');
    }
  }, [game.challengeState?.results, self.id, path, gridSize]);

  useEffect(() => {
    if (phase === 'memorize' && path.length > 0) {
      let i = 0;
      const interval = setInterval(() => {
        if (i < path.length) {
          if (path[i]) setMemorizedPathVisual((prev) => [...prev, path[i]!]);
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
        if (phase === 'play' && path.length > 0 && currentStep === 0) {
            setPlayerClickedTiles([path[0]!]);
            updateChallengeProgress(game.id, self.id, { currentStep: 1 });
        }
    }, [phase, path, currentStep, game.id, self.id]);


    useEffect(() => {
        if (phase !== 'play' || hasSubmitted) return;

        const timer = setInterval(() => {
            setTimeLeft(prevTime => {
                if (prevTime <= 1) {
                    clearInterval(timer);
                    handleFailure(false);
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);
        
        return () => clearInterval(timer);
    }, [phase, hasSubmitted, handleFailure]);


  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || !path || hasSubmitted || path.length === 0) return;

    const expectedTile = path[currentStep];
    if (!expectedTile) {
      await handleFailure(true);
      return;
    }

    if (expectedTile.x === x && expectedTile.y === y) {
      setPlayerClickedTiles((prev) => [...prev, expectedTile]);
      const isVictory = currentStep === path.length - 1;
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
        await updateChallengeProgress(game.id, self.id, {
          currentStep: currentStep + 1,
        });
      }
    } else {
      const newWrongAttempts = wrongAttempts + 1;
       if(newWrongAttempts === 1) {
          setIsWrongMove({ x, y });
       }
      if (newWrongAttempts > MAX_WRONG_ATTEMPTS) {
        await updateChallengeProgress(game.id, self.id, {
          currentStep: currentStep,
          wrongAttempts: newWrongAttempts,
        });
        await handleFailure(true);
      } else {
        await updateChallengeProgress(game.id, self.id, {
          currentStep: currentStep,
          wrongAttempts: newWrongAttempts,
        });
        toast({
          title: 'محاولة خاطئة!',
          description: `تبقى لديك ${
            MAX_WRONG_ATTEMPTS - newWrongAttempts
          } محاولة.`,
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
          <div className="relative h-4 w-full bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 h-full bg-red-500"
              initial={{ width: '100%' }}
              animate={{
                width:
                  phase === 'play'
                    ? `${(timeLeft / PLAY_TIME_SECONDS) * 100}%`
                    : '100%',
              }}
              transition={{ duration: phase === 'play' ? 1 : 0, ease: 'linear' }}
            />
          </div>
        </div>

        {phase === 'play' && (
          <div className="w-full text-center text-lg font-bold text-gray-400">
            الأخطاء المتبقية: {MAX_WRONG_ATTEMPTS - wrongAttempts}
            <div className="flex justify-center gap-1 mt-1">
              {Array.from({ length: MAX_WRONG_ATTEMPTS }).map((_, idx) => (
                <X
                  key={idx}
                  className={cn(
                    'h-6 w-6',
                    idx < wrongAttempts ? 'text-red-500' : 'text-gray-600'
                  )}
                />
              ))}
            </div>
          </div>
        )}

        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
        >
          {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);

            const tileClasses = cn(
              'w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-md transition-all duration-200 text-xs font-bold',
              phase === 'play' && 'cursor-pointer hover:bg-gray-700',
              'bg-gray-800 border-2 border-gray-700',
              isMemorizedVisualTile(x, y) && 'bg-green-500',
              isPlayerClickedTile(x, y) && 'bg-green-600',
              isWrongMove?.x === x && isWrongMove.y === y && 'bg-red-500',
              phase === 'ended' && isPathTile(x, y) && 'bg-green-800'
            );

            return (
              <div
                key={`${x}-${y}`}
                className={tileClasses}
                onClick={() => handleTileClick(x, y)}
              >
                {isStartTile(x, y) && (
                  <span className="text-green-400 text-lg">&#x25CF;</span>
                )}
                {isEndTile(x, y) && (
                  <span className="text-red-500 text-lg">&#x25A0;</span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
