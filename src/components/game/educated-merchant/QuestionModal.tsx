
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

export function QuestionModal({ game, self }: QuestionModalProps) {
    const { toast } = useToast();
    const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_LIMIT);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const question = game.educatedMerchantState?.currentQuestion;

    const handleTimeout = useCallback(async () => {
        if (isSubmitting || submittedAnswer) return;
        setIsSubmitting(true);
        const result = await answerQuestion(game.id, self.id, null); // Null answer for timeout
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    }, [game.id, self.id, isSubmitting, submittedAnswer, toast]);

    useEffect(() => {
        if (submittedAnswer) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [submittedAnswer, handleTimeout]);


    const handleSubmit = async () => {
        if (!selectedAnswer || isSubmitting) return;
        setIsSubmitting(true);
        setSubmittedAnswer(selectedAnswer);
        const result = await answerQuestion(game.id, self.id, selectedAnswer);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
            setIsSubmitting(false); // Allow retry on error
        }
        // No need to set isSubmitting to false on success, as the component will change state
    };
    
    if (!question) return null;

    const getOptionStyle = (option: string) => {
        if (!submittedAnswer) {
            return selectedAnswer === option ? 'border-primary bg-primary/10' : 'border-border bg-transparent';
        }
        if (option === question.correctAnswer) {
            return 'border-green-500 bg-green-500/20 text-green-800 dark:text-green-300';
        }
        if (option === submittedAnswer) {
            return 'border-red-500 bg-red-500/20 text-red-800 dark:text-red-400';
        }
        return 'border-border bg-transparent opacity-50';
    };


    return (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring' }}
            >
                <Card className="w-full max-w-lg shadow-2xl">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="flex items-center gap-2"><HelpCircle /> سؤال التاجر</CardTitle>
                            <div className="flex items-center gap-2 font-mono text-lg font-bold p-2 rounded-lg bg-muted">
                                <Timer className={cn(timeLeft <= 5 && 'text-destructive')} />
                                <span className={cn(timeLeft <= 5 && 'text-destructive animate-pulse')}>{timeLeft}</span>
                            </div>
                        </div>
                        <CardDescription className="text-lg font-semibold pt-4">{question.question}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <RadioGroup
                            value={selectedAnswer || ''}
                            onValueChange={setSelectedAnswer}
                            disabled={!!submittedAnswer}
                            className="space-y-3"
                        >
                            {question.options.map((option, index) => (
                                <Label key={index} htmlFor={`option-${index}`} 
                                    className={cn(
                                        "flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all duration-300",
                                        getOptionStyle(option)
                                    )}
                                >
                                    <RadioGroupItem value={option} id={`option-${index}`} className="w-6 h-6" />
                                    <span className="text-base font-medium flex-grow">{option}</span>
                                     {submittedAnswer && (
                                        <>
                                            {option === question.correctAnswer && <Check className="w-6 h-6 text-green-600" />}
                                            {option === submittedAnswer && option !== question.correctAnswer && <X className="w-6 h-6 text-red-600" />}
                                        </>
                                    )}
                                </Label>
                            ))}
                        </RadioGroup>
                    </CardContent>
                     <CardFooter>
                         <AnimatePresence mode="wait">
                            {!submittedAnswer ? (
                                 <motion.div key="submit" className="w-full">
                                    <Button onClick={handleSubmit} disabled={!selectedAnswer || isSubmitting} className="w-full" size="lg">
                                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإجابة'}
                                    </Button>
                                </motion.div>
                            ) : (
                                <motion.div key="wait" className="w-full text-center p-2 bg-muted rounded-md animate-pulse">
                                    <p>تم تسجيل إجابتك. في انتظار العودة للوحة...</p>
                                </motion.div>
                            )}
                         </AnimatePresence>
                     </CardFooter>
                </Card>
            </motion.div>
        </div>
    );
}
