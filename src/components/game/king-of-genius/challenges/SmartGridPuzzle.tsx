'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
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

// توليد شبكة عشوائية بنمط مختلف
function generatePuzzle(gridSize: number, emptyCellRatio: number) {
    const grid: (number | null)[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
    const solution: number[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));

    // اختيار نمط عشوائي (مثل الجمع أو التسلسل)
    const patternType = Math.random() > 0.5 ? 'addition' : 'sequence';

    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            if (patternType === 'addition') {
                solution[r][c] = (r + 1) + (c + 1); // نمط الجمع: الصف + العمود
            } else {
                solution[r][c] = r * gridSize + c + 1; // تسلسل الأرقام
            }
        }
    }

    // جعل بعض المربعات فارغة عشوائيًا
    const totalCells = gridSize * gridSize;
    const emptyCellsCount = Math.floor(totalCells * emptyCellRatio);
    const emptyCellsIndices = new Set<number>();

    while (emptyCellsIndices.size < emptyCellsCount) {
        const randomIndex = Math.floor(Math.random() * totalCells);
        emptyCellsIndices.add(randomIndex);
    }

    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const index = r * gridSize + c;
            grid[r][c] = emptyCellsIndices.has(index) ? null : solution[r][c];
        }
    }

    return { grid, solution };
}

export function SmartGridPuzzle({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [puzzle, setPuzzle] = useState<{ grid: (number | null)[][], solution: number[][] } | null>(null);
    const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
    const [validation, setValidation] = useState<Record<string, boolean>>({});
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    useEffect(() => {
        setPuzzle(generatePuzzle(GRID_SIZE, EMPTY_CELL_RATIO));
    }, []);

    useEffect(() => {
        if (hasSubmitted || isGameOver) return;

        const updateTimer = () => {
            setTimeLeft(prev => {
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
        };

        const timer = setInterval(updateTimer, 1000);
        updateTimer();

        return () => clearInterval(timer);
    }, [hasSubmitted, isGameOver, game.id, self.id, toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, row: number, col: number) => {
        const key = `${row}-${col}`;
        setUserAnswers(prev => ({ ...prev, [key]: e.target.value }));
        setValidation(prev => ({ ...prev, [key]: undefined })); // Reset validation
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

    if (hasSubmitted) {
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
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

    if (!puzzle) {
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد اللغز...</p>
                </CardContent>
            </Card>
        );
    }

    const { grid } = puzzle;

    return (
        <Card className="w-full max-w-2xl bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                <div className="w-full flex justify-center items-center bg-muted p-2 rounded-lg text-center font-mono text-lg">
                    <div className="flex items-center gap-2 p-2 bg-background rounded-md">
                        <Timer className="h-6 w-6" />
                        <span className={cn("font-bold text-xl", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                    </div>
                </div>

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
                                    ref={el => (inputRefs.current[key] = el)}
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
                <Button onClick={handleSubmit} disabled={isGameOver} className="w-full" size="lg">
                    تحقق من إجاباتي
                </Button>
            </CardFooter>
        </Card>
    );
}