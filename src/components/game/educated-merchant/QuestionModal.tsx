
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { Game, Player } from '@/types';
import { useState, useEffect } from 'react';
import { answerQuestion } from '@/lib/actions/educated-merchant';
import { Loader2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { handleTimeout } from '@/lib/actions/educated-merchant';
import { motion, AnimatePresence } from 'framer-motion';

const TimerRing = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number, onExpire: () => void }) => {
    const [timeLeft, setTimeLeft] = useState(() => Math.max(0, (expiryTimestamp - Date.now()) / 1000));
    
    useEffect(() => {
        const timer = setInterval(() => {
            const remaining = Math.max(0, (expiryTimestamp - Date.now()) / 1000);
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(timer);
                onExpire();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [expiryTimestamp, onExpire]);

    const circumference = 2 * Math.PI * 45;
    const progress = (timeLeft / 25) * circumference;

    return (
        <div className="relative w-24 h-24">
            <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" className="text-gray-700" strokeWidth="10" fill="transparent" />
                <motion.circle
                    cx="50" cy="50" r="45"
                    className="text-primary"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={progress - circumference}
                    transform="rotate(-90 50 50)"
                    transition={{ duration: 1, ease: "linear" }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-3xl font-mono font-bold">
                {Math.ceil(timeLeft)}
            </div>
        </div>
    );
};

export function QuestionModal({ game, self }: { game: Game; self: Player }) {
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [answerState, setAnswerState] = useState<'pending' | 'correct' | 'incorrect'>('pending');
    
    const question = game.educatedMerchantState?.currentQuestion;
    const isMyQuestion = game.educatedMerchantState?.pendingPurchase?.playerId === self.id;
    const isHost = game.hostId === self.id;

    const onTimeout = () => {
        if (isHost && answerState === 'pending') {
            handleTimeout(game.id, self.id);
        }
    };

    const handleSubmit = async () => {
        if (!selectedAnswer) return;
        setIsSubmitting(true);
        const isCorrect = selectedAnswer === question?.answer;
        setAnswerState(isCorrect ? 'correct' : 'incorrect');

        // Wait a bit to show feedback, then submit
        setTimeout(async () => {
            await answerQuestion(game.id, self.id, selectedAnswer);
            // No need to reset states as the modal will close
        }, 1500); 
    };

    if (!isMyQuestion || !question) return null;
    
    return (
        <Dialog open={true}>
            <DialogContent className="max-w-xl bg-gray-900/80 backdrop-blur-md border-primary/30 text-white" onInteractOutside={(e) => e.preventDefault()}>
                <AnimatePresence>
                    {answerState === 'correct' && (
                         <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1.2 }} className="absolute inset-0 flex items-center justify-center z-20">
                           <Check className="w-48 h-48 text-green-500/50" />
                        </motion.div>
                    )}
                     {answerState === 'incorrect' && (
                         <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center z-20">
                           <X className="w-48 h-48 text-red-500/50" />
                        </motion.div>
                    )}
                </AnimatePresence>
                <DialogHeader className="text-center">
                    {game.educatedMerchantState?.timerEndsAt && answerState === 'pending' && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                            <TimerRing 
                                expiryTimestamp={game.educatedMerchantState.timerEndsAt.toMillis()}
                                onExpire={onTimeout}
                            />
                        </div>
                    )}
                    <DialogTitle className="pt-28 text-2xl">{question.question}</DialogTitle>
                </DialogHeader>
                <motion.div 
                    animate={answerState === 'incorrect' ? { x: [-5, 5, -5, 5, 0] } : {}}
                    transition={{ duration: 0.3 }}
                >
                    <div className="py-4">
                        <RadioGroup value={selectedAnswer || ''} onValueChange={setSelectedAnswer} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {question.options.map((option, i) => (
                                <Label key={i} htmlFor={`option-${i}`} className={cn(
                                    'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                    selectedAnswer === option ? 'border-primary bg-primary/20' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-700/50',
                                    answerState !== 'pending' && option === question.answer && 'border-green-500 bg-green-500/20',
                                    answerState === 'incorrect' && selectedAnswer === option && 'border-red-500 bg-red-500/20'
                                )}>
                                    <RadioGroupItem value={option} id={`option-${i}`} />
                                    <span className="text-base font-semibold">{option}</span>
                                </Label>
                            ))}
                        </RadioGroup>
                    </div>
                </motion.div>
                <Button onClick={handleSubmit} disabled={!selectedAnswer || isSubmitting || answerState !== 'pending'}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإجابة'}
                </Button>
            </DialogContent>
        </Dialog>
    );
}
