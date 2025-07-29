
"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Game, Player } from '@/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import * as killerActions from "@/lib/actions/killer";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { cn } from "@/lib/utils";
import { MessageSquare, Send, Timer, Users, Vote, Gavel, Skull, ShieldCheck, Search, Eye, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Timestamp } from 'firebase/firestore';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface DayPhaseProps {
    game: Game;
    self: Player;
}

const PlayerList = ({ players, selfId, onVote, hasVoted, isSubmitting, isTieBreaker, tiedPlayers }: { players: Player[], selfId: string, onVote: (id: string) => void, hasVoted: boolean, isSubmitting: boolean, isTieBreaker: boolean, tiedPlayers?: string[] }) => (
    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                {isTieBreaker ? <Gavel /> : <Users />}
                <span>{isTieBreaker ? 'المتهمون' : 'اللاعبون'}</span>
            </CardTitle>
            <CardDescription>{isTieBreaker ? 'صوّت لأحد المتهمين' : 'اختر لاعبًا للتصويت ضده.'}</CardDescription>
        </CardHeader>
        <CardContent>
            <ScrollArea className="h-64 pr-2">
                <div className="space-y-2">
                    {players.map(p => {
                        const canVote = p.id !== selfId && selfId && p.status === 'alive';
                        // A player cannot vote if they are one of the tied players in a tie-breaker.
                        const isDisabledTiebreakerVote = isTieBreaker && tiedPlayers?.includes(selfId);
                        
                        return (
                        <motion.div 
                            key={p.id} 
                            className="flex items-center justify-between p-2 rounded-md bg-muted"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 * players.indexOf(p) }}
                        >
                            <div className="flex items-center gap-2">
                                <PlayerAvatar avatarId={p.avatarId} className={cn("w-10 h-10", p.status !== 'alive' && "grayscale")}/>
                                <div>
                                    <p className={cn("font-bold", p.status !== 'alive' && "line-through text-muted-foreground")}>{p.name}</p>
                                    <p className="text-xs text-muted-foreground">{p.status}</p>
                                </div>
                            </div>
                            {canVote && (
                                <Button size="sm" onClick={() => onVote(p.id)} disabled={hasVoted || isSubmitting || isDisabledTiebreakerVote}>
                                    <Vote />
                                </Button>
                            )}
                        </motion.div>
                    )})}
                </div>
            </ScrollArea>
        </CardContent>
    </Card>
);

const NightResultsDisplay = ({ game, self }: { game: Game, self: Player }) => {
    const [isVisible, setIsVisible] = useState(false);
    const { killedPlayerName, wasSaved, detectiveCheckResult, spyCheckResult, spyWasSpotted } = game.nightResults || {};
    
    const isDetective = self.role === 'detective';
    const isSpy = self.role === 'spy';

    useEffect(() => {
        // Show results only on discussion start (turn change)
        if (game.gameState === 'discussion' && game.turn! > 1) {
            setIsVisible(true);
            const timer = setTimeout(() => setIsVisible(false), 8000); // Hide after 8 seconds
            return () => clearTimeout(timer);
        }
    }, [game.gameState, game.turn]);

    if (!isVisible) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-md"
            >
                <div className="bg-background/80 backdrop-blur-sm p-4 rounded-lg shadow-lg border space-y-2">
                    <h3 className="font-bold text-center">أحداث الليلة الماضية</h3>
                    {/* Public Information */}
                    {killedPlayerName && <Alert variant="destructive"><Skull className="h-4 w-4" /><AlertTitle>جريمة قتل!</AlertTitle><AlertDescription>تم العثور على <strong>{killedPlayerName}</strong> مقتولاً هذا الصباح.</AlertDescription></Alert>}
                    {wasSaved && <Alert className="border-green-500 text-green-700"><ShieldCheck className="h-4 w-4 text-green-600" /><AlertTitle>نجاة!</AlertTitle><AlertDescription>نجا أحد اللاعبين من هجوم بفضل الطبيب.</AlertDescription></Alert>}
                    {!killedPlayerName && !wasSaved && <p className="text-muted-foreground text-center text-sm">مرت الليلة بسلام دون أي حوادث قتل.</p>}

                    {/* Private Information */}
                    {isDetective && detectiveCheckResult && <Alert className="border-blue-500 text-blue-700"><Search className="h-4 w-4 text-blue-600" /><AlertTitle>تقريرك السري</AlertTitle><AlertDescription>اللاعب <strong>{detectiveCheckResult.targetName}</strong> دوره هو <strong>{detectiveCheckResult.role}</strong>.</AlertDescription></Alert>}
                    {isSpy && spyCheckResult && <Alert className="border-purple-500 text-purple-700"><Eye className="h-4 w-4 text-purple-600" /><AlertTitle>تقريرك السري</AlertTitle><AlertDescription>اللاعب <strong>{spyCheckResult.targetName}</strong> دوره هو <strong>{spyCheckResult.role}</strong>.</AlertDescription></Alert>}
                    {isSpy && spyWasSpotted && <Alert variant="destructive"><FileText className="h-4 w-4" /><AlertTitle>تم كشفك!</AlertTitle><AlertDescription>لقد حاولت التجسس على الجندي، وتم كشف هويتك له.</AlertDescription></Alert>}
                </div>
            </motion.div>
        </AnimatePresence>
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
            killerActions.handleTimeout(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);

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
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6 h-[85vh] relative">
            <NightResultsDisplay game={game} self={self} />

            <div className="lg:col-span-2 flex flex-col h-full">
                <Card className="flex-grow flex flex-col">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <MessageSquare />
                                <span>غرفة التحقيق (اليوم {game.turn})</span>
                            </CardTitle>
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted text-sm">
                                <Timer className="w-5 h-5"/>
                                <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>
                                    {timeLeft > 0 ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}` : "انتهى الوقت!"}
                                </span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-grow overflow-hidden flex flex-col gap-4">
                       <ScrollArea className="flex-grow pr-4">
                         <div className="space-y-4" ref={messagesEndRef}>
                            {(game.messages || []).map((msg, index) => (
                                <motion.div 
                                    key={index} 
                                    className={cn("flex flex-col gap-1", msg.senderId === self.id ? "items-end" : "items-start")}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <div className={cn("rounded-lg px-3 py-2 max-w-sm", msg.senderId === self.id ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                        <p className="font-bold text-xs mb-1">{msg.senderName}</p>
                                        <p className="text-sm">{msg.text}</p>
                                    </div>
                                </motion.div>
                            ))}
                         </div>
                       </ScrollArea>
                       {self.status === 'alive' && (
                         <div className="flex gap-2 pt-2 border-t">
                            <Input 
                                placeholder="اكتب رسالتك..." 
                                value={chatMessage} 
                                onChange={(e) => setChatMessage(e.target.value)} 
                                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                disabled={timeLeft === 0}
                            />
                            <Button onClick={handleSendMessage} disabled={!chatMessage.trim() || timeLeft === 0}><Send /></Button>
                         </div>
                       )}
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-1 flex flex-col gap-4 h-full">
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
