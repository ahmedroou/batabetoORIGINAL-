'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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


const TIME_LIMIT_SECONDS = 55; // وقت اللعبة
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
  initialHints: Position[];
};

type MazePhase = 'instructions' | 'playing' | 'ended';

const KeyDisplay = ({ children }: { children: React.ReactNode }) => (
    <div className="w-12 h-12 bg-slate-700 border-b-4 border-slate-900 rounded-md flex items-center justify-center font-mono text-xl text-white">
        {children}
    </div>
);

const ArrowDisplay = ({ icon: Icon, direction }: { icon: React.ElementType, direction: string }) => (
    <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center">
        <Icon className="w-8 h-8" />
    </div>
);

export function HiddenMaze({ game, self, challenge }: { game: Game; self: Player; challenge: GeniusChallenge }) {
  const { toast } = useToast();
  const puzzle = game.challengeState?.puzzle as MazePuzzle;
  const { gridSize = 8, start = { x: 0, y: 0 }, end = { x: 7, y: 7 }, walls = [], initialHints = [] } = puzzle || {};
  
  const [mazePhase, setMazePhase] = useState<MazePhase>('instructions');
  const [currentPosition, setCurrentPosition] = useState<Position>(start);
  const [points, setPoints] = useState<number>(STARTING_POINTS);
  const [timeLeft, setTimeLeft] = useState<number>(TIME_LIMIT_SECONDS);
  const [freezeMovement, setFreezeMovement] = useState<boolean>(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [visited, setVisited] = useState<Position[]>([start, ...initialHints]);

  // **جديد:** حالة لتتبع المربعات المرئية (غير المغطاة بالضباب)
  const [revealedTiles, setRevealedTiles] = useState<Set<string>>(new Set());

  const controls = useMemo(() => {
    const directions: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];
    const shuffledDirections = [...directions].sort(() => Math.random() - 0.5);
    return {
        'ArrowUp': shuffledDirections[0]!,
        'ArrowDown': shuffledDirections[1]!,
        'ArrowLeft': shuffledDirections[2]!,
        'ArrowRight': shuffledDirections[3]!,
    };
  }, []);

  const isPositionEqual = (pos1: Position, pos2: Position) => pos1.x === pos2.x && pos1.y === pos2.y;
  const isWall = useCallback((pos: Position) => walls.some((wall) => isPositionEqual(wall, pos)), [walls]);

  // **جديد:** دالة مساعدة لتحويل Position إلى مفتاح سلسلة (للاستخدام في Set)
  const posKey = useCallback((pos: Position) => `${pos.x},${pos.y}`, []);

  // **جديد:** دالة مساعدة للحصول على المربعات المرئية حول نقطة معينة
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
      const timeTaken = TIME_LIMIT_SECONDS - timeLeft;
      await submitChallengeResult(game.id, self.id, { isCorrect: isVictory, time: timeTaken, score: finalPoints });
      if (isVictory) {
          toast({ title: 'وصلت للنهاية!', description: `نقاطك المتبقية: ${finalPoints}`, className: 'bg-green-100 text-green-700' });
      } else {
           toast({ title: 'انتهى الوقت!', variant: 'destructive' });
      }
  }, [hasSubmitted, timeLeft, game.id, self.id, toast]);

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
            if (!hasSubmitted) {
                handleSubmit(false, 0);
            }
            // لا حاجة لـ clearInterval هنا، سيتم مسحه بواسطة دالة التنظيف
        } else {
            setTimeLeft(remaining);
        }
    };
    const timer = setInterval(updateTimer, 1000);
    updateTimer(); // استدعاء فوري لتحديث الوقت عند بدء التأثير

    return () => clearInterval(timer); // دالة التنظيف
  }, [mazePhase, hasSubmitted, game.challengeState?.challengeEndsAt, handleSubmit]);

  // **جديد:** تأثير لتحديث المربعات المرئية عند تغيير موقع اللاعب
  useEffect(() => {
      if (mazePhase === 'playing' && currentPosition) {
          setRevealedTiles(prev => {
              const newRevealed = new Set(prev);
              getVisibleArea(currentPosition, 1).forEach(key => newRevealed.add(key)); // إضافة المربعات الجديدة المرئية
              return newRevealed;
          });
      }
  }, [mazePhase, currentPosition, getVisibleArea]);

  // **جديد:** تأثير لتهيئة المربعات المرئية عند بدء اللعبة
  useEffect(() => {
      if (mazePhase === 'playing' && puzzle && start) {
          const initialVisible = getVisibleArea(start, 1);
          // إضافة التلميحات الأولية إلى المربعات المرئية
          initialHints.forEach(hint => {
              initialVisible.add(posKey(hint)); // فقط مربع التلميح نفسه
          });
          setRevealedTiles(initialVisible);
      }
  }, [mazePhase, puzzle, start, initialHints, getVisibleArea, posKey]);


  const handleMove = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (mazePhase !== 'playing' || freezeMovement || points <= 0 || hasSubmitted) return;

      const dx = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;
      const dy = direction === 'down' ? 1 : direction === 'up' ? -1 : 0;
      const newPos = { x: currentPosition.x + dx, y: currentPosition.y + dy };

      if (newPos.x < 0 || newPos.x >= gridSize || newPos.y < 0 || newPos.y >= gridSize) {
        toast({ title: 'خارج الحدود!', description: 'لا يمكنك التحرك خارج المتاهة.', variant: 'destructive', duration: 1000 });
        return;
      }
      
      // لا نستخدم setVisited هنا لتلوين المسار، بل فقط لتتبع الأماكن التي مر بها اللاعب
      // setVisited(prev => [...prev, newPos]); // Keep this for potential future features or debugging

      if (isWall(newPos)) {
        setFreezeMovement(true);
        const newPoints = Math.max(0, points - WALL_HIT_COST);
        setPoints(newPoints);
        toast({ title: `اصطدمت بجدار! -${WALL_HIT_COST} نقطة`, description: `توقف لمدة ${WALL_HIT_FREEZE_SECONDS} ثواني`, variant: 'destructive', duration: 1500 });

        if (newPoints <= 0) {
          handleSubmit(false, 0);
        }

        setTimeout(() => setFreezeMovement(false), WALL_HIT_FREEZE_SECONDS * 1000);
        return;
      }

      setCurrentPosition(newPos);

      if (isPositionEqual(newPos, end)) {
        handleSubmit(true, points);
      }
    },
    [currentPosition, gridSize, mazePhase, freezeMovement, isWall, points, end, game.id, self.id, toast, hasSubmitted, handleSubmit]
  );
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (mazePhase !== 'playing' || freezeMovement) return;
        
        const key = e.key;
        let moveDirection: 'up' | 'down' | 'left' | 'right' | undefined;

        if (key === 'ArrowUp') moveDirection = controls['ArrowUp'];
        else if (key === 'ArrowDown') moveDirection = controls['ArrowDown'];
        else if (key === 'ArrowLeft') moveDirection = controls['ArrowLeft'];
        else if (key === 'ArrowRight') moveDirection = controls['ArrowRight'];

        if (moveDirection) {
            e.preventDefault();
            handleMove(moveDirection);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [handleMove, mazePhase, freezeMovement, controls]);

  const getMoveIcon = (direction: string) => {
      switch(direction) {
          case 'up': return MoveUp;
          case 'down': return MoveDown;
          case 'left': return MoveLeft;
          case 'right': return MoveRight;
          default: return MoveUp;
      }
  };

  const renderInstructions = () => (
    <Card className="w-full max-w-lg bg-gray-900 text-white border-gray-700">
        <CardHeader className="text-center">
            <CardTitle className="text-3xl text-primary">استعد للمتاهة!</CardTitle>
            <CardDescription className="text-yellow-400 font-bold">
                انتبه! تم تغيير أزرار التحكم في هذه الجولة.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex justify-center">
            <div className='space-y-2 p-3 bg-slate-800 rounded-lg'>
                <h4 className='font-bold text-lg text-center'>مفاتيح الأسهم</h4>
                {Object.entries(controls).map(([key, direction]) => (
                    <div key={key} className='flex items-center justify-center gap-4'>
                       <KeyDisplay>{key === 'ArrowUp' ? <ArrowUp className="w-6 h-6"/> : key === 'ArrowDown' ? <ArrowDown className="w-6 h-6"/> : key === 'ArrowLeft' ? <ArrowLeft className="w-6 h-6"/> : <ArrowRight className="w-6 h-6"/>}</KeyDisplay>
                       <ArrowRight className="w-6 h-6 text-slate-500" />
                       <ArrowDisplay icon={getMoveIcon(direction)} direction={direction} />
                    </div>
                ))}
            </div>
        </CardContent>
        <CardFooter>
            <Button onClick={() => setMazePhase('playing')} className="w-full" size="lg">
                <Play className="ml-2" />
                ابدأ التحدي
            </Button>
        </CardFooter>
    </Card>
  );

  const renderGame = () => (
    <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        <CardDescription className="text-red-500 font-bold">
            تحرك باستخدام الأسهم.
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
            const isAWall = isWall(pos);
            // const isVisitedPath = visited.some(p => isPositionEqual(p, pos) && !isAWall); // لم تعد تُستخدم مباشرة للتلوين
            // const isVisitedWall = visited.some(p => isPositionEqual(p, pos) && isAWall); // لم تعد تُستخدم مباشرة للتلوين
            
            // **جديد:** تحديد ما إذا كان المربع مغطى بالضباب
            const isFogged = !revealedTiles.has(posKey(pos));

            return (
              <motion.div
                key={`${x}-${y}`}
                className={cn(
                  'w-10 h-10 flex items-center justify-center rounded-md transition-colors duration-200 text-white font-bold',
                  // **تأثير الضباب:**
                  isFogged ? 'bg-gray-900 opacity-90' : '', // لون داكن وشفافية للضباب
                  
                  // **تلوين المربعات المرئية:**
                  !isFogged && (
                    isCurrent ? 'bg-blue-500' : 
                    isEndPos ? 'bg-purple-500' :
                    isAWall ? 'bg-red-900/60' : // الجدران المرئية
                    'bg-gray-800' // المربعات العادية المرئية
                  )
                )}
                initial={{ scale: 0.9, opacity: 0.8 }}
                animate={{ scale: isCurrent ? 1.1 : 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                {/* الأيقونات تظهر فقط إذا لم يكن المربع مغطى بالضباب */}
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
                <Button variant="outline" className="w-full h-full" size="icon" onClick={() => handleMove(controls['ArrowUp'])} disabled={freezeMovement || hasSubmitted}>
                    <MoveUp />
                </Button>
            </div>
            <div className="col-start-1 row-start-2">
                <Button variant="outline" className="w-full h-full" size="icon" onClick={() => handleMove(controls['ArrowLeft'])} disabled={freezeMovement || hasSubmitted}>
                    <MoveLeft />
                </Button>
            </div>
            <div className="col-start-2 row-start-2">
                   <Button variant="outline" className="w-full h-full" size="icon" onClick={() => handleMove(controls['ArrowDown'])} disabled={freezeMovement || hasSubmitted}>
                    <MoveDown />
                </Button>
            </div>
              <div className="col-start-3 row-start-2">
                <Button variant="outline" className="w-full h-full" size="icon" onClick={() => handleMove(controls['ArrowRight'])} disabled={freezeMovement || hasSubmitted}>
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
            {mazePhase === 'instructions' && renderInstructions()}
            {mazePhase === 'playing' && renderGame()}
            {mazePhase === 'ended' && renderEnded()}
          </motion.div>
      </AnimatePresence>
  );
}
