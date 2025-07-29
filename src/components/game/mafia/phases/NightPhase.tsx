
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Game, Player, Role, MafiaRole } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import * as mafiaActions from '@/lib/actions/mafia';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { Loader2, Timer } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NightPhaseProps {
  game: Game;
  self: Player;
}

const CountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number, onExpire: () => void }) => {
    const calculateTimeLeft = useCallback(() => Math.round((expiryTimestamp - Date.now()) / 1000), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setInterval(() => {
            const remaining = calculateTimeLeft();
            if (remaining <= 0) {
                clearInterval(timer);
                setTimeLeft(0);
                onExpire();
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [expiryTimestamp, onExpire, calculateTimeLeft]);
    
    return (
        <div className={cn("flex items-center gap-2 p-2 rounded-full", timeLeft <= 10 ? "text-red-400" : "text-gray-300")}>
            <Timer className="h-5 w-5" />
            <span className="font-mono font-bold text-lg">{timeLeft}</span>
        </div>
    );
};

export function NightPhase({ game, self }: NightPhaseProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const isHost = game.hostId === user?.uid;
    const selfInGame = game.players.find(p => p.id === self.id);
    const roleInfo = MAFIA_ROLES.find(r => r.id === selfInGame?.role);
    
    const [targetId, setTargetId] = useState<string | undefined>(undefined);
    const [disguiseAs, setDisguiseAs] = useState<MafiaRole | undefined>(undefined);
    const [hasActed, setHasActed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const onTimeoutRef = useRef<() => void>();

    useEffect(() => {
        onTimeoutRef.current = () => {
            if (isHost) {
                mafiaActions.handleTimeout(game.id, game.hostId);
            }
        };
    });

    useEffect(() => {
        // Reset state on new night
        setTargetId(undefined);
        setDisguiseAs(undefined);
        setHasActed(!!game.mafiaState?.nightActions?.[self.id]);
    }, [game.mafiaState?.night, self.id, game.mafiaState?.nightActions]);

    const handleAction = async () => {
        if (!selfInGame || !roleInfo || hasActed) return;
        
        let action;
        switch(roleInfo.id) {
            case 'killer':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'kill', killTarget: targetId };
                break;
            case 'doctor':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'protect', targetId };
                break;
            case 'detective':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'investigate', targetId };
                break;
            case 'spy':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'spy', targetId };
                break;
            case 'shifter':
                 if (!disguiseAs) { toast({ title: "الرجاء اختيار شخصية للتنكر", variant: "destructive" }); return; }
                 action = { type: 'disguise', disguiseAs };
                 break;
            case 'explosive':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'trap', targetId };
                break;
            default:
                // No action for civilians or soldier
                setHasActed(true);
                return;
        }

        setIsSubmitting(true);
        try {
            await mafiaActions.submitNightAction(game.id, self.id, action);
            setHasActed(true);
            toast({ title: "تم تنفيذ الإجراء بنجاح." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const getRoleInstructions = () => {
        switch (roleInfo?.id) {
            case 'killer': return 'اختر لاعبًا لتصفيته.';
            case 'doctor': return 'اختر لاعبًا لحمايته.';
            case 'detective': return 'اختر لاعبًا للتحقيق في هويته.';
            case 'spy': return 'اختر لاعبًا للتجسس على دوره.';
            case 'shifter': return 'اختر دورًا للتنكر به هذه الليلة.';
            case 'explosive': return 'اختر لاعبًا لتفجيره إذا تم قتلك.';
            default: return 'أنت مدني. حاول البقاء على قيد الحياة.';
        }
    };
    
    const getTargetablePlayers = () => {
        if (!selfInGame) return [];
        let players = game.players.filter(p => p.status === 'alive');
        if (roleInfo?.id !== 'doctor') {
            players = players.filter(p => p.id !== self.id);
        }
        return players;
    };

    if (!selfInGame || !roleInfo) return <Loader2 className="animate-spin" />;
    
    const canAct = roleInfo.id !== 'civilian' && roleInfo.id !== 'soldier';

    return (
        <Card className="w-full max-w-lg bg-gray-900/80 backdrop-blur-sm text-white border-primary/30">
            <CardHeader className="text-center relative">
                {game.mafiaState?.timerEndsAt && (
                     <div className="absolute top-2 left-2">
                        <CountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} onExpire={() => onTimeoutRef.current?.()} />
                    </div>
                )}
                <CardTitle>الليلة {game.mafiaState?.night}</CardTitle>
                <CardDescription className="text-gray-400">{getRoleInstructions()}</CardDescription>
            </CardHeader>
            <CardContent>
                {hasActed ? (
                    <div className="text-center p-8">
                        <p className="text-lg font-bold">لقد قمت بدورك. انتظر شروق الشمس...</p>
                    </div>
                ) : (
                    canAct ? (
                         <div className="space-y-4">
                            {roleInfo.id === 'shifter' ? (
                                <Select onValueChange={setDisguiseAs} value={disguiseAs}>
                                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                                        <SelectValue placeholder="اختر شخصية للتنكر..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-600 text-white">
                                        {MAFIA_ROLES.filter(r => r.id !== 'shifter').map(r => (
                                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {getTargetablePlayers().map(p => (
                                        <button key={p.id} onClick={() => setTargetId(p.id)} className={cn("p-2 rounded-lg text-center border-2 transition-all", targetId === p.id ? "border-primary bg-primary/20" : "border-transparent hover:bg-gray-700")}>
                                            <PlayerAvatar avatarId={p.avatarId} className="w-20 h-20 mx-auto" />
                                            <p className="mt-2 font-semibold truncate">{p.name}</p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <Button onClick={handleAction} disabled={isSubmitting} className="w-full">
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد'}
                            </Button>
                        </div>
                    ) : (
                         <div className="text-center p-8">
                            <p className="text-lg font-bold">ليس لديك أي إجراء لتتخذه. انتظر شروق الشمس...</p>
                        </div>
                    )
                )}
            </CardContent>
        </Card>
    );
}
