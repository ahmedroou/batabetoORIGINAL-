"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Game, Player } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sun, Vote, Users, Skull, Timer, ArrowRight, Loader2 } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


const CountdownTimer = ({ expiryTimestamp, onTimeUp }: { expiryTimestamp: number; onTimeUp: () => void }) => {
    const calculateTimeLeft = useCallback(() => Math.max(0, Math.round((expiryTimestamp - Date.now()) / 1000)), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const onTimeUpRef = useRef(onTimeUp);
    onTimeUpRef.current = onTimeUp;

    useEffect(() => {
        setTimeLeft(calculateTimeLeft()); 
        const interval = setInterval(() => {
            const newRemaining = calculateTimeLeft();
            if (newRemaining > 0) {
                setTimeLeft(newRemaining);
            } else {
                setTimeLeft(0);
                clearInterval(interval);
                onTimeUpRef.current();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [expiryTimestamp, calculateTimeLeft]);


    const isLowTime = timeLeft <= 10 && timeLeft > 0;

    return (
        <div className={cn("flex items-center gap-2 p-2 rounded-full transition-all duration-300", 
            isLowTime ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-muted',
            timeLeft === 0 && 'bg-destructive/20 text-destructive'
            )}>
            <Timer className="h-6 w-6" />
            <div className="text-lg font-bold font-mono">
               {timeLeft > 0 ? String(timeLeft).padStart(2, '0') : "انتهى الوقت"}
            </div>
        </div>
    );
};


interface DayPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
    isSubmitting: boolean;
    setIsSubmitting: (isSubmitting: boolean) => void;
}

export function DayPhase({ game, self, isHost, isSubmitting, setIsSubmitting }: DayPhaseProps) {
    const { toast } = useToast();
    const [selectedVote, setSelectedVote] = useState<string | null>(null);
    const [isTimeUp, setIsTimeUp] = useState(false);
    
    const { investigationResult, spyResult, votes = {} } = game.mafiaState || {};
    const alivePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    const deadPlayers = useMemo(() => game.players.filter(p => p.status !== 'alive' && p.status !== 'left'), [game.players]);
    const rolesInGame = useMemo(() => game.mafiaState?.rolesInGame || [], [game.mafiaState?.rolesInGame]);
    const hasVoted = useMemo(() => votes[self.id] !== undefined, [votes, self.id]);
    
    useEffect(() => {
        setIsTimeUp(!game.mafiaState?.timerEndsAt || Date.now() >= game.mafiaState.timerEndsAt.toMillis());
    }, [game.mafiaState?.timerEndsAt]);

    useEffect(() => {
        if(game.gameState === 'voting') {
            setSelectedVote(null);
        }
    }, [game.gameState]);

    const handleVote = async () => {
        if (selectedVote === null) { toast({ title: "الرجاء اختيار لاعب للتصويت", variant: "destructive" }); return; }
        setIsSubmitting(true);
        try {
            await mafiaActions.submitVote(game.id, self.id, selectedVote === "no_one" ? null : selectedVote);
            toast({ title: "تم تسجيل تصويتك" });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleProceed = async () => {
        if (!isHost || !isTimeUp) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.hostProgressNextPhase(game.id, self.id);
        } catch(e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const renderDiscussion = () => (
        <Card className="w-full max-w-4xl bg-white border-gray-200">
            <CardHeader className="text-center relative">
                <Sun className="w-16 h-16 mx-auto text-yellow-400" />
                <CardTitle className="text-3xl">النهار - يوم النقاش</CardTitle>
                <CardDescription className="text-gray-600">حان وقت النقاش. حاولوا كشف القاتل!</CardDescription>
                {game.mafiaState?.timerEndsAt && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10"><CountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} onTimeUp={() => setIsTimeUp(true)} /></div>}
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-4">
                     <Alert><Skull className="h-4 w-4" /><AlertTitle>أحداث الليلة الماضية:</AlertTitle><AlertDescription><ul className="space-y-2 text-sm list-disc pl-5">{(game.mafiaState?.events || []).length > 0 ? game.mafiaState?.events?.map((event, index) => (<li key={index}>{event.message}</li>)) : (<li>لم يحدث شيء مهم هذه الليلة.</li>)}</ul></AlertDescription></Alert>
                        {self.role === 'detective' && investigationResult && (<Alert variant="default" className="bg-blue-50 border-blue-200"><AlertTitle className="text-blue-800">نتيجة التحقيق الخاصة بك:</AlertTitle><AlertDescription className="text-blue-700">{game.players.find(p => p.id === investigationResult.playerId)?.name} هو من فريق **{investigationResult.team === 'good' ? 'الخير' : 'المافيا'}**.</AlertDescription></Alert>)}
                        {self.role === 'spy' && spyResult && (<Alert variant="default" className="bg-purple-50 border-purple-200"><AlertTitle className="text-purple-800">تقرير التجسس الخاص بك:</AlertTitle><AlertDescription className="text-purple-700">{game.players.find(p => p.id === spyResult.playerId)?.name} يظهر بدور **'{MAFIA_ROLES.find(r => r.id === spyResult.role)?.name}'**.</AlertDescription></Alert>)}
                </div>
                <div className="space-y-4">
                     <Card><CardHeader className="p-3"><CardTitle className="text-base">المقبرة</CardTitle></CardHeader><CardContent className="p-3 space-y-2"><ScrollArea className="h-24">{deadPlayers.length > 0 ? deadPlayers.map(p => (<div key={p.id} className="flex items-center gap-2 text-sm opacity-70"><PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/><div className="flex-grow"><p className="font-semibold line-through">{p.name}</p><p className="text-xs">{MAFIA_ROLES.find(r => r.id === p.role)?.name}</p></div></div>)) : <p className="text-xs text-muted-foreground text-center">لا يوجد موتى بعد.</p>}</ScrollArea></CardContent></Card>
                     <Card><CardHeader className="p-3"><CardTitle className="text-base">الأدوار في اللعبة</CardTitle></CardHeader><CardContent className="p-3"><ScrollArea className="h-24"><div className="grid grid-cols-2 gap-1 text-sm">{rolesInGame.map(roleId => (<div key={roleId} className="p-1 bg-muted rounded-md text-center">{MAFIA_ROLES.find(r => r.id === roleId)?.name}</div>))}</div></ScrollArea></CardContent></Card>
                </div>
            </CardContent>
             {isHost && (<CardFooter><Button onClick={handleProceed} disabled={!isTimeUp || isSubmitting} className="w-full">
                {isSubmitting ? <Loader2 className="animate-spin" /> : 'الانتقال لمرحلة التصويت'} <ArrowRight />
            </Button></CardFooter>)}
        </Card>
    );
    
    const renderVoting = () => {
        const votesByPlayer: Record<string, string[]> = {};
        Object.entries(votes).forEach(([voterId, targetId]) => {
            if (targetId && targetId !== "no_one") {
                if (!votesByPlayer[targetId]) votesByPlayer[targetId] = [];
                votesByPlayer[targetId].push(voterId);
            }
        });
        const hasVotedCount = Object.keys(votes).length;

        return (
          <Card className="w-full max-w-2xl relative">
              <CardHeader className="text-center">
                  <Vote className="w-16 h-16 mx-auto text-primary" />
                  <CardTitle className="text-3xl">التصويت</CardTitle>
                  <CardDescription className="text-gray-600">صوتوا للاعب الذي تشكون بأنه القاتل.</CardDescription>
                  {game.mafiaState?.timerEndsAt && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10"><CountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} onTimeUp={() => setIsTimeUp(true)} /></div>}
                  <p className="text-sm font-bold pt-2">{hasVotedCount}/{alivePlayers.length} صوتوا</p>
              </CardHeader>
              <CardContent><ScrollArea className="h-72"><div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-1">{alivePlayers.map(p => (<div key={p.id}><motion.div onClick={() => !hasVoted && setSelectedVote(p.id)} className={cn("p-2 rounded-lg border-2 cursor-pointer text-center", selectedVote === p.id ? "border-primary bg-primary/10" : "border-transparent bg-muted", hasVoted && "cursor-not-allowed opacity-60")} whileTap={{ scale: hasVoted ? 1 : 0.95 }}><PlayerAvatar avatarId={p.avatarId} className="w-16 h-16 mx-auto" /><p className="font-bold mt-2">{p.name}</p></motion.div>{votesByPlayer[p.id] && (<div className="flex justify-center flex-wrap gap-1 mt-1">{votesByPlayer[p.id].map(voterId => (<PlayerAvatar key={voterId} avatarId={game.players.find(pl => pl.id === voterId)?.avatarId || ''} className="w-5 h-5" />))}</div>)}</div>))}<div key="no_one"><motion.div onClick={() => !hasVoted && setSelectedVote('no_one')} className={cn("p-2 rounded-lg border-2 cursor-pointer text-center h-full flex flex-col justify-center", selectedVote === 'no_one' ? "border-primary bg-primary/10" : "border-transparent bg-muted", hasVoted && "cursor-not-allowed opacity-60")} whileTap={{ scale: hasVoted ? 1 : 0.95 }}><Users className="w-16 h-16 mx-auto text-muted-foreground"/><p className="font-bold mt-2">لا أحد</p></motion.div></div></div></ScrollArea></CardContent>
              <CardFooter className="flex-col gap-2">
                {hasVoted ? (<p className="text-center w-full text-green-600 font-bold">تم التصويت بنجاح. في انتظار الآخرين...</p>) : (<Button onClick={handleVote} disabled={isSubmitting || selectedVote === null || isTimeUp} className="w-full">تأكيد التصويت</Button>)}
                {isHost && <Button onClick={handleProceed} disabled={!isTimeUp || isSubmitting} className="w-full" variant="outline">{isSubmitting ? <Loader2 className="animate-spin" /> : 'إنهاء التصويت والانتقال للنتائج'}</Button>}
              </CardFooter>
          </Card>
        );
    };
    
     const renderVotingResults = () => {
        const votedOutPlayer = game.mafiaState?.lastVotedOut?.playerId ? game.players.find(p => p.id === game.mafiaState.lastVotedOut!.playerId) : null;
        return (
            <Card className="w-full max-w-md relative">
                {game.mafiaState?.timerEndsAt && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10"><CountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} onTimeUp={() => setIsTimeUp(true)}/></div>}
                <CardHeader className="text-center pt-20">
                    <Users className="w-16 h-16 mx-auto text-gray-500" />
                    <CardTitle className="text-3xl">نتيجة التصويت</CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                    {votedOutPlayer ? (
                        <div className="flex flex-col items-center gap-2">
                            <Skull className="w-12 h-12 text-destructive" />
                            <p className="text-xl">قررت المدينة التضحية بـ:</p>
                            <PlayerAvatar avatarId={votedOutPlayer.avatarId} className="w-24 h-24" />
                            <p className="text-2xl font-bold">{votedOutPlayer.name}</p>
                            <p className="text-lg text-muted-foreground">(كان {MAFIA_ROLES.find(r => r.id === votedOutPlayer.role)?.name})</p>
                        </div>
                    ) : (
                        <p className="text-xl text-muted-foreground">{game.mafiaState?.lastVotedOut?.tie ? "تعادل في الأصوات! لم يتم إقصاء أحد." : "لم يصوت أحد! لقد نجا الجميع هذه المرة."}</p>
                    )}
                </CardContent>
                 {isHost && (<CardFooter><Button onClick={handleProceed} disabled={!isTimeUp || isSubmitting} className="w-full">
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'المتابعة إلى الليل'} <ArrowRight />
                    </Button></CardFooter>)}
            </Card>
        );
     };

    switch (game.gameState) {
        case 'discussion': return renderDiscussion();
        case 'voting': return renderVoting();
        case 'voting_results': return renderVotingResults();
        default: return null;
    }
}
