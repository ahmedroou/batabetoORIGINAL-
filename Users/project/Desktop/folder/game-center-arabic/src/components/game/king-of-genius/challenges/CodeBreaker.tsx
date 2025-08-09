'use client';

import { useState, useEffect, useRef } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer } from 'lucide-react';
import { updateKingOfGeniusProgress, submitKingOfGeniusResult } from '@/app/actions';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const CODE_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const TIME_LIMIT_SECONDS = 45;

type Attempt = {
  guess: string[];
  feedback: ('correct' | 'misplaced' | 'incorrect')[];
};

export function CodeBreaker({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const secretCode = puzzle?.secretCode;

    const [guess, setGuess] = useState<string[]>(new Array(CODE_LENGTH).fill(''));
    const [attempts, setAttempts] = useState<Attempt[]>(game.challengeState?.playerProgress?.[self.id]?.attempts || []);
    const [isGameOver, setIsGameOver] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setIsGameOver(true);
        } else if (secretCode) {
             inputRefs.current[0]?.focus();
        }
    }, [game.challengeState?.results, self.id, secretCode]);

    useEffect(() => {
        if (isGameOver || !game.challengeState?.challengeEndsAt) return;

        const endTime = game.challengeState.challengeEndsAt.toMillis();
        const updateTimer = () => {
            const remaining = Math.round((endTime - Date.now()) / 1000);
            if (remaining <= 0) {
                setTimeLeft(0);
                if (!hasSubmitted && !isGameOver) {
                    setIsGameOver(true);
                    toast({ title: "انتهى الوقت!", description: "للأسف، لم تفك الشيفرة في الوقت المحدد.", variant: "destructive" });
                    submitKingOfGeniusResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS });
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const value = e.target.value;
        if (/^[0-9]$/.test(value)) {
            const newGuess = [...guess];
            newGuess[index] = value;
            setGuess(newGuess);
            if (index < CODE_LENGTH - 1) {
                inputRefs.current[index + 1]?.focus();
            }
        } else if (value === '') {
            const newGuess = [...guess];
            newGuess[index] = '';
            setGuess(newGuess);
        }
    };

    const handleKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !guess[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            checkGuess();
        }
    };

    const checkGuess = async () => {
        if (guess.some(g => g === '') || isGameOver || !secretCode || isChecking) return;
        
        setIsChecking(true);
        
        const timeTaken = TIME_LIMIT_SECONDS - timeLeft;
        
        const feedback: Attempt['feedback'] = new Array(CODE_LENGTH).fill('incorrect');
        const secretCodeCopy = [...secretCode];
        const guessCopy = [...guess];

        // First pass for correct guesses
        for (let i = 0; i < CODE_LENGTH; i++) {
            if (guessCopy[i] === secretCodeCopy[i]) {
                feedback[i] = 'correct';
                secretCodeCopy[i] = '-'; // Mark as used
                guessCopy[i] = '*'; // Mark as checked
            }
        }
        
        // Second pass for misplaced guesses
        for (let i = 0; i < CODE_LENGTH; i++) {
            if (guessCopy[i] !== '*') {
                const indexInSecret = secretCodeCopy.indexOf(guessCopy[i]);
                if (indexInSecret !== -1) {
                    feedback[i] = 'misplaced';
                    secretCodeCopy[indexInSecret] = '-'; // Mark as used
                }
            }
        }

        const newAttempt = { guess: [...guess], feedback };
        const newAttempts = [...attempts, newAttempt];
        setAttempts(newAttempts);
        setGuess(new Array(CODE_LENGTH).fill(''));

        // Fire-and-forget the update to avoid UI lag.
        updateKingOfGeniusProgress(game.id, self.id, { attempts: newAttempts }).catch(err => {
            console.error("Failed to update progress:", err);
            // Optionally, show a subtle error to the user
        });
        
        const victory = feedback.every(f => f === 'correct');
        if (victory) {
            setIsGameOver(true);
            setHasSubmitted(true);
            await submitKingOfGeniusResult(game.id, self.id, { isCorrect: true, time: timeTaken });
            toast({ title: "نجاح!", description: "لقد فككت الشيفرة بنجاح.", className: "bg-green-100 border-green-500 text-green-700" });
        } else if (newAttempts.length >= MAX_ATTEMPTS) {
            setIsGameOver(true);
            setHasSubmitted(true);
            await submitKingOfGeniusResult(game.id, self.id, { isCorrect: false, time: timeTaken });
            toast({ title: "فشلت!", description: "لقد استنفدت كل محاولاتك.", variant: "destructive" });
        }
        
        setIsChecking(false);
        // Reset focus to the first input for the next attempt
        inputRefs.current[0]?.focus();
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

    if (!secretCode) {
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد الشيفرة...</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="w-full max-w-lg bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>خمن الشيفرة المكونة من {CODE_LENGTH} أرقام فريدة.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                 <div className="w-full flex justify-between items-center bg-muted p-3 rounded-lg text-center font-mono text-lg">
                    <span>المحاولات: <span className="font-bold">{MAX_ATTEMPTS - attempts.length} / {MAX_ATTEMPTS}</span></span>
                    <div className="flex items-center gap-2">
                        <Timer className="h-6 w-6"/>
                        <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
                    </div>
                </div>
                
                <div className="flex gap-2" dir="ltr">
                    {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                        <Input
                            key={index}
                            ref={el => inputRefs.current[index] = el}
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            maxLength={1}
                            value={guess[index]}
                            onChange={(e) => handleInputChange(e, index)}
                            onKeyDown={handleKeyDown(index)}
                            className="w-14 h-16 text-3xl text-center font-bold bg-white border-slate-300"
                            disabled={isGameOver || isChecking}
                        />
                    ))}
                </div>
                
                <Button onClick={checkGuess} disabled={isGameOver || guess.some(g => g === '') || isChecking} className="w-full max-w-xs" size="lg">
                    {isChecking ? <Loader2 className="animate-spin" /> : "تحقق"}
                </Button>

                {attempts.length > 0 && (
                    <div className="w-full space-y-3 text-center pt-4 border-t">
                        <h4 className="font-bold text-muted-foreground">المحاولات السابقة:</h4>
                        <div className="space-y-2">
                            <AnimatePresence>
                                {attempts.slice().reverse().map((att, i) => (
                                    <motion.div 
                                        key={attempts.length - 1 - i} 
                                        className="flex items-center justify-center gap-3 p-2 bg-muted/50 rounded-md"
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <div className="flex gap-2" dir="ltr">
                                            {att.guess.map((digit, j) => {
                                                const status = att.feedback[j];
                                                const colorClass = 
                                                    status === 'correct' ? 'bg-green-500 border-green-600 text-white' :
                                                    status === 'misplaced' ? 'bg-yellow-400 border-yellow-500 text-white' :
                                                    'bg-slate-400 border-slate-500 text-white';
                                                
                                                return (
                                                    <div key={j} className={cn("w-10 h-10 flex items-center justify-center font-bold rounded-md border-2 text-2xl", colorClass)}>
                                                        {digit}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
