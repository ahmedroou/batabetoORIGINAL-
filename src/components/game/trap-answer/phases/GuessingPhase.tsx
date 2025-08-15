
'use client';

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { submitGuess } from '@/lib/actions/trap-answer/actions';
import { useToast } from '@/hooks/use-toast';
import { CountdownTimer } from '@/components/game/CountdownTimer';

interface GuessingPhaseProps {
    game: Game;
    self: Player;
}

export default function GuessingPhase({ game, self }: GuessingPhaseProps) {
    const { toast } = useToast();
    const [selectedGuess, setSelectedGuess] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const hasGuessed = !!game.trapAnswerState?.playerGuesses?.[self.id];
    const answers = game.trapAnswerState?.shuffledAnswers || [];

    const handleSubmit = async () => {
        if (!selectedGuess) return;
        setIsSubmitting(true);
        try {
            await submitGuess(game.id, self.id, selectedGuess);
        } catch (error: any) {
            toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-2xl text-center">
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
                    {hasGuessed ? 'تم تسجيل تخمينك. في انتظار الآخرين...' : 'اختر الإجابة التي تعتقد أنها الصحيحة.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
                {answers.map((answer) => (
                    <Button
                        key={answer}
                        variant={selectedGuess === answer ? 'default' : 'outline'}
                        onClick={() => setSelectedGuess(answer)}
                        disabled={hasGuessed || isSubmitting}
                        className="h-auto py-4 text-lg whitespace-normal"
                    >
                        {answer}
                    </Button>
                ))}
            </CardContent>
            {!hasGuessed && (
                <CardFooter>
                    <Button onClick={handleSubmit} disabled={!selectedGuess || isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد التخمين'}
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
