
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Brain, Timer, UserX } from 'lucide-react';
import { endArtistTurn, kickArtistForInactivity } from '@/lib/actions/draw-and-deceive';

interface WaitingPhaseProps {
    game: Game;
    self: Player;
}

export function WaitingPhase({ game, self }: WaitingPhaseProps) {
    const state = game.drawAndDeceiveState!;
    const [isSubmitting, setIsSubmitting] = useState<'end' | 'kick' | false>(false);
    const [timeLeft, setTimeLeft] = useState(() => {
        const ends = state.timerEndsAt?.toMillis();
        return ends ? Math.max(0, Math.round((ends - Date.now()) / 1000)) : 0;
    });

    const artist = useMemo(() => game.players.find(p => p.id === state.artistId), [game.players, state.artistId]);

    useEffect(() => {
        const ends = state.timerEndsAt?.toMillis();
        if (!ends) return;
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((ends - Date.now()) / 1000));
            setTimeLeft(remaining);
        }, 1000);
        return () => clearInterval(timer);
    }, [state.timerEndsAt]);

    const handleEndTurn = async () => {
        setIsSubmitting('end');
        try {
            await endArtistTurn(game.id, self.id);
        } catch(e) {
            // handle error with toast if available
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleKickArtist = async () => {
        setIsSubmitting('kick');
        try {
            await kickArtistForInactivity(game.id, self.id);
        } catch(e) {
            // handle error
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                    <Brain className="w-8 h-8 text-primary"/>
                    في انتظار الفنان
                </CardTitle>
                <CardDescription>
                    يقوم {artist?.name || 'الفنان'} حاليًا بالرسم. استعد لوضع فخك!
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-2 font-mono text-xl">
                    <Timer/> {timeLeft}s
                </div>
                
                {timeLeft === 0 && (
                    <div className="p-4 border-t space-y-3">
                        <p className="text-sm text-muted-foreground">انتهى وقت الفنان!</p>
                        <div className="flex justify-center gap-2">
                            <Button onClick={handleEndTurn} disabled={!!isSubmitting}>
                                {isSubmitting === 'end' ? <Loader2 className="animate-spin"/> : 'إنهاء دوره (حفظ الرسمة)'}
                            </Button>
                            <Button variant="destructive" onClick={handleKickArtist} disabled={!!isSubmitting}>
                                {isSubmitting === 'kick' ? <Loader2 className="animate-spin"/> : <UserX/>} طرد الفنان
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

