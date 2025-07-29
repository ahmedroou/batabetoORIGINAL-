
"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import type { Game, Player, PlayerRole, NightAction } from '@/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Moon, Timer, Loader2 } from "lucide-react";
import * as killerActions from "@/lib/actions/killer";
import { NightActionModal } from './NightActionModal';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';

interface NightPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
}

export function NightPhase({ game, self, isHost }: NightPhaseProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showNightActionModal, setShowNightActionModal] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const hasPlayerActed = useMemo(() => !!game.nightActions?.[self.id], [game.nightActions, self.id]);
    const canPlayerAct = useMemo(() => self.status === 'alive' && self.role !== 'civilian' && self.role !== 'soldier' && self.role !== 'contestant', [self]);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
    
        let phaseEndTime: number | undefined;
        if (game.discussionEndsAt) {
            phaseEndTime = game.discussionEndsAt instanceof Timestamp 
                ? game.discussionEndsAt.toMillis() 
                : new Date(game.discussionEndsAt as any).getTime();
        }
    
        if (phaseEndTime) {
            const updateTimer = () => {
                const remaining = Math.round((phaseEndTime! - Date.now()) / 1000);
                if (remaining <= 0) {
                    setTimeLeft(0);
                    if (timerRef.current) clearInterval(timerRef.current);
                    if (isHost) {
                        killerActions.progressToDiscussion(game.id, self.id).catch(e => console.error("Error progressing to discussion automatically:", e));
                    }
                } else {
                    setTimeLeft(remaining);
                }
            };
    
            timerRef.current = setInterval(updateTimer, 1000);
            updateTimer();
        } else {
            setTimeLeft(0);
        }
    
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [game.discussionEndsAt, game.id, self.id, isHost]);
    
    const handleEndNightEarly = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await killerActions.progressToDiscussion(game.id, self.id);
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Card className="w-full max-w-md animate-pop-in text-center">
                <CardHeader>
                    <Moon className="w-20 h-20 mx-auto text-indigo-400" />
                    <CardTitle className="text-3xl">حل الظلام</CardTitle>
                    <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-muted">
                        <Timer className="w-6 h-6"/>
                        <span className={cn("font-bold text-lg", timeLeft < 10 && "text-destructive")}>
                            {timeLeft > 0 ? `الوقت المتبقي: ${timeLeft}` : "انتهى الوقت!"}
                        </span>
                    </div>
                    <CardDescription>
                        {self.status === 'alive' 
                            ? (hasPlayerActed ? 'لقد قمت بإجراءك. في انتظار بقية اللاعبين...' : 'الوقت مناسب لاستخدام قدراتك الخاصة.')
                            : 'أنت خارج اللعبة، ولكن يمكنك مشاهدة الأحداث تتكشف.'
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {canPlayerAct && (
                        <Button onClick={() => setShowNightActionModal(true)} disabled={hasPlayerActed} className="w-full" size="lg">
                            {hasPlayerActed ? 'تم استخدام القدرة' : 'استخدم قدرتك'}
                        </Button>
                    )}
                    {!canPlayerAct && self.status === 'alive' && <p className="text-muted-foreground">ليس لديك قدرة خاصة. انتظر شروق الشمس.</p>}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    {isHost && (
                        <Button onClick={handleEndNightEarly} disabled={isSubmitting} className="w-full">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'إنهاء الليل'}
                        </Button>
                    )}
                </CardFooter>
            </Card>

            {canPlayerAct && (
                 <NightActionModal 
                    game={game} 
                    self={self} 
                    isOpen={showNightActionModal} 
                    onClose={() => setShowNightActionModal(false)}
                 />
            )}
        </>
    );
}
