'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
import {
  updateChallengeProgress,
  submitChallengeResult,
} from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const PLAY_TIME_SECONDS = 20;
const MAX_WRONG_ATTEMPTS = 2; // Fails on the 3rd mistake

type Phase = 'loading' | 'memorize' | 'play' | 'ended';
type PathTile = { x: number; y: number };

export function PathOfSurvival({
  game,
  player,
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
  const [timeLeft, setTimeLeft] = useState(PLAY_TIME_SECONDS);
  
  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const initialStep = myProgress?.currentStep || 0;
  const wrongAttempts = myProgress?.wrongAttempts || 0;

  const [localCurrentStep, setLocalCurrentStep] = useState(initialStep);
  const [playerClickedTiles, setPlayerClickedTiles] = useState<PathTile[]>([]);

  const handleFailure = useCallback(
    async (isMisstep: boolean) => {
      if (phase === 'ended' || hasSubmitted) return;
      setPhase('ended');
      setHasSubmitted(true);
      const timeTaken = PLAY_TIME_SECONDS - timeLeft;
      await submitChallengeResult(game.id, self.id, {
        isCorrect: false,
        time: timeTaken,
      });
      toast({
        title: isMisstep ? 'خطوة خاطئة!' : 'انتهى الوقت!',
        description: 'حظًا أفضل في المرة القادمة.',
        variant: 'destructive',
      });
    },
    [phase, hasSubmitted, timeLeft, game.id, self.id, toast]
  );
  
  // Sync local state when component loads or game data changes
  useEffect(() => {
    const serverStep = game.challengeState?.playerProgress?.[self.id]?.currentStep || 0;
    setLocalCurrentStep(serverStep);
    
    // Reconstruct clicked tiles based on server progress
    if (path.length > 0 && serverStep > 0) {
      setPlayerClickedTiles(path.slice(0, serverStep));
    } else {
      setPlayerClickedTiles([]);
    }
    
  }, [game.challengeState?.playerProgress, self.id, path]);


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

  // Memorization phase timer
  useEffect(() => {
    if (phase === 'memorize') {
      const memorizeDuration = path.length * 300; // Adjust speed based on path length
      const timer = setTimeout(() => {
        setPhase('play');
      }, memorizeDuration);
      return () => clearTimeout(timer);
    }
  }, [phase, path.length]);

  // Play phase timer
  useEffect(() => {
    if (phase !== 'play' || hasSubmitted || !game.challengeState?.challengeEndsAt)
      return;
    const endTime = game.challengeState.challengeEndsAt.toMillis();

    const updateTimer = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0 && !hasSubmitted) {
        handleFailure(false);
      }
    };

    const timerInterval = setInterval(updateTimer, 1000);
    updateTimer();

    return () => clearInterval(timerInterval);
  }, [phase, hasSubmitted, game.challengeState?.challengeEndsAt, handleFailure]);

  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || !path || hasSubmitted || path.length === 0) return;

    const expectedTile = path[localCurrentStep];
    if (!expectedTile) return;

    if (expectedTile.x === x && expectedTile.y === y) {
      const newClickedTiles = [...playerClickedTiles, expectedTile];
      setPlayerClickedTiles(newClickedTiles);

      const isVictory = localCurrentStep === path.length - 1;
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
        setLocalCurrentStep(prev => prev + 1);
        await updateChallengeProgress(game.id, self.id, { currentStep: localCurrentStep + 1 });
      }
    } else {
      const newWrongAttempts = wrongAttempts + 1;
      toast({
          title: "محاولة خاطئة!",
          variant: "destructive",
          duration: 1500,
      });
      if (newWrongAttempts > MAX_WRONG_ATTEMPTS) {
        await updateChallengeProgress(game.id, self.id, { wrongAttempts: newWrongAttempts });
        await handleFailure(true);
      } else {
        await updateChallengeProgress(game.id, self.id, { wrongAttempts: newWrongAttempts });
      }
    }
  };

  const isPathTile = (x: number, y: number) =>
    path?.some((p) => p && p.x === x && p.y === y);
  const isStartTile = (x: number, y: number) => path?.[0]?.x === x && path[0]?.y === y;
  const isEndTile = (x: number, y: number) => path?.[path.length - 1]?.x === x && path[path.length - 1]?.y === y;
  const isPlayerClickedTile = (x: number, y: number) =>
    playerClickedTiles.some((p) => p && p.x === x && p.y === y);

  if (hasSubmitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
          <CardHeader>
            <CardTitle className="text-3xl text-primary">
              {challenge.name}
            </CardTitle>
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
          <CardHeader>
            <CardTitle className="text-3xl text-primary">
              {challenge.name}
            </CardTitle>
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
    <div className="w-auto flex flex-col gap-4 p-4 bg-slate-900 rounded-lg">
      <div className="w-full bg-slate-800 p-1 rounded-full">
        <motion.div
          className="h-2 bg-red-500 rounded-full"
          initial={{ width: '100%' }}
          animate={{
            width: phase === 'play' ? `${(timeLeft / PLAY_TIME_SECONDS) * 100}%` : '100%',
          }}
          transition={{ duration: phase === 'play' ? 1 : 0, ease: 'linear' }}
        />
      </div>

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
      >
        {Array.from({ length: gridSize * gridSize }).map((_, i) => {
          const x = i % gridSize;
          const y = Math.floor(i / gridSize);

          const tileClasses = cn(
            'w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-sm transition-colors duration-150',
            'bg-slate-800 border border-slate-700',
            phase === 'play' && 'cursor-pointer hover:bg-slate-700',
            (phase === 'memorize' && isPathTile(x, y)) || isPlayerClickedTile(x, y) ? 'bg-green-500' : ''
          );

          return (
            <div
              key={`${x}-${y}`}
              className={tileClasses}
              onClick={() => handleTileClick(x, y)}
            >
              {isStartTile(x, y) && <div className="w-2 h-2 bg-green-300 rounded-full" />}
              {isEndTile(x, y) && <div className="w-2 h-2 bg-red-500" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
