
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Game, Player, MafiaRole, Team } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { Timer, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Role Card Imports ---
import { CivilianCard } from '../cards/CivilianCard';
import { SoldierCard } from '../cards/SoldierCard';
import { KillerCard } from '../cards/KillerCard';
import { DoctorCard } from '../cards/DoctorCard';
import { DetectiveCard } from '../cards/DetectiveCard';
import { SpyCard } from '../cards/SpyCard';
import { ExplosiveCard } from '../cards/ExplosiveCard';
import { ShifterCard } from '../cards/ShifterCard';


const CountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number; onExpire: () => void }) => {
    const calculateTimeLeft = useCallback(() => Math.max(0, Math.round((expiryTimestamp - Date.now()) / 1000)), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    useEffect(() => {
        const interval = setInterval(() => {
            const newRemaining = calculateTimeLeft();
            if (newRemaining > 0) {
                setTimeLeft(newRemaining);
            } else {
                setTimeLeft(0);
                clearInterval(interval);
                onExpireRef.current();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [expiryTimestamp, calculateTimeLeft]);

    if (timeLeft <= 0) {
        return <div className="text-lg font-bold text-red-400">انتهى الوقت!</div>;
    }

    const isLowTime = timeLeft <= 10;

    return (
        <div className={cn("flex items-center gap-2 p-2 rounded-full transition-all duration-300", 
            isLowTime ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-gray-700 text-gray-200')}>
            <Timer className="h-6 w-6" />
            <div className="text-lg font-bold font-mono">
               {String(timeLeft).padStart(2, '0')}
            </div>
        </div>
    );
};

interface NightPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
    isSubmitting: boolean;
    setIsSubmitting: (isSubmitting: boolean) => void;
}

export function NightPhase({ game, self, isHost, isSubmitting, setIsSubmitting }: NightPhaseProps) {
    const { toast } = useToast();
    const selfRoleDetails = MAFIA_ROLES.find(r => r.id === self.role);
    const hasActed = !!game.mafiaState?.nightActions?.[self.id];
    
    const alivePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    
    const onTimeout = useCallback(() => {
        if (isHost) {
          mafiaActions.hostProgressNextPhase(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);

    const handleAction = async (actionDetails: { targetId?: string, disguiseAs?: MafiaRole, killTarget?: string }) => {
        if (!selfRoleDetails) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.submitNightAction(game.id, self.id, { type: selfRoleDetails.id as any, ...actionDetails });
            toast({ title: "تم تسجيل حركتك." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const roleCardMap: Record<string, React.FC<any>> = {
        killer: KillerCard,
        detective: DetectiveCard,
        doctor: DoctorCard,
        spy: SpyCard,
        shifter: ShifterCard,
        soldier: SoldierCard,
        explosive: ExplosiveCard,
        civilian: CivilianCard,
    };
    
    const SpecificRoleCard = selfRoleDetails ? roleCardMap[selfRoleDetails.id] : null;

    if (!selfRoleDetails) {
        return (
            <Card className="w-full max-w-lg bg-gray-900/80 backdrop-blur-sm text-white border-gray-700 relative">
                 <CardHeader className="text-center pt-20">
                    <CardTitle className="text-3xl">الليل</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-destructive">خطأ: لم يتم العثور على تفاصيل الدور.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className="w-full max-w-lg bg-gray-900/80 backdrop-blur-sm text-white border-gray-700 relative">
             {game.mafiaState?.timerEndsAt && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10"><CountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} onExpire={onTimeout} /></div>}
            <CardHeader className="text-center pt-20">
                <CardTitle className="text-3xl">الليل</CardTitle>
                <CardDescription className="text-gray-400">حل الظلام... يقوم أصحاب الأدوار الخاصة بتنفيذ حركاتهم.</CardDescription>
            </CardHeader>
            <CardContent>
                {SpecificRoleCard ? <SpecificRoleCard self={self} alivePlayers={alivePlayers} hasActed={hasActed} handleAction={handleAction} isSubmitting={isSubmitting} /> : <p className="text-center text-destructive">خطأ: لم يتم العثور على تفاصيل الدور.</p>}
            </CardContent>
        </Card>
    );
}
