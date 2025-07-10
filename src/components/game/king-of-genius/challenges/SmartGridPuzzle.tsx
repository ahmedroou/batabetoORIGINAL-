
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Send, BrainCircuit, Lightbulb } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';


const TIME_LIMIT_SECONDS = 120;

type SmartGridPuzzleData = {
    nodes: { r: number; c: number; value: number | null; isIntersection: boolean }[];
    paths: { type: 'row' | 'col'; index: number; points: string; hint: string }[];
    solution: number[][];
    gridSize: number;
};

export default function SmartGridPuzzle({ game, player, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle as SmartGridPuzzleData;
    const { nodes, paths, solution, gridSize } = puzzle || {};

    const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const [currentScore, setCurrentScore] = useState(0);

    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    
    const viewBoxSize = 100 * (gridSize || 5);

    useEffect(() => {
        if (nodes) {
            const initialAnswers: Record<string, string> = {};
            nodes.forEach(node => {
                const key = `${node.r}-${node.c}`;
                initialAnswers[key] = node.value === null ? '' : String(node.value);
            });
            setUserAnswers(initialAnswers);
        }
    }, [nodes]);

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
                    description: "للأسف، لم تقم بتسليم إجابتك في الوقت المناسب. تم إرسال نتيجتك بصفر من النقاط.",
                    variant: "destructive"
                });
                submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS, score: 0 });
                setHasSubmitted(true);
                clearInterval(timer);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [hasSubmitted, isGameOver, game.id, self.id, toast, game.challengeState?.challengeEndsAt]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, row: number, col: number) => {
        const key = `${row}-${col}`;
        const value = e.target.value;
        if (!/^-?\d*$/.test(value)) return;
        setUserAnswers((prev) => ({ ...prev, [key]: value }));
    };

    const calculateScore = () => {
        if (!nodes || !solution) return 0;
        let correctCount = 0;
        nodes.forEach(node => {
            if (node.value === null) {
                const key = `${node.r}-${node.c}`;
                const userAnswer = parseInt(userAnswers[key], 10);
                const correctAnswer = solution[node.r]?.[node.c];
                if (!isNaN(userAnswer) && userAnswer === correctAnswer) {
                    correctCount++;
                }
            }
        });
        return correctCount;
    };


    const handleSubmit = async () => {
        if (isGameOver || hasSubmitted) return;

        const finalScore = calculateScore();
        setCurrentScore(finalScore);

        setIsGameOver(true);
        setHasSubmitted(true);
        const timeTaken = TIME_LIMIT_SECONDS - timeLeft;
        await submitChallengeResult(game.id, self.id, { isCorrect: finalScore > 0, time: timeTaken, score: finalScore });

        toast({
            title: `تم تسليم إجابتك النهائية!`,
            description: `لقد حصلت على ${finalScore} نقاط.`,
            className: finalScore > 0 ? "bg-green-100 border-green-500 text-green-700" : "bg-yellow-100 border-yellow-500 text-yellow-800",
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
        <Card className="w-full max-w-4xl bg-white/90 backdrop-blur-sm border-gray-200 flex flex-col max-h-[95vh]">
            <CardHeader className="text-center shrink-0">
                 <BrainCircuit className="w-12 h-12 mx-auto text-primary" />
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>
                   اكتشف الأنماط الرياضية لكل مسار واملأ العقد الفارغة.
                </CardDescription>
            </CardHeader>
            <div className="flex-grow min-h-0 overflow-y-auto px-6 pb-4">
                 <CardContent className="space-y-4 flex flex-col items-center">
                     <div className="w-full max-w-lg flex justify-between items-center bg-muted p-2 rounded-lg text-center font-mono text-lg shrink-0">
                        <span>النقاط: <span className="font-bold text-green-600">{calculateScore()}</span></span>
                        <div className="flex items-center gap-2">
                            <Timer className="h-6 w-6"/>
                            <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                        </div>
                    </div>
                    
                    <div className="w-full flex-grow rounded-lg border bg-slate-50 dark:bg-slate-900 p-4">
                         <svg viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} className="max-w-full h-auto">
                            <defs>
                                <filter id="glow">
                                    <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>
                            {paths?.map((path, i) => (
                                <motion.path
                                    key={i}
                                    d={path.points}
                                    stroke={path.type === 'row' ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--destructive) / 0.5)'}
                                    strokeWidth="8"
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 1, delay: i * 0.1, ease: "easeInOut" }}
                                />
                            ))}
                            {nodes?.map((node, i) => {
                                const key = `${node.r}-${node.c}`;
                                const isEditable = node.value === null;
                                const pathString = paths?.find(p => p.type === 'row' && p.index === node.r)?.points;
                                const points = pathString?.split(/[ML]/).filter(Boolean).map(p => p.trim());
                                const point = points?.[node.c]?.split(',').map(Number);
                                const [x, y] = point || [0,0];

                                return (
                                    <g key={key} transform={`translate(${x}, ${y})`}>
                                        <motion.circle
                                            cx="0"
                                            cy="0"
                                            r="24"
                                            fill={isEditable ? "hsl(var(--background))" : "hsl(var(--muted))"}
                                            stroke={node.isIntersection ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                                            strokeWidth={node.isIntersection ? 4 : 2}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: "spring", delay: 0.5 + i * 0.05 }}
                                        />
                                        <foreignObject x="-20" y="-20" width="40" height="40">
                                            <div className="w-full h-full flex items-center justify-center">
                                            {isEditable ? (
                                                <Input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="-?[0-9]*"
                                                    className="w-10 h-10 text-lg text-center font-bold p-0 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none"
                                                    value={userAnswers[key] || ''}
                                                    onChange={(e) => handleInputChange(e, node.r, node.c)}
                                                    disabled={isGameOver}
                                                    placeholder="?"
                                                />
                                            ) : (
                                                <span className="text-lg font-bold text-slate-800">{node.value}</span>
                                            )}
                                            </div>
                                        </foreignObject>
                                    </g>
                                )
                            })}
                        </svg>
                    </div>

                     <div className="shrink-0 max-w-lg w-full text-center mt-4">
                        <details className="bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700 rounded-lg p-2 text-sm">
                            <summary className="cursor-pointer font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2"><Lightbulb /> <span>عرض تلميحات الأنماط (انقر للفتح)</span></summary>
                            <ScrollArea className="max-h-24 mt-2">
                                <ul className="space-y-1 text-left pr-2">
                                    {paths?.map((path, i) => (
                                        <li key={i} className={path.type === 'row' ? 'text-blue-700' : 'text-red-700'}>
                                            <strong>{path.type === 'row' ? 'المسار الأفقي' : 'المسار العمودي'} {path.index + 1}:</strong> {path.hint}
                                        </li>
                                    ))}
                                </ul>
                            </ScrollArea>
                        </details>
                    </div>
                </CardContent>
            </div>
            <CardFooter className="flex flex-col gap-2 shrink-0 pt-4 border-t">
                <Button onClick={handleSubmit} disabled={isGameOver || hasSubmitted} className="w-full" size="lg">
                    <Send className="ml-2" />
                    إنهاء وتسليم الإجابة
                </Button>
            </CardFooter>
        </Card>
    );
}
