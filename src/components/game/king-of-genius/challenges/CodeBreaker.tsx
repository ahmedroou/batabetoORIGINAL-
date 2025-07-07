
'use client';

import { useState, useEffect, useRef } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

const CODE_LENGTH = 5;
const MAX_ATTEMPTS = 6;

type Attempt = {
  guess: string[];
  feedback: ('correct' | 'misplaced' | 'incorrect')[];
};

export function CodeBreaker({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const secretCode = puzzle?.secretCode;

    const [guess, setGuess] = useState<string[]>(new Array(CODE_LENGTH).fill(''));
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [isGameOver, setIsGameOver] = useState(false);
    const [remainingAttempts, setRemainingAttempts] = useState(MAX_ATTEMPTS);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [startTime] = useState(Date.now());

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setIsGameOver(true);
        } else {
             inputRefs.current[0]?.focus();
        }
    }, [game.challengeState?.results, self.id]);

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
            checkGuess();
        }
    };

    const checkGuess = () => {
        if (guess.some(g => g === '') || isGameOver || !secretCode) return;
        
        const timeTaken = (Date.now() - startTime) / 1000;
        
        const feedback: Attempt['feedback'] = new Array(CODE_LENGTH).fill('incorrect');
        const secretCodeCopy = [...secretCode];
        const guessCopy = [...guess];

        // First pass for correct positions (green)
        for (let i = 0; i < CODE_LENGTH; i++) {
            if (guessCopy[i] === secretCodeCopy[i]) {
                feedback[i] = 'correct';
                secretCodeCopy[i] = '-'; // Mark as used
                guessCopy[i] = '*'; // Mark as used
            }
        }
        
        // Second pass for misplaced numbers (yellow)
        for (let i = 0; i < CODE_LENGTH; i++) {
            if (guessCopy[i] !== '*') {
                const indexInSecret = secretCodeCopy.indexOf(guessCopy[i]);
                if (indexInSecret !== -1) {
                    feedback[i] = 'misplaced';
                    secretCodeCopy[indexInSecret] = '-'; // Mark as used
                }
            }
        }

        const newAttempts = [...attempts, { guess: [...guess], feedback }];
        setAttempts(newAttempts);
        setRemainingAttempts(prev => prev - 1);
        
        const victory = feedback.every(f => f === 'correct');
        if (victory) {
            setIsGameOver(true);
            toast({ title: "نجاح!", description: "لقد فككت الشيفرة بنجاح.", className: "bg-green-100 border-green-500 text-green-700" });
            submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
            setHasSubmitted(true);
            return;
        }

        if (remainingAttempts <= 1) {
            setIsGameOver(true);
            toast({ title: "فشلت!", description: "لقد استنفدت كل محاولاتك.", variant: "destructive" });
            submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
            setHasSubmitted(true);
            return;
        }

        setGuess(new Array(CODE_LENGTH).fill(''));
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
                 <div className="w-full bg-muted p-3 rounded-lg text-center">
                    <span className="font-mono text-lg">المحاولات المتبقية: <span className="font-bold">{remainingAttempts}</span></span>
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
                            disabled={isGameOver}
                        />
                    ))}
                </div>
                
                <Button onClick={checkGuess} disabled={isGameOver || guess.some(g => g === '')} className="w-full max-w-xs" size="lg">
                    تحقق
                </Button>

                {attempts.length > 0 && (
                    <div className="w-full space-y-3 text-center pt-4 border-t">
                        <h4 className="font-bold text-muted-foreground">المحاولات السابقة:</h4>
                        <div className="space-y-2">
                            {attempts.map((att, i) => (
                                <div key={i} className="flex items-center justify-center gap-3 p-2 bg-muted/50 rounded-md">
                                    <div className="flex gap-2" dir="ltr">
                                        {att.guess.map((digit, j) => {
                                            const status = att.feedback[j];
                                            const colorClass = 
                                                status === 'correct' ? 'bg-green-500 border-green-600 text-white' :
                                                status === 'misplaced' ? 'bg-yellow-400 border-yellow-500 text-white' :
                                                'bg-slate-400 border-slate-500 text-white';
                                            
                                            return (
                                                <div key={j} className={cn("w-10 h-10 flex items-center justify-center font-bold rounded-md border-2", colorClass)}>
                                                    {digit}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

