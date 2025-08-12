// .
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Game, Player, EducatedMerchantQuestion } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Loader2, Timer, HelpCircle, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { answerQuestion } from '@/lib/actions/educated-merchant';

interface QuestionModalProps {
    game: Game;
    self: Player;
}

const QUESTION_TIME_LIMIT = 25;


const SpectatorView = ({ questionText, activePlayerName }: { questionText: string, activePlayerName: string }) => (
    <Card className="w-full max-w-lg mx-auto shadow-2xl bg-gray-900/80 text-white border-purple-500/50 backdrop-blur-sm">
        <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2"><HelpCircle /> سؤال التاجر للاعب</CardTitle>
            <CardDescription className="text-2xl font-bold pt-2 text-purple-300">{activePlayerName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
            <p className="text-lg font-semibold p-4 bg-black/30 rounded-lg">{questionText}</p>
            <div className="flex items-center justify-center gap-2 text-yellow-400 animate-pulse">
                <Loader2 className="w-5 h-5 animate-spin" />
                <p>في انتظار إجابة اللاعب...</p>
            </div>
        </CardContent>
    </Card>
);

export function QuestionModal({ game, self }: QuestionModalProps) {
    const { toast } = useToast();
    const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_LIMIT);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const question = game.educatedMerchantState?.currentQuestion;
    const isMyTurn = game.educatedMerchantState?.turnOrder[game.educatedMerchantState.currentTurnIndex] === self.id;
    
    const handleTimeout = useCallback(async () => {
        if (isSubmitting || submittedAnswer || !isMyTurn) return;
        setIsSubmitting(true);
        setSubmittedAnswer('__TIMEOUT__');
        const result = await answerQuestion(game.id, self.id, null);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
    }, [game.id, self.id, isSubmitting, submittedAnswer, toast, isMyTurn]);

    useEffect(() => {
        if (!isMyTurn || submittedAnswer || !game.educatedMerchantState?.timerEndsAt) return;

        const endTime = game.educatedMerchantState.timerEndsAt.toMillis();
        
        const updateTimer = () => {
            const remaining = Math.round((endTime - Date.now()) / 1000);
            if (remaining <= 0) {
                 setTimeLeft(0);
                 handleTimeout();
            } else {
                 setTimeLeft(remaining);
            }
        };
        
        const timer = setInterval(updateTimer, 1000);
        updateTimer();
        
        return () => clearInterval(timer);
    }, [submittedAnswer, game.educatedMerchantState?.timerEndsAt, handleTimeout, isMyTurn]);


    const handleSubmit = async () => {
        if (!selectedAnswer || isSubmitting || !isMyTurn) return;
        setIsSubmitting(true);
        setSubmittedAnswer(selectedAnswer);
        const result = await answerQuestion(game.id, self.id, selectedAnswer);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
            setIsSubmitting(false);
        }
    };
    
    if (!question) return null;
    
    // --- Spectator View ---
    if (!isMyTurn) {
        const activePlayerId = game.educatedMerchantState?.turnOrder[game.educatedMerchantState.currentTurnIndex];
        const activePlayer = game.players.find(p => p.id === activePlayerId);
        return (
            <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                 <motion.div
                    className="w-full"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring' }}
                >
                    <SpectatorView questionText={question.question} activePlayerName={activePlayer?.name || '...'} />
                </motion.div>
            </div>
        );
    }
    
    // --- Active Player View ---
    const getOptionStyle = (option: string) => {
        if (!submittedAnswer) {
            return selectedAnswer === option ? 'border-primary bg-primary/10' : 'border-border bg-transparent hover:bg-muted/50';
        }
        if (option === submittedAnswer) {
            return answerIsCorrect(option) ? 'border-green-500 bg-green-500/20 text-green-800 dark:text-green-300' : 'border-red-500 bg-red-500/20 text-red-800 dark:text-red-400';
        }
        return 'border-border bg-transparent opacity-50';
    };

    const answerIsCorrect = (answer: string) => answer === question.correctAnswer;


    return (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
                className="w-full"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring' }}
            >
                <Card className="w-full max-w-lg mx-auto shadow-2xl">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="flex items-center gap-2"><HelpCircle /> سؤال التاجر</CardTitle>
                             <div className="relative w-16 h-16">
                                <motion.div
                                    className="absolute inset-0"
                                >
                                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                        <circle cx="50" cy="50" r="45" stroke="hsl(var(--muted))" strokeWidth="10" fill="transparent" />
                                        <motion.circle cx="50" cy="50" r="45" stroke="hsl(var(--primary))" strokeWidth="10" fill="transparent"
                                            strokeDasharray="282.74"
                                            initial={{ pathLength: 1 }}
                                            animate={{ pathLength: timeLeft / QUESTION_TIME_LIMIT }}
                                            transition={{ duration: 1, ease: 'linear' }}
                                        />
                                    </svg>
                                </motion.div>
                                <div className="absolute inset-0 flex items-center justify-center text-xl font-bold font-mono text-foreground">
                                    {timeLeft}
                                </div>
                            </div>
                        </div>
                        <CardDescription className="text-lg font-semibold pt-4">{question.question}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <RadioGroup
                            value={selectedAnswer || ''}
                            onValueChange={setSelectedAnswer}
                            disabled={!!submittedAnswer}
                            className="grid grid-cols-1 md:grid-cols-2 gap-3"
                        >
                            {question.options.map((option, index) => (
                                <Label key={index} htmlFor={`option-${index}`} 
                                    className={cn(
                                        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all duration-300",
                                        getOptionStyle(option)
                                    )}
                                >
                                    <RadioGroupItem value={option} id={`option-${index}`} className="w-5 h-5 mt-1 shrink-0" />
                                    <span className="text-base font-medium flex-grow">{option}</span>
                                     {submittedAnswer && selectedAnswer === option && (
                                        <div className="shrink-0">
                                            {answerIsCorrect(option) ? <Check className="w-6 h-6 text-green-600" /> : <X className="w-6 h-6 text-red-600" />}
                                        </div>
                                    )}
                                </Label>
                            ))}
                        </RadioGroup>
                    </CardContent>
                     <CardFooter>
                         <AnimatePresence mode="wait">
                            {!submittedAnswer ? (
                                 <motion.div key="submit" className="w-full" initial={{opacity: 0}} animate={{opacity: 1}}>
                                    <Button onClick={handleSubmit} disabled={!selectedAnswer || isSubmitting} className="w-full" size="lg">
                                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإجابة'}
                                    </Button>
                                </motion.div>
                            ) : (
                                <motion.div key="wait" className="w-full text-center p-2 bg-muted rounded-md" initial={{opacity: 0}} animate={{opacity: 1}}>
                                    <p className="font-bold animate-pulse">
                                         {submittedAnswer === '__TIMEOUT__' ? "انتهى الوقت!" : (answerIsCorrect(submittedAnswer) ? "إجابة صحيحة!" : "إجابة خاطئة!")}
                                         {' '}جاري العودة للوحة...
                                    </p>
                                </motion.div>
                            )}
                         </AnimatePresence>
                     </CardFooter>
                </Card>
            </motion.div>
        </div>
    );
}
