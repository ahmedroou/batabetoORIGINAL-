
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, X, ShieldAlert, BrainCircuit } from 'lucide-react';
import {
  updateChallengeProgress,
  submitChallengeResult,
} from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const MEMORIZE_PER_TILE_DURATION_MS = 300;
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
  const [timeLeft, setTimeLeft] = useState(PLAY_TIME_SECONDS);
  const [memorizedPathVisual, setMemorizedPathVisual] = useState<PathTile[]>([]);
  const [playerClickedTiles, setPlayerClickedTiles] = useState<PathTile[]>([]);
  const [isWrongMove, setIsWrongMove] = useState<PathTile | null>(null);

  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const currentStep = myProgress?.currentStep || 0;
  const wrongAttempts = myProgress?.wrongAttempts || 0;

  const handleFailure = useCallback(
    async (isMisstep: boolean) => {
      if (phase === 'ended' || hasSubmitted) return;
      setPhase('ended');
      setHasSubmitted(true);
      const timeTaken = isMisstep ? (PLAY_TIME_SECONDS - timeLeft) : PLAY_TIME_SECONDS;
      await submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
      toast({
        title: isMisstep ? "خطوة خاطئة!" : "انتهى الوقت!",
        description: isMisstep ? `لقد استنفذت محاولاتك (${MAX_WRONG_ATTEMPTS}).` : "حظًا أفضل في المرة القادمة.",
        variant: "destructive",
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
          if (path[i]) setMemorizedPathVisual(prev => [...prev, path[i]]);
          i++;
        } else {
          clearInterval(interval);
          setTimeout(() => {
            setPhase('play');
            setMemorizedPathVisual([]);
          }, MEMORIZE_PER_TILE_DURATION_MS * 2);
        }
      }, MEMORIZE_PER_TILE_DURATION_MS);
      return () => clearInterval(interval);
    }
  }, [phase, path]);


  useEffect(() => {
    if (phase === 'play' && path.length > 0 && currentStep === 0) {
        setPlayerClickedTiles([path[0]]);
        // Instantly update local state and then send to server
        updateChallengeProgress(game.id, self.id, { currentStep: 1, wrongAttempts: 0 });
    }
  }, [phase, path, currentStep, game.id, self.id]);

  useEffect(() => {
    if (phase !== 'play' || hasSubmitted || !game.challengeState?.challengeEndsAt) return;
    
    const challengeEndTimeMillis = game.challengeState.challengeEndsAt.toMillis();
    
    const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.round((challengeEndTimeMillis - now) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
            handleFailure(false);
            if (timerInterval) clearInterval(timerInterval);
        }
    };
    
    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [phase, hasSubmitted, game.challengeState?.challengeEndsAt, handleFailure]);


  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || hasSubmitted || path.length === 0) return;

    const expectedTile = path[currentStep];
    if (!expectedTile) return;

    if (expectedTile.x === x && expectedTile.y === y) {
      setIsWrongMove(null);
      const newClickedTiles = [...playerClickedTiles, expectedTile];
      setPlayerClickedTiles(newClickedTiles);

      const isVictory = currentStep === path.length - 1;
      if (isVictory) {
        setPhase('ended');
        setHasSubmitted(true);
        const timeTaken = PLAY_TIME_SECONDS - timeLeft;
        await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
        toast({
          title: 'نجاة!', description: 'لقد عبرت المسار بنجاح.', className: 'bg-green-100 border-green-500 text-green-700',
        });
      } else {
        await updateChallengeProgress(game.id, self.id, { currentStep: currentStep + 1 });
      }
    } else {
      const newWrongAttempts = wrongAttempts + 1;
      setIsWrongMove({x, y});
      setTimeout(() => setIsWrongMove(null), 400);

      if (newWrongAttempts >= MAX_WRONG_ATTEMPTS) {
        await updateChallengeProgress(game.id, self.id, { wrongAttempts: newWrongAttempts });
        await handleFailure(true);
      } else {
        await updateChallengeProgress(game.id, self.id, { wrongAttempts: newWrongAttempts });
      }
    }
  };

  const isPathTile = (x: number, y: number) => path?.some(p => p.x === x && p.y === y);
  const isStartTile = (x: number, y: number) => path?.[0]?.x === x && path[0].y === y;
  const isEndTile = (x: number, y: number) => path?.[path.length - 1]?.x === x && path[path.length-1].y === y;
  const isMemorizedVisualTile = (x: number, y: number) => phase === 'memorize' && memorizedPathVisual.some(p => p.x === x && p.y === y);
  const isPlayerClickedTile = (x: number, y: number) => playerClickedTiles.some(p => p.x === x && p.y === y);

  const renderGrid = () => (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
        {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);
            
            const tileClasses = cn(
                "w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-md transition-all duration-200",
                phase === 'play' && "cursor-pointer hover:bg-slate-700",
                "bg-slate-800 border-2 border-slate-700",
                isMemorizedVisualTile(x,y) && "bg-green-500 border-green-400 animate-pulse",
                isPlayerClickedTile(x,y) && "bg-green-600 border-green-500",
                isWrongMove?.x === x && isWrongMove.y === y && "bg-red-500 border-red-400 animate-shake",
                phase === 'ended' && !hasSubmitted && isPathTile(x, y) && "bg-yellow-600 border-yellow-500", // Show correct path on timeout
            );

            return (
                <div key={`${x}-${y}`} className={tileClasses} onClick={() => handleTileClick(x, y)}>
                    {isStartTile(x,y) && <div className="w-3 h-3 bg-green-300 rounded-full" />}
                    {isEndTile(x,y) && <div className="w-3 h-3 bg-red-400" />}
                </div>
            );
        })}
    </div>
  );

  if (hasSubmitted) {
    return (
        <Card className="w-full max-w-lg text-center bg-slate-900 text-white border-slate-700 p-6">
            <CardHeader><CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle></CardHeader>
            <CardContent>
                <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
                <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
            </CardContent>
        </Card>
    );
  }
  
  if (phase === 'loading' || !puzzle || !path || gridSize === 0 || path.length === 0) {
    return (
        <Card className="w-full max-w-lg text-center bg-slate-900 text-white border-slate-700 p-6">
            <CardHeader><CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle></CardHeader>
            <CardContent>
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <p className="mt-4 text-slate-400">جاري توليد المسار...</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="w-auto max-w-xl bg-slate-900 text-white border-slate-700 p-4">
        <style>{`
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
            .animate-shake { animation: shake 0.4s ease-in-out; }
        `}</style>
        <CardHeader className="text-center">
            <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
                {phase === 'memorize' ? <BrainCircuit /> : <ShieldAlert />}
                {challenge.name}
            </CardTitle>
            <CardDescription className="text-slate-400">
                {phase === 'memorize' ? `احفظ المسار!` : `اعبر المسار من الذاكرة!`}
            </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
            <div className="w-full bg-slate-800 p-1 rounded-full">
                <motion.div
                    className="h-2 bg-red-500 rounded-full"
                    initial={{ width: '100%' }}
                    animate={{ width: phase === 'play' ? `${(timeLeft / PLAY_TIME_SECONDS) * 100}%` : '100%' }}
                    transition={{ duration: 1, ease: 'linear' }}
                />
            </div>
            
             {phase === 'play' && (
                <div className="w-full text-center text-lg font-bold text-slate-400 flex items-center justify-center gap-2">
                    <span>المحاولات الخاطئة:</span>
                    <div className="flex justify-center gap-2">
                        {Array.from({ length: MAX_WRONG_ATTEMPTS }).map((_, idx) => (
                            <X key={idx} className={cn("h-6 w-6 transition-colors", idx < wrongAttempts ? "text-red-500" : "text-slate-600")} />
                        ))}
                    </div>
                </div>
            )}
            
            {renderGrid()}

        </CardContent>
    </Card>
  );
}
