'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const GRID_SIZE = 4;

const generatePath = () => {
  const path = [{ x: 0, y: 0 }];
  let current = { x: 0, y: 0 };

  while (path.length < GRID_SIZE * 2 - 1) {
    const moves = [];
    if (current.x < GRID_SIZE - 1) moves.push({ x: current.x + 1, y: current.y });
    if (current.y < GRID_SIZE - 1) moves.push({ x: current.x, y: current.y + 1 });

    const move = moves[Math.floor(Math.random() * moves.length)];
    if (move && !path.some(p => p.x === move.x && p.y === move.y)) {
      path.push(move);
      current = move;
    } else {
      if (current.x < GRID_SIZE - 1) current.x++;
      else if (current.y < GRID_SIZE - 1) current.y++;
      if (!path.some(p => p.x === current.x && p.y === current.y)) {
        path.push({ ...current });
      }
    }
  }
  return path;
};

export function PathOfSurvival({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
  const { toast } = useToast();
  const [path] = useState(() => game.challengeState?.path || generatePath());
  const [gameState, setGameState] = useState<'preview' | 'play' | 'submitted'>('preview');
  const [userPath, setUserPath] = useState<{ x: number, y: number }[]>([]);
  const [startTime, setStartTime] = useState(0);

  useEffect(() => {
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    if (myResult) {
      setGameState('submitted');
      return;
    }

    const timer = setTimeout(() => {
      setGameState('play');
      setStartTime(Date.now());
    }, 3000);

    return () => clearTimeout(timer);
  }, [game.challengeState, self.id]);

  const handleCellClick = async (x: number, y: number) => {
    if (gameState !== 'play') return;
    if (userPath.some(p => p.x === x && p.y === y)) return;

    const newPath = [...userPath, { x, y }];
    setUserPath(newPath);

    const correctStep = path[newPath.length - 1];
    if (!correctStep || correctStep.x !== x || correctStep.y !== y) {
      const endTime = Date.now();
      setGameState('submitted');
      toast({ title: "مسار خاطئ!", description: "لقد انحرفت عن الطريق.", variant: "destructive" });
      try {
        await submitChallengeResult(game.id, self.id, { isCorrect: false, time: (endTime - startTime) / 1000 });
      } catch (error: any) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      }
      return;
    }

    if (newPath.length === path.length) {
      const endTime = Date.now();
      setGameState('submitted');
      toast({ title: "نجاة!", description: "لقد عبرت المسار بنجاح.", className: "bg-green-600 border-green-600 text-white" });
      try {
        await submitChallengeResult(game.id, self.id, { isCorrect: true, time: (endTime - startTime) / 1000 });
      } catch (error: any) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      }
    }
  };

  if (gameState === 'submitted') {
    return (
      <Card className="w-full max-w-md bg-gray-900/80 border-gray-700 text-white text-center">
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

  return (
    <Card className="w-full max-w-md bg-gray-900/80 border-gray-700 text-white">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        <CardDescription className="text-gray-400">
          {gameState === 'preview' ? 'احفظ المسار... سيختفي بعد لحظات!' : 'أعد رسم المسار الصحيح!'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}>
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
            const x = index % GRID_SIZE;
            const y = Math.floor(index / GRID_SIZE);
            const isPath = path.some(p => p.x === x && p.y === y);
            const isUserPath = userPath.some(p => p.x === x && p.y === y);
            const isStart = x === 0 && y === 0;
            const isEnd = x === GRID_SIZE - 1 && y === GRID_SIZE - 1;

            return (
              <Button
                key={`${x}-${y}`}
                variant="outline"
                className={cn(
                  "w-16 h-16 sm:w-20 sm:h-20 transition-colors duration-300 p-0",
                  gameState === 'preview' && isPath ? 'bg-yellow-400' : 'bg-gray-700 hover:bg-gray-600',
                  gameState === 'play' && isUserPath && 'bg-blue-500'
                )}
                onClick={() => handleCellClick(x, y)}
                disabled={gameState !== 'play' || isUserPath}
              >
                <span className="text-lg">
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