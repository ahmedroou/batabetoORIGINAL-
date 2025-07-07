
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Flame } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';


// A simple non-AI code generator
const generateCode = (length: number): string[] => {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const code = [];
  while (code.length < length) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    code.push(digits[randomIndex]);
  }
  return code;
};


export function CodeBreaker({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [secretCode] = useState(() => game.challengeState?.secretCode || generateCode(4));
    const [guess, setGuess] = useState<string[]>(Array(4).fill(''));
    const [history, setHistory] = useState<{ guess: string[], feedback: { correct: number, misplaced: number } }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [startTime] = useState(Date.now());

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
        }
    }, [game.challengeState, self.id]);

    const handleGuessChange = (index: number, value: string) => {
        if (/^\d?$/.test(value)) {
            const newGuess = [...guess];
            newGuess[index] = value;
            setGuess(newGuess);

            // Auto-focus next input
            if (value && index < 3) {
                document.getElementById(`guess-input-${index + 1}`)?.focus();
            }
        }
    };
    
    const handleSubmitGuess = async () => {
        if (guess.some(g => g === '')) {
            toast({ title: "تخمين غير مكتمل", description: "الرجاء إدخال 4 أرقام.", variant: 'destructive' });
            return;
        }

        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;
        
        let correct = 0;
        let misplaced = 0;
        
        if (guess.join('') === secretCode.join('')) {
            // Correct guess
            setIsSubmitting(true);
            setHasSubmitted(true);
            toast({ title: "صحيح!", description: "لقد كسرت الشفرة!", className: "bg-green-600 border-green-600 text-white" });
            try {
                await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
            } catch (error: any) {
                toast({ title: "خطأ", description: error.message, variant: "destructive" });
                setIsSubmitting(false);
                setHasSubmitted(false);
            }
        } else {
            // Incorrect guess, provide feedback
            const secretCopy = [...secretCode];
            const guessCopy = [...guess];

            // Check for correct digits in correct positions
            for (let i = 0; i < 4; i++) {
                if (guessCopy[i] === secretCopy[i]) {
                    correct++;
                    secretCopy[i] = 'c'; // Mark as checked
                    guessCopy[i] = 'c';
                }
            }
            // Check for correct digits in wrong positions
            for (let i = 0; i < 4; i++) {
                if (guessCopy[i] !== 'c') {
                    const misplacedIndex = secretCopy.indexOf(guessCopy[i]);
                    if (misplacedIndex !== -1) {
                        misplaced++;
                        secretCopy[misplacedIndex] = 'c';
                    }
                }
            }

            setHistory(h => [...h, { guess, feedback: { correct, misplaced } }]);
            setGuess(Array(4).fill(''));
            document.getElementById('guess-input-0')?.focus();
            
            if (history.length >= 5) { // Max 6 attempts
                setIsSubmitting(true);
                setHasSubmitted(true);
                toast({ title: "انتهت المحاولات!", variant: 'destructive' });
                try {
                    await submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
                } catch (error: any) {
                    toast({ title: "خطأ", description: error.message, variant: "destructive" });
                    setIsSubmitting(false);
                    setHasSubmitted(false);
                }
            }
        }
    };

    if (hasSubmitted) {
        return (
             <Card className="w-full max-w-md bg-gray-900/80 border-gray-700 text-white text-center">
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
        <Card className="w-full max-w-md bg-gray-900/80 border-gray-700 text-white">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription className="text-gray-400">{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2 h-40 overflow-y-auto p-2 bg-gray-900/50 rounded-lg border border-gray-700">
                    <AnimatePresence>
                    {history.map((h, i) => (
                        <motion.div 
                            key={i} 
                            initial={{opacity: 0, x: -20}} 
                            animate={{opacity: 1, x: 0}}
                            className="flex justify-between items-center p-2 bg-gray-700/50 rounded"
                        >
                            <div className="flex gap-2 font-mono text-xl tracking-widest text-gray-300">
                                {h.guess.map((g, j) => <span key={j}>{g}</span>)}
                            </div>
                            <div className="flex gap-4 text-sm font-semibold">
                                <span className="text-green-400 flex items-center gap-1">✅ {h.feedback.correct}</span>
                                <span className="text-yellow-400 flex items-center gap-1">🔄 {h.feedback.misplaced}</span>
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
                            className="w-16 h-16 text-4xl text-center font-mono bg-gray-800 border-gray-600 text-white focus:border-primary focus:ring-primary"
                            disabled={isSubmitting}
                            autoComplete="off"
                        />
                    ))}
                </div>
                <Button onClick={handleSubmitGuess} className="w-full" size="lg" variant="secondary" disabled={isSubmitting || guess.some(g => g === '')}>
                    {isSubmitting ? 'جاري التحقق...' : 'تأكيد التخمين'}
                </Button>
                <p className="text-center text-sm text-gray-400">
                    <Flame className="inline-block w-4 h-4 text-red-500" /> المحاولات المتبقية: {6 - history.length}
                </p>
            </CardContent>
        </Card>
    );
}
