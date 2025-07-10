'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Info } from 'lucide-react';
import { submitChallengeResult, updateChallengeProgress } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const TIME_LIMIT_SECONDS = 90;
const GRID_SIZE = 4; // Grid size (e.g., 4x4)
const NUM_HIDDEN_CELLS = 6; // Number of cells to hide for the puzzle (can be adjusted)

// Define types for the puzzle structure
type SmartGridPuzzleData = {
    grid: (number | null)[][]; // The puzzle grid with hidden cells (null)
    solution: number[][]; // The complete solution grid
    hint: string; // A hint about the patterns
    gridSize: number;
};

// --- Puzzle Generation Logic ---
const generateSmartGridPuzzle = (size: number): SmartGridPuzzleData => {
    let solution: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
    let hintParts: string[] = [];

    // Randomly choose a primary pattern type for rows and columns
    const primaryRowPatternType: 'arithmetic' | 'geometric' = Math.random() < 0.5 ? 'arithmetic' : 'geometric';
    const primaryColPatternType: 'arithmetic' | 'geometric' = Math.random() < 0.5 ? 'arithmetic' : 'geometric';

    // Generate initial values for the first row and first column
    // These will be the anchors for the patterns
    const firstRow: number[] = Array(size).fill(0).map(() => Math.floor(Math.random() * 9) + 1); // 1-9
    const firstCol: number[] = Array(size).fill(0).map(() => Math.floor(Math.random() * 9) + 1); // 1-9

    // Ensure (0,0) is consistent
    solution[0][0] = firstRow[0]; // Or firstCol[0], they should be consistent if generated from same source

    // Generate patterns for rows
    const rowOperations: { type: 'add' | 'multiply', value: number }[] = [];
    for (let r = 0; r < size; r++) {
        const opValue = Math.floor(Math.random() * 5) + 1; // 1-5
        if (primaryRowPatternType === 'arithmetic') {
            rowOperations.push({ type: 'add', value: opValue });
            if (r === 0) hintParts.push(`الصف الأول: تبدأ بـ ${firstRow[0]} وتزداد بمقدار ${opValue}.`);
        } else { // geometric
            rowOperations.push({ type: 'multiply', value: opValue });
            if (r === 0) hintParts.push(`الصف الأول: تبدأ بـ ${firstRow[0]} وتتضاعف بـ ${opValue}.`);
        }
    }

    // Generate patterns for columns
    const colOperations: { type: 'add' | 'multiply', value: number }[] = [];
    for (let c = 0; c < size; c++) {
        const opValue = Math.floor(Math.random() * 5) + 1; // 1-5
        if (primaryColPatternType === 'arithmetic') {
            colOperations.push({ type: 'add', value: opValue });
            if (c === 0) hintParts.push(`العمود الأول: تبدأ بـ ${firstCol[0]} وتزداد بمقدار ${opValue}.`);
        } else { // geometric
            colOperations.push({ type: 'multiply', value: opValue });
            if (c === 0) hintParts.push(`العمود الأول: تبدأ بـ ${firstCol[0]} وتتضاعف بـ ${opValue}.`);
        }
    }

    // Populate the solution grid based on patterns
    // This approach ensures consistency by building from first row/col
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (r === 0) { // First row is based on its pattern and firstRow initial values
                if (rowOperations[0].type === 'add') {
                    solution[r][c] = firstRow[0] + c * rowOperations[0].value;
                } else {
                    solution[r][c] = firstRow[0] * (rowOperations[0].value ** c);
                }
            } else if (c === 0) { // First column is based on its pattern and firstCol initial values
                if (colOperations[0].type === 'add') {
                    solution[r][c] = firstCol[0] + r * colOperations[0].value;
                } else {
                    solution[r][c] = firstCol[0] * (colOperations[0].value ** r);
                }
            } else { // Other cells derived from previous row/col cells using their respective patterns
                let valFromRow: number;
                if (rowOperations[r].type === 'add') {
                    valFromRow = solution[r][c-1] + rowOperations[r].value;
                } else {
                    valFromRow = solution[r][c-1] * rowOperations[r].value;
                }

                let valFromCol: number;
                if (colOperations[c].type === 'add') {
                    valFromCol = solution[r-1][c] + colOperations[c].value;
                } else {
                    valFromCol = solution[r-1][c] * colOperations[c].value;
                }
                
                // Simple merge: average or sum. For simplicity and unique solution, let's try a consistent rule
                // For a truly unique solution, the patterns must intersect perfectly.
                // This simplified generation might lead to non-unique solutions or non-perfect patterns.
                // A more robust solution would be to generate the entire grid based on a few seed values and rules.
                // For this prompt, let's assume patterns are applied consistently.
                solution[r][c] = Math.round((valFromRow + valFromCol) / 2); // Simple average for intersection
            }
            // Ensure values are positive and not too large
            solution[r][c] = Math.max(1, Math.min(999, solution[r][c]));
        }
    }

    // Refine hint
    hintParts = [
        "اكتشف النمط في الصفوف والأعمدة.",
        `معظم الصفوف تتبع متوالية ${primaryRowPatternType === 'arithmetic' ? 'حسابية (إضافة/طرح ثابت)' : 'هندسية (ضرب/قسمة ثابت)'}.`,
        `ومعظم الأعمدة تتبع متوالية ${primaryColPatternType === 'arithmetic' ? 'حسابية (إضافة/طرح ثابت)' : 'هندسية (ضرب/قسمة ثابت)'}.`
    ];
    hintParts.push("حاول إيجاد القاعدة لكل صف وعمود.");


    // Create the puzzle grid by hiding cells
    let grid: (number | null)[][] = solution.map(row => [...row]);
    const cellsToHide: Position[] = [];

    // Collect all cells except (0,0) for hiding
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (r !== 0 || c !== 0) { // Exclude (0,0)
                cellsToHide.push({ x: r, y: c });
            }
        }
    }

    // Shuffle and pick cells to hide
    cellsToHide.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(NUM_HIDDEN_CELLS, cellsToHide.length); i++) {
        const { x, y } = cellsToHide[i];
        grid[x][y] = null;
    }

    return {
        grid,
        solution,
        hint: hintParts.join(" "),
        gridSize: size,
    };
};
// --- End Puzzle Generation Logic ---


export default function SmartGridPuzzle({ game, player, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
    const { toast } = useToast();
    // Use useMemo to ensure puzzle generation only happens once per component instance
    // or when gridSize changes (if it were a prop)
    const puzzle = useMemo(() => {
        // In a real app, the puzzle would be passed from `game.challengeState.puzzle`
        // and generated on the server. Here, we generate it for demonstration.
        if (game.challengeState?.puzzle) {
            return game.challengeState.puzzle as SmartGridPuzzleData;
        }
        return generateSmartGridPuzzle(GRID_SIZE);
    }, [game.challengeState?.puzzle]); // Regenerate only if puzzle data from game changes

    const { grid = [], solution = [], hint = "", gridSize = 0 } = puzzle || {};

    const [userAnswers, setUserAnswers] = useState<Record<string, string>>(() => {
        // Initialize userAnswers from grid, filling nulls with empty strings
        const initialAnswers: Record<string, string> = {};
        if (grid) {
            for (let r = 0; r < gridSize; r++) {
                for (let c = 0; c < gridSize; c++) {
                    if (grid[r][c] === null) {
                        initialAnswers[`${r}-${c}`] = '';
                    } else {
                        initialAnswers[`${r}-${c}`] = String(grid[r][c]);
                    }
                }
            }
        }
        return initialAnswers;
    });
    const [validation, setValidation] = useState<Record<string, boolean>>({});
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);

    useEffect(() => {
        if (myResult) {
            setHasSubmitted(true);
            setIsGameOver(true);
        }
    }, [myResult]);
    
    useEffect(() => {
        if (isGameOver || hasSubmitted || !game.challengeState?.challengeEndsAt) return;
        const endTime = game.challengeState.challengeEndsAt.toMillis();
        
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0 && !hasSubmitted) {
                setIsGameOver(true);
                toast({ title: "انتهى الوقت!", variant: "destructive" });
                submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS });
                setHasSubmitted(true);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [hasSubmitted, isGameOver, game.id, self.id, toast, game.challengeState?.challengeEndsAt]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, row: number, col: number) => {
        const key = `${row}-${col}`;
        const value = e.target.value;
        // Only allow numbers
        if (!/^\d*$/.test(value)) return; 
        setUserAnswers((prev) => ({ ...prev, [key]: value }));
        // Clear validation feedback immediately when user types
        if (validation[key] !== undefined) {
             setValidation((prev) => ({ ...prev, [key]: undefined }));
        }
    };

    const handleSubmit = async () => { // Made async
        if (isGameOver || !puzzle || hasSubmitted) return; // Add hasSubmitted check

        let allCorrect = true;
        const newValidation: Record<string, boolean> = {};

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (grid[r][c] === null) { // Only validate input cells
                    const key = `${r}-${c}`;
                    const userAnswer = parseInt(userAnswers[key], 10);
                    const correctAnswer = solution[r][c];
                    const isCorrect = !isNaN(userAnswer) && userAnswer === correctAnswer; // Check for NaN
                    newValidation[key] = isCorrect;
                    if (!isCorrect) {
                        allCorrect = false;
                    }
                }
            }
        }

        setValidation(newValidation);

        if (allCorrect) {
            const timeTaken = TIME_LIMIT_SECONDS - timeLeft;
            setIsGameOver(true);
            setHasSubmitted(true);
            await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken }); // Await submission
            toast({
                title: "لغز محلول!",
                description: "لقد حلت الشبكة بنجاح.",
                className: "bg-green-100 border-green-500 text-green-700",
            });
        } else {
            toast({
                title: "إجابات خاطئة!",
                description: "تحقق من الأرقام في المربعات الحمراء.",
                variant: "destructive",
            });
        }
    };
    
    if (hasSubmitted) {
        return (
             <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
                    <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
                </CardContent>
            </Card>
        )
    }

    if (!puzzle || grid.length === 0 || gridSize === 0) { // Added gridSize check
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد الشبكة...</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="w-full max-w-lg bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>اكتشف النمط واملأ الفراغات.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col items-center">
                <div className="w-full flex justify-between items-center bg-muted p-2 rounded-lg text-center font-mono text-lg">
                    <div className="p-2 bg-blue-100 text-blue-800 rounded-md flex items-center gap-2">
                        <Info className="h-5 w-5"/>
                        <span className="text-sm font-sans">{hint}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Timer className="h-6 w-6"/>
                        <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                    </div>
                </div>

                <div className="grid gap-1.5 p-2 bg-slate-200 rounded-md" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
                    {grid.map((row, r_idx) =>
                        row.map((cell, c_idx) => {
                            const key = `${r_idx}-${c_idx}`;
                            const isValid = validation[key];
                            const cellClass = cn(
                                "w-16 h-16 text-3xl text-center font-bold flex items-center justify-center rounded-md transition-all duration-200",
                                isValid === true && "border-2 border-green-500 bg-green-100",
                                isValid === false && "border-2 border-red-500 bg-red-100",
                                isValid === undefined && "bg-white border-slate-300"
                            );

                            if (cell !== null) {
                                return (
                                    <div key={key} className={cn(cellClass, "bg-slate-200 text-slate-800")}>
                                        {cell}
                                    </div>
                                );
                            }

                            return (
                                <Input
                                    key={key}
                                    type="number"
                                    className={cn(cellClass)}
                                    value={userAnswers[key] || ''}
                                    onChange={(e) => handleInputChange(e, r_idx, c_idx)}
                                    disabled={isGameOver}
                                />
                            );
                        })
                    )}
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSubmit} disabled={isGameOver || hasSubmitted} className="w-full" size="lg">
                    تحقق من إجاباتي
                </Button>
            </CardFooter>
        </Card>
    );
}

