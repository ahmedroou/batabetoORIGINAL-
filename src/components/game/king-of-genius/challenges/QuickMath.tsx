'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Calculator } from 'lucide-react';
import { submitChallengeResult, updateKingOfGeniusProgress } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const parseIntSafe = (val: string) => {
    const cleaned = (val || '').trim();
    if (!/^-?\d+$/.test(cleaned)) return NaN;
    return parseInt(cleaned, 10);
};

export function QuickMath({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const problems = puzzle?.problems;
    const timeLimit = challenge.timeLimit || 60;

    const [answer, setAnswer] = useState('');
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [timeLeft, setTimeLeft] = useState(() => {
        if (!game.challengeState?.challengeEndsAt) return timeLimit;
        return Math.max(0, Math.round((game.challengeState.challengeEndsAt.toMillis() - Date.now()) / 1000));
    });

    const inputRef = useRef<HTMLInputElement>(null);
    const hasSubmittedRef = useRef(false);

    const myProgress = game.challengeState?.playerProgress?.[self.id];
    const effectiveNumProblems = problems?.length ?? 5;
    const currentProblemIndex = clamp(myProgress?.currentProblemIndex ?? 0, 0, effectiveNumProblems - 1);

    const handleSubmission = useCallback(async (isVictory: boolean, timeTaken: number, finalScore: number) => {
        if (hasSubmittedRef.current) return;
        hasSubmittedRef.current = true;
        setIsGameOver(true);
        setHasSubmitted(true);
        try {
            await submitChallengeResult(game.id, self.id, { isCorrect: isVictory, time: timeTaken, score: finalScore });
            if (isVictory) {
                toast({ title: "تحدي مكتمل!", description: `أحسنت! أكملت ${effectiveNumProblems}/${effectiveNumProblems} في ${timeTaken} ثانية.`, className: "bg-green-100 border-green-500 text-green-700" });
            }
        } catch (e: any) {
            toast({ title: "خطأ", description: `فشل إرسال النتيجة: ${e.message}`, variant: "destructive" });
            hasSubmittedRef.current = false; // Allow retry on error
        }
    }, [game.id, self.id, toast, effectiveNumProblems]);
    
    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setIsGameOver(true);
            hasSubmittedRef.current = true;
        } else if (problems) {
            inputRef.current?.focus();
        }
    }, [game.challengeState?.results, self.id, problems]);

    useEffect(() => {
        if (isGameOver || !game.challengeState?.challengeEndsAt) return;
        const endTime = game.challengeState.challengeEndsAt.toMillis();
        const timer = setInterval(() => {
            const remaining = Math.round((endTime - Date.now()) / 1000);
            if (remaining <= 0) {
                setTimeLeft(0);
                if (!hasSubmittedRef.current) {
                    toast({ title: "انتهى الوقت!", description: `للأسف، لم تكمل في الوقت المحدد.`, variant: "destructive" });
                    handleSubmission(false, timeLimit, 0);
                }
                clearInterval(timer);
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [isGameOver, game.challengeState?.challengeEndsAt, handleSubmission, timeLimit, toast]);

    const handleAnswerSubmit = async () => {
        if (isGameOver || isSubmitting || !problems) return;
        const currentProblem = problems[currentProblemIndex];
        if (!currentProblem) return;

        const value = parseIntSafe(answer);
        if (Number.isNaN(value)) {
            toast({ title: "إدخال غير صالح", description: "الرجاء إدخال رقم صحيح.", variant: "destructive" });
            return;
        }

        const correct = value === currentProblem.answer;

        if (correct) {
            const isLastProblem = currentProblemIndex >= effectiveNumProblems - 1;
            if (isLastProblem) {
                const timeTaken = clamp(timeLimit - timeLeft, 0, timeLimit);
                await handleSubmission(true, timeTaken, 5);
            } else {
                setIsSubmitting(true);
                try {
                    await updateKingOfGeniusProgress(game.id, self.id, { currentProblemIndex: currentProblemIndex + 1 });
                    setAnswer('');
                    toast({
                        title: "إجابة صحيحة!",
                        description: "استعد للمسألة التالية...",
                        className: "bg-green-100 border-green-500 text-green-700",
                        duration: 1200,
                    });
                } catch (e: any) {
                    toast({ title: "خطأ", description: `فشل تحديث التقدم: ${e.message}`, variant: "destructive" });
                } finally {
                    setIsSubmitting(false);
                }
            }
        } else {
            toast({ title: "إجابة خاطئة!", description: "حاول مرة أخرى.", variant: "destructive" });
            setAnswer('');
        }
        inputRef.current?.focus();
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAnswerSubmit();
        }
    };
    
    const pct = clamp((timeLeft / timeLimit) * 100, 0, 100);
    const progressTone = timeLeft <= 10 ? '[&>*]:bg-red-500' : timeLeft <= 30 ? '[&>*]:bg-yellow-500' : '[&>*]:bg-green-500';

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

    if (!problems || !problems.length) {
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد المسائل...</p>
                </CardContent>
            </Card>
        )
    }

    const current = problems[currentProblemIndex];

    return (
        <Card className="w-full max-w-lg bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>{challenge.description}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col items-center space-y-4">
                <div className="w-full flex justify-between items-center bg-muted p-2 rounded-lg text-center font-mono text-lg" role="status">
                    <span>المسألة: <span className="font-bold">{currentProblemIndex + 1} / {effectiveNumProblems}</span></span>
                    <div className="flex items-center gap-2">
                        <Timer className="h-6 w-6"/>
                        <span className={cn("font-bold tabular-nums", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                    </div>
                </div>
                <Progress value={pct} className={cn("w-full h-2", progressTone)} />
                <div className="w-full text-center bg-slate-800 text-white p-4 md:p-6 rounded-lg shadow-inner flex items-center justify-center" dir="ltr">
                    <p className="font-mono text-3xl md:text-4xl tracking-tight">{current?.problem ?? '...'}</p>
                </div>
                <div className="w-full flex gap-2">
                    <Input
                        ref={inputRef}
                        type="text"
                        inputMode="numeric"
                        placeholder="أدخل إجابتك هنا..."
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value.replace(/[^\d-]/g, ''))}
                        onKeyDown={handleKeyDown}
                        className="text-center text-2xl h-16"
                        disabled={isGameOver || isSubmitting}
                        autoComplete="off"
                    />
                    <Button
                        onClick={handleAnswerSubmit}
                        disabled={isGameOver || isSubmitting || answer.trim() === ''}
                        size="lg"
                        className="h-16 min-w-28"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <Calculator className="ml-2" />}
                        تأكيد
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}