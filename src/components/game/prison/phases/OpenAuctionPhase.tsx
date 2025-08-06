
"use client";

import type { Game, Player } from '@/types';
import { CountdownTimer } from '../CountdownTimer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import * as prisonActions from '@/lib/actions/prison';

interface OpenAuctionPhaseProps {
    game: Game;
    self: Player;
}

export function OpenAuctionPhase({ game, self }: OpenAuctionPhaseProps) {
    const [liveAnswerInput, setLiveAnswerInput] = useState('');
    const [liveAnswersList, setLiveAnswersList] = useState<string[]>(
        game.prisonState?.playerProgress?.[self.id]?.answers || []
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const isHost = game.hostId === self.id;

    const hasSubmitted = !!game.prisonState?.openAuctionSubmissions?.[self.id];
    const isTimeUp = !game.prisonState?.timerEndsAt || Date.now() > game.prisonState.timerEndsAt.toMillis();
    
    const handleAnswerSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!liveAnswerInput.trim() || isTimeUp) return;
        const newAnswers = [...liveAnswersList, liveAnswerInput.trim()];
        setLiveAnswersList(newAnswers);
        setLiveAnswerInput('');
        prisonActions.updateOpenAuctionProgress(game.id, self.id, newAnswers);
    };
    
    const removeAnswer = (indexToRemove: number) => {
        if(isTimeUp) return;
        const newAnswers = liveAnswersList.filter((_, index) => index !== indexToRemove);
        setLiveAnswersList(newAnswers);
        prisonActions.updateOpenAuctionProgress(game.id, self.id, newAnswers);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAnswerSubmit(e);
    };

    return (
        <Card className="w-full max-w-lg relative animate-pop-in">
            {game.prisonState?.timerEndsAt && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer 
                        gameId={game.id}
                        expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                        selfId={self.id}
                        isHost={isHost}
                    />
                </div>
            )}
            <CardHeader className="text-center pt-20">
                <CardTitle>سؤال المزاد المفتوح</CardTitle>
                <CardDescription className="text-xl font-bold pt-2">{game.prisonState?.currentQuestion?.text}</CardDescription>
            </CardHeader>
            <CardContent>
                {hasSubmitted ? (
                    <div className="text-center p-4 rounded-lg bg-green-100 text-green-800">
                        <p className="font-semibold">تم إرسال إجابتك! في انتظار بقية اللاعبين...</p>
                    </div>
                ) : isTimeUp ? (
                     <div className="text-center p-4 rounded-lg bg-yellow-100 text-yellow-800">
                        <p className="font-semibold">انتهى الوقت! جاري الانتقال لمرحلة الحكم...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Input 
                                placeholder='اكتب إجابة...'
                                value={liveAnswerInput}
                                onChange={(e) => setLiveAnswerInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isSubmitting || isTimeUp}
                            />
                            <Button type="button" onClick={handleAnswerSubmit} disabled={isSubmitting || !liveAnswerInput.trim() || isTimeUp}>إضافة</Button>
                        </div>
                        <ScrollArea className="h-48 p-2 border rounded-md bg-muted/50">
                            {liveAnswersList.length > 0 ? (
                                <div className='space-y-2'>
                                {liveAnswersList.map((answer, index) => (
                                    <div key={index} className="flex justify-between items-center p-2 bg-background rounded-md">
                                        <span className='font-semibold'>{answer}</span>
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAnswer(index)} disabled={isTimeUp}>
                                            <Trash2 className="w-4 h-4"/>
                                        </Button>
                                    </div>
                                ))}
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground pt-4">قائمة إجاباتك فارغة.</p>
                            )}
                        </ScrollArea>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
