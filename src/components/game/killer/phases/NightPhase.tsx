

"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Game, Player } from '@/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Moon, Timer, Loader2 } from "lucide-react";
import * as killerActions from "@/lib/actions/killer";
import { NightActionModal } from './NightActionModal';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';

const Star = () => (
    <motion.div
        className="absolute bg-white rounded-full"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1, 0.5, 1], opacity: [0, 1, 0.8, 1] }}
        exit={{ scale: 0, opacity: 0 }}
        style={{
            width: Math.random() * 2 + 1,
            height: Math.random() * 2 + 1,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
        }}
        transition={{
            duration: Math.random() * 2 + 2,
            repeat: Infinity,
            repeatType: 'reverse'
        }}
    />
);

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
    const actionCalled = useRef(false);

    const hasPlayerActed = useMemo(() => !!game.nightActions?.[self.id], [game.nightActions, self.id]);
    const canPlayerAct = useMemo(() => self.status === 'alive' && self.role !== 'civilian' && self.role !== 'soldier' && self.role !== 'contestant', [self]);

    const handleTimeout = useCallback(() => {
        if (isHost && !actionCalled.current) {
            actionCalled.current = true;
            killerActions.handleTimeout(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);


    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        actionCalled.current = false;
    
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
                    handleTimeout();
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
    }, [game.discussionEndsAt, handleTimeout]);
    
    return (
        <>
            <div className="absolute inset-0 z-0 overflow-hidden">
                {[...Array(50)].map((_, i) => <Star key={i} />)}
            </div>
            <Card className="w-full max-w-md animate-pop-in text-center bg-slate-900/70 backdrop-blur-sm border-slate-700 text-white z-10">
                <CardHeader>
                    <Moon className="w-20 h-20 mx-auto text-indigo-300 drop-shadow-[0_0_15px_rgba(165,180,252,0.5)]" />
                    <CardTitle className="text-3xl">حل الظلام</CardTitle>
                    <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-slate-800/50">
                        <Timer className="w-6 h-6"/>
                        <span className={cn("font-bold text-lg", timeLeft < 10 && "text-destructive")}>
                            {timeLeft > 0 ? `الوقت المتبقي: ${timeLeft}` : "انتهى الوقت!"}
                        </span>
                    </div>
                    <CardDescription className="text-slate-400">
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
                    {!canPlayerAct && self.status === 'alive' && <p className="text-slate-400">ليس لديك قدرة خاصة. انتظر شروق الشمس.</p>}
                </CardContent>
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
