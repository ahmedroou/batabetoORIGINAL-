'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Brain, Timer, PenSquare, HelpCircle, Loader2 } from 'lucide-react';
import { handleTimeout } from '@/lib/actions/draw-and-deceive';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';

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

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const ends = state.timerEndsAt?.toMillis();
        if (!ends) return;
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((ends - Date.now())/1000));
            setTimeLeft(remaining);
        }, 1000);
        return () => clearInterval(timer);
    }, [state.timerEndsAt]);
    
    const handleEndTurnByVote = async () => {
        if (isSubmitting) return;
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
        const artist = game.players.find(p => p.id === state.artistId);
        switch(state.phase) {
            case 'drawing':
                return {
                    title: `في انتظار ${artist?.name || 'الفنان'}...`,
                    description: state.correctAnswer ? 'يقوم بالرسم الآن...' : 'يقوم بكتابة وصف الرسمة...',
                    icon: <Brain className="w-16 h-16 text-primary" />
                };
            case 'trapping':
                 const activePlayers = game.players.filter(p => p.status !== 'left' && p.id !== state.artistId);
                 const waitingCount = activePlayers.length - Object.keys(state.playerTraps || {}).length;
                 return {
                    title: 'في انتظار اللاعبين...',
                    description: `يقوم ${waitingCount} لاعبين بوضع فخاخهم.`,
                    icon: <PenSquare className="w-16 h-16 text-primary" />
                };
            case 'guessing':
                const totalGuessers = game.players.filter(p => p.id !== state.artistId).length;
                const guessedCount = Object.keys(state.playerGuesses || {}).length;
                 return {
                    title: 'في انتظار التخمينات...',
                    description: `خمن ${guessedCount} من ${totalGuessers} لاعبين.`,
                    icon: <HelpCircle className="w-16 h-16 text-primary" />
                };
            default:
                return {
                    title: 'في الانتظار...',
                    description: 'يرجى انتظار اكتمال الإجراءات.',
                    icon: <Loader2 className="w-16 h-16 text-primary animate-spin" />
                };
        }
    }, [state.phase, state.artistId, game.players, state.correctAnswer, state.playerTraps, state.playerGuesses]);
    

    return (
        <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <div className="mx-auto mb-4">{phaseDetails.icon}</div>
                <CardTitle className="text-2xl">{phaseDetails.title}</CardTitle>
                <CardDescription>{phaseDetails.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-2 font-mono text-xl">
                    <Timer /> {timeLeft > 0 ? `${timeLeft}s` : "انتهى الوقت"}
                </div>
                {timeLeft === 0 && (
                    <div className="p-4 border-t space-y-3">
                        <p className="text-sm text-muted-foreground">انتهى الوقت المخصص لهذه المرحلة!</p>
                        <div className="flex justify-center gap-2">
                           <Button onClick={handleEndTurnByVote} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin"/> : 'تجاوز المرحلة'}
                           </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
