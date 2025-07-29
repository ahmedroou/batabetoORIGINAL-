
import React, { useEffect, useState } from 'react';
import type { Game, Player } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import { RoleCard } from '../cards/RoleCard';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { cn } from '@/lib/utils';

interface RoleRevealPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
}

export function RoleRevealPhase({ game, self, isHost }: RoleRevealPhaseProps) {
    const [timeLeft, setTimeLeft] = useState(15);
    const selfRoleDetails = MAFIA_ROLES.find(r => r.id === self.role);

    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        
        const endTime = game.mafiaState.timerEndsAt.toMillis();
        
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0 && isHost) {
                mafiaActions.hostProgressNextPhase(game.id, self.id);
                clearInterval(timer);
            }
        }, 1000);
        
        return () => clearInterval(timer);
    }, [isHost, self.id, game.id, game.mafiaState?.timerEndsAt]);
    
    
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
                initial={{ opacity: 0, scale: 0.8, rotateY: 180 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
            >
                <RoleCard role={selfRoleDetails} />
            </motion.div>
            
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
