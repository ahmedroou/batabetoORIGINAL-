
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, BrainCircuit, Flame, CircleHelp } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function CodeBreaker({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const secretCode = game.challengeState?.secretCode;
    const [guess, setGuess] = useState<string[]>(Array(4).fill(''));
    const [history, setHistory] = useState<{ guess: string[], feedback: { correct: number, misplaced: number } }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [startTime, setStartTime] = useState(Date.now());

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
        } else {
            setStartTime(Date.now());
        }
    }, [game.challengeState, self.id]);

    const handleGuessChange = (index: number, value: string) => {
        if (/^\d?$/.test(value)) {
            const newGuess = [...guess];
            newGuess[index] = value;
            setGuess(newGuess);

            if (value && index < 3) {
                document.getElementById(`guess-input-${index + 1}`)?.focus();
            }
        }
    };
    
    const handleSubmitGuess = async () => {
        if (!secretCode || guess.some(g => g === '')) {
            toast({ title: "تخمين غير مكتمل", description: "الرجاء إدخال 4 أرقام.", variant: 'destructive' });
            return;
        }

        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;
        
        let isCorrect = guess.join('') === secretCode.join('');

        if (isCorrect) {
            setIsSubmitting(true);
            toast({ title: "صحيح!", description: "لقد كسرت الشفرة!", className: "bg-green-100 border-green-500 text-green-700" });
        } else {
            let correctCount = 0;
            let misplacedCount = 0;
            const secretCopy = [...secretCode];
            const guessCopy = [...guess];

            for (let i = 0; i < 4; i++) {
                if (guessCopy[i] === secretCopy[i]) {
                    correctCount++;
                    secretCopy[i] = 'c';
                    guessCopy[i] = 'c';
                }
            }
            for (let i = 0; i < 4; i++) {
                if (guessCopy[i] !== 'c') {
                    const misplacedIndex = secretCopy.indexOf(guessCopy[i]);
                    if (misplacedIndex !== -1) {
                        misplacedCount++;
                        secretCopy[misplacedIndex] = 'c';
                    }
                }
            }

            setHistory(h => [...h, { guess, feedback: { correct: correctCount, misplaced: misplacedCount } }]);
            setGuess(Array(4).fill(''));
            document.getElementById('guess-input-0')?.focus();
        }

        const isFinished = isCorrect || history.length >= 5;

        if(isFinished){
            setIsSubmitting(true);
            setHasSubmitted(true);
            if (!isCorrect) {
                toast({ title: "انتهت المحاولات!", description: `الشفرة الصحيحة كانت: ${secretCode.join('')}`, variant: 'destructive' });
            }
            try {
                await submitChallengeResult(game.id, self.id, { isCorrect, time: timeTaken });
            } catch (error: any) {
                toast({ title: "خطأ", description: error.message, variant: "destructive" });
                setIsSubmitting(false);
                setHasSubmitted(false);
            }
        }
    };

    if (hasSubmitted) {
        return (
             <Card className="w-full max-w-md text-center bg-white/90 backdrop-blur-sm border-gray-200">
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
            <Card className="w-full max-w-md text-center bg-white/90 backdrop-blur-sm border-gray-200">
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
        <Card className="w-full max-w-md bg-white/90 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                 <BrainCircuit className="w-16 h-16 mx-auto text-primary" />
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription className="flex items-center justify-center gap-2">
                    {challenge.description}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <CircleHelp className="w-4 h-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>✅: رقم صحيح في مكانه الصحيح</p>
                                <p>🔄: رقم صحيح في مكان خاطئ</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2 h-40 overflow-y-auto p-2 bg-background rounded-lg border">
                    <AnimatePresence>
                    {history.map((h, i) => (
                        <motion.div 
                            key={i} 
                            initial={{opacity: 0, x: -20}} 
                            animate={{opacity: 1, x: 0}}
                            className="flex justify-between items-center p-2 bg-card rounded"
                        >
                            <div className="flex gap-2 font-mono text-xl tracking-widest text-card-foreground">
                                {h.guess.map((g, j) => <span key={j}>{g}</span>)}
                            </div>
                            <div className="flex gap-4 text-sm font-semibold">
                                <span className="text-green-500 flex items-center gap-1">✅ {h.feedback.correct}</span>
                                <span className="text-yellow-500 flex items-center gap-1">🔄 {h.feedback.misplaced}</span>
                            </div>
                        </motion.div>
                    ))}
                    </AnimatePresence>
                </div>

                 <div className="flex justify-center gap-2" dir="ltr">
                    {guess.map((digit, index) => (
                        <Input
                            key={index}
                            id={`guess-input-${index}`}
                            type="text"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleGuessChange(index, e.target.value)}
                            className="w-16 h-16 text-4xl text-center font-mono"
                            disabled={isSubmitting}
                            autoComplete="off"
                        />
                    ))}
                </div>
                <Button onClick={handleSubmitGuess} className="w-full" size="lg" variant="secondary" disabled={isSubmitting || guess.some(g => g === '')}>
                    {isSubmitting ? 'جاري التحقق...' : 'تأكيد التخمين'}
                </Button>
            </CardContent>
            <CardFooter>
                 <p className="text-center text-sm text-muted-foreground w-full">
                    <Flame className="inline-block w-4 h-4 text-destructive" /> المحاولات المتبقية: {6 - history.length}
                </p>
            </CardFooter>
        </Card>
    );
}
