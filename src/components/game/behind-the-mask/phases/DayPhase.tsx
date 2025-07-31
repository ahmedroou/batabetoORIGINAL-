
"use client";

import type { Game, Player, DayEvent, PublicChatMessage, PrivateEvent } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Skull, ShieldCheck, Search, Gavel, Info, FileText, Send, Loader2, User, UserCheck, UserX, ThumbsUp, ThumbsDown, Vote, Ban, Square, CheckSquare, X, VenetianMask } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { processDay, sendPublicMessage, submitVote } from '@/lib/actions/behind-the-mask';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '../../PlayerAvatar';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { ROLES } from '@/data/mafia-roles';

interface DayPhaseProps {
    game: Game;
    self: Player;
}

type DisplayMessage = PublicChatMessage & { pending?: boolean };
type QuickReaction = "👍" | "👎" | "🤔" | "🤫";

const PLAYER_COLORS = [
    'text-red-400', 'text-blue-400', 'text-green-400', 'text-yellow-400',
    'text-purple-400', 'text-pink-400', 'text-indigo-400', 'text-teal-400'
];

const PRIVATE_EVENT_ICONS: Record<PrivateEvent['type'], React.ElementType> = {
    investigation_result: Search,
    spy_result: UserCheck,
    spy_result_soldier_block: UserX,
    doctor_success: ShieldCheck,
};

const SecretReportCard = ({ event, onClose }: { event: PrivateEvent, onClose: () => void }) => {
    const roleDetails = event.targetPlayer?.role ? ROLES[event.targetPlayer.role] : null;
    return (
        <motion.div 
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="w-full max-w-sm"
                initial={{ scale: 0.5, rotateY: 90 }}
                animate={{ scale: 1, rotateY: 0 }}
                exit={{ scale: 0.5, rotateY: -90 }}
                transition={{ duration: 0.4, type: 'spring' }}
                onClick={(e) => e.stopPropagation()}
            >
                <Card className="bg-slate-800 border-yellow-500/50 text-white shadow-2xl overflow-hidden">
                    <CardHeader className="bg-slate-900/50 p-4 border-b border-yellow-500/30">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-yellow-300">
                                <FileText /> تقرير سري
                            </CardTitle>
                             <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white h-8 w-8" onClick={onClose}>
                                <X/>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 text-center space-y-4">
                        <PlayerAvatar avatarId={event.targetPlayer?.avatarId || 'Avatar01.png'} className="w-32 h-32 mx-auto rounded-full border-4 border-yellow-400" />
                        <h3 className="text-2xl font-bold">{event.targetPlayer?.name}</h3>
                        <p className="text-lg text-slate-200 bg-black/30 p-3 rounded-md">{event.message}</p>
                         {roleDetails && (
                            <div className="flex items-center justify-center gap-2 p-2 bg-purple-900/50 rounded-lg">
                                <VenetianMask className="w-5 h-5 text-purple-300" />
                                <span className="font-bold text-purple-200">الدور: {roleDetails.name}</span>
                            </div>
                         )}
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div>
    );
};


export function DayPhase({ game, self }: DayPhaseProps) {
    const { toast } = useToast();
    const [message, setMessage] = useState("");
    const [timeLeft, setTimeLeft] = useState(180);
    const [optimisticMessages, setOptimisticMessages] = useState<DisplayMessage[]>([]);
    const [selectedVote, setSelectedVote] = useState<string | null>(game.mafiaState?.votes?.[self.id] || null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedReport, setSelectedReport] = useState<PrivateEvent | null>(null);

    const events = game.mafiaState?.events || [];
    const privateEvents = game.mafiaState?.privateEvents?.[self.id] || [];
    const publicChat = game.mafiaState?.publicChat || [];
    const isHost = game.hostId === self.id;
    const canVote = self.status === 'alive';
    const hasVoted = !!game.mafiaState?.votes?.[self.id];
    const votes = game.mafiaState?.votes || {};

    const scrollViewportRef = useRef<HTMLDivElement>(null);

    const handleProcessDay = useCallback(async () => {
        if (isHost) {
            await processDay(game.id, self.id).catch(e => console.error("Host failed to process day on timeout", e));
        }
    }, [isHost, game.id, self.id]);

    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        const endTime = game.mafiaState.timerEndsAt.toMillis();

        const updateTimer = () => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0) {
                handleProcessDay();
            }
        };

        const timer = setInterval(updateTimer, 1000);
        updateTimer();
        return () => clearInterval(timer);
    }, [game.mafiaState?.timerEndsAt, handleProcessDay]);

    useEffect(() => {
        if (scrollViewportRef.current) {
            scrollViewportRef.current.scrollTo({ top: scrollViewportRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [publicChat, optimisticMessages]);
    
    useEffect(() => {
        setOptimisticMessages([]);
    }, [publicChat]);

    const handleVote = async (targetId: string | null) => {
        if (!canVote || hasVoted) return;
        
        setIsSubmitting(true);
        setSelectedVote(targetId); // Optimistic UI update
        try {
            await submitVote(game.id, self.id, targetId);
        } catch (error: any) {
            toast({ title: "خطأ في التصويت", description: error.message, variant: 'destructive' });
            setSelectedVote(game.mafiaState?.votes?.[self.id] || null); // Revert optimistic update
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const messageToSend = message.trim();
        if (!messageToSend || self.status !== 'alive') return;
        sendMessage(messageToSend);
        setMessage("");
    };
    
    const handleQuickReaction = (reaction: QuickReaction) => {
        if (self.status !== 'alive') return;
        sendMessage(reaction);
    }
    
    const sendMessage = async (content: string) => {
        const optimisticMessage: DisplayMessage = {
            senderId: self.id,
            senderName: self.name,
            message: content,
            timestamp: Timestamp.now(),
            pending: true,
        };

        setOptimisticMessages(prev => [...prev, optimisticMessage]);

        try {
            await sendPublicMessage(game.id, {
                senderId: self.id,
                senderName: self.name,
                message: content,
            });
        } catch (error: any) {
            toast({ title: "فشل إرسال الرسالة", description: error.message, variant: 'destructive' });
            setOptimisticMessages(prev => prev.filter(msg => msg !== optimisticMessage));
        }
    }


    const playerColors = game.players.reduce((acc, player, index) => {
        acc[player.id] = PLAYER_COLORS[index % PLAYER_COLORS.length];
        return acc;
    }, {} as Record<string, string>);
    
    const minutesLeft = Math.floor(timeLeft / 60);
    const secondsLeft = timeLeft % 60;
    
    const allMessages: DisplayMessage[] = [...publicChat, ...optimisticMessages];
    
    const alivePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    
    const voteCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        Object.values(votes).forEach(targetId => {
            if(targetId) {
                counts[targetId] = (counts[targetId] || 0) + 1;
            }
        });
        return counts;
    }, [votes]);

    return (
        <>
            <AnimatePresence>
                {selectedReport && <SecretReportCard event={selectedReport} onClose={() => setSelectedReport(null)} />}
            </AnimatePresence>
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-slate-900 via-sky-800 to-amber-300">
                <div className="w-full max-w-7xl h-[95vh] flex flex-col">
                    <header className="text-center shrink-0 mb-4">
                        <Sun className="w-12 h-12 mx-auto text-yellow-300 animate-pulse-glow" />
                        <h1 className="text-4xl font-bold text-slate-100">مرحلة النقاش والتصويت ({minutesLeft}:{secondsLeft.toString().padStart(2, '0')})</h1>
                        <p className="text-lg text-slate-300">
                           ناقش، حقق، وصوّت لإعدام من تشك به.
                        </p>
                    </header>
                    <main className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0">
                        {/* Center Column: Chat & Input */}
                        <div className="md:col-span-2 flex flex-col h-full bg-black/30 backdrop-blur-sm border border-slate-500/50 text-white rounded-lg p-4">
                            <ScrollArea className="flex-grow h-full pr-2" viewportRef={scrollViewportRef}>
                                <div className="space-y-4">
                                {allMessages.map((msg, i) => {
                                    const isQuickReaction = ["👍", "👎", "🤔", "🤫"].includes(msg.message);
                                    return (
                                        <div key={i} className={cn("flex items-start gap-3 w-full transition-opacity", msg.senderId === self.id ? "flex-row-reverse" : "", msg.pending ? "opacity-60" : "opacity-100")}>
                                            <PlayerAvatar avatarId={game.players.find(p => p.id === msg.senderId)?.avatarId || 'Avatar01.png'} className="w-10 h-10 shrink-0 mt-1"/>
                                            <div className={cn("p-3 rounded-xl max-w-[80%]", 
                                                msg.senderId === self.id ? "bg-primary rounded-br-none" : "bg-slate-700 rounded-bl-none",
                                                isQuickReaction ? "bg-transparent shadow-none" : ""
                                            )}>
                                                {!isQuickReaction && <p className={cn("font-bold text-sm mb-1", playerColors[msg.senderId])}>{msg.senderName}</p>}
                                                <p className={cn("text-base text-slate-100 whitespace-pre-wrap", isQuickReaction ? "text-5xl" : "")}>{msg.message}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                                </div>
                            </ScrollArea>
                            <div className="shrink-0 pt-4 space-y-2">
                                <div className="flex justify-center gap-2">
                                     {(["👍", "👎", "🤔", "🤫"] as QuickReaction[]).map(r => (
                                         <Button key={r} variant="outline" size="icon" onClick={() => handleQuickReaction(r)} disabled={!canVote} className="bg-slate-800 border-slate-600 hover:bg-slate-700 text-2xl">
                                             {r}
                                         </Button>
                                     ))}
                                </div>
                                <form onSubmit={handleSendMessage} className="flex gap-2">
                                    <Input 
                                        placeholder={canVote ? "اكتب رسالتك..." : "لا يمكنك الحديث وأنت ميت."}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        disabled={!canVote}
                                        className="bg-slate-800 border-slate-600 focus:ring-primary text-base text-white"
                                    />
                                    <Button type="submit" size="icon" disabled={!message.trim() || !canVote}>
                                        <Send />
                                    </Button>
                                </form>
                            </div>
                        </div>

                        {/* Right Column: Info & Actions */}
                        <div className="md:col-span-1 flex flex-col gap-4 h-full">
                            {/* Voting Panel */}
                            <Card className="bg-black/30 border-slate-700 text-white">
                                <CardHeader className="p-3">
                                    <CardTitle className="flex items-center justify-center gap-2 text-red-400">
                                        <Gavel/> ساحة الإعدام
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-3 space-y-2">
                                    <p className="text-sm text-center text-slate-400">اختر من تريد التصويت ضده. يمكنك تغيير صوتك.</p>
                                    <div className="space-y-2">
                                        {alivePlayers.map(player => (
                                            <Button key={player.id} variant={selectedVote === player.id ? 'destructive' : 'secondary'} className="w-full justify-between h-12" onClick={() => handleVote(player.id)} disabled={!canVote || hasVoted}>
                                                <div className='flex items-center gap-2'>
                                                    <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8"/>
                                                    <span>{player.name} {player.id === self.id ? '(أنت)' : ''}</span>
                                                </div>
                                                <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-xs">
                                                    <User className="w-3 h-3"/>
                                                    <span>{voteCounts[player.id] || 0}</span>
                                                </div>
                                            </Button>
                                        ))}
                                         <Button variant={selectedVote === null ? 'destructive' : 'secondary'} className="w-full justify-between h-12 bg-slate-600 hover:bg-slate-700" onClick={() => handleVote(null)} disabled={!canVote || hasVoted}>
                                            <div className="flex items-center gap-2">
                                                <Ban className="w-8 h-8"/>
                                                <span>تخطي التصويت</span>
                                            </div>
                                             <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-xs">
                                                <User className="w-3 h-3"/>
                                                <span>{Object.values(votes).filter(v => v === null).length}</span>
                                            </div>
                                        </Button>
                                    </div>
                                    {hasVoted && <p className="text-center text-green-400 font-bold p-2">تم تسجيل صوتك بنجاح!</p>}
                                </CardContent>
                            </Card>
                            
                            {/* Secret Reports */}
                            <Card className="bg-black/30 border-slate-700 text-white">
                                <CardHeader className="p-3">
                                    <CardTitle className="flex items-center justify-center gap-2 text-purple-300">
                                        <FileText/> تقارير سرية
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-3">
                                    {privateEvents.length > 0 ? (
                                        <div className="space-y-2">
                                            {privateEvents.map((event, index) => (
                                                <Button key={index} variant="outline" className="w-full justify-start gap-2 bg-slate-800 border-purple-600 hover:bg-slate-700 text-white" onClick={() => setSelectedReport(event)}>
                                                    <FileText className="w-4 h-4 text-purple-400"/>
                                                    تقرير عن {event.targetPlayer?.name}
                                                </Button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-center text-slate-400">لا توجد تقارير لك.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
