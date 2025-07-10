'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  HelpCircle,
  Coins,
} from 'lucide-react';
import { submitChallengeResult, updateChallengeProgress } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const TIME_LIMIT_SECONDS = 60;
const STARTING_POINTS = 20;
const HINT_COST = 1;
const WALL_HIT_COST = 1;

type Position = { x: number; y: number };
type MazePuzzle = {
    gridSize: number;
    start: Position;
    end: Position;
    path: Position[];
    walls: Position[];
    initialHints: Position[];
};

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
  const puzzle = game.challengeState?.puzzle as MazePuzzle;
  const {
    gridSize = 8,
    start = { x: 0, y: 0 },
    end = { x: 7, y: 7 },
    path = [],
    walls = [],
    initialHints = [],
  } = puzzle || {};

  const myProgress = game.challengeState?.playerProgress?.[self.id] || {};
  
  const [currentPosition, setCurrentPosition] = useState<Position>(myProgress.position || start);
  const [visited, setVisited] = useState<Position[]>([start, ...(myProgress.visited || [])]);
  const [hitWalls, setHitWalls] = useState<Position[]>(myProgress.hitWalls || []);
  const [points, setPoints] = useState<number>(myProgress.points ?? STARTING_POINTS);
  const [revealedByHint, setRevealedByHint] = useState<Position[]>(myProgress.revealedByHint || initialHints);

  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
  
  const myResult = game.challengeState?.results?.find( (r) => r.playerId === self.id );

  const isPositionEqual = (pos1: Position, pos2: Position) => pos1 && pos2 && pos1.x === pos2.x && pos1.y === pos2.y;
  const isWall = useCallback((pos: Position) => walls.some(wall => isPositionEqual(wall, pos)), [walls]);
  const isVisited = useCallback((pos: Position) => visited.some(v => isPositionEqual(v, pos)), [visited]);
  const isRevealedByHint = useCallback((pos: Position) => revealedByHint.some(h => isPositionEqual(h, pos)), [revealedByHint]);


  useEffect(() => {
    if (myResult) {
      setHasSubmitted(true);
      setIsGameOver(true);
    }
  }, [myResult]);
  
  useEffect(() => {
    if (isGameOver || !game.challengeState?.challengeEndsAt) return;
    const endTime = game.challengeState.challengeEndsAt.toMillis();
    
    const updateTimer = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !hasSubmitted) {
        setIsGameOver(true);
        toast({ title: 'انتهى الوقت!', variant: 'destructive' });
        submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS });
        setHasSubmitted(true);
      }
    };

    const timer = setInterval(updateTimer, 1000);
    updateTimer();
    return () => clearInterval(timer);
  }, [isGameOver, hasSubmitted, game.id, self.id, game.challengeState?.challengeEndsAt, toast]);

  const handleMove = useCallback(async (dx: number, dy: number) => {
    if (isGameOver || !currentPosition || points <= 0 || hasSubmitted) return;

    const newPos = { x: currentPosition.x + dx, y: currentPosition.y + dy };

    if (newPos.x < 0 || newPos.x >= gridSize || newPos.y < 0 || newPos.y >= gridSize) {
      toast({ title: 'خارج الحدود!', description: 'لا يمكنك التحرك خارج المتاهة.', variant: 'destructive', duration: 1000 });
      return;
    }

    if (isWall(newPos)) {
      if (!hitWalls.some(w => isPositionEqual(w, newPos))) {
        const newHitWalls = [...hitWalls, newPos];
        const newPoints = Math.max(0, points - WALL_HIT_COST);
        setHitWalls(newHitWalls);
        setPoints(newPoints);
        await updateChallengeProgress(game.id, self.id, { hitWalls: newHitWalls, points: newPoints });
        toast({ title: `اصطدمت بجدار! -${WALL_HIT_COST} نقطة`, variant: 'destructive', duration: 1500 });
        if (newPoints <= 0 && !hasSubmitted) {
            setIsGameOver(true);
            setHasSubmitted(true);
            await submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS - timeLeft });
        }
      } else {
          toast({ title: "جدار", description: "لقد اصطدمت بهذا الجدار بالفعل.", duration: 1000 });
      }
      return;
    }
    
    const newVisited = isVisited(newPos) ? visited : [...visited, newPos];
    setCurrentPosition(newPos);
    setVisited(newVisited);

    await updateChallengeProgress(game.id, self.id, { position: newPos, visited: newVisited });

    if (isPositionEqual(newPos, end)) {
        setIsGameOver(true);
        setHasSubmitted(true);
        const timeTaken = TIME_LIMIT_SECONDS - timeLeft;
        await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken, score: points });
        toast({ title: 'وصلت للنهاية!', description: `نقاطك المتبقية: ${points}`, className: 'bg-green-100 text-green-700' });
    }
  }, [currentPosition, gridSize, isGameOver, isWall, visited, hitWalls, end, timeLeft, game.id, self.id, toast, isVisited, points, hasSubmitted]);

  const requestHint = useCallback(async () => {
    if (isGameOver || points < HINT_COST || hasSubmitted) {
        toast({ title: "لا تملك نقاطًا كافية أو اللعبة انتهت!", variant: "destructive" });
        return;
    }

    const unrevealedPathTiles = path.filter(p => !isVisited(p) && !isRevealedByHint(p));

    if (unrevealedPathTiles.length === 0) {
        toast({ title: "لا توجد تلميحات أخرى!", description: "لقد تم كشف كل المسار.", duration: 2000 });
        return;
    }
    
    let nextHint = unrevealedPathTiles[0];
    let minDistance = Infinity;
    
    unrevealedPathTiles.forEach(tile => {
        const distance = Math.abs(tile.x - currentPosition.x) + Math.abs(tile.y - currentPosition.y);
        if(distance < minDistance){
            minDistance = distance;
            nextHint = tile;
        }
    });

    const newRevealedByHint = [...revealedByHint, nextHint];
    const newPoints = points - HINT_COST;

    setRevealedByHint(newRevealedByHint);
    setPoints(newPoints);
    await updateChallengeProgress(game.id, self.id, { revealedByHint: newRevealedByHint, points: newPoints });
    toast({ title: `تم كشف مربع! -${HINT_COST} نقطة`, duration: 1500 });

    if (newPoints <= 0 && !hasSubmitted) {
        setIsGameOver(true);
        setHasSubmitted(true);
        await submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS - timeLeft });
    }

  }, [isGameOver, points, path, isVisited, revealedByHint, toast, game.id, self.id, currentPosition, hasSubmitted, isRevealedByHint]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGameOver || hasSubmitted) return;
      e.preventDefault();
      switch (e.key) {
        case 'ArrowUp': case 'w': handleMove(0, -1); break;
        case 'ArrowDown': case 's': handleMove(0, 1); break;
        case 'ArrowLeft': case 'a': handleMove(-1, 0); break;
        case 'ArrowRight': case 'd': handleMove(1, 0); break;
        case 'h': requestHint(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, requestHint, isGameOver, hasSubmitted]);

  if (!puzzle) {
    return (
      <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
        <CardHeader><CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle></CardHeader>
        <CardContent>
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" /><p className="mt-4 text-muted-foreground">جاري توليد المتاهة...</p>
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
                {myResult?.isCorrect ? <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" /> : <X className="w-20 h-20 text-red-500 mx-auto mb-4" />}
                <p className="text-xl">{myResult?.isCorrect ? `لقد نجوت بـ ${myResult.score} نقاط!` : "لقد فشلت."}</p>
                <p className="text-muted-foreground">في انتظار بقية اللاعبين...</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">{challenge.name}</CardTitle>
        <CardDescription>استخدم الأسهم للتحرك و 'H' للتلميح. تجنب الجدران!</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="w-full flex justify-between items-center bg-slate-800 p-3 rounded-lg text-lg font-bold">
          <div className="flex items-center gap-2 text-yellow-400"><Coins /><span className="font-mono">{points}</span></div>
          <div className="flex items-center gap-2"><Timer /><span className={cn('font-mono', timeLeft < 10 && 'text-red-500')}>{timeLeft}</span></div>
        </div>
        <div className="grid gap-1 bg-slate-800 p-2 rounded-lg" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
          {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const x = i % gridSize;
            const y = Math.floor(i / gridSize);
            const pos = { x, y };
            
            const isCurrent = isPositionEqual(pos, currentPosition);
            const isStartPos = isPositionEqual(pos, start);
            const isEndPos = isPositionEqual(pos, end);
            const wasHit = hitWalls.some(w => isPositionEqual(w, pos));
            const isHintRevealed = revealedByHint.some(h => isPositionEqual(h, pos));
            const isVisible = isVisited(pos) || isHintRevealed || isCurrent || isStartPos || isEndPos;

            let tileContent = null;
            let tileClass = 'bg-gray-800/50 border-gray-700';

            if (isStartPos) tileContent = <Footprints className="h-6 w-6 text-yellow-400"/>;
            if (isEndPos) tileContent = <Flag className="h-6 w-6 text-green-400"/>;
            if (isCurrent && !isStartPos && !isEndPos) tileContent = <Footprints className="h-6 w-6 text-white"/>;

            if (isWall(pos)) {
                tileClass = 'bg-slate-950 border-slate-600';
                if (wasHit) tileContent = <Bomb className="h-6 w-6 text-red-500"/>;
            } else {
                if (isVisited(pos) && !isCurrent && !isStartPos && !isEndPos) {
                    tileClass = 'bg-blue-900/50 border-blue-800';
                }
                if (isHintRevealed && !isCurrent && !isStartPos && !isEndPos) {
                    tileClass = 'bg-cyan-900/50 border-cyan-800';
                    if (!tileContent) tileContent = <HelpCircle className="h-6 w-6 text-cyan-400"/>;
                }
            }
            
            if (isCurrent) tileClass = 'bg-blue-500 border-blue-400';
            if (isStartPos) tileClass = 'bg-yellow-600 border-yellow-500';
            if (isEndPos) tileClass = 'bg-green-600 border-green-500';
            if (wasHit) tileClass = 'bg-red-900/50 border-red-800';


            return (
              <motion.div
                key={`${x}-${y}`}
                className={cn('w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-md transition-colors duration-200 text-white font-bold', tileClass)}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: isVisible ? 1 : 0.1 }}
                transition={{ duration: 0.2 }}
              >
                {tileContent}
              </motion.div>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
            <div></div>
            <Button variant="outline" size="icon" onClick={() => handleMove(0,-1)} disabled={isGameOver || points <= 0 || hasSubmitted}><MoveUp/></Button>
            <div></div>
            <Button variant="outline" size="icon" onClick={() => handleMove(-1,0)} disabled={isGameOver || points <= 0 || hasSubmitted}><MoveLeft/></Button>
            <Button variant="outline" size="icon" onClick={() => handleMove(0,1)} disabled={isGameOver || points <= 0 || hasSubmitted}><MoveDown/></Button>
            <Button variant="outline" size="icon" onClick={() => handleMove(1,0)} disabled={isGameOver || points <= 0 || hasSubmitted}><MoveRight/></Button>
        </div>
      </CardContent>
       <CardFooter className="flex-col gap-2">
            <Button variant="secondary" onClick={requestHint} disabled={isGameOver || points < HINT_COST || hasSubmitted} className="w-full">
                <HelpCircle className="ml-2" />
                طلب تلميح (-{HINT_COST} نقطة)
            </Button>
       </CardFooter>
    </Card>
  );
}
