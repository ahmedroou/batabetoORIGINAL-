
'use client';

import { useState, useEffect, useRef } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Calculator } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const TIME_LIMIT_SECONDS = 90;
const NUM_PROBLEMS = 5;

export function QuickMath({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const problems = puzzle?.problems;

    const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
    const [answer, setAnswer] = useState('');
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [startTime] = useState(Date.now());
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setIsGameOver(true);
        } else if (problems) {
             inputRef.current?.focus();
        }
    }, [game.challengeState?.results, self.id, problems]);

    useEffect(() => {
        if (isGameOver || !problems) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    if (!hasSubmitted) {
                        setIsGameOver(true);
                        toast({ title: "انتهى الوقت!", description: `للأسف، لم تكمل ${NUM_PROBLEMS} مسائل في الوقت المحدد.`, variant: "destructive" });
                        submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS });
                        setHasSubmitted(true);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isGameOver, hasSubmitted, game.id, self.id, toast, problems]);
    
    const handleAnswerSubmit = () => {
        if (isGameOver || !problems || answer === '') return;

        const currentProblem = problems[currentProblemIndex];
        if (parseInt(answer, 10) === currentProblem.answer) {
            if (currentProblemIndex < NUM_PROBLEMS - 1) {
                setCurrentProblemIndex(prev => prev + 1);
                setAnswer('');
                inputRef.current?.focus();
                toast({
                    title: "إجابة صحيحة!",
                    description: "استعد للمسألة التالية...",
                    className: "bg-green-100 border-green-500 text-green-700",
                    duration: 1500,
                });
            } else {
                const timeTaken = (Date.now() - startTime) / 1000;
                setIsGameOver(true);
                setHasSubmitted(true);
                submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
                toast({
                    title: "تحدي مكتمل!",
                    description: `لقد حلت جميع الـ ${NUM_PROBLEMS} مسائل بنجاح.`,
                    className: "bg-green-100 border-green-500 text-green-700",
                });
            }
        } else {
            toast({
                title: "إجابة خاطئة!",
                description: "حاول مرة أخرى.",
                variant: "destructive",
            });
            setAnswer('');
            inputRef.current?.focus();
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
        )
    }

    if (!problems) {
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

    return (
        <Card className="w-full max-w-lg bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                <div className="w-full flex justify-between items-center bg-muted p-2 rounded-lg text-center font-mono text-lg">
                    <span>المسألة: <span className="font-bold">{currentProblemIndex + 1} / {NUM_PROBLEMS}</span></span>
                    <div className="flex items-center gap-2">
                        <Timer className="h-6 w-6"/>
                        <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                    </div>
                </div>

                <Progress value={((currentProblemIndex) / NUM_PROBLEMS) * 100} className="w-full h-2" />
                
                <div className="w-full text-center bg-slate-800 text-white p-6 rounded-lg shadow-inner" dir="ltr">
                    <p className="font-mono text-5xl tracking-widest">{problems[currentProblemIndex].problem}</p>
                </div>
                
                <div className="w-full flex gap-2">
                    <Input
                        ref={inputRef}
                        type="number"
                        placeholder="أدخل إجابتك هنا..."
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAnswerSubmit()}
                        className="text-center text-2xl h-16"
                        disabled={isGameOver}
                    />
                    <Button onClick={handleAnswerSubmit} disabled={isGameOver || answer === ''} size="lg" className="h-16">
                        <Calculator className="ml-2" />
                        تأكيد
                    </Button>
                </div>

            </CardContent>
        </Card>
    );
}
