
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CountdownTimer } from '../CountdownTimer';
import type { Game, Player } from '@/types';
import { useState } from 'react';
import { answerQuestion } from '@/lib/actions/educated-merchant';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { handleTimeout } from '@/lib/actions/educated-merchant';

export function QuestionModal({ game, self }: { game: Game; self: Player }) {
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const question = game.educatedMerchantState?.currentQuestion;
    const isMyQuestion = game.educatedMerchantState?.pendingPurchase?.playerId === self.id;
    const isHost = game.hostId === self.id;

    if (!isMyQuestion || !question) return null;

    const handleSubmit = async () => {
        if (!selectedAnswer) return;
        setIsSubmitting(true);
        await answerQuestion(game.id, self.id, selectedAnswer);
        setIsSubmitting(false);
    };

    const onTimeout = () => {
        if (isHost) {
            handleTimeout(game.id, self.id);
        }
    };
    
    return (
        <Dialog open={true}>
            <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader className="text-center">
                    {game.educatedMerchantState?.timerEndsAt && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                            <CountdownTimer 
                                expiryTimestamp={game.educatedMerchantState.timerEndsAt.toMillis()}
                                onExpire={onTimeout}
                            />
                        </div>
                    )}
                    <DialogTitle className="pt-12 text-2xl">{question.question}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <RadioGroup value={selectedAnswer || ''} onValueChange={setSelectedAnswer} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {question.options.map((option, i) => (
                            <Label key={i} htmlFor={`option-${i}`} className={cn(
                                'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                selectedAnswer === option ? 'border-primary bg-primary/10' : 'border-border bg-muted/50'
                            )}>
                                <RadioGroupItem value={option} id={`option-${i}`} />
                                <span className="text-base font-semibold">{option}</span>
                            </Label>
                        ))}
                    </RadioGroup>
                </div>
                <Button onClick={handleSubmit} disabled={!selectedAnswer || isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإجابة'}
                </Button>
            </DialogContent>
        </Dialog>
    );
}
