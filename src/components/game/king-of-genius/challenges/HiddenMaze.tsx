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
  BrainCircuit, // Added for consistency with PathOfSurvival
  ShieldAlert // Added for consistency with PathOfSurvival
} from 'lucide-react';
import { submitChallengeResult, updateChallengeProgress } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const TIME_LIMIT_SECONDS = 60;
const STARTING_POINTS = 20;
const HINT_COST = 3; // Increased hint cost for balance
const WALL_HIT_COST = 2; // Increased wall hit cost for balance

type Position = { x: number; y: number };
type MazePuzzle = {
    gridSize: number;
    start: Position;
    end: Position;
    path: Position[]; // The actual solution path for hints
    walls: Position[]; // The positions of walls
    initialHints: Position[]; // A few starting hints
};

// --- Maze Generation Logic ---
// Helper to check if a position is within bounds
const isInBounds = (x: number, y: number, gridSize: number) => x >= 0 && x < gridSize && y >= 0 && y < gridSize;

// Helper to get neighbors
const getNeighbors = (x: number, y: number, gridSize: number) => {
    const neighbors: Position[] = [];
    if (isInBounds(x + 1, y, gridSize)) neighbors.push({ x: x + 1, y });
    if (isInBounds(x - 1, y, gridSize)) neighbors.push({ x: x - 1, y });
    if (isInBounds(x, y + 1, gridSize)) neighbors.push({ x, y: y + 1 });
    if (isInBounds(x, y - 1, gridSize)) neighbors.push({ x, y: y - 1 });
    return neighbors;
};

// Maze generation using Randomized Prim's Algorithm
const generateMaze = (gridSize: number, start: Position, end: Position): { walls: Position[], passages: Position[] } => {
    const allCells: Position[] = [];
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            allCells.push({ x, y });
        }
    }

    const walls: Position[] = [...allCells]; // Start with all cells as walls
    const passages: Position[] = [];
    const frontier: Position[] = []; // Cells adjacent to passages but not yet passages

    // Start carving from the start position
    passages.push(start);
    walls.splice(walls.findIndex(p => p.x === start.x && p.y === start.y), 1); // Remove start from walls

    getNeighbors(start.x, start.y, gridSize).forEach(n => {
        if (walls.some(w => w.x === n.x && w.y === n.y)) { // Ensure it's a wall
            frontier.push(n);
        }
    });

    while (frontier.length > 0) {
        const randomIndex = Math.floor(Math.random() * frontier.length);
        const cell = frontier.splice(randomIndex, 1)[0]; // Pick random cell from frontier

        // Find neighbors of 'cell' that are already passages
        const passageNeighbors = getNeighbors(cell.x, cell.y, gridSize).filter(n =>
            passages.some(p => p.x === n.x && p.y === n.y)
        );

        if (passageNeighbors.length > 0) {
            passages.push(cell);
            walls.splice(walls.findIndex(p => p.x === cell.x && p.y === cell.y), 1); // Remove cell from walls

            // Add new frontier cells
            getNeighbors(cell.x, cell.y, gridSize).forEach(n => {
                const isWallCell = walls.some(w => w.x === n.x && w.y === n.y);
                const isFrontierCell = frontier.some(f => f.x === n.x && f.y === n.y);
                if (isWallCell && !isFrontierCell) {
                    frontier.push(n);
                }
            });
        }
    }

    // Ensure start and end are passages
    if (!passages.some(p => p.x === start.x && p.y === start.y)) {
        passages.push(start);
        walls.splice(walls.findIndex(p => p.x === start.x && p.y === start.y), 1);
    }
    if (!passages.some(p => p.x === end.x && p.y === end.y)) {
        passages.push(end);
        walls.splice(walls.findIndex(p => p.x === end.x && p.y === end.y), 1);
    }

    return { walls, passages };
};

// Find a path within the generated maze using BFS
const findPathInMaze = (gridSize: number, start: Position, end: Position, walls: Position[]): Position[] | null => {
    const queue: { pos: Position, path: Position[] }[] = [{ pos: start, path: [start] }];
    const visited = new Set<string>([`${start.x},${start.y}`]);

    const isWallCell = (pos: Position) => walls.some(w => w.x === pos.x && w.y === pos.y);

    while (queue.length > 0) {
        const { pos: currentPos, path: currentPath } = queue.shift()!;

        if (currentPos.x === end.x && currentPos.y === end.y) {
            return currentPath;
        }

        const directions = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
        for (const dir of directions) {
            const nextPos = { x: currentPos.x + dir.dx, y: currentPos.y + dir.dy };
            const nextCoord = `${nextPos.x},${nextPos.y}`;

            if (isInBounds(nextPos.x, nextPos.y, gridSize) && !isWallCell(nextPos) && !visited.has(nextCoord)) {
                visited.add(nextCoord);
                queue.push({ pos: nextPos, path: [...currentPath, nextPos] });
            }
        }
    }
    return null; // No path found
};

// Main function to generate the full puzzle
const generateMazePuzzle = (gridSize: number): MazePuzzle => {
    const start: Position = { x: 0, y: 0 };
    const end: Position = { x: gridSize - 1, y: gridSize - 1 };

    let walls: Position[] = [];
    let path: Position[] | null = null;
    let attempts = 0;
    const MAX_MAZE_GEN_ATTEMPTS = 100; // Limit attempts to find a solvable maze

    while ((!path || path.length === 0) && attempts < MAX_MAZE_GEN_ATTEMPTS) {
        attempts++;
        const mazeResult = generateMaze(gridSize, start, end);
        walls = mazeResult.walls;
        path = findPathInMaze(gridSize, start, end, walls);
    }

    if (!path || path.length === 0) {
        console.warn("Could not generate a solvable maze. Falling back to a simple path with no walls.");
        walls = []; // No walls
        path = [];
        let current: Position = { x: start.x, y: start.y };
        path.push(current);
        while (current.x < end.x) { current = { x: current.x + 1, y: current.y }; path.push(current); }
        while (current.y < end.y) { current = { x: current.x, y: current.y + 1 }; path.push(current); }
    }

    // Generate initial hints (e.g., 3 random points on the path, excluding start/end)
    const initialHints: Position[] = [];
    const pathWithoutStartEnd = path.slice(1, path.length - 1);
    const numHints = Math.min(3, pathWithoutStartEnd.length); // Max 3 hints
    const shuffledPath = [...pathWithoutStartEnd].sort(() => Math.random() - 0.5);
    for (let i = 0; i < numHints; i++) {
        initialHints.push(shuffledPath[i]);
    }

    return { gridSize, start, end, path, walls, initialHints };
};
// --- End Maze Generation Logic ---


export default function HiddenMaze({
  game,
  player, // Added player to props
  self,
  challenge,
  // These are passed from the mock App component for demonstration
  // In a real app, these would come from your actual actions/backend
  updateChallengeProgress: mockUpdateChallengeProgress,
  submitChallengeResult: mockSubmitChallengeResult,
}: {
  game: Game;
  player: Player;
  self: Player;
  challenge: GeniusChallenge;
  updateChallengeProgress: (
    gameId: string,
    playerId: string,
    progress: { position?: Position; visited?: Position[]; hitWalls?: Position[]; points?: number; revealedByHint?: Position[] }
  ) => Promise<void>;
  submitChallengeResult: (
    gameId: string,
    playerId: string,
    result: { isCorrect: boolean; time: number; score?: number }
  ) => Promise<void>;
}) {
  const { toast } = useToast();
  const puzzle = game.challengeState?.puzzle as MazePuzzle || {}; // Cast to MazePuzzle type
  const {
    gridSize = 8, // Default to 8 if not provided
    start = { x: 0, y: 0 },
    end = { x: 7, y: 7 },
    path = [],
    walls = [],
    initialHints = [],
  } = puzzle;

  const myProgress = game.challengeState?.playerProgress?.[self.id] || {};
  
  // Local state for immediate UI feedback
  const [currentPosition, setCurrentPosition] = useState<Position>(myProgress.position || start);
  const [visited, setVisited] = useState<Position[]>(myProgress.visited || (start ? [start] : [])); // Start is always visited
  const [hitWalls, setHitWalls] = useState<Position[]>(myProgress.hitWalls || []);
  const [points, setPoints] = useState<number>(myProgress.points ?? STARTING_POINTS);
  const [revealedByHint, setRevealedByHint] = useState<Position[]>(myProgress.revealedByHint || initialHints || []);

  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
  
  const myResult = game.challengeState?.results?.find( (r) => r.playerId === self.id );

  const isPositionEqual = (pos1: Position, pos2: Position) => pos1.x === pos2.x && pos1.y === pos2.y;
  const isWall = useCallback((pos: Position) => walls.some(wall => isPositionEqual(wall, pos)), [walls]);
  const isVisited = useCallback((pos: Position) => visited.some(v => isPositionEqual(v, pos)), [visited]);
  const isRevealedByHint = useCallback((pos: Position) => revealedByHint.some(h => isPositionEqual(h, pos)), [revealedByHint]);


  // Effect to handle initial setup and game end state
  useEffect(() => {
    if (myResult) {
      setHasSubmitted(true);
      setIsGameOver(true);
    }
  }, [myResult]);
  
  // Sync local state with Firestore progress
  useEffect(() => {
    // Only update if myProgress has actual data (i.e., not just an empty object from initial load)
    // And if the position is different, to avoid unnecessary re-renders
    if (myProgress.position && !isPositionEqual(myProgress.position, currentPosition)) {
        setCurrentPosition(myProgress.position);
    }
    if (myProgress.visited) { // Visited is an array, always update if provided
        setVisited(myProgress.visited);
    }
    if (myProgress.hitWalls) { // HitWalls is an array, always update if provided
        setHitWalls(myProgress.hitWalls);
    }
    if (myProgress.points !== undefined && myProgress.points !== points) { // Points is a number
        setPoints(myProgress.points);
    }
    if (myProgress.revealedByHint) { // RevealedByHint is an array
        setRevealedByHint(myProgress.revealedByHint);
    }
  }, [myProgress]); // Depend on myProgress object itself

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
        mockSubmitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS });
        setHasSubmitted(true);
      }
    };

    const timer = setInterval(updateTimer, 1000);
    updateTimer();
    return () => clearInterval(timer);
  }, [isGameOver, hasSubmitted, game.id, self.id, game.challengeState?.challengeEndsAt, toast, mockSubmitChallengeResult]);

  const handleMove = useCallback(async (dx: number, dy: number) => {
    if (isGameOver || !currentPosition || points <= 0 || hasSubmitted) return; // Add hasSubmitted check

    const newPos = { x: currentPosition.x + dx, y: currentPosition.y + dy };

    if (!isInBounds(newPos.x, newPos.y, gridSize)) {
      toast({ title: 'خارج الحدود!', description: 'لا يمكنك التحرك خارج المتاهة.', variant: 'destructive', duration: 1000 });
      return; // Out of bounds
    }

    if (isWall(newPos)) {
      if (!hitWalls.some(w => isPositionEqual(w, newPos))) { // Only penalize once per wall
        const newHitWalls = [...hitWalls, newPos];
        const newPoints = Math.max(0, points - WALL_HIT_COST);
        setHitWalls(newHitWalls);
        setPoints(newPoints);
        await mockUpdateChallengeProgress(game.id, self.id, { hitWalls: newHitWalls, points: newPoints });
        toast({ title: `اصطدمت بجدار! -${WALL_HIT_COST} نقطة`, variant: 'destructive', duration: 1500 });
        if (newPoints <= 0 && !hasSubmitted) { // Check hasSubmitted to prevent double submission
            setIsGameOver(true);
            setHasSubmitted(true);
            await mockSubmitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS - timeLeft });
        }
      } else {
          toast({ title: "جدار", description: "لقد اصطدمت بهذا الجدار بالفعل.", duration: 1000 });
      }
      return;
    }
    
    const newVisited = isVisited(newPos) ? visited : [...visited, newPos];
    setCurrentPosition(newPos);
    setVisited(newVisited);

    await mockUpdateChallengeProgress(game.id, self.id, { position: newPos, visited: newVisited });

    if (isPositionEqual(newPos, end)) {
        setIsGameOver(true);
        setHasSubmitted(true);
        const timeTaken = TIME_LIMIT_SECONDS - timeLeft;
        await mockSubmitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken, score: points });
        toast({ title: 'وصلت للنهاية!', description: `نقاطك المتبقية: ${points}`, className: 'bg-green-100 text-green-700' });
    }
  }, [currentPosition, gridSize, isGameOver, isWall, visited, hitWalls, end, timeLeft, game.id, self.id, toast, isVisited, points, hasSubmitted, mockUpdateChallengeProgress, mockSubmitChallengeResult]);

  const requestHint = useCallback(async () => {
    if (isGameOver || points < HINT_COST || hasSubmitted) { // Add hasSubmitted check
        toast({ title: "لا تملك نقاطًا كافية أو اللعبة انتهت!", variant: "destructive" });
        return;
    }

    // Find the next path tile that is closest to the current position AND not yet visited or revealed by hint
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
    await mockUpdateChallengeProgress(game.id, self.id, { revealedByHint: newRevealedByHint, points: newPoints });
    toast({ title: `تم كشف مربع! -${HINT_COST} نقطة`, duration: 1500 });

    if (newPoints <= 0 && !hasSubmitted) { // Check hasSubmitted
        setIsGameOver(true);
        setHasSubmitted(true);
        await mockSubmitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS - timeLeft });
    }

  }, [isGameOver, points, path, isVisited, revealedByHint, toast, game.id, self.id, currentPosition, hasSubmitted, isRevealedByHint, mockUpdateChallengeProgress, mockSubmitChallengeResult]);

  // Keyboard controls effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGameOver || hasSubmitted) return; // Prevent input after game over or submission
      e.preventDefault(); // Prevent default scroll behavior for arrow keys
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

  if (!puzzle || !start || !end || !path || !walls) { // More robust check for puzzle data
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
            const isVisible = isVisited(pos) || isHintRevealed || isCurrent || isStartPos || isEndPos; // Visible if visited, hinted, current, start, or end

            let tileContent = null;
            let tileClass = 'bg-gray-800/50 border-gray-700'; // Dimmed, default background

            if (isStartPos) tileContent = <Footprints className="h-6 w-6 text-yellow-400"/>;
            if (isEndPos) tileContent = <Flag className="h-6 w-6 text-green-400"/>;
            if (isCurrent && !isStartPos && !isEndPos) tileContent = <Footprints className="h-6 w-6 text-white"/>; // Current position, not start/end

            if (isWall(pos)) {
                tileClass = 'bg-slate-950 border-slate-600'; // Darker for walls
                if (wasHit) tileContent = <Bomb className="h-6 w-6 text-red-500"/>;
                else tileContent = null; // Walls are empty unless hit
            } else { // It's a passage
                if (isVisited(pos) && !isCurrent && !isStartPos && !isEndPos) { // Visited passage, not current/start/end
                    tileClass = 'bg-blue-900/50 border-blue-800'; // Blue for visited path
                }
                if (isHintRevealed && !isCurrent && !isStartPos && !isEndPos) { // Hint revealed, not current/start/end
                    tileClass = 'bg-cyan-900/50 border-cyan-800'; // Cyan for hinted path
                    if (!tileContent) tileContent = <HelpCircle className="h-6 w-6 text-cyan-400"/>;
                }
            }
            
            // Override for current position, start, end, hit walls
            if (isCurrent) tileClass = 'bg-blue-500 border-blue-400'; // Brighter blue for current
            if (isStartPos) tileClass = 'bg-yellow-600 border-yellow-500'; // Yellow for start
            if (isEndPos) tileClass = 'bg-green-600 border-green-500'; // Green for end
            if (wasHit) tileClass = 'bg-red-900/50 border-red-800'; // Dark red for hit walls


            return (
              <motion.div
                key={`${x}-${y}`}
                className={cn('w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-md transition-colors duration-200 text-white font-bold', tileClass)}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: isVisible ? 1 : 0.1 }} // Dim unrevealed/unvisited tiles
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

// Mock App Component for demonstration purposes
export function App() {
    const gridSize = 8;
    const [puzzle, setPuzzle] = useState<MazePuzzle | null>(null);

    useEffect(() => {
        // Generate maze and path when component mounts
        setPuzzle(generateMazePuzzle(gridSize));
    }, [gridSize]);

    // Mock Firebase-like timestamp
    const [challengeEndsAt] = useState(() => {
        const now = new Date();
        now.setSeconds(now.getSeconds() + TIME_LIMIT_SECONDS);
        return { toMillis: () => now.getTime() };
    });

    // Mock game state (mimics Firestore document structure)
    const [mockGame, setMockGame] = useState<Game>(() => ({
        id: 'maze-game-123',
        challengeState: {
            puzzle: null, // Will be set by useEffect
            playerProgress: {
                'player-1': {
                    position: { x: 0, y: 0 },
                    visited: [{ x: 0, y: 0 }],
                    hitWalls: [],
                    points: STARTING_POINTS,
                    revealedByHint: [],
                },
            },
            results: [],
            challengeEndsAt: challengeEndsAt,
        },
    }));

    // Update mockGame puzzle once it's generated
    useEffect(() => {
        if (puzzle) {
            setMockGame(prev => ({
                ...prev,
                challengeState: {
                    ...prev.challengeState,
                    puzzle: puzzle,
                    playerProgress: { // Initialize player progress with initial hints from the generated puzzle
                        'player-1': {
                            position: puzzle.start,
                            visited: [puzzle.start],
                            hitWalls: [],
                            points: STARTING_POINTS,
                            revealedByHint: puzzle.initialHints, // Pass initial hints
                        },
                    },
                },
            }));
        }
    }, [puzzle]);


    // Mock updateChallengeProgress action
    const mockUpdateChallengeProgress = useCallback(async (gameId: string, playerId: string, progress: any) => {
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
        setMockGame(prevGame => ({
            ...prevGame,
            challengeState: {
                ...prevGame.challengeState,
                playerProgress: {
                    ...prevGame.challengeState?.playerProgress,
                    [playerId]: {
                        ...prevGame.challengeState?.playerProgress?.[playerId],
                        ...progress, // Merge new progress fields
                    },
                },
            },
        }));
    }, []);

    // Mock submitChallengeResult action
    const mockSubmitChallengeResult = useCallback(async (gameId: string, playerId: string, result: any) => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        setMockGame(prevGame => ({
            ...prevGame,
            challengeState: {
                ...prevGame.challengeState,
                results: [
                    ...(prevGame.challengeState?.results || []),
                    { playerId, isCorrect: result.isCorrect, time: result.time, score: result.score }
                ],
            },
        }));
    }, []);

    const mockPlayer: Player = { id: 'player-1', name: 'المستكشف' };
    const mockSelf: Player = { id: 'player-1', name: 'أنت' };
    const mockChallenge: GeniusChallenge = { name: 'المتاهة الخفية' };

    if (!puzzle) {
        return (
            <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
                <CardHeader><CardTitle className="text-3xl text-primary">{mockChallenge.name}</CardTitle></CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" /><p className="mt-4 text-muted-foreground">جاري توليد المتاهة...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-950 p-4">
            <HiddenMaze
                game={mockGame}
                player={mockPlayer}
                self={mockSelf}
                challenge={mockChallenge}
                updateChallengeProgress={mockUpdateChallengeProgress}
                submitChallengeResult={mockSubmitChallengeResult}
            />
        </div>
    );
}

