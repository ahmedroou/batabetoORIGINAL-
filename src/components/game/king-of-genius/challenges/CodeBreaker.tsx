
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { Lightbulb } from 'lucide-react';

// A simple non-AI code generator for now
const generateCode = (length: number): string[] => {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const code = [];
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    code.push(digits.splice(randomIndex, 1)[0]);
  }
  return code;
};

export function CodeBreaker({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [secretCode] = useState(() => generateCode(4));
    const [guess, setGuess] = useState<string[]>(Array(4).fill(''));
    const [history, setHistory] = useState<{ guess: string[], feedback: { correct: number, misplaced: number } }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [startTime] = useState(Date.now());

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
        
        if (guess.join('') === secretCode.join('')) {
            // Correct guess
            setIsSubmitting(true);
            toast({ title: "صحيح!", description: "لقد كسرت الشفرة!", className: "bg-green-500 text-white" });
            await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
        } else {
            // Incorrect guess, provide feedback
            let correct = 0;
            let misplaced = 0;
            const secretCopy = [...secretCode];
            const guessCopy = [...guess];

            // Check for correct digits in correct positions
            for (let i = 0; i < 4; i++) {
                if (guessCopy[i] === secretCopy[i]) {
                    correct++;
                    secretCopy[i] = '-';
                    guessCopy[i] = '-';
                }
            }
            // Check for correct digits in wrong positions
            for (let i = 0; i < 4; i++) {
                if (guessCopy[i] !== '-') {
                    const misplacedIndex = secretCopy.indexOf(guessCopy[i]);
                    if (misplacedIndex !== -1) {
                        misplaced++;
                        secretCopy[misplacedIndex] = '-';
                    }
                }
            }

            setHistory(h => [...h, { guess, feedback: { correct, misplaced } }]);
            setGuess(Array(4).fill(''));
            document.getElementById('guess-input-0')?.focus();
            
            if (history.length >= 5) { // Max 6 attempts
                setIsSubmitting(true);
                toast({ title: "انتهت المحاولات!", variant: 'destructive' });
                await submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
            }
        }
    };

    return (
        <Card className="w-full max-w-md bg-gray-800/50 border-primary/30 text-white">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription className="text-muted-foreground">{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Guess History */}
                <div className="space-y-2 h-40 overflow-y-auto p-2 bg-gray-900/50 rounded-lg">
                    {history.map((h, i) => (
                        <motion.div key={i} initial={{opacity: 0}} animate={{opacity: 1}} className="flex justify-between items-center p-2 bg-gray-700/50 rounded">
                            <div className="flex gap-2 font-mono text-xl">
                                {h.guess.map((g, j) => <span key={j}>{g}</span>)}
                            </div>
                            <div className="flex gap-2 text-sm">
                                <span className="text-green-400">✅ {h.feedback.correct}</span>
                                <span className="text-yellow-400">🔄 {h.feedback.misplaced}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>
                {/* Guess Input */}
                 <div className="flex justify-center gap-2" dir="ltr">
                    {guess.map((digit, index) => (
                        <Input
                            key={index}
                            id={`guess-input-${index}`}
                            type="text"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleGuessChange(index, e.target.value)}
                            className="w-16 h-16 text-4xl text-center font-mono bg-gray-900/80 border-gray-600 focus:border-primary focus:ring-primary"
                            disabled={isSubmitting}
                        />
                    ))}
                </div>
                <Button onClick={handleSubmitGuess} className="w-full" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? '...' : 'تأكيد التخمين'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                    المحاولات المتبقية: {6 - history.length}
                </p>
            </CardContent>
        </Card>
    );
}
