'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Timer } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const TIME_LIMIT_SECONDS = 90;
const GRID_SIZE = 5; // حجم الشبكة
const EMPTY_CELL_RATIO = 0.3; // نسبة المربعات الفارغة في الشبكة

// توليد نمط رياضي عشوائي
function generatePattern(baseValue: number, size: number, type: string): number[] {
    switch (type) {
        case 'addition':
            return Array.from({ length: size }, (_, i) => baseValue + i);
        case 'multiplication':
            return Array.from({ length: size }, (_, i) => baseValue * (i + 1));
        case 'subtraction':
            return Array.from({ length: size }, (_, i) => baseValue - i);
        case 'division':
            return Array.from({ length: size }, (_, i) => Math.floor(baseValue / (i + 1)));
        default:
            return Array.from({ length: size }, (_, i) => baseValue + i);
    }
}

// توليد الشبكة بناءً على أنماط الصفوف والأعمدة
function generatePuzzle(gridSize: number, emptyCellRatio: number): { grid: (number | null)[][]; solution: number[][] } {
    const grid: (number | null)[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
    const solution: number[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));

    const rowPatterns = Array.from({ length: gridSize }, () => ['addition', 'multiplication', 'subtraction', 'division'][Math.floor(Math.random() * 4)]);
    const colPatterns = Array.from({ length: gridSize }, () => ['addition', 'multiplication', 'subtraction', 'division'][Math.floor(Math.random() * 4)]);

    for (let r = 0; r < gridSize; r++) {
        const rowBase = Math.floor(Math.random() * 10) + 1; // قيمة عشوائية للصف
        const rowValues = generatePattern(rowBase, gridSize, rowPatterns[r]);

        for (let c = 0; c < gridSize; c++) {
            const colBase = Math.floor(Math.random() * 10) + 1; // قيمة عشوائية للعمود
            const colValues = generatePattern(colBase, gridSize, colPatterns[c]);

            solution[r][c] = Math.floor((rowValues[c] + colValues[r]) / 2); // الجمع بين النمطين بشكل رياضي

            // جعل بعض المربعات فارغة عشوائياً
            grid[r][c] = Math.random() < emptyCellRatio ? null : solution[r][c];
        }
    }

    return { grid, solution };
}

export function SmartGridPuzzle({ game, player, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [puzzle, setPuzzle] = useState<{ grid: (number | null)[][]; solution: number[][] } | null>(null);
    const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
    const [validation, setValidation] = useState<Record<string, boolean>>({});
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);

    useEffect(() => {
        setPuzzle(generatePuzzle(GRID_SIZE, EMPTY_CELL_RATIO));
    }, []);

    useEffect(() => {
        if (isGameOver || hasSubmitted) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    setTimeLeft(0);
                    if (!hasSubmitted) {
                        setIsGameOver(true);
                        toast({ title: "انتهى الوقت!", variant: "destructive" });
                        submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS });
                        setHasSubmitted(true);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [hasSubmitted, isGameOver, game.id, self.id, toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, row: number, col: number) => {
        const key = `${row}-${col}`;
        setUserAnswers((prev) => ({ ...prev, [key]: e.target.value }));
        setValidation((prev) => ({ ...prev, [key]: undefined })); // Reset validation
    };

    const handleSubmit = () => {
        if (isGameOver || !puzzle) return;

        const { solution, grid } = puzzle;
        let allCorrect = true;
        const newValidation: Record<string, boolean> = {};

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (grid[r][c] === null) {
                    const key = `${r}-${c}`;
                    const userAnswer = parseInt(userAnswers[key], 10);
                    const correctAnswer = solution[r][c];
                    const isCorrect = userAnswer === correctAnswer;
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
            submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
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

    if (!puzzle) return <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />;

    const { grid } = puzzle;

    return (
        <Card className="w-full max-w-2xl bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
                    {grid.map((row, r_idx) =>
                        row.map((cell, c_idx) => {
                            const key = `${r_idx}-${c_idx}`;
                            const isValid = validation[key];
                            const cellClass = cn(
                                "w-16 h-16 text-3xl text-center font-bold flex items-center justify-center rounded-md",
                                isValid === true && "border-2 border-green-500",
                                isValid === false && "border-2 border-red-500"
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
                                    className={cn(cellClass, "bg-white border-slate-300")}
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
                <Button onClick={handleSubmit} disabled={isGameOver} className="w-full">
                    تحقق من إجاباتي
                </Button>
            </CardFooter>
        </Card>
    );
}