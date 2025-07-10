'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Timer, Footprints, Flag, Bomb, MoveUp, MoveDown, MoveLeft, MoveRight, HelpCircle, Coins } from 'lucide-react';
import { submitChallengeResult, updateChallengeProgress } from '@/lib/actions/king-of-genius';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TIME_LIMIT_SECONDS = 30; // وقت اللعبة
const STARTING_POINTS = 10; // عدد النقاط عند البدء
const WALL_HIT_COST = 1; // تكلفة الاصطدام بالجدار
const WALL_HIT_FREEZE_SECONDS = 3; // مدة التوقف عند الاصطدام بالجدار

type Position = { x: number; y: number };
type MazePuzzle = {
  gridSize: number;
  start: Position;
  end: Position;
  path: Position[];
  walls: Position[];
};

export function HiddenMaze({ game, self, challenge }: { game: Game; self: Player; challenge: GeniusChallenge }) {
  const { toast } = useToast();
  const puzzle = game.challengeState?.puzzle as MazePuzzle;
  const { gridSize = 8, start = { x: 0, y: 0 }, end = { x: 7, y: 7 }, walls = [] } = puzzle || {};

  const [currentPosition, setCurrentPosition] = useState<Position>(start);
  const [points, setPoints] = useState<number>(STARTING_POINTS);
  const [timeLeft, setTimeLeft] = useState<number>(TIME_LIMIT_SECONDS);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [freezeMovement, setFreezeMovement] = useState<boolean>(false);

  const [controls, setControls] = useState<Record<string, string>>({
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  });

  const isPositionEqual = (pos1: Position, pos2: Position) => pos1.x === pos2.x && pos1.y === pos2.y;
  const isWall = useCallback((pos: Position) => walls.some((wall) => isPositionEqual(wall, pos)), [walls]);

  useEffect(() => {
    const randomizeControls = () => {
      const directions = ['up', 'down', 'left', 'right'];
      const shuffledDirections = directions.sort(() => Math.random() - 0.5);

      setControls({
        ArrowUp: shuffledDirections[0],
        ArrowDown: shuffledDirections[1],
        ArrowLeft: shuffledDirections[2],
        ArrowRight: shuffledDirections[3],
        w: shuffledDirections[0],
        s: shuffledDirections[1],
        a: shuffledDirections[2],
        d: shuffledDirections[3],
      });
    };

    randomizeControls();
  }, []);

  useEffect(() => {
    if (isGameOver) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsGameOver(true);
          toast({ title: 'انتهى الوقت!', variant: 'destructive' });
          submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isGameOver, game.id, self.id, toast]);

  const handleMove = useCallback(
    async (direction: string) => {
      if (isGameOver || freezeMovement || points <= 0) return;

      const dx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
      const dy = direction === 'down' ? 1 : direction === 'up' ? -1 : 0;
      const newPos = { x: currentPosition.x + dx, y: currentPosition.y + dy };

      if (newPos.x < 0 || newPos.x >= gridSize || newPos.y < 0 || newPos.y >= gridSize) {
        toast({ title: 'خارج الحدود!', description: 'لا يمكنك التحرك خارج المتاهة.', variant: 'destructive', duration: 1000 });
        return;
      }

      if (isWall(newPos)) {
        setFreezeMovement(true);
        const newPoints = Math.max(0, points - WALL_HIT_COST);
        setPoints(newPoints);
        toast({ title: `اصطدمت بجدار! -${WALL_HIT_COST} نقطة`, variant: 'destructive', duration: 1500 });

        if (newPoints <= 0) {
          setIsGameOver(true);
          submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS - timeLeft });
        }

        setTimeout(() => setFreezeMovement(false), WALL_HIT_FREEZE_SECONDS * 1000);
        return;
      }

      setCurrentPosition(newPos);

      if (isPositionEqual(newPos, end)) {
        setIsGameOver(true);
        submitChallengeResult(game.id, self.id, { isCorrect: true, time: TIME_LIMIT_SECONDS - timeLeft, score: points });
        toast({ title: 'وصلت للنهاية!', description: `نقاطك المتبقية: ${points}`, className: 'bg-green-100 text-green-700' });
      }
    },
    [currentPosition, gridSize, isGameOver, freezeMovement, isWall, points, end, timeLeft, game.id, self.id, toast]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (controls[e.key]) handleMove(controls[e.key]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, controls]);

  return (
    <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        <CardDescription>
          التحكم الحالي: {Object.keys(controls).map((key) => `${key} => ${controls[key]}`).join(', ')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="flex justify-between items-center bg-slate-800 p-3 rounded-lg text-lg font-bold">
          <div className="flex items-center gap-2 text-yellow-400">
            <Coins />
            <span className="font-mono">{points}</span>
          </div>
          <div className="flex items-center gap-2">
            <Timer />
            <span className={cn('font-mono', timeLeft < 10 && 'text-red-500')}>{timeLeft}</span>
          </div>
        </div>
        <div className="grid gap-1 bg-slate-800 p-2 rounded-lg" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
          {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);
            const pos = { x, y };
            const isCurrent = isPositionEqual(pos, currentPosition);
            const isStartPos = isPositionEqual(pos, start);
            const isEndPos = isPositionEqual(pos, end);
            const isWallTile = isWall(pos);

            return (
              <motion.div
                key={`${x}-${y}`}
                className={cn(
                  'w-10 h-10 flex items-center justify-center rounded-md transition-colors duration-200 text-white font-bold',
                  isCurrent ? 'bg-blue-500' : isStartPos ? 'bg-yellow-600' : isEndPos ? 'bg-green-600' : isWallTile ? 'bg-red-900' : 'bg-gray-800'
                )}
              >
                {isCurrent ? <Footprints /> : isStartPos ? <Footprints /> : isEndPos ? <Flag /> : null}
              </motion.div>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
          <Button variant="outline" size="icon" onClick={() => handleMove(controls['w'])} disabled={freezeMovement || isGameOver}>
            <MoveUp />
          </Button>
          <Button variant="outline" size="icon" onClick={() => handleMove(controls['a'])} disabled={freezeMovement || isGameOver}>
            <MoveLeft />
          </Button>
          <Button variant="outline" size="icon" onClick={() => handleMove(controls['s'])} disabled={freezeMovement || isGameOver}>
            <MoveDown />
          </Button>
          <Button variant="outline" size="icon" onClick={() => handleMove(controls['d'])} disabled={freezeMovement || isGameOver}>
            <MoveRight />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}