
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { motion } from 'framer-motion';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Timer,
  Check,
  X,
  Footprints,
  Flag,
  Bomb,
  MoveUp,
  MoveDown,
  MoveLeft,
  MoveRight,
} from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

const TIME_LIMIT_SECONDS = 60;

type Position = { x: number; y: number };

export function HiddenMaze({
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
  const {
    gridSize = 0,
    start,
    end,
    path,
    walls,
  }: {
    gridSize: number;
    start: Position;
    end: Position;
    path: Position[];
    walls: Position[];
  } = puzzle || {};

  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
  
  const myProgress = game.challengeState?.playerProgress?.[self.id] || {};
  const currentPosition: Position = myProgress.position || start;
  const visited: Position[] = myProgress.visited || (start ? [start] : []);
  const hitWalls: Position[] = myProgress.hitWalls || [];

  const myResult = game.challengeState?.results?.find(
    (r) => r.playerId === self.id
  );

  const isPositionEqual = (pos1: Position, pos2: Position) => {
    return pos1.x === pos2.x && pos1.y === pos2.y;
  };

  const isWall = useCallback((pos: Position) => {
    return walls?.some(wall => isPositionEqual(wall, pos));
  }, [walls]);
  
  const isVisited = useCallback((pos: Position) => {
    return visited?.some(v => isPositionEqual(v, pos));
  }, [visited]);

  // Effect to handle initial setup and game end state
  useEffect(() => {
    if (myResult) {
      setHasSubmitted(true);
      setIsGameOver(true);
    }
  }, [myResult]);

  // Timer effect
  useEffect(() => {
    if (isGameOver || !game.challengeState?.challengeEndsAt) return;

    const endTime = game.challengeState.challengeEndsAt.toMillis();
    const updateTimer = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !hasSubmitted) {
        setIsGameOver(true);
        toast({ title: 'انتهى الوقت!', variant: 'destructive' });
        submitChallengeResult(game.id, self.id, {
          isCorrect: false,
          time: TIME_LIMIT_SECONDS,
        });
        setHasSubmitted(true);
      }
    };
    const timer = setInterval(updateTimer, 1000);
    updateTimer();
    return () => clearInterval(timer);
  }, [isGameOver, hasSubmitted, game.id, self.id, game.challengeState?.challengeEndsAt, toast]);

  const handleMove = useCallback(async (dx: number, dy: number) => {
    if (isGameOver || !currentPosition) return;

    const newPos = { x: currentPosition.x + dx, y: currentPosition.y + dy };

    if (newPos.x < 0 || newPos.x >= gridSize || newPos.y < 0 || newPos.y >= gridSize) {
      return; // Out of bounds
    }

    if (isWall(newPos)) {
      if (!hitWalls.some(w => isPositionEqual(w, newPos))) {
        const newHitWalls = [...hitWalls, newPos];
        // For simplicity, we won't use updateChallengeProgress for walls to reduce Firestore writes.
        // We'll manage this state locally and send it with the final result if needed.
        // For now, local state is enough.
      }
      toast({ title: "صطدمت بجدار!", variant: 'destructive', duration: 1500 });
      return;
    }
    
    const newVisited = isVisited(newPos) ? visited : [...visited, newPos];
    // In a real scenario, this would be an `updateChallengeProgress` call
    // For now, let's simulate the state update optimistically.
     const optimisticProgress = {
        position: newPos,
        visited: newVisited,
        hitWalls,
     };
    
     // Let's assume a local state management for moves for now to avoid too many writes.
     // The final result submission is the most critical part.
     game.challengeState.playerProgress[self.id] = optimisticProgress;


    if (isPositionEqual(newPos, end)) {
        setIsGameOver(true);
        setHasSubmitted(true);
        const timeTaken = TIME_LIMIT_SECONDS - timeLeft;
        await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
        toast({ title: 'وصلت للنهاية!', className: 'bg-green-100 text-green-700' });
    }
  }, [currentPosition, gridSize, isGameOver, isWall, visited, hitWalls, end, timeLeft, game.id, self.id, toast, isVisited]);

  // Keyboard controls effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          handleMove(0, -1);
          break;
        case 'ArrowDown':
        case 's':
          handleMove(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
          handleMove(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
          handleMove(1, 0);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove]);


  if (!puzzle) {
    return (
      <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">جاري توليد المتاهة...</p>
        </CardContent>
      </Card>
    );
  }
  
  if (hasSubmitted) {
     return (
        <Card className="w-full max-w-lg text-center bg-gray-800 text-white border-gray-700">
            <CardHeader>
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>انتهى التحدي بالنسبة لك</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {myResult?.isCorrect ? (
                    <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
                ) : (
                    <X className="w-20 h-20 text-red-500 mx-auto mb-4" />
                )}
                <p className="text-xl">{myResult?.isCorrect ? "لقد نجوت!" : "لقد فشلت."}</p>
                <p className="text-muted-foreground">في انتظار بقية اللاعبين...</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
          {challenge.name}
        </CardTitle>
        <CardDescription>
          استخدم الأسهم أو WASD للتحرك والوصول إلى النهاية.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="w-full flex justify-between items-center bg-slate-800 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-xl font-bold">
            <Timer />
            <span className={cn(timeLeft < 10 && 'text-destructive')}>{timeLeft}</span>
          </div>
        </div>
        <div
          className="grid gap-1 bg-slate-800 p-2 rounded-lg"
          style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
        >
          {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);
            const pos = { x, y };
            
            const isCurrent = isPositionEqual(pos, currentPosition);
            const isStartPos = isPositionEqual(pos, start);
            const isEndPos = isPositionEqual(pos, end);
            const isKnownWall = isGameOver && isWall(pos);
            const isVisitedPath = isVisited(pos);

            let tileContent = null;
            if(isCurrent && !isStartPos) tileContent = <Footprints className="h-6 w-6 text-white"/>;
            if(isStartPos) tileContent = <Footprints className="h-6 w-6 text-yellow-400"/>;
            if(isEndPos) tileContent = <Flag className="h-6 w-6 text-green-400"/>;
            if(isKnownWall) tileContent = <Bomb className="h-6 w-6 text-red-400"/>;

            return (
              <motion.div
                key={`${x}-${y}`}
                className={cn(
                  'w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-md transition-all duration-200 text-white font-bold text-lg',
                  'bg-slate-700 border-2 border-slate-600',
                   isVisitedPath ? 'bg-blue-900/50' : 'bg-gray-800/50',
                   isCurrent && 'bg-blue-600 ring-2 ring-white',
                   isKnownWall && 'bg-red-900/70',
                   isEndPos && !isVisitedPath && 'bg-gray-800/50'
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: isVisitedPath || isCurrent || isEndPos ? 1 : 0.2 }}
                transition={{ duration: 0.5 }}
              >
                {tileContent}
              </motion.div>
            );
          })}
        </div>
        <div className="flex space-x-2 text-gray-400">
           <div className="flex flex-col items-center">
                <Button variant="outline" size="icon" onClick={() => handleMove(0,-1)}><MoveUp/></Button>
            </div>
        </div>
         <div className="flex space-x-12 text-gray-400">
            <Button variant="outline" size="icon" onClick={() => handleMove(-1,0)}><MoveLeft/></Button>
            <Button variant="outline" size="icon" onClick={() => handleMove(0,1)}><MoveDown/></Button>
            <Button variant="outline" size="icon" onClick={() => handleMove(1,0)}><MoveRight/></Button>
        </div>
      </CardContent>
    </Card>
  );
}
