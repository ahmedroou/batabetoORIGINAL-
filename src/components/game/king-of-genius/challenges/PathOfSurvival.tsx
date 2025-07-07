

'use client';

import { useState, useEffect } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Footprints } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';


export function PathOfSurvival({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
  const { toast } = useToast();
  const path = game.challengeState?.puzzle;
  
  const [gameState, setGameState] = useState<'preview' | 'play' | 'submitted'>('preview');
  const [userPath, setUserPath] = useState<{ x: number, y: number }[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  const GRID_SIZE = 5;

  useEffect(() => {
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    if (myResult) {
      setGameState('submitted');
      setHasSubmitted(true);
      return;
    }

    if (path) {
        const timer = setTimeout(() => {
            setGameState('play');
            setStartTime(Date.now());
        }, 3000);
        return () => clearTimeout(timer);
    }
  }, [game.challengeState, self.id, path]);

  const handleCellClick = async (x: number, y: number) => {
    if (gameState !== 'play' || hasSubmitted || !path) return;
    if (userPath.some(p => p.x === x && p.y === y)) return;

    const currentExpectedStep = path[userPath.length];

    if (currentExpectedStep && currentExpectedStep.x === x && currentExpectedStep.y === y) {
        const newPath = [...userPath, { x, y }];
        setUserPath(newPath);

        if (newPath.length === path.length) {
            const endTime = Date.now();
            setGameState('submitted');
            setHasSubmitted(true);
            toast({ title: "نجاة!", description: "لقد عبرت المسار بنجاح!", className: "bg-green-100 border-green-500 text-green-700" });
            try {
                await submitChallengeResult(game.id, self.id, { isCorrect: true, time: (endTime - startTime) / 1000 });
            } catch (error: any) {
                toast({ title: "خطأ", description: error.message, variant: "destructive" });
            }
        }
    } else {
        const endTime = Date.now();
        setGameState('submitted');
        setHasSubmitted(true);
        toast({ title: "مسار خاطئ!", description: "لقد انحرفت عن الطريق.", variant: "destructive" });
        try {
            await submitChallengeResult(game.id, self.id, { isCorrect: false, time: (endTime - startTime) / 1000 });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    }
  };

  if (hasSubmitted) {
    return (
      <Card className="w-full max-w-md bg-white text-center">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
        </CardContent>
      </Card>
    );
  }

  if (!path) {
    return (
      <Card className="w-full max-w-md text-center bg-white">
          <CardHeader>
              <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
          </CardHeader>
          <CardContent>
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
              <p className="mt-4 text-muted-foreground">جاري توليد المسار...</p>
          </CardContent>
      </Card>
    )
  }

  const startPoint = path[0];
  const endPoint = path[path.length - 1];

  return (
    <Card className="w-full max-w-md bg-white">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2"><Footprints/>{challenge.name}</CardTitle>
        <CardDescription className="text-muted-foreground mt-2">
          {gameState === 'preview' ? '👁️ احفظ المسار... سيختفي بعد لحظات!' : '🧩 أعد رسم المسار الصحيح!'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center p-4">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}>
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
            const x = index % GRID_SIZE;
            const y = Math.floor(index / GRID_SIZE);
            
            const isPathCell = path.some((p: any) => p.x === x && p.y === y);
            const isUserPathCell = userPath.some(p => p.x === x && p.y === y);
            const isStart = startPoint.x === x && startPoint.y === y;
            const isEnd = endPoint.x === x && endPoint.y === y;

            return (
              <Button
                key={`${x}-${y}`}
                variant="outline"
                className={cn(
                  "w-14 h-14 sm:w-16 sm:h-16 transition-all duration-200 p-0 border-2 flex items-center justify-center",
                  gameState === 'preview' && isPathCell ? 'bg-amber-300 border-amber-400' : 'bg-slate-200 hover:bg-slate-300 border-slate-300',
                  gameState === 'play' && isUserPathCell && 'bg-blue-400 border-blue-500',
                  gameState !== 'play' ? 'cursor-not-allowed' : 'cursor-pointer'
                )}
                onClick={() => handleCellClick(x, y)}
                disabled={gameState !== 'play'}
              >
                <span className="text-xl">
                  {isStart ? '🏁' : isEnd ? '🏆' : ''}
                </span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
