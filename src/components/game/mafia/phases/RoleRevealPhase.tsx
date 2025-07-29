"use client";

import React, { useEffect, useState, useCallback } from 'react';
import type { Game, Player } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoleCard } from '../cards/RoleCard';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { VenetianMask } from 'lucide-react';

interface RoleRevealPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
}

export function RoleRevealPhase({ game, self, isHost }: RoleRevealPhaseProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [timeLeft, setTimeLeft] = useState(15);
    const selfRoleDetails = MAFIA_ROLES.find(r => r.id === self.role);

    const onTimeout = useCallback(() => {
        if (isHost) {
          mafiaActions.hostProgressNextPhase(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);

    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        
        const endTime = game.mafiaState.timerEndsAt.toMillis();
        
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0) {
                clearInterval(timer);
                onTimeout();
            }
        }, 1000);
        
        return () => clearInterval(timer);
    }, [isHost, self.id, game.id, game.mafiaState?.timerEndsAt, onTimeout]);
    
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
            <div className="w-80 h-[28rem] [perspective:1000px]">
                <AnimatePresence>
                    <motion.div
                        className="relative w-full h-full transform-style-3d"
                        initial={{ rotateY: 0 }}
                        animate={{ rotateY: isFlipped ? 180 : 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        {/* Card Front (Facedown) */}
                        <div className="absolute w-full h-full backface-hidden">
                            <Card className="w-full h-full flex flex-col items-center justify-center bg-gray-800 border-4 border-gray-600">
                                <VenetianMask className="w-24 h-24 text-gray-400" />
                                <h2 className="text-2xl font-bold text-white mt-4">دورك السري</h2>
                                <Button className="mt-6" onClick={() => setIsFlipped(true)}>
                                    اكشف دورك
                                </Button>
                            </Card>
                        </div>

                        {/* Card Back (Role Info) */}
                        <div className="absolute w-full h-full backface-hidden rotate-y-180">
                            <RoleCard role={selfRoleDetails} />
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
            
            <div className="mt-8 text-center">
                 <p className="text-muted-foreground">ستبدأ اللعبة خلال:</p>
                 <div className={cn("flex items-center justify-center gap-2 p-2 rounded-full text-lg font-bold font-mono transition-colors", timeLeft <= 5 && "text-red-500")}>
                    <Timer className="h-6 w-6" />
                    <span>{timeLeft}</span>
                 </div>
            </div>
        </div>
    );
}
