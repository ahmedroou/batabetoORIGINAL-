
'use client';

import { useState, useEffect, useRef } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, KeyRound, AlertTriangle, X } from 'lucide-react';
import { updateChallengeProgress, submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';

const TIME_LIMIT_SECONDS = 15;
const MAX_WRONG_GUESSES = 2;

export function CipherShift({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const { encryptedWord, plainWord, hint } = puzzle || {};

    const [answer, setAnswer] = useState('');
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
    const inputRef = useRef<HTMLInputElement>(null);

    const myProgress = game.challengeState?.playerProgress?.[self.id];
    const wrongGuesses = myProgress?.wrongGuesses || 0;

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setIsGameOver(true);
        } else if (puzzle) {
            inputRef.current?.focus();
        }
    }, [game.challengeState?.results, self.id, puzzle]);

    useEffect(() => {
        if (isGameOver || !game.challengeState?.challengeEndsAt) return;

        const endTime = game.challengeState.challengeEndsAt.toMillis();
        const updateTimer = () => {
            const remaining = Math.round((endTime - Date.now()) / 1000);
            if (remaining <= 0) {
                setTimeLeft(0);
                if (!hasSubmitted) {
                    setIsGameOver(true);
                    toast({ title: "انتهى الوقت!", variant: "destructive" });
                    submitChallengeResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS });
                    setHasSubmitted(true);
                }
                clearInterval(timer);
            } else {
                setTimeLeft(remaining);
            }
        };

        const timer = setInterval(updateTimer, 1000);
        updateTimer();

        return () => clearInterval(timer);
    }, [isGameOver, hasSubmitted, game.id, self.id, game.challengeState?.challengeEndsAt, toast]);

    const handleAnswerSubmit = () => {
        if (isGameOver || !puzzle || answer.trim() === '') return;

        const timeTaken = TIME_LIMIT_SECONDS - timeLeft;

        if (answer.trim() === plainWord) {
            setIsGameOver(true);
            setHasSubmitted(true);
            submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
            toast({
                title: "تم فك الشيفرة!",
                description: "إجابة صحيحة.",
                className: "bg-green-100 border-green-500 text-green-700",
            });
        } else {
            const newWrongGuesses = wrongGuesses + 1;
            updateChallengeProgress(game.id, self.id, { wrongGuesses: newWrongGuesses });
            setAnswer('');
            toast({
                title: "محاولة خاطئة!",
                variant: "destructive",
                duration: 2000,
            });

            if (newWrongGuesses >= MAX_WRONG_GUESSES) {
                setIsGameOver(true);
                setHasSubmitted(true);
                submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
                toast({
                    title: "انتهت المحاولات!",
                    description: "حظًا أفضل في المرة القادمة.",
                    variant: "destructive",
                });
            }
        }
    };

    if (hasSubmitted) {
        return (
            <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
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
            <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد الشيفرة...</p>
                </CardContent>
            </Card>
        );
    }
    
    const strikeIcons = Array.from({ length: MAX_WRONG_GUESSES }).map((_, index) => (
        <X key={index} className={cn("h-6 w-6", index < wrongGuesses ? "text-red-500" : "text-gray-600")} />
    ));

    return (
        <Card className="w-full max-w-lg bg-gray-900 text-white border-gray-700">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
                    <KeyRound /> {challenge.name}
                </CardTitle>
                <CardDescription className="text-gray-400">{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                 <div className="w-full flex justify-between items-center bg-gray-800 p-2 rounded-lg text-center font-mono text-lg">
                    <div className="flex items-center gap-2" title="محاولات خاطئة">
                        {strikeIcons}
                    </div>
                    <div className="flex items-center gap-2">
                        <Timer className="h-6 w-6"/>
                        <span className={cn("font-bold", timeLeft < 5 && "text-destructive animate-pulse")}>{timeLeft}</span>
                    </div>
                </div>
                
                 <div className="w-full">
                    <Progress value={(timeLeft / TIME_LIMIT_SECONDS) * 100} className="w-full h-2 bg-gray-700 [&>*]:bg-red-500" />
                </div>

                <div className="w-full text-center bg-gray-800/50 p-6 my-4 rounded-lg shadow-inner border border-gray-700">
                    <motion.p 
                        key={encryptedWord}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="font-mono text-5xl tracking-widest text-amber-300"
                    >
                        {encryptedWord}
                    </motion.p>
                </div>
                
                <div className="w-full flex items-center gap-2 bg-gray-800 p-3 rounded-md border border-gray-700">
                    <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0"/>
                    <p className="text-yellow-200 text-sm"><strong>تلميح:</strong> {hint}</p>
                </div>

                <div className="w-full flex gap-2">
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder="أدخل إجابتك هنا..."
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAnswerSubmit()}
                        className="text-center text-2xl h-16 bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 focus:ring-amber-400"
                        disabled={isGameOver}
                        dir="rtl"
                    />
                    <Button onClick={handleAnswerSubmit} disabled={isGameOver || answer === ''} size="lg" className="h-16 bg-amber-500 hover:bg-amber-600 text-black font-bold">
                        فك الشيفرة
                    </Button>
                </div>

            </CardContent>
        </Card>
    );
}
