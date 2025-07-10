
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Send, BrainCircuit, X } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const TIME_LIMIT_SECONDS = 120;

type SmartGridPuzzleData = {
    grid: (number | null)[][];
    solution: number[][];
    hint: string;
    gridSize: number;
};

export default function SmartGridPuzzle({ game, player, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle as SmartGridPuzzleData;
    const { grid, solution, hint, gridSize } = puzzle || {};

    const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
    const [validation, setValidation] = useState<Record<string, boolean | undefined>>({});
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const [currentScore, setCurrentScore] = useState(0);

    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);

    // Dynamic grid layout generation
    const nodePositions = useMemo(() => {
        if (!gridSize) return [];
        const positions: { x: number; y: number }[] = [];
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                positions.push({
                    x: c * 100 + Math.random() * 20 - 10,
                    y: r * 100 + Math.random() * 20 - 10,
                });
            }
        }
        return positions;
    }, [gridSize]);


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
        if (!grid || !solution) return { correctCount: 0, newValidation: {} };
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
    
    if (!puzzle) {
        return (
             <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد الشبكة المنطقية...</p>
                </CardContent>
            </Card>
        );
    }
    
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
        )
    }

    return (
        <Card className="w-full max-w-4xl bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                 <BrainCircuit className="w-12 h-12 mx-auto text-primary" />
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>
                    {hint}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col items-center">
                 <div className="w-full max-w-lg flex justify-between items-center bg-muted p-2 rounded-lg text-center font-mono text-lg">
                    <span>النقاط الحالية: <span className="font-bold text-green-600">{currentScore}</span></span>
                    <div className="flex items-center gap-2">
                        <Timer className="h-6 w-6"/>
                        <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                    </div>
                </div>
                 <div className="relative w-[620px] h-[620px] bg-slate-100 rounded-lg overflow-hidden">
                    <svg width="100%" height="100%" className="absolute inset-0">
                        {/* Draw lines */}
                        {Array.from({ length: gridSize }).map((_, i) => (
                            <React.Fragment key={`line-group-${i}`}>
                                {/* Row lines */}
                                <path
                                    d={`M ${nodePositions[i * gridSize]?.x} ${nodePositions[i * gridSize]?.y} ${Array.from({ length: gridSize - 1 }).map((_, j) => `L ${nodePositions[i * gridSize + j + 1]?.x} ${nodePositions[i * gridSize + j + 1]?.y}`).join(' ')}`}
                                    stroke="rgba(0, 0, 255, 0.2)"
                                    strokeWidth="15"
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                {/* Column lines */}
                                <path
                                    d={`M ${nodePositions[i]?.x} ${nodePositions[i]?.y} ${Array.from({ length: gridSize - 1 }).map((_, j) => `L ${nodePositions[(j + 1) * gridSize + i]?.x} ${nodePositions[(j + 1) * gridSize + i]?.y}`).join(' ')}`}
                                    stroke="rgba(255, 0, 0, 0.2)"
                                    strokeWidth="15"
                                    fill="none"
                                    strokeLinecap="round"
                                />
                            </React.Fragment>
                        ))}
                    </svg>

                    {nodePositions.map((pos, i) => {
                        const r_idx = Math.floor(i / gridSize);
                        const c_idx = i % gridSize;
                        const key = `${r_idx}-${c_idx}`;
                        const isEditable = grid[r_idx]?.[c_idx] === null;
                        const isValid = validation[key];
                        const cellValue = isEditable ? userAnswers[key] : grid[r_idx]?.[c_idx];

                        return (
                             <motion.div
                                key={key}
                                className="absolute w-16 h-16"
                                style={{
                                    left: `${pos.x - 32}px`,
                                    top: `${pos.y - 32}px`,
                                }}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1, transition: { delay: i * 0.02, type: 'spring' } }}
                            >
                                <div className={cn(
                                    "w-full h-full rounded-full flex items-center justify-center transition-all duration-300",
                                    isEditable ? "bg-white shadow-lg" : "bg-slate-300 shadow-md",
                                    isValid === true && "bg-green-200 ring-4 ring-green-500",
                                    isValid === false && "bg-red-200 ring-4 ring-red-500",
                                )}>
                                    {isEditable ? (
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="-?[0-9]*"
                                            className="w-14 h-14 text-2xl text-center font-bold p-0 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none"
                                            value={userAnswers[key] || ''}
                                            onChange={(e) => handleInputChange(e, r_idx, c_idx)}
                                            disabled={isGameOver}
                                            placeholder="?"
                                        />
                                    ) : (
                                        <span className="text-2xl font-bold text-slate-800">{cellValue}</span>
                                    )}
                                </div>
                             </motion.div>
                        );
                    })}
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
