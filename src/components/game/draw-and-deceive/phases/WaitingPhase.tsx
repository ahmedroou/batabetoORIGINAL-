'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Brain, Timer, UserX, PenSquare, HelpCircle } from 'lucide-react';
import { handleTimeout } from '@/lib/actions/draw-and-deceive';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface WaitingPhaseProps {
    game: Game;
    self: Player;
}

export function WaitingPhase({ game, self }: WaitingPhaseProps) {
    const state = game.drawAndDeceiveState!;
    const [timeLeft, setTimeLeft] = useState(() => {
        const ends = state.timerEndsAt?.toMillis();
        return ends ? Math.max(0, Math.round((ends - Date.now()) / 1000)) : 0;
    });

    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const ends = state.timerEndsAt?.toMillis();
        if (!ends) return;
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((ends - Date.now()) / 1000));
            setTimeLeft(remaining);
        }, 1000);
        return () => clearInterval(timer);
    }, [state.timerEndsAt]);
    
    const handleEndTurnByVote = async () => {
        if (!isHost || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await handleTimeout(game.id, self.id);
        } catch(e: any) {
            console.error("Failed to end turn", e.message);
        } finally {
            setIsSubmitting(false);
        }
    }

    const phaseDetails = useMemo(() => {
        switch(state.phase) {
            case 'drawing':
                const artist = game.players.find(p => p.id === state.artistId);
                return {
                    title: `في انتظار ${artist?.name || 'الفنان'}...`,
                    description: 'يقوم بكتابة وصف الرسمة...',
                    icon: <Brain className="w-16 h-16 text-primary" />
                };
            case 'trapping':
                 return {
                    title: 'في انتظار اللاعبين...',
                    description: 'يقوم اللاعبون الآخرون بوضع فخاخهم.',
                    icon: <PenSquare className="w-16 h-16 text-primary" />
                };
            case 'guessing':
                 return {
                    title: 'في انتظار التخمينات...',
                    description: 'يقوم اللاعبون باختيار تخميناتهم.',
                    icon: <HelpCircle className="w-16 h-16 text-primary" />
                };
            default:
                return {
                    title: 'في الانتظار...',
                    description: 'يرجى انتظار اكتمال الإجراءات.',
                    icon: <Loader2 className="w-16 h-16 text-primary animate-spin" />
                };
        }
    }, [state.phase, state.artistId, game.players]);
    

    return (
        <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <div className="mx-auto mb-4">{phaseDetails.icon}</div>
                <CardTitle className="text-2xl">{phaseDetails.title}</CardTitle>
                <CardDescription>{phaseDetails.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-2 font-mono text-xl">
                    <Timer /> {timeLeft}s
                </div>
                {isHost && timeLeft === 0 && (
                    <div className="p-4 border-t space-y-3">
                        <p className="text-sm text-muted-foreground">انتهى وقت اللاعب الحالي!</p>
                        <div className="flex justify-center gap-2">
                           <Button onClick={handleEndTurnByVote} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin"/> : 'إنهاء دوره'}
                           </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
