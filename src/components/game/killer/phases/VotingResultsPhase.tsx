
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Game } from '@/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Gavel, Loader2, ArrowRight, Timer } from 'lucide-react';
import * as killerActions from "@/lib/actions/killer";
import { useToast } from "@/hooks/use-toast";
import { Timestamp } from 'firebase/firestore';

interface VotingResultsPhaseProps {
    game: Game;
    isHost: boolean;
}

export function VotingResultsPhase({ game, isHost }: VotingResultsPhaseProps) {
    const { toast } = useToast();
    const { wasTie, message, eliminatedPlayerRole } = game.lastVoteResult || {};
    const [timeLeft, setTimeLeft] = useState(5);
    const actionCalled = useRef(false);

    const handleTimeout = useCallback(() => {
        if(isHost && !actionCalled.current) {
            actionCalled.current = true;
            killerActions.handleTimeout(game.id, game.hostId);
        }
    }, [isHost, game.id, game.hostId]);


    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        actionCalled.current = false;
        if (game.discussionEndsAt) { // Using discussionEndsAt to store timer for this phase
            const endTime = game.discussionEndsAt instanceof Timestamp ? game.discussionEndsAt.toMillis() : new Date(game.discussionEndsAt as any).getTime();
            const updateTimer = () => {
                const remaining = Math.round((endTime - Date.now()) / 1000);
                setTimeLeft(Math.max(0, remaining));
                if (remaining <= 0) {
                    if (timer) clearInterval(timer);
                    handleTimeout();
                }
            };
            timer = setInterval(updateTimer, 1000);
            updateTimer();
        }
        return () => { if (timer) clearInterval(timer) };
    }, [game.discussionEndsAt, handleTimeout]);


    return (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="w-full max-w-md animate-pop-in text-center">
                <CardHeader>
                    <Gavel className="w-20 h-20 mx-auto text-primary"/>
                    <CardTitle className="text-3xl mt-2">نتيجة التصويت</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xl">
                    <p>{message}</p>
                    {!wasTie && eliminatedPlayerRole && (
                        <div className="p-3 bg-muted rounded-lg">
                            <p>دوره كان: <strong className="text-primary">{eliminatedPlayerRole}</strong></p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className='flex-col gap-2'>
                   <p className="w-full text-center text-muted-foreground animate-pulse">الانتقال إلى الليل خلال...</p>
                   <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-muted text-sm">
                        <Timer className="w-5 h-5"/>
                        <span className="font-bold">{timeLeft}</span>
                    </div>
                </CardFooter>
            </Card>
        </motion.div>
    );
}
