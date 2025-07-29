
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import type { Game, Player, MafiaRole, Role } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { useToast } from '@/hooks/use-toast';
import { CivilianCard } from '../cards/CivilianCard';
import { KillerCard } from '../cards/KillerCard';
import { DetectiveCard } from '../cards/DetectiveCard';
import { DoctorCard } from '../cards/DoctorCard';
import { SpyCard } from '../cards/SpyCard';
import { ShifterCard } from '../cards/ShifterCard';
import { SoldierCard } from '../cards/SoldierCard';
import { ExplosiveCard } from '../cards/ExplosiveCard';

interface NightPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
    isSubmitting: boolean;
    setIsSubmitting: (isSubmitting: boolean) => void;
}

const roleCardMap: Record<MafiaRole, React.FC<any>> = {
    killer: KillerCard,
    detective: DetectiveCard,
    doctor: DoctorCard,
    spy: SpyCard,
    shifter: ShifterCard,
    soldier: SoldierCard,
    explosive: ExplosiveCard,
    civilian: CivilianCard,
};

export function NightPhase({ game, self, isHost, setIsSubmitting }: NightPhaseProps) {
    const { toast } = useToast();
    const [timeLeft, setTimeLeft] = useState(game.mafiaState?.settings.nightDuration || 70);
    const selfRoleDetails = MAFIA_ROLES.find(r => r.id === self.role);
    const hasActed = !!game.mafiaState?.nightActions?.[self.id];
    
    const alivePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    const canAct = selfRoleDetails && selfRoleDetails.id !== 'civilian' && selfRoleDetails.id !== 'soldier';

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

    const handleAction = async (targetId?: string, disguiseAs?: MafiaRole, killTarget?: string) => {
        if (!selfRoleDetails) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.submitNightAction(game.id, self.id, {
                type: selfRoleDetails.id as any, // Cast to any to satisfy the complex type
                targetId,
                disguiseAs,
                killTarget
            });
            toast({ title: "تم تسجيل حركتك." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const SpecificRoleCard = selfRoleDetails ? roleCardMap[selfRoleDetails.id] : null;

    return (
        <Card className="w-full max-w-lg bg-gray-950 text-white border-gray-800">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl">الليل</CardTitle>
                <CardDescription className="text-gray-400">
                    حل الظلام... يقوم أصحاب الأدوار الخاصة بتنفيذ حركاتهم.
                </CardDescription>
                <div className="text-2xl font-bold font-mono text-primary">{timeLeft}</div>
            </CardHeader>
            <CardContent>
                {SpecificRoleCard ? (
                    <SpecificRoleCard
                        self={self}
                        alivePlayers={alivePlayers}
                        hasActed={hasActed}
                        handleAction={handleAction}
                    />
                ) : (
                    <p>جاري تحميل دورك...</p>
                )}
            </CardContent>
            {isHost && (
                 <CardFooter>
                    <Button onClick={() => mafiaActions.hostProgressNextPhase(game.id, self.id)} className="w-full">
                        إنهاء الليل وبدء النهار
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
