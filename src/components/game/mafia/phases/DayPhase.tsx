
"use client";

import { useState, useEffect, useRef } from 'react';
import type { Game, Player, Role, MafiaRole } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import * as mafiaActions from '@/lib/actions/mafia';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { Loader2, Timer, MessageSquare, VenetianMask, Gavel, UserCheck, UserX, Moon } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { KillAnimationOverlay } from '../overlays/KillAnimationOverlay';
import { AnimatePresence, motion } from 'framer-motion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DayPhaseProps {
  game: Game;
  self: Player;
}

const CountdownTimer = ({ expiryTimestamp }: { expiryTimestamp: number }) => {
    const [timeLeft, setTimeLeft] = useState(Math.round((expiryTimestamp - Date.now()) / 1000));

    useEffect(() => {
        const timer = setInterval(() => {
            const remaining = Math.round((expiryTimestamp - Date.now()) / 1000);
            if (remaining <= 0) {
                clearInterval(timer);
                setTimeLeft(0);
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [expiryTimestamp]);
    
    return (
        <div className={cn("flex items-center gap-2 p-2 rounded-full", timeLeft <= 10 ? "text-red-500" : "text-gray-500")}>
            <Timer className="h-5 w-5" />
            <span className="font-mono font-bold text-lg">{timeLeft}</span>
        </div>
    );
};


export function DayPhase({ game, self }: DayPhaseProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const isHost = game.hostId === user?.uid;
    const selfInGame = game.players.find(p => p.id === self.id);

    const [showKillAnimation, setShowKillAnimation] = useState(!!game.mafiaState?.killedPlayer);
    const [killedPlayerInfo, setKilledPlayerInfo] = useState<{name: string, avatarId: string} | null>(null);
    const [selectedVoteTarget, setSelectedVoteTarget] = useState<string | null>(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    useEffect(() => {
        const killedPlayer = game.players.find(p => p.id === game.mafiaState?.killedPlayer);
        if (killedPlayer) {
            setKilledPlayerInfo({ name: killedPlayer.name, avatarId: killedPlayer.avatarId });
            setShowKillAnimation(true);
        } else {
            setShowKillAnimation(false);
        }
    }, [game.mafiaState?.killedPlayer, game.players]);
    
    useEffect(() => {
        setHasVoted(!!game.mafiaState?.votes?.[self.id]);
    }, [game.mafiaState?.votes, self.id]);
    
    const handleHostAction = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.hostProgressNextPhase(game.id, self.id);
        } catch (error: any) {
            toast({ title: "Error progressing phase", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleVote = async () => {
        if (!selectedVoteTarget) {
            toast({ title: "الرجاء اختيار لاعب للتصويت", variant: "destructive" });
            return;
        }
        try {
            await mafiaActions.submitVote(game.id, self.id, selectedVoteTarget);
            toast({ title: "تم تسجيل صوتك." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    };

    const handleSkipVote = async () => {
         try {
            await mafiaActions.submitVote(game.id, self.id, null);
            toast({ title: "لقد تخطيت التصويت." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    };

    const renderNightResults = () => (
        <div className="space-y-3">
             {game.mafiaState?.investigationResult && selfInGame?.role === 'detective' && (
                <Alert variant="default" className="bg-blue-100 border-blue-300">
                    <AlertTitle className="text-blue-900">تقرير التحقيق</AlertTitle>
                    <AlertDescription className="text-blue-800">
                        اللاعب {game.players.find(p => p.id === game.mafiaState?.investigationResult?.playerId)?.name} هو من فريق **{game.mafiaState.investigationResult.team === 'mafia' ? 'المافيا' : 'الخير'}**.
                    </AlertDescription>
                </Alert>
            )}
            {game.mafiaState?.spyResult && selfInGame?.role === 'spy' && (
                 <Alert variant="default" className="bg-purple-100 border-purple-300">
                    <AlertTitle className="text-purple-900">تقرير التجسس</AlertTitle>
                    <AlertDescription className="text-purple-800">
                        {game.mafiaState.spyResult.isSoldier 
                            ? "لقد حاولت التجسس على جندي! تم كشف محاولتك."
                            : `اللاعب ${game.players.find(p => p.id === game.mafiaState?.spyResult?.playerId)?.name} دوره هو **${MAFIA_ROLES.find(r => r.id === game.mafiaState?.spyResult?.role)?.name}**.`
                        }
                    </AlertDescription>
                </Alert>
            )}
             {game.mafiaState?.events?.map((event, index) => {
                 if(event.type === 'save_success') {
                     return (
                         <Alert key={index} variant="default" className="bg-green-100 border-green-300">
                            <AlertTitle className="text-green-900">نجاة!</AlertTitle>
                            <AlertDescription className="text-green-800">
                                نجا أحد اللاعبين من هجوم بفضل الطبيب!
                            </AlertDescription>
                        </Alert>
                     )
                 }
                 return null;
             })}
        </div>
    );

    const renderPhaseContent = () => {
        const alivePlayers = game.players.filter(p => p.status === 'alive');
        const timerExpired = !game.mafiaState?.timerEndsAt || Date.now() >= game.mafiaState.timerEndsAt.toMillis();
        
        switch (game.gameState) {
            case 'discussion':
                const canHostProceedFromDiscussion = timerExpired;
                return (
                     <Card className="w-full max-w-4xl h-full flex flex-col">
                         <CardHeader className="text-center">
                             <CardTitle>مرحلة النقاش</CardTitle>
                             <CardDescription>ناقشوا أحداث الليلة الماضية وحاولوا كشف المافيا.</CardDescription>
                             {game.mafiaState?.timerEndsAt && <div className="absolute top-2 left-2"><CountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} /></div>}
                         </CardHeader>
                         <CardContent className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div className="md:col-span-2 bg-gray-200/50 p-4 rounded-lg flex flex-col">
                                {renderNightResults()}
                                <div className="flex-grow flex items-center justify-center">
                                    <p className="text-muted-foreground">منطقة الدردشة (سيتم تنفيذها لاحقاً)</p>
                                </div>
                             </div>
                             <div className="space-y-2">
                                 <h3 className="font-bold">اللاعبون الأحياء ({alivePlayers.length})</h3>
                                 {alivePlayers.map(p => (
                                     <div key={p.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                        <p className="font-semibold">{p.name}</p>
                                    </div>
                                 ))}
                             </div>
                         </CardContent>
                          {isHost && (
                            <CardFooter>
                                <Button onClick={handleHostAction} disabled={!canHostProceedFromDiscussion || isSubmitting} className="w-full">
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'الانتقال إلى التصويت'}
                                </Button>
                            </CardFooter>
                         )}
                     </Card>
                );
            case 'voting':
                 const allVotesIn = alivePlayers.every(p => game.mafiaState?.votes?.[p.id] !== undefined);
                 const canHostProceedFromVoting = timerExpired || allVotesIn;
                 return (
                     <Card className="w-full max-w-lg">
                        <CardHeader className="text-center">
                            <CardTitle>التصويت</CardTitle>
                            <CardDescription>صوّت للاعب الذي تعتقد أنه من المافيا.</CardDescription>
                           {game.mafiaState?.timerEndsAt && <div className="absolute top-2 left-2"><CountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} /></div>}
                        </CardHeader>
                        <CardContent>
                            {hasVoted ? (
                                <p className="text-center font-bold text-green-600">تم تسجيل صوتك. في انتظار بقية اللاعبين...</p>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {alivePlayers.filter(p => p.id !== self.id).map(p => (
                                            <button key={p.id} onClick={() => setSelectedVoteTarget(p.id)} className={cn("p-2 rounded-lg text-center border-2 transition-all", selectedVoteTarget === p.id ? "border-primary bg-primary/20" : "border-transparent hover:bg-muted")}>
                                                <PlayerAvatar avatarId={p.avatarId} className="w-20 h-20 mx-auto" />
                                                <p className="mt-2 font-semibold truncate">{p.name}</p>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleVote} className="w-full" disabled={!selectedVoteTarget}><UserX/> تصويت</Button>
                                        <Button onClick={handleSkipVote} variant="outline" className="w-full">تخطي</Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        {isHost && (
                            <CardFooter>
                                <Button onClick={handleHostAction} disabled={!canHostProceedFromVoting || isSubmitting} className="w-full">
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'عرض نتيجة التصويت'}
                                </Button>
                            </CardFooter>
                        )}
                     </Card>
                 );
            case 'voting_results':
                const result = game.mafiaState?.lastVotedOut;
                const votedOutPlayer = result?.playerId ? game.players.find(p => p.id === result.playerId) : null;
                const canHostProceedFromResults = timerExpired;
                return (
                     <Card className="w-full max-w-lg text-center">
                        <CardHeader>
                            <CardTitle>نتيجة التصويت</CardTitle>
                        </CardHeader>
                         <CardContent>
                            {result?.tie ? (
                                <p className="text-xl font-bold">تعادل في الأصوات! لم يتم إعدام أحد.</p>
                            ) : votedOutPlayer ? (
                                <div className="flex flex-col items-center gap-4">
                                    <Gavel className="w-16 h-16 text-destructive"/>
                                    <p className="text-xl font-bold">قررت المدينة إعدام</p>
                                    <PlayerAvatar avatarId={votedOutPlayer.avatarId} className="w-24 h-24"/>
                                    <p className="text-3xl font-bold">{votedOutPlayer.name}</p>
                                    <p className="text-lg">دوره كان: <span className="font-bold">{MAFIA_ROLES.find(r => r.id === votedOutPlayer.role)?.name}</span></p>
                                </div>
                            ) : (
                                <p className="text-xl font-bold">لم يصوّت أحد. لم يتم إعدام أي لاعب.</p>
                            )}
                         </CardContent>
                         {isHost && (
                             <CardFooter>
                                <Button onClick={handleHostAction} disabled={!canHostProceedFromResults || isSubmitting} className="w-full">
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Moon />}
                                    الانتقال إلى الليل
                                </Button>
                             </CardFooter>
                         )}
                     </Card>
                );
            default:
                return <Loader2 className="animate-spin" />
        }
    };

    if (showKillAnimation && killedPlayerInfo) {
        return <KillAnimationOverlay playerName={killedPlayerInfo.name} onAnimationEnd={() => setShowKillAnimation(false)} />;
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={game.gameState}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full flex items-center justify-center p-4"
            >
                {renderPhaseContent()}
            </motion.div>
        </AnimatePresence>
    );
}
