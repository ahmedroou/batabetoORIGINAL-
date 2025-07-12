
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Game, Player, GeniusChallenge, BombDuelState } from '@/types';
import { handleBombDuelAction } from '@/app/actions';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Bomb, Shield, Users, Loader2, Trophy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';

const PlayerCard = ({
    player,
    bomb,
    playerState,
    isSelf,
    onThrow,
    isThrowingDisabled,
    isEliminated
}: {
    player: Player;
    bomb: { expiresAt: Timestamp } | null;
    playerState: BombDuelState['players'][string];
    isSelf: boolean;
    onThrow: (targetId: string) => void;
    isThrowingDisabled: boolean;
    isEliminated: boolean;
}) => {
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!bomb) {
            setTimeLeft(0);
            return;
        }
        const interval = setInterval(() => {
            const remaining = Math.max(0, bomb.expiresAt.toMillis() - Date.now());
            setTimeLeft(remaining / 1000);
        }, 100);
        return () => clearInterval(interval);
    }, [bomb]);

    const hasBomb = !!bomb;
    const isShielding = playerState?.isShielding;
    const animationIntensity = hasBomb ? Math.max(0, 1 - (timeLeft / 5)) : 0;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isEliminated ? 0.4 : 1, y: 0, scale: isSelf ? 1.05 : 1 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
                "relative p-4 rounded-lg border-2 transition-all duration-300 w-full",
                isSelf ? 'bg-primary/10 border-primary' : 'bg-muted/50 border-border',
                isEliminated && 'bg-destructive/20 border-destructive',
            )}
        >
            <AnimatePresence>
                {isShielding && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1.2 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        <Shield className="w-24 h-24 text-blue-500/50" />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-center gap-4 relative z-10">
                <PlayerAvatar avatarId={player.avatarId} className="w-16 h-16 rounded-full" />
                <div className="flex-grow">
                    <h3 className="text-xl font-bold">{player.name} {isSelf && '(أنت)'}</h3>
                    <p className="text-sm text-muted-foreground">{isEliminated ? 'تم إقصاؤه' : hasBomb ? 'يحمل قنبلة!' : 'آمن'}</p>
                </div>
                {hasBomb && !isEliminated && (
                    <motion.div
                        className="flex flex-col items-center"
                        animate={{
                            scale: 1 + animationIntensity * 0.1,
                            rotate: (Math.random() - 0.5) * animationIntensity * 10,
                        }}
                    >
                        <Bomb className="w-12 h-12 text-destructive" />
                        <span className="font-mono font-bold text-lg text-destructive">{timeLeft.toFixed(1)}</span>
                    </motion.div>
                )}
            </div>
            {isSelf && hasBomb && !isEliminated && (
                 <Button onClick={() => onThrow(player.id)} disabled={isThrowingDisabled} className="w-full mt-3">
                    <Bomb className="ml-2" />
                    ارمي القنبلة
                </Button>
            )}
        </motion.div>
    );
};


export function BombDuel({ game, self, challenge }: { game: Game, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState<'throw' | 'shield' | null>(null);
    const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

    const bombDuelState = game.challengeState?.bombDuelState;
    const myState = bombDuelState?.players[self.id];
    const myBomb = bombDuelState?.bombs.find(b => b.heldBy === self.id);

    const otherPlayers = useMemo(() => game.players.filter(p => p.id !== self.id && p.status !== 'eliminated'), [game.players, self.id]);
    
    const isMyShieldOnCooldown = myState?.shieldCooldownUntil && myState.shieldCooldownUntil.toMillis() > Date.now();
    const isMyThrowOnCooldown = myState?.throwCooldownUntil && myState.throwCooldownUntil.toMillis() > Date.now();

    const handleAction = async (action: 'throw' | 'shield', targetId?: string) => {
        if (isSubmitting) return;
        setIsSubmitting(action);
        const result = await handleBombDuelAction(game.id, self.id, action, targetId);
        if (result.error) {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(null);
        setSelectedTarget(null);
    };

    if (!bombDuelState) {
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري تجهيز القنابل...</p>
                </CardContent>
            </Card>
        );
    }
    
    const alivePlayers = game.players.filter(p => p.status !== 'eliminated');
    if (alivePlayers.length <= 1) {
        const winner = alivePlayers[0];
        return (
             <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-4" />
                    <CardTitle className="text-3xl text-primary">انتهى التحدي!</CardTitle>
                    <CardDescription>
                        {winner ? `الفائز هو ${winner.name}!` : "انتهت الجولة بالتعادل!"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                   <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
                    <p className="text-xl">في انتظار بقية اللاعبين...</p>
                </CardContent>
            </Card>
        )
    }

    if (self.status === 'eliminated') {
         return (
             <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-destructive">لقد تم إقصاؤك!</CardTitle>
                </CardHeader>
                <CardContent>
                     <p className="text-xl">يمكنك مشاهدة بقية الجولة. حظًا أفضل في المرة القادمة.</p>
                </CardContent>
            </Card>
        )
    }


    return (
        <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-primary">{challenge.name}</h1>
                <p className="text-muted-foreground">{challenge.description}</p>
            </div>
            
            <div className="space-y-4">
                 <AnimatePresence>
                     {game.players.map(p => {
                         const playerBomb = bombDuelState.bombs.find(b => b.heldBy === p.id);
                         const playerState = bombDuelState.players[p.id];
                         if (!playerState) return null;
                         return (
                            <PlayerCard
                                key={p.id}
                                player={p}
                                bomb={playerBomb || null}
                                playerState={playerState}
                                isSelf={p.id === self.id}
                                onThrow={() => {}} // Throwing is handled by the target selection UI
                                isThrowingDisabled={isMyThrowOnCooldown || !myBomb}
                                isEliminated={p.status === 'eliminated'}
                            />
                         )
                     })}
                 </AnimatePresence>
            </div>
            
            {selectedTarget && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>تأكيد الرمي</CardTitle>
                            <CardDescription>هل أنت متأكد من رمي القنبلة على {otherPlayers.find(p=>p.id === selectedTarget)?.name}?</CardDescription>
                        </CardHeader>
                        <CardContent className="flex gap-2">
                            <Button onClick={() => handleAction('throw', selectedTarget)} className="flex-1" disabled={isSubmitting === 'throw'}>
                                {isSubmitting === 'throw' ? <Loader2 className="animate-spin" /> : "تأكيد"}
                            </Button>
                             <Button onClick={() => setSelectedTarget(null)} variant="outline" className="flex-1">إلغاء</Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="mt-6 flex flex-col md:flex-row gap-4 justify-center">
                 {myBomb && (
                    <div className="flex flex-col gap-2">
                        <h4 className="font-bold text-center">ارمي القنبلة على:</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {otherPlayers.map(p => (
                            <Button
                                key={p.id}
                                onClick={() => setSelectedTarget(p.id)}
                                disabled={isMyThrowOnCooldown || !!isSubmitting}
                                variant="destructive"
                                className="h-auto flex flex-col p-2 gap-1"
                            >
                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                <span>{p.name}</span>
                            </Button>
                        ))}
                        </div>
                    </div>
                )}
                
                <Button 
                    onClick={() => handleAction('shield')} 
                    disabled={isMyShieldOnCooldown || !!isSubmitting}
                    variant="outline"
                    className="p-6 text-xl border-blue-500 text-blue-500 hover:bg-blue-50 hover:text-blue-600"
                >
                    <Shield className="ml-2"/>
                    {isSubmitting === 'shield' ? "جاري..." : "تجهيز الدرع"}
                </Button>
            </div>
        </div>
    );
}
