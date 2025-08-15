
'use client';

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { submitTrapAnswer } from '@/lib/actions/trap-answer/actions';
import { useToast } from '@/hooks/use-toast';
import { CountdownTimer } from '@/components/game/CountdownTimer';

interface AnswerSubmissionPhaseProps {
    game: Game;
    self: Player;
}

export default function AnswerSubmissionPhase({ game, self }: AnswerSubmissionPhaseProps) {
    const { toast } = useToast();
    const [trapAnswer, setTrapAnswer] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const hasSubmitted = !!game.trapAnswerState?.playerAnswers?.[self.id];

    const handleSubmit = async () => {
        if (!trapAnswer.trim()) return;
        setIsSubmitting(true);
        try {
            await submitTrapAnswer(game.id, self.id, trapAnswer);
        } catch (error: any) {
            toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Card className="w-full max-w-xl text-center">
            {game.trapAnswerState?.timerEndsAt && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer
                        gameId={game.id}
                        gameType='trap-answer'
                        expiryTimestamp={game.trapAnswerState.timerEndsAt.toMillis()}
                        selfId={self.id}
                        isHost={game.hostId === self.id}
                    />
                </div>
            )}
            <CardHeader>
                <CardTitle>{game.trapAnswerState?.currentQuestion?.question}</CardTitle>
                <CardDescription>
                    {hasSubmitted ? 'تم إرسال إجابتك. في انتظار بقية اللاعبين...' : 'اكتب إجابة خاطئة لكن قابلة للتصديق لخداع الآخرين!'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Textarea
                    value={trapAnswer}
                    onChange={(e) => setTrapAnswer(e.target.value)}
                    placeholder="اكتب فخك هنا..."
                    disabled={hasSubmitted || isSubmitting}
                />
            </CardContent>
            <CardFooter>
                <Button onClick={handleSubmit} disabled={hasSubmitted || isSubmitting || !trapAnswer.trim()} className="w-full">
                    {isSubmitting ? <Loader2 className="animate-spin" /> : hasSubmitted ? 'تم الإرسال' : 'إرسال الجواب'}
                </Button>
            </CardFooter>
        </Card>
    );
}
