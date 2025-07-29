

"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Game, Player, NightResult } from '@/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import * as killerActions from "@/lib/actions/killer";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { cn } from "@/lib/utils";
import { MessageSquare, Send, Timer, Users, Vote, Gavel, Heart, Shield, Eye, Search, Skull } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Timestamp } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DayPhaseProps {
    game: Game;
    self: Player;
}

const PlayerList = ({ players, selfId, onVote, hasVoted, isSubmitting, isTieBreaker, tiedPlayers }: { players: Player[], selfId: string, onVote: (id: string) => void, hasVoted: boolean, isSubmitting: boolean, isTieBreaker: boolean, tiedPlayers?: string[] }) => (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 h-full flex flex-col">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            {isTieBreaker ? <Gavel /> : <Users />}
            <span>{isTieBreaker ? 'المتهَمون' : 'الناجون'}</span>
        </h2>
        <ScrollArea className="flex-grow pr-2">
            <div className="space-y-2">
                {players.map(p => {
                    const canVote = p.id !== selfId && selfId && p.status === 'alive';
                    const isDisabledTiebreakerVote = isTieBreaker && tiedPlayers?.includes(selfId);
                    
                    return (
                        <motion.div 
                            key={p.id} 
                            className="flex items-center justify-between p-2 rounded-md bg-slate-700/60"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 * players.indexOf(p) }}
                        >
                            <div className="flex items-center gap-3">
                                <PlayerAvatar avatarId={p.avatarId} className={cn("w-12 h-12 border-2 rounded-full", p.status !== 'alive' ? "border-slate-600 grayscale" : "border-slate-400")}/>
                                <div>
                                    <p className={cn("font-bold text-lg text-white", p.status !== 'alive' && "line-through text-slate-400")}>{p.name}</p>
                                    <p className="text-xs text-slate-400">{p.status}</p>
                                </div>
                            </div>
                            {canVote && (
                                <Button size="sm" onClick={() => onVote(p.id)} disabled={hasVoted || isSubmitting || isDisabledTiebreakerVote} variant="destructive">
                                    <Vote />
                                </Button>
                            )}
                        </motion.div>
                    )})}
            </div>
        </ScrollArea>
    </div>
);


const NightEvents = ({ nightResults, self, show }: { nightResults: NightResult, self: Player, show: boolean }) => {
    const { killedPlayerName, wasSaved, detectiveCheckResult, spyCheckResult, spyWasSpotted } = nightResults;

    const events = [];

    // Public events
    if (killedPlayerName) {
        events.push({
            icon: Skull,
            title: "جريمة قتل!",
            description: `تم العثور على ${killedPlayerName} مقتولاً هذا الصباح.`,
            variant: "destructive",
            isPublic: true,
        });
    } else if (wasSaved) {
        events.push({
            icon: Heart,
            title: "محاولة قتل فاشلة!",
            description: "تم إنقاذ أحد اللاعبين من هجوم القاتل بفضل الطبيب.",
            variant: "default",
            isPublic: true,
        });
    }

    // Private events for roles
    if (self.role === 'detective' && detectiveCheckResult) {
         events.push({
            icon: Search,
            title: "تقريرك السري كمحقق",
            description: `الشخص الذي استهدفته (${detectiveCheckResult.targetName}) هو: ${detectiveCheckResult.role}.`,
            variant: "default",
        });
    }

    if (self.role === 'spy') {
        if(spyWasSpotted) {
            events.push({
                icon: Shield,
                title: "تم كشفك!",
                description: `لقد حاولت التجسس على الجندي. لقد تم كشف هويتك له!`,
                variant: "destructive",
            });
        } else if (spyCheckResult) {
            events.push({
                icon: Eye,
                title: "تقريرك السري كجاسوس",
                description: `الشخص الذي استهدفته (${spyCheckResult.targetName}) هو: ${spyCheckResult.role}.`,
                variant: "default",
            });
        }
    }
    
    if (!show || events.length === 0) return null;

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-2xl z-20 px-4">
             <AnimatePresence>
                {events.map((event, index) => {
                    if (!event.isPublic && !['detective', 'spy'].includes(self.role!)) {
                        return null;
                    }
                    return (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            transition={{ delay: index * 0.2 }}
                            className="mb-2"
                        >
                            <Alert variant={event.variant as any} className="bg-background/80 backdrop-blur-sm">
                                <event.icon className="h-4 w-4" />
                                <AlertTitle>{event.title}</AlertTitle>
                                <AlertDescription>
                                   {event.description}
                                </AlertDescription>
                            </Alert>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};



export function DayPhase({ game, self }: DayPhaseProps) {
    const { toast } = useToast();
    const [chatMessage, setChatMessage] = useState("");
    const [timeLeft, setTimeLeft] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const isHost = game.hostId === self.id;
    const actionCalled = useRef(false);
    
    const [showNightEvents, setShowNightEvents] = useState(false);
    
    useEffect(() => {
        if(game.gameState === 'discussion' && game.turn! > 1) {
            setShowNightEvents(true);
            const timer = setTimeout(() => setShowNightEvents(false), 8000); // Hide after 8 seconds
            return () => clearTimeout(timer);
        }
    }, [game.gameState, game.turn]);


    const hasVoted = useMemo(() => !!(game.votes && game.votes[self.id]), [game.votes, self.id]);
    const isTieBreaker = game.gameState === 'tie_breaker_voting';
    
    const votablePlayers = useMemo(() => {
        if (isTieBreaker && game.lastVoteResult?.tiedPlayers) {
            return game.players.filter(p => game.lastVoteResult!.tiedPlayers!.includes(p.id) && p.status === 'alive');
        }
        return game.players.filter(p => p.status === 'alive');
    }, [game.players, isTieBreaker, game.lastVoteResult]);

    const handleTimeout = useCallback(() => {
        if(isHost && !actionCalled.current) {
            actionCalled.current = true;
            killerActions.handleTimeout(self.id);
        }
    }, [isHost, self.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [game?.messages]);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        actionCalled.current = false;
        if (game.discussionEndsAt) {
            const endTime = game.discussionEndsAt instanceof Timestamp ? game.discussionEndsAt.toMillis() : new Date(game.discussionEndsAt as any).getTime();
            const updateTimer = () => {
                const remaining = Math.round((endTime - Date.now()) / 1000);
                setTimeLeft(Math.max(0, remaining));
                if (remaining <= 0) {
                    if (timer) clearInterval(timer);
                    handleTimeout();
                }
            };
            timer = setInterval(updateTimer, 1000);
            updateTimer();
        }
        return () => { if (timer) clearInterval(timer) };
    }, [game.discussionEndsAt, handleTimeout]);

    const handleSendMessage = () => {
        if (!chatMessage.trim() || !self || self.status !== 'alive') return;
        killerActions.submitMessage(game.id, self.id, chatMessage.trim());
        setChatMessage("");
    };

    const handleSubmitVote = async (votedId: string) => {
        if (!votedId || !self) return;
        setIsSubmitting(true);
        try {
            await killerActions.submitVote(game.id, self.id, votedId);
            toast({ title: "تم تسجيل صوتك بنجاح!" });
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 h-[85vh] p-4 relative">
             <NightEvents nightResults={game.nightResults || {}} self={self} show={showNightEvents} />

            <div className="lg:col-span-2 flex flex-col h-full bg-slate-800/50 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <MessageSquare />
                        <span>غرفة التحقيق (اليوم {game.turn})</span>
                    </h2>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/50 text-white text-lg">
                        <Timer className="w-6 h-6"/>
                        <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>
                            {timeLeft > 0 ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}` : "انتهى الوقت!"}
                        </span>
                    </div>
                </div>
                <ScrollArea className="flex-grow pr-4 -mr-4">
                    <div className="space-y-4" ref={messagesEndRef}>
                    {(game.messages || []).map((msg, index) => (
                        <motion.div 
                            key={index} 
                            className={cn("flex flex-col gap-1", msg.senderId === self.id ? "items-end" : "items-start")}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className={cn("rounded-lg px-4 py-2 max-w-lg shadow-lg", msg.senderId === self.id ? "bg-blue-800 text-white" : "bg-slate-200 text-slate-800")}>
                                <p className="font-bold text-sm mb-1">{msg.senderName}</p>
                                <p className="text-base whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        </motion.div>
                    ))}
                    </div>
                </ScrollArea>
                {self.status === 'alive' && (
                    <div className="flex gap-2 pt-4 mt-4 border-t border-slate-600">
                    <Input 
                        placeholder="اكتب رسالتك..." 
                        value={chatMessage} 
                        onChange={(e) => setChatMessage(e.target.value)} 
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        disabled={timeLeft === 0}
                        className="bg-slate-700 text-white border-slate-600 placeholder:text-slate-400 focus:ring-primary h-12 text-base"
                    />
                    <Button onClick={handleSendMessage} disabled={!chatMessage.trim() || timeLeft === 0} size="lg"><Send /></Button>
                    </div>
                )}
            </div>
            <div className="lg:col-span-1 h-full">
                <PlayerList 
                    players={votablePlayers} 
                    selfId={self.id} 
                    onVote={handleSubmitVote} 
                    hasVoted={hasVoted} 
                    isSubmitting={isSubmitting}
                    isTieBreaker={isTieBreaker}
                    tiedPlayers={game.lastVoteResult?.tiedPlayers}
                />
            </div>
        </div>
    );
}
