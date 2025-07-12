
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
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { updateChallengeProgress, submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const MEMORIZE_PER_TILE_DURATION = 350; // ms per tile for memorize highlight
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use a ref to track the current phase to avoid stale closures in timeouts/intervals
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Derive progress from the single source of truth: game state
  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const currentStep = myProgress?.currentStep ?? 0;
  const wrongAttempts = myProgress?.wrongAttempts ?? 0;
  const playerClickedTiles = myProgress?.clickedTiles ?? [];

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Main effect to control game phase transitions
  useEffect(() => {
    const myResult = game.challengeState?.results?.find((r) => r.playerId === self.id);
    if (myResult) {
      if (phaseRef.current !== 'ended') {
        setHasSubmitted(true);
        setPhase('ended');
      }
      return;
    }
    
    // Only transition to memorize phase once when the puzzle is ready
    if (path.length > 0 && gridSize > 0 && phaseRef.current === 'loading') {
      setPhase('memorize');
    }
  }, [game.challengeState?.results, self.id, path, gridSize]);


  // Effect for the memorization visual sequence
  useEffect(() => {
    if (phase === 'memorize' && path.length > 0) {
      setMemorizedPathVisual([]); 
      let i = 0; 
      const interval = setInterval(() => {
        if (i < path.length) {
          setMemorizedPathVisual((prev) => [...prev, path[i]!]);
          i++;
        } else {
          clearInterval(interval);
          setTimeout(() => {
             // Check ref to ensure we are still in memorize phase before switching
             if (phaseRef.current === 'memorize') setPhase('play');
          }, MEMORIZE_PER_TILE_DURATION);
        }
      }, MEMORIZE_PER_TILE_DURATION);
      return () => clearInterval(interval);
    }
  }, [phase, path]);


  // Effect to initialize player progress when play phase begins
  useEffect(() => {
    if (phase === 'play' && !myProgress) {
        // Initialize progress with the first step already "completed"
        updateChallengeProgress(game.id, self.id, {
            currentStep: 0,
            wrongAttempts: 0,
            clickedTiles: [],
        });
    }
  }, [phase, myProgress, game.id, self.id]);


  // Effect for the play phase timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (phase !== 'play' || hasSubmitted) return;
    
    const endTime = game.challengeState?.challengeEndsAt?.toMillis();
    if (!endTime) return;

    const playStartTime = endTime - (PLAY_TIME_SECONDS * 1000);

    const updateTimer = () => {
        const remaining = Math.max(0, Math.round((playStartTime + (PLAY_TIME_SECONDS * 1000) - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
             if (timerRef.current) clearInterval(timerRef.current);
             // Check ref to ensure we are still in play phase and haven't submitted
             if (phaseRef.current === 'play' && !hasSubmitted) {
                handleFailure(false);
             }
        }
    };
    
    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase, hasSubmitted, game.challengeState?.challengeEndsAt]);

  // Function to handle failure (timeout or too many wrong moves)
  const handleFailure = useCallback(
    async (isMisstep: boolean) => {
      if (phaseRef.current === 'ended' || hasSubmitted) return;
      setHasSubmitted(true); // Set submission flag immediately
      setPhase('ended');
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

  // Main game logic for handling tile clicks
  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || hasSubmitted || !path.length) return;
    
    const expectedTile = path[currentStep];
    if (!expectedTile) {
      await handleFailure(true);
      return;
    }

    if (expectedTile.x === x && expectedTile.y === y) {
      setIsWrongMove(null);
      const isVictory = currentStep === path.length - 1;
      
      const newClickedTiles = [...playerClickedTiles, expectedTile];
      
      if (isVictory) {
        setHasSubmitted(true);
        setPhase('ended');
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
        // Just update progress for the next step
        await updateChallengeProgress(game.id, self.id, {
          currentStep: currentStep + 1,
          clickedTiles: newClickedTiles
        });
      }
    } else {
      // Handle wrong move
      setIsWrongMove({ x, y });
      const newWrongAttempts = wrongAttempts + 1;
      
      await updateChallengeProgress(game.id, self.id, {
        wrongAttempts: newWrongAttempts
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

  // Helper functions for rendering tile states
  const isMemorizedVisualTile = (x: number, y: number) => {
    if (!path || path.length === 0) return false;
    return phase === 'memorize' && memorizedPathVisual.some((p) => p && p.x === x && p.y === y);
  }
  const isPlayerClickedTile = (x: number, y: number) =>
    (phase === 'play' || phase === 'ended') && playerClickedTiles.some((p) => p.x === x && p.y === y);
  const isWrongTile = (x: number, y: number) =>
    isWrongMove?.x === x && isWrongMove?.y === y;

  // Render "ended" state
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

  // Render "loading" state
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

  // Render main game view (memorize or play)
  return (
    <Card className="w-full max-w-xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
          {phase === 'memorize' ? <BrainCircuit /> : <ShieldAlert />}
          {challenge.name}
        </CardTitle>
        <CardDescription>
          {phase === 'memorize'
            ? `احفظ المسار!`
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
        
        <div className="relative p-4">
            <ArrowUpRight className="absolute top-0 right-0 text-blue-400 w-8 h-8" />
            <ArrowDownLeft className="absolute bottom-0 left-0 text-purple-400 w-8 h-8" />
            <div
              className="grid gap-1 border-2 border-gray-700"
              style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
            >
              {Array.from({ length: gridSize * gridSize }).map((_, i) => {
                const x = i % gridSize;
                const y = Math.floor(i / gridSize);

                const tileClasses = cn(
                  'w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-sm transition-all duration-200',
                  'bg-gray-800',
                  phase === 'play' && 'cursor-pointer hover:bg-gray-700',
                  isMemorizedVisualTile(x, y) && 'bg-yellow-500',
                  isPlayerClickedTile(x, y) && 'bg-green-600',
                  isWrongTile(x, y) && 'bg-red-500 animate-pulse'
                );

                return (
                  <motion.div
                    key={`${x}-${y}`}
                    className={tileClasses}
                    onClick={() => handleTileClick(x, y)}
                    initial={{ opacity: 0.5 }}
                    animate={{ opacity: 1 }}
                  />
                );
              })}
            </div>
        </div>

         <div className="text-center text-sm text-red-400 font-semibold h-5">
            {phase === 'play' && `المحاولات الخاطئة: ${wrongAttempts} / ${MAX_WRONG_ATTEMPTS}`}
        </div>
      </CardContent>
    </Card>
  );
}
