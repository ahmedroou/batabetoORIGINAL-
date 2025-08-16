'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Timer,
  Footprints,
  Flag,
  MoveUp,
  MoveDown,
  MoveLeft,
  MoveRight,
  Coins,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Play,
  Check,
} from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Game, Player, GeniusChallenge } from '@/types';


const WALL_HIT_COST = 1;
const WALL_HIT_FREEZE_SECONDS = 3;

type Position = { x: number; y: number };
type MazePuzzle = {
  gridSize: number;
  start: Position;
  end: Position;
  path: Position[];
  walls: Position[];
  initialHints: Position[];
};

type MazePhase = 'playing' | 'ended';

export function HiddenMaze({ game, self, challenge }: { game: Game; self: Player; challenge: GeniusChallenge }) {
  const { toast } = useToast();
  const puzzle = game.challengeState?.puzzle as MazePuzzle;
  const { gridSize = 8, start = { x: 0, y: 0 }, end = { x: 7, y: 7 }, walls = [], initialHints = [] } = puzzle || {};
  
  const [mazePhase, setMazePhase] = useState<MazePhase>('playing');
  const [currentPosition, setCurrentPosition] = useState<Position>(start);
  const [points, setPoints] = useState<number>(() => game.challengeState?.playerProgress?.[self.id]?.points ?? 10);
  const [freezeMovement, setFreezeMovement] = useState<boolean>(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [revealedTiles, setRevealedTiles] = useState<Set<string>>(new Set());
  
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!game.challengeState?.challengeEndsAt) return challenge.timeLimit;
    return Math.max(0, Math.round((game.challengeState.challengeEndsAt.toMillis() - Date.now()) / 1000));
  });

  const isPositionEqual = (pos1: Position, pos2: Position) => pos1.x === pos2.x && pos1.y === pos2.y;
  const isWall = useCallback((pos: Position) => walls.some((wall) => isPositionEqual(wall, pos)), [walls]);
  const posKey = useCallback((pos: Position) => `${pos.x},${pos.y}`, []);

  const getVisibleArea = useCallback((center: Position, radius: number = 1) => {
      const visible = new Set<string>();
      for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
              const newX = center.x + dx;
              const newY = center.y + dy;
              if (newX >= 0 && newX < gridSize && newY >= 0 && newY < gridSize) {
                  visible.add(posKey({ x: newX, y: newY }));
              }
          }
      }
      return visible;
  }, [gridSize, posKey]);

  const handleSubmit = useCallback(async (isVictory: boolean, finalPoints: number) => {
      if (hasSubmitted) return;
      setHasSubmitted(true);
      setMazePhase('ended');
      const timeTaken = challenge.timeLimit - timeLeft;
      await submitChallengeResult(game.id, self.id, { isCorrect: isVictory, time: timeTaken, score: finalPoints });
      if (isVictory) {
          toast({ title: 'وصلت للنهاية!', description: `نقاطك المتبقية: ${finalPoints}`, className: 'bg-green-100 text-green-700' });
      } else {
           toast({ title: 'انتهى الوقت!', variant: 'destructive' });
      }
  }, [hasSubmitted, timeLeft, game.id, self.id, toast, challenge.timeLimit]);

  useEffect(() => {
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    if (myResult) {
      setHasSubmitted(true);
      setMazePhase('ended');
    }
  }, [game.challengeState?.results, self.id]);
  
  useEffect(() => {
    if (mazePhase !== 'playing' || hasSubmitted || !game.challengeState?.challengeEndsAt) return;
    const endTime = game.challengeState.challengeEndsAt.toMillis();
    const updateTimer = () => {
        const remaining = Math.round((endTime - Date.now()) / 1000);
        if (remaining <= 0) {
            setTimeLeft(0);
            if (!hasSubmitted) handleSubmit(false, 0);
        } else {
            setTimeLeft(remaining);
        }
    };
    const timer = setInterval(updateTimer, 1000);
    updateTimer(); 
    return () => clearInterval(timer);
  }, [mazePhase, hasSubmitted, game.challengeState?.challengeEndsAt, handleSubmit]);

  useEffect(() => {
      if (mazePhase === 'playing' && currentPosition) {
          setRevealedTiles(prev => {
              const newRevealed = new Set(prev);
              getVisibleArea(currentPosition, 1).forEach(key => newRevealed.add(key));
              return newRevealed;
          });
      }
  }, [mazePhase, currentPosition, getVisibleArea]);

  useEffect(() => {
      if (mazePhase === 'playing' && puzzle && start) {
          const initialVisible = getVisibleArea(start, 1);
          initialHints.forEach(hint => initialVisible.add(posKey(hint)));
          setRevealedTiles(initialVisible);
      }
  }, [mazePhase, puzzle, start, initialHints, getVisibleArea, posKey]);

  const handleMove = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
      if (mazePhase !== 'playing' || freezeMovement || points <= 0 || hasSubmitted) return;

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
        toast({ title: `اصطدمت بجدار! -${WALL_HIT_COST} نقطة`, description: `توقف لمدة ${WALL_HIT_FREEZE_SECONDS} ثواني`, variant: 'destructive', duration: 1500 });

        if (newPoints <= 0) handleSubmit(false, 0);

        setTimeout(() => setFreezeMovement(false), WALL_HIT_FREEZE_SECONDS * 1000);
        return;
      }

      setCurrentPosition(newPos);
      if (isPositionEqual(newPos, end)) handleSubmit(true, points);
    },
    [currentPosition, gridSize, mazePhase, freezeMovement, isWall, points, end, toast, hasSubmitted, handleSubmit]
  );
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (mazePhase !== 'playing' || freezeMovement) return;
        
        let moveDirection: 'up' | 'down' | 'left' | 'right' | undefined;
        if (e.key === 'ArrowUp') moveDirection = 'up';
        else if (e.key === 'ArrowDown') moveDirection = 'down';
        else if (e.key === 'ArrowLeft') moveDirection = 'left';
        else if (e.key === 'ArrowRight') moveDirection = 'right';

        if (moveDirection) {
            e.preventDefault();
            handleMove(moveDirection);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [handleMove, mazePhase, freezeMovement]);
  
  const renderGame = () => (
    <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        <CardDescription className="text-red-500 font-bold">
            استخدم الأسهم للتحرك والوصول للهدف.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="w-full flex justify-around items-center bg-slate-800 p-3 rounded-lg text-lg font-bold">
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
            const isFogged = !revealedTiles.has(posKey(pos));

            return (
              <motion.div
                key={`${x}-${y}`}
                className={cn(
                  'w-10 h-10 flex items-center justify-center rounded-md transition-colors duration-200 text-white font-bold',
                  isFogged ? 'bg-gray-900 opacity-90' : '',
                  !isFogged && (
                    isCurrent ? 'bg-blue-500' : 
                    isEndPos ? 'bg-purple-500' :
                    isWall(pos) ? 'bg-red-900/60' :
                    'bg-gray-800'
                  )
                )}
                initial={{ scale: 0.9, opacity: 0.8 }}
                animate={{ scale: isCurrent ? 1.1 : 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                {!isFogged && (
                  isCurrent ? <Footprints className="animate-pulse" /> : 
                  isStartPos ? <Footprints /> : 
                  isEndPos ? <Flag /> : null
                )}
              </motion.div>
            );
          })}
        </div>
        <div className="grid grid-cols-3 grid-rows-2 gap-2 w-full max-w-xs pt-4">
            <div className="col-start-2 row-start-1">
                <Button variant="outline" className="w-full h-full" size="icon" onClick={() => handleMove('up')} disabled={freezeMovement || hasSubmitted}>
                    <MoveUp />
                </Button>
            </div>
            <div className="col-start-1 row-start-2">
                <Button variant="outline" className="w-full h-full" size="icon" onClick={() => handleMove('left')} disabled={freezeMovement || hasSubmitted}>
                    <MoveLeft />
                </Button>
            </div>
            <div className="col-start-2 row-start-2">
                   <Button variant="outline" className="w-full h-full" size="icon" onClick={() => handleMove('down')} disabled={freezeMovement || hasSubmitted}>
                    <MoveDown />
                </Button>
            </div>
              <div className="col-start-3 row-start-2">
                <Button variant="outline" className="w-full h-full" size="icon" onClick={() => handleMove('right')} disabled={freezeMovement || hasSubmitted}>
                    <MoveRight />
                </Button>
            </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderEnded = () => (
      <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
        <CardHeader>
            <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
            <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
            <p className="text-xl">انتهى التحدي! في انتظار بقية اللاعبين...</p>
        </CardContent>
    </Card>
  );
  
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
      )
  }

  return (
      <AnimatePresence mode="wait">
          <motion.div
            key={mazePhase}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            {mazePhase === 'playing' && renderGame()}
            {mazePhase === 'ended' && renderEnded()}
          </motion.div>
      </AnimatePresence>
  );
}