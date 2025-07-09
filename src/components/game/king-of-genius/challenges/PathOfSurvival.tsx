
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Play, Timer, Trophy, X } from 'lucide-react';
import { updateChallengeProgress, submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const MEMORIZE_TIME_SECONDS = 5;
const PLAY_TIME_SECONDS = 15;
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
  const [timer, setTimer] = useState(MEMORIZE_TIME_SECONDS);

  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const currentStep = myProgress?.currentStep || 0;
  const wrongAttempts = myProgress?.wrongAttempts || 0;

  const handleFailure = useCallback(
    async (reason: 'misstep' | 'timeout') => {
        if (hasSubmitted) return;
        setHasSubmitted(true);
        setPhase('ended');
        const timeTaken = PLAY_TIME_SECONDS - (reason === 'timeout' ? 0 : timer);
        await submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
        toast({
            title: reason === 'misstep' ? "خطوة خاطئة!" : "انتهى الوقت!",
            description: reason === 'misstep' ? `لقد استنفذت محاولاتك (${MAX_WRONG_ATTEMPTS}).` : "حظًا أفضل في المرة القادمة.",
            variant: "destructive",
        });
    },
    [hasSubmitted, game.id, self.id, toast, timer]
  );
  
  // Initialize game phase
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
  
  // Timer logic
  useEffect(() => {
    if (phase === 'ended' || hasSubmitted) return;

    if (timer <= 0) {
      if (phase === 'memorize') {
        setPhase('play');
        setTimer(PLAY_TIME_SECONDS);
      } else if (phase === 'play') {
        handleFailure('timeout');
      }
      return;
    }

    const interval = setInterval(() => {
        setTimer(t => t - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, timer, hasSubmitted, handleFailure]);
  
  // Auto-reveal first step
  useEffect(() => {
    if (phase === 'play' && path.length > 0 && currentStep === 0) {
      updateChallengeProgress(game.id, self.id, {
        currentStep: 1,
        wrongAttempts: 0,
      });
    }
  }, [phase, path, currentStep, game.id, self.id]);

  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || hasSubmitted || path.length === 0) return;

    const expectedTile = path[currentStep];
    if (!expectedTile) return;

    if (expectedTile.x === x && expectedTile.y === y) {
      setIsWrongMove(null);
      const nextStep = currentStep + 1;
      const isVictory = nextStep === path.length;

      if (isVictory) {
        const timeTaken = PLAY_TIME_SECONDS - timer;
        setPhase('ended');
        setHasSubmitted(true);
        await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
        toast({
          title: 'نجاة!',
          description: 'لقد عبرت المسار بنجاح.',
          className: 'bg-green-100 border-green-500 text-green-700',
        });
      } else {
        await updateChallengeProgress(game.id, self.id, { currentStep: nextStep });
      }
    } else {
      const newWrongAttempts = wrongAttempts + 1;
      setIsWrongMove({ x, y });
      setTimeout(() => setIsWrongMove(null), 300);

      await updateChallengeProgress(game.id, self.id, { wrongAttempts: newWrongAttempts });

      if (newWrongAttempts >= MAX_WRONG_ATTEMPTS) {
        await handleFailure('misstep');
      } else {
        toast({
          title: 'محاولة خاطئة!',
          description: `تبقى لديك ${MAX_WRONG_ATTEMPTS - newWrongAttempts} محاولة.`,
          variant: 'destructive',
          duration: 2000,
        });
      }
    }
  };

  const getTileState = (x: number, y: number) => {
      const isStart = path?.[0]?.x === x && path[0]?.y === y;
      const isEnd = path?.[path.length - 1]?.x === x && path[path.length - 1]?.y === y;
      const isPath = path?.some((p) => p?.x === x && p?.y === y);
      const isClicked = currentStep > 0 && path.slice(0, currentStep).some(p => p.x === x && p.y === y);
      
      return { isStart, isEnd, isPath, isClicked };
  };

  if (hasSubmitted) {
    return (
      <Card className="w-full max-w-lg text-center bg-white border-gray-200 p-6">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
          <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
        </CardContent>
      </Card>
    );
  }

  if (phase === 'loading' || !puzzle || !path || gridSize === 0 || path.length === 0) {
    return (
      <Card className="w-full max-w-lg text-center bg-white border-gray-200 p-6">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <p className="mt-4 text-slate-400">جاري توليد المسار...</p>
        </CardContent>
      </Card>
    );
  }
  
  const progressValue = phase === 'memorize' ? (timer / MEMORIZE_TIME_SECONDS) * 100 : (timer / PLAY_TIME_SECONDS) * 100;

  return (
    <Card className="w-full max-w-2xl bg-slate-50 border-gray-200 p-4">
       <style>{`
            @keyframes wrong-move-animation {
                0%, 100% { transform: scale(1); }
                25% { transform: scale(1.1) rotate(3deg); }
                75% { transform: scale(1.1) rotate(-3deg); }
            }
            .animate-wrong-move { animation: wrong-move-animation 0.3s ease-in-out; }
        `}</style>
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
          {challenge.name}
        </CardTitle>
        <CardDescription className="text-slate-500 text-lg">
          {phase === 'memorize' ? `احفظ المسار جيدًا!` : `اعبر المسار من الذاكرة!`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="w-full flex items-center justify-between gap-4 px-2">
            <div className='flex items-center gap-2 text-xl font-bold font-mono text-slate-600'>
                <Timer className="h-6 w-6"/>
                <span>{timer}</span>
            </div>
             <div className="flex justify-center gap-2">
                {Array.from({ length: MAX_WRONG_ATTEMPTS }).map((_, idx) => (
                    <X key={idx} className={cn("h-6 w-6 transition-colors duration-300", idx < wrongAttempts ? "text-red-500" : "text-slate-300")} />
                ))}
            </div>
        </div>
        <Progress value={progressValue} className="w-full h-2 transition-all ease-linear" />
        
        <div className="grid gap-1 p-2 bg-slate-200 rounded-lg" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
          <AnimatePresence>
          {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);
            const { isStart, isEnd, isPath, isClicked } = getTileState(x,y);

            const tileClasses = cn(
              "aspect-square flex items-center justify-center rounded-md transition-all duration-200",
              phase === 'play' && isPath && !isClicked && "cursor-pointer hover:bg-slate-400",
              phase === 'play' && !isPath && "cursor-pointer hover:bg-red-200",
              "bg-slate-300",
              phase === 'memorize' && isPath && 'bg-blue-400 animate-pulse',
              phase === 'play' && isClicked && 'bg-blue-400',
              isWrongMove?.x === x && isWrongMove.y === y && "bg-red-500 animate-wrong-move"
            );

            return (
              <motion.div 
                key={`${x}-${y}`}
                layout
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: (y * gridSize + x) * 0.01 }}
                className={tileClasses} 
                onClick={() => handleTileClick(x, y)}
               >
                 {isStart && <Play className="h-6 w-6 text-green-600 fill-current" />}
                 {isEnd && <Trophy className="h-6 w-6 text-yellow-500 fill-current" />}
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
