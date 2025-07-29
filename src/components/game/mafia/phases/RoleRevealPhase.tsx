
"use client";

import React, { useEffect, useState, useRef } from 'react';
import type { Game, Player, MafiaRole, Role } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { RoleCard } from '../cards/RoleCard';
import { MAFIA_ROLES } from '@/data/mafia-roles';

interface RoleRevealPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
    isSubmitting: boolean;
    setIsSubmitting: (isSubmitting: boolean) => void;
}

export function RoleRevealPhase({ game, self, isHost, isSubmitting, setIsSubmitting }: RoleRevealPhaseProps) {
    const [timeLeft, setTimeLeft] = useState(15);
    const selfRoleDetails = MAFIA_ROLES.find(r => r.id === self.role);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const actionCalled = useRef(false);

    const handleNextPhase = async () => {
        if (!isHost || actionCalled.current) return;
        actionCalled.current = true;
        setIsSubmitting(true);
        await mafiaActions.hostProgressNextPhase(game.id, self.id);
        setIsSubmitting(false);
    }
    
    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        
        const endTime = game.mafiaState.timerEndsAt.toMillis();
        
        timerRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0) {
                if (timerRef.current) clearInterval(timerRef.current);
                if (isHost && !actionCalled.current) {
                    handleNextPhase();
                }
            }
        }, 1000);
        
        // Initial call
        const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        setTimeLeft(remaining);


        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, game.id, game.mafiaState?.timerEndsAt]);
    
    
    if (!selfRoleDetails) {
        return (
            <Card className="w-full max-w-md text-center">
                <CardHeader><CardTitle>جاري توزيع الأدوار...</CardTitle></CardHeader>
                <CardContent><Loader2 className="w-12 h-12 mx-auto animate-spin" /></CardContent>
            </Card>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full w-full">
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
            >
                <RoleCard role={selfRoleDetails} />
            </motion.div>
            
            <div className="mt-8 text-center">
                 <p className="text-muted-foreground">ستبدأ اللعبة خلال:</p>
                 <p className="text-4xl font-bold font-mono text-primary">{timeLeft}</p>
                 {isHost && (
                    <Button onClick={handleNextPhase} disabled={isSubmitting} className="mt-4">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : "بدء الليل"}
                    </Button>
                )}
            </div>
        </div>
    );
}
