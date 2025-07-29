
import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { Game, Player } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { RoleCard } from '../cards/RoleCard';
import { MAFIA_ROLES } from '@/data/mafia-roles';

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
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
            >
                <RoleCard role={selfRoleDetails} />
            </motion.div>
            
            <div className="mt-8 text-center">
                 <p className="text-muted-foreground">ستبدأ اللعبة خلال:</p>
                 <p className="text-4xl font-bold font-mono text-primary">{timeLeft}</p>
            </div>
        </div>
    );
}
