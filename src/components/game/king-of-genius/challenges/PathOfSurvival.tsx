
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Check,
  Loader2,
  BrainCircuit,
  ShieldAlert,
  X,
  Play,
  Trophy,
} from 'lucide-react';
import { submitChallengeResult, updateChallengeProgress } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const MEMORIZE_DURATION_MS = 8000;
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
  const path: PathTile[] = useMemo(() => puzzle?.path || [], [puzzle]);
  const gridSize: number = useMemo(() => puzzle?.gridSize || 0, [puzzle]);

  const [phase, setPhase] = useState<Phase>('loading');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [revealedPath, setRevealedPath] = useState<PathTile[]>([]);
  const [playerClickedPath, setPlayerClickedPath] = useState<PathTile[]>([]);
  const [wrongClick, setWrongClick] = useState<PathTile | null>(null);
  const [timeLeft, setTimeLeft] = useState(PLAY_TIME_SECONDS);
  const [memorizeTimeLeft, setMemorizeTimeLeft] = useState(MEMORIZE_DURATION_MS);

  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const currentStep = myProgress?.currentStep ?? 0;
  const wrongAttempts = myProgress?.wrongAttempts ?? 0;
  const myResult = game.challengeState?.results?.find((r) => r.playerId === self.id);

  // Effect to handle initial setup and phase transitions based on game state
  useEffect(() => {
    if (myResult) {
      setHasSubmitted(true);
      setPhase('ended');
    } else if (path.length > 0 && gridSize > 0 && !hasSubmitted) {
      setPhase('memorize');
    }
  }, [myResult, path, gridSize, hasSubmitted]);

  // Effect for the MEMORIZE phase timer
  useEffect(() => {
    if (phase !== 'memorize') return;

    setMemorizeTimeLeft(MEMORIZE_DURATION_MS);
    const interval = setInterval(() => {
      setMemorizeTimeLeft((prev) => {
        if (prev <= 100) {
          clearInterval(interval);
          setPhase('play');
          updateChallengeProgress(game.id, self.id, { currentStep: 1, wrongAttempts: 0 });
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [phase, game.id, self.id]);

  // Effect for the PLAY phase timer
  useEffect(() => {
    if (phase !== 'play') return;

    setTimeLeft(PLAY_TIME_SECONDS);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleFailure(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  const handleFailure = useCallback(
    async (isMisstep: boolean) => {
      if (hasSubmitted) return;
      setHasSubmitted(true);
      setPhase('ended');
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
    [hasSubmitted, timeLeft, game.id, self.id, toast]
  );

  const handleTileClick = async (x: number, y: number) => {
    if (phase !== 'play' || hasSubmitted) return;
    
    const isStart = path[0]?.x === x && path[0]?.y === y;
    const isEnd = path[path.length - 1]?.x === x && path[path.length - 1]?.y === y;
    if (isStart || isEnd) return; // Cannot click start/end

    const expectedTile = path[currentStep];

    if (expectedTile?.x === x && expectedTile?.y === y) {
      // Correct click
      setPlayerClickedPath((prev) => [...prev, expectedTile]);
      const nextStep = currentStep + 1;
      if (nextStep === path.length - 1) {
        // VICTORY
        setHasSubmitted(true);
        setPhase('ended');
        const timeTaken = PLAY_TIME_SECONDS - timeLeft;
        await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
        toast({ title: "نجاة!", description: "لقد عبرت المسار بنجاح.", className: "bg-green-100 border-green-500 text-green-700" });
      } else {
        await updateChallengeProgress(game.id, self.id, { currentStep: nextStep });
      }
    } else {
      // Wrong click
      setWrongClick({ x, y });
      const newWrongAttempts = wrongAttempts + 1;
      await updateChallengeProgress(game.id, self.id, { wrongAttempts: newWrongAttempts });
      if (newWrongAttempts >= MAX_WRONG_ATTEMPTS) {
        handleFailure(true);
      } else {
        toast({
          title: "محاولة خاطئة!",
          description: `تبقى لديك ${MAX_WRONG_ATTEMPTS - newWrongAttempts} محاولة.`,
          variant: "destructive",
          duration: 2000,
        });
      }
    }
  };

  const isRevealedOnFail = phase === 'ended' && !myResult?.isCorrect;

  const renderGrid = () => (
    <div
      className="grid gap-1 bg-slate-800 p-2 rounded-lg"
      style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
    >
      {Array.from({ length: gridSize * gridSize }).map((_, i) => {
        const x = i % gridSize;
        const y = Math.floor(i / gridSize);

        const isPathTile = path.some((p) => p.x === x && p.y === y);
        const isStartTile = path[0]?.x === x && path[0]?.y === y;
        const isEndTile = path[path.length - 1]?.x === x && path[path.length - 1]?.y === y;
        const isPlayerClicked = playerClickedPath.some((p) => p.x === x && p.y === y);
        const isWrongClicked = wrongClick?.x === x && wrongClick?.y === y;

        const tileClasses = cn(
          'w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-md transition-all duration-200 text-white font-bold text-lg',
          'bg-slate-700 border-2 border-slate-600',
           phase === 'play' && !isStartTile && !isEndTile && 'cursor-pointer hover:bg-slate-600',
           phase === 'memorize' && isPathTile && 'bg-blue-500 border-blue-400',
           isPlayerClicked && 'bg-blue-500 border-blue-400',
           isWrongClicked && 'bg-red-500 border-red-400 animate-pulse',
           isRevealedOnFail && isPathTile && 'bg-green-800 border-green-700',
           isRevealedOnFail && isWrongClicked && 'bg-red-600 border-red-500'
        );

        return (
          <div key={`${x}-${y}`} className={tileClasses} onClick={() => handleTileClick(x, y)}>
            {isStartTile && <Play className="h-6 w-6 text-green-400" />}
            {isEndTile && <Trophy className="h-6 w-6 text-yellow-400" />}
          </div>
        );
      })}
    </div>
  );

  if (phase === 'loading' || path.length === 0) {
    return (
      <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
        <CardHeader><CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle></CardHeader>
        <CardContent>
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">جاري توليد المسار...</p>
        </CardContent>
      </Card>
    );
  }

  if (hasSubmitted && myResult) {
     return (
        <Card className="w-full max-w-lg text-center bg-gray-800 text-white border-gray-700">
            <CardHeader>
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>انتهى التحدي بالنسبة لك</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {myResult.isCorrect ? (
                    <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
                ) : (
                    <X className="w-20 h-20 text-red-500 mx-auto mb-4" />
                )}
                <p className="text-xl">{myResult.isCorrect ? "لقد نجوت!" : "لقد فشلت."}</p>
                <p className="text-muted-foreground">في انتظار بقية اللاعبين...</p>
                {renderGrid()}
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
          {phase === 'memorize' ? <BrainCircuit /> : <ShieldAlert />}
          {challenge.name}
        </CardTitle>
        <CardDescription>
          {phase === 'memorize' ? `احفظ المسار!` : `اعبر المسار من الذاكرة!`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="w-full bg-slate-800 p-3 rounded-lg flex justify-between items-center">
             <div className="w-full">
                <Progress 
                    value={phase === 'memorize' ? (memorizeTimeLeft / MEMORIZE_DURATION_MS) * 100 : (timeLeft / PLAY_TIME_SECONDS) * 100} 
                    className={cn("h-3", (phase === 'play' && timeLeft < 5) && "[&>*]:bg-red-500")}
                />
             </div>
             <div className="flex items-center gap-2 text-red-400 font-bold w-32 justify-end">
                <X/>
                <span>{wrongAttempts} / {MAX_WRONG_ATTEMPTS}</span>
             </div>
        </div>
        
        {renderGrid()}

      </CardContent>
      <CardFooter>
          <p className="text-xs text-center text-muted-foreground w-full">
             {phase === 'memorize' ? 'استعد للعب...' : 'مهمتك هي إعادة رسم المسار من نقطة البداية إلى النهاية.'}
          </p>
      </CardFooter>
    </Card>
  );
}
