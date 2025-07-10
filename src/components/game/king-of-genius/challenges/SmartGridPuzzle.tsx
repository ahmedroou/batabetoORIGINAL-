'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const TIME_LIMIT_SECONDS = 90;
const GRID_SIZE = 5; // حجم الشبكة
const EMPTY_CELL_RATIO = 0.3; // نسبة المربعات الفارغة في الشبكة

// توليد أنماط عشوائية لكل صف
function generateRowPattern(rowIndex: number): { description: string; values: number[] } {
    const baseValue = Math.floor(Math.random() * 10) + 1;
    const patternType = Math.floor(Math.random() * 4); // 0: +1, 1: *2, 2: -1, 3: ^2

    switch (patternType) {
        case 0: // إضافة رقم ثابت
            return {
                description: `+${rowIndex + 1}`,
                values: Array.from({ length: GRID_SIZE }, (_, i) => baseValue + i + rowIndex + 1),
            };
        case 1: // مضاعفة
            return {
                description: `x${rowIndex + 2}`,
                values: Array.from({ length: GRID_SIZE }, (_, i) => baseValue * (i + rowIndex + 2)),
            };
        case 2: // طرح ثابت
            return {
                description: `-${rowIndex + 1}`,
                values: Array.from({ length: GRID_SIZE }, (_, i) => baseValue - i - rowIndex - 1),
            };
        case 3: // مربعات
            return {
                description: `^2`,
                values: Array.from({ length: GRID_SIZE }, (_, i) => (baseValue + i) ** 2),
            };
        default:
            return {
                description: `+${rowIndex + 1}`,
                values: Array.from({ length: GRID_SIZE }, (_, i) => baseValue + i + rowIndex + 1),
            };
    }
}

// توليد الشبكة بناءً على أنماط الصفوف
function generatePuzzle(gridSize: number, emptyCellRatio: number): { grid: (number | null)[][]; solution: number[][]; patterns: string[] } {
    const grid: (number | null)[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
    const solution: number[][] = [];
    const patterns: string[] = [];

    for (let r = 0; r < gridSize; r++) {
        const { description, values } = generateRowPattern(r);
        solution.push(values);
        patterns.push(description);

        for (let c = 0; c < gridSize; c++) {
            grid[r][c] = Math.random() < emptyCellRatio ? null : values[c];
        }
    }

    return { grid, solution, patterns };
}

export function SmartGridPuzzle({ game, player, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [puzzle, setPuzzle] = useState<{ grid: (number | null)[][]; solution: number[][]; patterns: string[] } | null>(null);
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

    const { grid, patterns } = puzzle;

    return (
        <Card className="w-full max-w-2xl bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${GRID_SIZE + 1}, 1fr)` }}>
                    {grid.map((row, r_idx) => (
                        <>
                            <div key={`pattern-${r_idx}`} className="flex items-center justify-center font-bold text-lg">
                                {patterns[r_idx]}
                            </div>
                            {row.map((cell, c_idx) => {
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
                            })}
                        </>
                    ))}
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