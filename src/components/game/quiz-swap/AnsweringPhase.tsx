
'use client';

import React, { useState, useEffect } from 'react';
import type { Game, Player, QuizSwapQuestionCard } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Timer, HelpCircle } from 'lucide-react';
import { submitAnswer } from '@/lib/actions/quizswap';
import { QUIZ_SWAP_DECK_MAP } from '@/data/quiz-swap-cards';

interface AnsweringPhaseProps {
    game: Game;
    self: Player;
}

export function AnsweringPhase({ game, self }: AnsweringPhaseProps) {
    const { toast } = useToast();
    const state = game.quizSwapState!;
    const isMyTurn = state.currentPlayerAnswering === self.id;

    const selfState = state.players.find(p => p.id === self.id)!;
    const questionsToAnswer = selfState.hand
        .map(cid => QUIZ_SWAP_DECK_MAP.get(cid))
        .filter((c): c is QuizSwapQuestionCard => !!c && c.kind === 'question');

    const currentQuestionIndex = state.currentQuestionIndex || 0;
    const currentQuestion = questionsToAnswer[currentQuestionIndex];
    
    const [answer, setAnswer] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(state.settings.answerSeconds);

    useEffect(() => {
        if(!isMyTurn) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    // Handle timeout
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isMyTurn, currentQuestionIndex]);

    const handleAnswerSubmit = async () => {
        if (!currentQuestion) return;
        setIsSubmitting(true);
        try {
            await submitAnswer(game.id, self.id, currentQuestion.id, answer);
            setAnswer('');
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if(!isMyTurn) {
        return (
             <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>مرحلة الإجابة</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="animate-pulse">في انتظار {state.players.find(p => p.id === state.currentPlayerAnswering)?.name} للإجابة على أسئلته...</p>
                </CardContent>
            </Card>
        )
    }
    
    if(!currentQuestion) {
        return (
             <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>مرحلة الإجابة</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>لقد أجبت على جميع أسئلتك! في انتظار اللاعبين الآخرين.</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="w-full max-w-2xl text-center">
                <CardHeader>
                    <HelpCircle className="w-16 h-16 mx-auto text-primary" />
                    <CardTitle className="text-3xl">أجب على السؤال</CardTitle>
                    <CardDescription className="text-xl font-bold pt-2">{currentQuestion.question}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-center items-center gap-2 text-lg">
                        <Timer />
                        <span>{timeLeft}</span>
                    </div>
                    <div className="flex gap-2">
                        <Input 
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder="اكتب إجابتك هنا..."
                            disabled={isSubmitting}
                        />
                        <Button onClick={handleAnswerSubmit} disabled={isSubmitting || !answer.trim()}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "إرسال"}
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">السؤال {currentQuestionIndex + 1} من {questionsToAnswer.length}</p>
                </CardContent>
            </Card>
        </motion.div>
    );
}
