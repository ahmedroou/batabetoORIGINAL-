
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Game, Player, GeniusChallenge, SmartGridPuzzleData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Send, BrainCircuit, Lightbulb } from 'lucide-react';
import { submitChallengeResult, updateChallengeProgress } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const TIME_LIMIT_SECONDS = 90;

export default function SmartGridPuzzle({ game, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle as SmartGridPuzzleData;
    const { columns } = puzzle || {};

    const myProgress = game.challengeState?.playerProgress?.[self.id];
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);

    const [userAnswers, setUserAnswers] = useState<Record<string, string>>(myProgress?.answers || {});
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const calculateScore = useCallback(() => {
        if (!columns) return 0;
        let correctCount = 0;
        columns.forEach((col, colIndex) => {
            col.cells.forEach((cell, rowIndex) => {
                if (cell === null) {
                    const key = `${colIndex}-${rowIndex}`;
                    const userAnswer = parseInt(userAnswers[key], 10);
                    const correctAnswer = col.solution[rowIndex];
                    if (!isNaN(userAnswer) && userAnswer === correctAnswer) {
                        correctCount++;
                    }
                }
            });
        });
        return correctCount;
    }, [columns, userAnswers]);

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
            toast({ title: "حدث خطأ أثناء التسليم!", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [hasSubmitted, isSubmitting, calculateScore, timeLeft, game.id, self.id, toast]);

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

    const handleInputChange = (colIndex: number, rowIndex: number, value: string) => {
        if (!/^-?\d*$/.test(value)) return;
        const key = `${colIndex}-${rowIndex}`;
        const newAnswers = { ...userAnswers, [key]: value };
        setUserAnswers(newAnswers);
        // Fire-and-forget progress update
        updateChallengeProgress(game.id, self.id, { answers: newAnswers });
    };

    if (!puzzle) {
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري تحميل الشبكة الذكية...</p>
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
        <Card className="w-full h-screen flex flex-col bg-white/90 backdrop-blur-sm border-gray-200 p-2">
            <CardHeader className="text-center shrink-0">
                <BrainCircuit className="w-12 h-12 mx-auto text-primary" />
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>
                    اكتشف النمط في كل عمود واملأ الخانتين الفارغتين.
                </CardDescription>
            </CardHeader>
            
            <div className="w-full flex justify-between items-center bg-muted p-2 rounded-lg text-center font-mono text-lg shrink-0 mb-4 mx-auto max-w-3xl">
                <div className="flex items-center gap-2">
                    <span>النقاط: <span className="font-bold text-green-600">{calculateScore()}</span></span>
                </div>
                <div className="flex items-center gap-2">
                    <Timer className="h-6 w-6" />
                    <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                </div>
            </div>

            <ScrollArea className="flex-grow min-h-0 w-full">
                <div className="flex justify-center p-4">
                    <div className="flex gap-4">
                        {columns.map((col, colIndex) => (
                            <motion.div 
                                key={colIndex} 
                                className="flex flex-col items-center space-y-2 p-3 bg-muted/50 rounded-lg border"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: colIndex * 0.1 }}
                            >
                                {col.cells.map((cell, rowIndex) => {
                                    const key = `${colIndex}-${rowIndex}`;
                                    const isEditable = cell === null;
                                    return (
                                        <div key={rowIndex} className="w-20 h-20 flex items-center justify-center">
                                            {isEditable ? (
                                                <Input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="-?[0-9]*"
                                                    className="w-full h-full text-2xl text-center font-bold p-0 bg-background border-primary border-2 ring-2 ring-primary/20"
                                                    value={userAnswers[key] || ''}
                                                    onChange={(e) => handleInputChange(colIndex, rowIndex, e.target.value)}
                                                    disabled={isGameOver || isSubmitting}
                                                    placeholder="?"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-2xl font-bold bg-muted rounded-md border">
                                                    {cell}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <div className="p-2 mt-2 bg-primary/10 rounded-md text-center w-full">
                                    <p className="text-xs font-semibold text-primary flex items-center justify-center gap-1"><Lightbulb className="w-3 h-3"/> تلميح</p>
                                    <p className="text-xs text-muted-foreground font-bold">{col.pattern}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
            
            <CardFooter className="shrink-0 pt-4 mt-auto border-t">
                <Button onClick={() => handleSubmit(false)} disabled={isGameOver || hasSubmitted || isSubmitting} className="w-full" size="lg">
                    {isSubmitting ? <Loader2 className="mr-2 animate-spin" /> : <Send className="ml-2" />}
                    إنهاء وتسليم الإجابة
                </Button>
            </CardFooter>
        </Card>
    );
}
