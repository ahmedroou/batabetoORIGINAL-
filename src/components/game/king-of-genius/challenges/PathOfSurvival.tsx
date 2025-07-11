
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Footprints,
  Flag,
} from 'lucide-react';
import { updateChallengeProgress, submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const MEMORIZE_DURATION_SECONDS = 8;
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
  
  // The start and end tiles are part of the puzzle visual, but not the clickable path
  const startTile = path.length > 0 ? path[0] : null;
  const endTile = path.length > 0 ? path[path.length - 1] : null;
  const clickablePath = path.slice(1); // The actual path the user needs to click

  const [phase, setPhase] = useState<Phase>('loading');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isWrongMove, setIsWrongMove] = useState<PathTile | null>(null);
  const [timeLeft, setTimeLeft] = useState(PLAY_TIME_SECONDS);
  
  // State for the tile-by-tile drawing effect
  const [memorizePath, setMemorizePath] = useState<PathTile[]>([]);

  // State for tiles the player has correctly clicked
  const [playerClickedPath, setPlayerClickedPath] = useState<PathTile[]>([]);

  // Derive progress from game state for persistence
  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const currentStep = myProgress?.currentStep ?? 0;
  const wrongAttempts = myProgress?.wrongAttempts ?? 0;

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
    } else if (path.length > 0 && gridSize > 0 && phase === 'loading') {
      setPhase('memorize');
    }
  }, [game.challengeState?.results, self.id, path, gridSize, phase]);
  
  // Effect for drawing the path tile by tile
  useEffect(() => {
    if (phase !== 'memorize' || path.length === 0) return;

    setMemorizePath([path[0]]); // Start with the first tile immediately

    const drawInterval = setInterval(() => {
        setMemorizePath(prev => {
            if (prev.length < path.length) {
                return [...prev, path[prev.length]];
            }
            clearInterval(drawInterval);
            return prev;
        });
    }, 200); // Adjust speed of drawing here

    return () => clearInterval(drawInterval);
  }, [phase, path]);


  // Transition from memorize to play phase
  useEffect(() => {
    if (phase === 'memorize') {
      const timer = setTimeout(() => {
        setPhase('play');
        updateChallengeProgress(game.id, self.id, { currentStep: 0, wrongAttempts: 0 });
      }, MEMORIZE_DURATION_SECONDS * 1000);
      
      return () => clearTimeout(timer);
    }
  }, [phase, game.id, self.id]);
  
  // Timer for the play phase
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
    if (phase !== 'play' || hasSubmitted || !clickablePath.length) return;

    const expectedTile = clickablePath[currentStep];
    if (!expectedTile) {
      await handleFailure(true);
      return;
    }

    if (expectedTile.x === x && expectedTile.y === y) {
      setPlayerClickedPath((prev) => [...prev, expectedTile]);
      setIsWrongMove(null);
      const nextStep = currentStep + 1;
      const isVictory = nextStep === clickablePath.length;

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
        updateChallengeProgress(game.id, self.id, {
          currentStep: nextStep,
          wrongAttempts,
        });
      }
    } else {
      setIsWrongMove({ x, y });
      const newWrongAttempts = wrongAttempts + 1;
      updateChallengeProgress(game.id, self.id, {
        currentStep,
        wrongAttempts: newWrongAttempts,
      });

      if (newWrongAttempts >= MAX_WRONG_ATTEMPTS) {
        await handleFailure(true);
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

  const isSameTile = (tile1: PathTile | null, tile2: PathTile | null) => {
      if (!tile1 || !tile2) return false;
      return tile1.x === tile2.x && tile1.y === tile2.y;
  };

  const isMemorizedVisualTile = (x: number, y: number) =>
    memorizePath.some((p) => p && p.x === x && p.y === y);
  
  const isPlayerVisualTile = (x: number, y: number) => 
    isSameTile(startTile, {x, y}) || playerClickedPath.some(p => p && p.x === x && p.y === y);

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
          <AnimatePresence>
            {Array.from({ length: gridSize * gridSize }).map((_, i) => {
              const x = i % gridSize;
              const y = Math.floor(i / gridSize);

              const isStart = isSameTile(startTile, {x, y});
              const isEnd = isSameTile(endTile, {x,y});
              
              const tileClasses = cn(
                'w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-md transition-all duration-200 text-xs font-bold',
                'bg-gray-800 border-2 border-gray-700',
                phase === 'play' && !isStart && !isEnd && 'cursor-pointer hover:bg-gray-700',
                isStart && 'bg-blue-500 cursor-not-allowed',
                isEnd && 'bg-purple-500 cursor-not-allowed',
                phase === 'memorize' && isMemorizedVisualTile(x, y) && 'bg-green-500',
                phase === 'play' && isPlayerVisualTile(x, y) && 'bg-green-600',
                isWrongTile(x, y) && 'bg-red-500 animate-pulse',
              );

              return (
                <motion.div
                  key={`${x}-${y}`}
                  className={tileClasses}
                  onClick={() => handleTileClick(x, y)}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: (x + y) * 0.02 }}
                >
                  {isStart && <Footprints className="w-6 h-6" />}
                  {isEnd && <Flag className="w-6 h-6" />}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
