'use client';

import { useState, useEffect } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Info, Award, Send } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const TIME_LIMIT_SECONDS = 120;
const GRID_SIZE = 6;

type SmartGridPuzzleData = {
    grid: (number | null)[][];
    solution: number[][];
    hint: string;
    gridSize: number;
};

// Generate grid based on patterns
const generatePuzzle = (patternType: string): SmartGridPuzzleData => {
    const grid: (number | null)[][] = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => null)
    );
    const solution: number[][] = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => 0)
    );

    let hint = "";

    switch (patternType) {
        case "arithmetic_sequence":
            hint = "النمط: تسلسل حسابي، الفرق الثابت بين الأرقام.";
            for (let i = 0; i < GRID_SIZE; i++) {
                for (let j = 0; j < GRID_SIZE; j++) {
                    solution[i][j] = i * GRID_SIZE + j + 1; // مثال على تسلسل حسابي
                }
            }
            break;
        case "geometric_sequence":
            hint = "النمط: تسلسل هندسي، نسبة ثابتة بين الأرقام.";
            for (let i = 0; i < GRID_SIZE; i++) {
                for (let j = 0; j < GRID_SIZE; j++) {
                    solution[i][j] = Math.pow(2, i + j); // مثال على تسلسل هندسي
                }
            }
            break;
        case "conditional_rules":
            hint = "النمط: قواعد شرطية تعتمد على الرقم.";
            for (let i = 0; i < GRID_SIZE; i++) {
                for (let j = 0; j < GRID_SIZE; j++) {
                    const value = i + j;
                    solution[i][j] =
                        value % 2 === 0 ? value * 2 : value + 3; // قواعد شرطية
                }
            }
            break;
        default:
            hint = "النمط غير معروف.";
            break;
    }

    // Fill the grid with some values from the solution
    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            if (Math.random() > 0.5) {
                grid[i][j] = solution[i][j];
            }
        }
    }

    return { grid, solution, hint, gridSize: GRID_SIZE };
};

export default function SmartGridPuzzle({ game, player, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
    const { toast } = useToast();
    
    // Generate puzzle only once
    const [puzzle] = useState(() => generatePuzzle("arithmetic_sequence"));
    const { grid, solution, hint, gridSize } = puzzle;

    const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
    const [validation, setValidation] = useState<Record<string, boolean | undefined>>({});
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const [currentScore, setCurrentScore] = useState(0);

    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);

    useEffect(() => {
        if (grid && grid.length > 0) {
            const initialAnswers: Record<string, string> = {};
            for (let r = 0; r < gridSize; r++) {
                for (let c = 0; c < gridSize; c++) {
                    const cellValue = grid[r]?.[c];
                    initialAnswers[`${r}-${c}`] = cellValue === null ? '' : String(cellValue);
                }
            }
            setUserAnswers(initialAnswers);
        }
    }, [grid, gridSize]);

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
                toast({
                    title: "انتهى الوقت!",
                    description: "لقد خسرت جميع نقاطك التي جمعتها.",
                    variant: "destructive"
                });
                submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS, score: 0 });
                setHasSubmitted(true);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [hasSubmitted, isGameOver, game.id, self.id, toast, game.challengeState?.challengeEndsAt]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, row: number, col: number) => {
        const key = `${row}-${col}`;
        const value = e.target.value;
        if (!/^-?\d*$/.test(value)) return;
        setUserAnswers((prev) => ({ ...prev, [key]: value }));
        if (validation[key] !== undefined) {
            setValidation((prev) => {
                const newValidation = { ...prev };
                delete newValidation[key];
                return newValidation;
            });
        }
    };

    const calculateScore = () => {
        let correctCount = 0;
        const newValidation: Record<string, boolean> = {};

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (grid[r]?.[c] === null) {
                    const key = `${r}-${c}`;
                    const userAnswer = parseInt(userAnswers[key], 10);
                    const correctAnswer = solution[r]?.[c];
                    const isCorrect = !isNaN(userAnswer) && userAnswer === correctAnswer;
                    newValidation[key] = isCorrect;
                    if (isCorrect) {
                        correctCount++;
                    }
                }
            }
        }
        return { correctCount, newValidation };
    };

    const handleCheckAnswers = () => {
        if (isGameOver || hasSubmitted) return;
        const { correctCount, newValidation } = calculateScore();
        setValidation(newValidation);
        setCurrentScore(correctCount);
        toast({
            title: "تم التحقق!",
            description: `لديك ${correctCount} إجابات صحيحة حتى الآن.`,
        });
    };

    const handleSubmit = async () => {
        if (isGameOver || hasSubmitted) return;

        const { correctCount, newValidation } = calculateScore();
        setValidation(newValidation);
        setCurrentScore(correctCount);

        setIsGameOver(true);
        setHasSubmitted(true);
        const timeTaken = TIME_LIMIT_SECONDS - timeLeft;
        await submitChallengeResult(game.id, self.id, { isCorrect: correctCount > 0, time: timeTaken, score: correctCount });

        toast({
            title: `تم تسليم إجابتك النهائية!`,
            description: `لقد حصلت على ${correctCount} نقاط.`,
            className: correctCount > 0 ? "bg-green-100 border-green-500 text-green-700" : "bg-yellow-100 border-yellow-500 text-yellow-800",
        });
    };

    return (
        <Card className="w-full max-w-3xl bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>
                    {hint}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col items-center">
                <div className="grid gap-1 p-2 bg-slate-200 rounded-md" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
                    {Array.from({ length: gridSize }).map((_, r_idx) =>
                        Array.from({ length: gridSize }).map((_, c_idx) => {
                            const key = `${r_idx}-${c_idx}`;
                            const isEditable = grid[r_idx]?.[c_idx] === null;
                            const isValid = validation[key];
                            const cellClass = cn(
                                "w-12 h-12 sm:w-14 sm:h-14 text-xl sm:text-2xl text-center font-bold flex items-center justify-center rounded-md transition-all duration-200 border-2",
                                isEditable ? "bg-white border-slate-300" : "bg-slate-200 text-slate-800 border-slate-200",
                                isValid === true && "border-green-500 bg-green-100 text-green-800",
                                isValid === false && "border-red-500 bg-red-100 text-red-800"
                            );

                            if (!isEditable) {
                                return (
                                    <div key={key} className={cn(cellClass)}>
                                        {grid[r_idx]?.[c_idx]}
                                    </div>
                                );
                            }

                            return (
                                <Input
                                    key={key}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="-?[0-9]*"
                                    className={cn(cellClass, "p-0")}
                                    value={userAnswers[key] || ''}
                                    onChange={(e) => handleInputChange(e, r_idx, c_idx)}
                                    disabled={isGameOver}
                                />
                            );
                        })
                    )}
                </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-2">
                <Button onClick={handleCheckAnswers} disabled={isGameOver || hasSubmitted} className="w-full" size="lg" variant="secondary">
                    <Check className="ml-2" />
                    تحقق الآن
                </Button>
                <Button onClick={handleSubmit} disabled={isGameOver || hasSubmitted} className="w-full" size="lg">
                    <Send className="ml-2" />
                    إنهاء وتسليم الإجابة
                </Button>
            </CardFooter>
        </Card>
    );
}