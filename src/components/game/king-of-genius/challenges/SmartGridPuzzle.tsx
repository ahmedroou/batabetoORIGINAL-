
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Game, Player, GeniusChallenge, GridPosition } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Send, BrainCircuit, HelpCircle, XCircle, CheckCircle } from 'lucide-react';
import { submitChallengeResult, checkSmartGridSolution } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TIME_LIMIT_SECONDS = 120;
const CHECK_FEEDBACK_DURATION_MS = 10000;

type SmartGridPuzzleData = {
    nodes: { r: number; c: number; value: number | null; isIntersection: boolean }[];
    paths: { type: 'row' | 'col'; index: number; points: string; hint: string }[];
    solution: number[][];
    gridSize: number;
};

type CheckResult = {
    correctCells: GridPosition[];
    incorrectCells: GridPosition[];
};

export default function SmartGridPuzzle({ game, player, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle as SmartGridPuzzleData;
    const { nodes, paths, solution, gridSize } = puzzle || {};

    const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [isCheckConfirmOpen, setIsCheckConfirmOpen] = useState(false);
    const [checkFeedback, setCheckFeedback] = useState<CheckResult | null>(null);

    const myProgress = game.challengeState?.playerProgress?.[self.id];
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    const checkUsed = myProgress?.checkUsed || false;

     const calculateScore = useCallback(() => {
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
    }, [nodes, solution, userAnswers]);

    const handleSubmit = useCallback(async (isTimeout = false) => {
        if (hasSubmitted || isSubmitting) return;

        setIsSubmitting(true);
        const finalScore = isTimeout ? 0 : calculateScore();
        
        setIsGameOver(true);
        setHasSubmitted(true);
        const timeTaken = TIME_LIMIT_SECONDS - timeLeft;

        try {
            await submitChallengeResult(game.id, self.id, { isCorrect: finalScore > 0, time: timeTaken, score: finalScore });
            if (!isTimeout) {
                toast({
                    title: `تم تسليم إجابتك النهائية!`,
                    description: `لقد حصلت على ${finalScore} نقاط.`,
                    className: finalScore > 0 ? "bg-green-100 border-green-500 text-green-700" : "bg-yellow-100 border-yellow-500 text-yellow-800",
                });
            }
        } catch (error) {
            toast({
                title: "حدث خطأ أثناء التسليم!",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [hasSubmitted, isSubmitting, calculateScore, timeLeft, game.id, self.id, toast]);

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
        if (myProgress?.lastCheckResult && !checkFeedback) {
             setCheckFeedback(myProgress.lastCheckResult);
             setTimeout(() => setCheckFeedback(null), CHECK_FEEDBACK_DURATION_MS);
        }
    }, [myProgress, checkFeedback]);

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
            if (remaining === 0) {
                if (!hasSubmitted && !isSubmitting) {
                    handleSubmit(true); 
                    toast({
                        title: "انتهى الوقت!",
                        description: "تم تسليم إجابتك تلقائيًا.",
                        variant: "destructive"
                    });
                }
                clearInterval(timer);
            }
        }, 1000);
        setTimeLeft(Math.max(0, Math.round((endTime - Date.now()) / 1000)));

        return () => clearInterval(timer);
    }, [hasSubmitted, isGameOver, game.challengeState?.challengeEndsAt, isSubmitting, handleSubmit, toast]);

    const handleCheckClick = () => {
        if (checkUsed || isChecking) return;
        setIsCheckConfirmOpen(true);
    };

    const handleConfirmCheck = async () => {
        setIsCheckConfirmOpen(false);
        if (checkUsed || isChecking) return;

        setIsChecking(true);
        try {
            const result = await checkSmartGridSolution(game.id, self.id, userAnswers);
            if (result.error) {
                toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
            } else if (result.checkResult) {
                 toast({
                    title: 'تم التحقق!',
                    description: `سيتم خصم نقطة واحدة من نتيجتك النهائية.`,
                });
            }
        } finally {
            setIsChecking(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, row: number, col: number) => {
        const key = `${row}-${col}`;
        const value = e.target.value;
        if (!/^-?\d*$/.test(value)) return;
        setUserAnswers((prev) => ({ ...prev, [key]: value }));
    };

    const isCellCorrect = (r: number, c: number) => checkFeedback?.correctCells.some(cell => cell.r === r && cell.c === c);
    const isCellIncorrect = (r: number, c: number) => checkFeedback?.incorrectCells.some(cell => cell.r === r && cell.c === c);


    if (!puzzle) {
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري تحميل الشبكة المنطقية...</p>
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

    const hints = {
        rows: paths.filter(p => p.type === 'row').sort((a,b) => a.index - b.index),
        cols: paths.filter(p => p.type === 'col').sort((a,b) => a.index - b.index),
    }

    return (
        <Card className="w-full max-w-4xl h-screen flex flex-col bg-white/90 backdrop-blur-sm border-gray-200 p-2">
            <CardHeader className="text-center shrink-0">
                <BrainCircuit className="w-12 h-12 mx-auto text-primary" />
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>
                    اكتشف الأنماط الرياضية لكل مسار واملأ العقد الفارغة.
                </CardDescription>
            </CardHeader>
            
            <ScrollArea className="flex-grow min-h-0">
                <CardContent className="p-2 sm:p-4 space-y-4">
                    <div className="w-full flex justify-between items-center bg-muted p-2 rounded-lg text-center font-mono text-lg shrink-0">
                        <div className="flex items-center gap-2">
                            <span>النقاط: <span className="font-bold text-green-600">{calculateScore()}</span></span>
                            <AnimatePresence>
                            {checkFeedback && (
                                <motion.div 
                                    className="flex gap-4 text-xs ml-4"
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <span className="flex items-center gap-1 text-green-600"><CheckCircle /> {checkFeedback.correctCells.length}</span>
                                    <span className="flex items-center gap-1 text-red-600"><XCircle /> {checkFeedback.incorrectCells.length}</span>
                                </motion.div>
                            )}
                            </AnimatePresence>
                        </div>
                        <div className="flex items-center gap-2">
                            <Timer className="h-6 w-6" />
                            <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                        </div>
                    </div>
                    
                    <div className="w-full">
                        <svg viewBox={`-25 -25 ${100 * gridSize + 50} ${100 * gridSize + 50}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                            {paths?.map((path, i) => (
                                <motion.path
                                    key={i}
                                    d={path.points}
                                    stroke={path.type === 'row' ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--destructive) / 0.5)'}
                                    strokeWidth="6"
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
                                const point = [node.c * 100 + 50, node.r * 100 + 50];

                                return (
                                    <g key={key} transform={`translate(${point[0]}, ${point[1]})`}>
                                        <motion.circle
                                            cx="0"
                                            cy="0"
                                            r="24"
                                            fill={isEditable ? "hsl(var(--background))" : "hsl(var(--muted))"}
                                            stroke={
                                                isCellCorrect(node.r, node.c) ? 'hsl(var(--chart-2))' : 
                                                isCellIncorrect(node.r, node.c) ? 'hsl(var(--destructive))' :
                                                node.isIntersection ? 'hsl(var(--primary))' : 'hsl(var(--border))'
                                            }
                                            strokeWidth={node.isIntersection || isCellCorrect(node.r, node.c) || isCellIncorrect(node.r, node.c) ? 4 : 2}
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
                                                        className={cn(
                                                            "w-10 h-10 text-lg text-center font-bold p-0 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none"
                                                        )}
                                                        value={userAnswers[key] || ''}
                                                        onChange={(e) => handleInputChange(e, node.r, node.c)}
                                                        disabled={isGameOver || isSubmitting}
                                                        placeholder="?"
                                                    />
                                                ) : (
                                                    <span className="text-lg font-bold text-slate-800">{node.value}</span>
                                                )}
                                            </div>
                                        </foreignObject>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-4 w-full pt-4 border-t">
                        <div className="space-y-1 text-center">
                            <h4 className="font-bold text-primary">تلميحات الصفوف</h4>
                            {hints.rows.map(p => <p key={p.index} className="text-xs text-muted-foreground">{p.hint}</p>)}
                        </div>
                        <div className="space-y-1 text-center">
                            <h4 className="font-bold text-destructive">تلميحات الأعمدة</h4>
                            {hints.cols.map(p => <p key={p.index} className="text-xs text-muted-foreground">{p.hint}</p>)}
                        </div>
                    </div>
                </CardContent>
            </ScrollArea>
            
            <CardFooter className="shrink-0 pt-4 border-t flex flex-col sm:flex-row gap-2">
                <Button onClick={handleCheckClick} disabled={isGameOver || hasSubmitted || isChecking || checkUsed} className="w-full sm:w-auto" variant="outline">
                    {isChecking ? <Loader2 className="mr-2 animate-spin" /> : <HelpCircle className="ml-2" />}
                    {checkUsed ? 'تم استخدام التحقق' : 'تحقق من الحل (-1 نقطة)'}
                </Button>
                <Button onClick={() => handleSubmit(false)} disabled={isGameOver || hasSubmitted || isSubmitting} className="w-full sm:flex-grow" size="lg">
                    {isSubmitting ? <Loader2 className="mr-2 animate-spin" /> : <Send className="ml-2" />}
                    إنهاء وتسليم الإجابة
                </Button>
            </CardFooter>

            <AlertDialog open={isCheckConfirmOpen} onOpenChange={setIsCheckConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم استخدام ميزة "التحقق من الحل" لمرة واحدة فقط. سيتم خصم نقطة واحدة من نتيجتك النهائية. لا يمكنك التراجع عن هذا الإجراء.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirmCheck}>نعم، قم بالتحقق</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
