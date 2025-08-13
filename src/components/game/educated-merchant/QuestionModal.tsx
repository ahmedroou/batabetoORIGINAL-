
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { Game, Player } from '@/types';
import { useState, useEffect, useCallback } from 'react';
import { answerQuestion } from '@/lib/actions/educated-merchant';
import { Loader2, Check, X, HelpCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { CountdownTimer } from '@/components/game/CountdownTimer';

export function QuestionModal({ game, self }: { game: Game; self: Player }) {
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [answerState, setAnswerState] = useState<'pending' | 'correct' | 'incorrect'>('pending');
    
    const question = game.educatedMerchantState?.currentQuestion;
    const pendingPurchase = game.educatedMerchantState?.pendingPurchase;
    const pendingFine = game.educatedMerchantState?.pendingFine;
    
    const isMyTurnToAnswer = pendingPurchase?.playerId === self.id || pendingFine?.playerId === self.id;
    const isOpen = game.gameState === 'question';

    const isHost = game.hostId === self.id;
    const isFineQuestion = !!pendingFine;

    useEffect(() => {
        if (isOpen && isMyTurnToAnswer) {
            setSelectedAnswer(null);
            setIsSubmitting(false);
            setAnswerState('pending');
        }
    }, [isOpen, isMyTurnToAnswer, question?.id]);

    const handleSubmit = async () => {
        if (!selectedAnswer || !question || !isMyTurnToAnswer) return;
        setIsSubmitting(true);
        const isCorrect = selectedAnswer === question.answer;
        setAnswerState(isCorrect ? 'correct' : 'incorrect');

        setTimeout(async () => {
            try {
                await answerQuestion(game.id, self.id, selectedAnswer);
            } catch (error) {
                // If the server-side action fails, revert the state
                console.error("Failed to submit answer:", error);
                setAnswerState('pending');
                setIsSubmitting(false);
            }
        }, 1500); 
    };

    if (!isOpen || (!pendingPurchase && !pendingFine) || !question) return null;
    
    const playerOnQuestion = game.players.find(p => p.id === (pendingPurchase?.playerId || pendingFine?.playerId));

    return (
        <Dialog open={isOpen}>
            <DialogContent className="max-w-xl bg-gray-900/80 backdrop-blur-md border-primary/30 text-white" onInteractOutside={(e) => e.preventDefault()}>
                <AnimatePresence>
                    {answerState === 'correct' && isMyTurnToAnswer && (
                         <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1.2 }} className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                           <Check className="w-48 h-48 text-green-500/50" />
                        </motion.div>
                    )}
                     {answerState === 'incorrect' && isMyTurnToAnswer && (
                         <motion.div initial={{ opacity: 0, rotate: -30, scale: 0.8 }} animate={{ opacity: 1, rotate: 0, scale: 1.2 }} className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                           <X className="w-48 h-48 text-red-500/50" />
                        </motion.div>
                    )}
                </AnimatePresence>
                 {game.educatedMerchantState?.timerEndsAt && answerState === 'pending' && isMyTurnToAnswer && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            gameId={game.id}
                            gameType='educated-merchant'
                            expiryTimestamp={game.educatedMerchantState.timerEndsAt.toMillis()}
                            selfId={self.id}
                            isHost={isHost}
                        />
                    </div>
                 )}
                <DialogHeader className="text-center pt-12 md:pt-20">
                     {isFineQuestion ? <AlertTriangle className="w-12 h-12 mx-auto text-red-400"/> : <HelpCircle className="w-12 h-12 mx-auto text-primary" />}
                    <DialogTitle className="text-2xl">{isFineQuestion ? 'سؤال الغرامة!' : question.question}</DialogTitle>
                     {isFineQuestion && <p className="text-yellow-300 font-bold">أجب بشكل صحيح لتنجو من الغرامة!</p>}
                    {!isMyTurnToAnswer && (
                        <DialogDescription className="text-base text-yellow-300 animate-pulse">
                            في انتظار {playerOnQuestion?.name || 'اللاعب'} للإجابة...
                        </DialogDescription>
                    )}
                </DialogHeader>
                
                {isMyTurnToAnswer && (
                    <motion.div 
                        animate={answerState === 'incorrect' ? { x: [-5, 5, -5, 5, 0] } : {}}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="py-4">
                            <RadioGroup value={selectedAnswer || ''} onValueChange={setSelectedAnswer} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {question.options.map((option, i) => (
                                    <Label key={i} htmlFor={`option-${i}`} className={cn(
                                        'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                        'disabled:cursor-not-allowed disabled:opacity-50',
                                        answerState !== 'pending' ? 'pointer-events-none opacity-50' : '',
                                        selectedAnswer === option ? 'border-primary bg-primary/20' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-700/50',
                                        // When showing feedback, only highlight the selected answer
                                        answerState === 'incorrect' && selectedAnswer === option && 'border-red-500 bg-red-500/20',
                                        // Do not reveal the correct answer if another option was chosen
                                        answerState === 'correct' && selectedAnswer === option && 'border-green-500 bg-green-500/20'
                                    )}>
                                        <RadioGroupItem value={option} id={`option-${i}`} disabled={answerState !== 'pending'}/>
                                        <span className="text-base font-semibold">{option}</span>
                                    </Label>
                                ))}
                            </RadioGroup>
                        </div>
                        <Button onClick={handleSubmit} disabled={!selectedAnswer || isSubmitting || answerState !== 'pending'} className="w-full">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإجابة'}
                        </Button>
                    </motion.div>
                )}
            </DialogContent>
        </Dialog>
    );
}
