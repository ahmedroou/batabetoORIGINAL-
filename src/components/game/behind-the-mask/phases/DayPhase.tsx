
"use client";

import type { Game, Player, DayEvent, PublicChatMessage } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Skull, ShieldCheck, Search, Gavel, Info, FileText, Send, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { transitionToVoting, sendPublicMessage } from '@/lib/actions/behind-the-mask';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '../../PlayerAvatar';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface DayPhaseProps {
    game: Game;
    self: Player;
}

const EVENT_ICONS: Record<DayEvent['type'], React.ElementType> = {
    death: Skull,
    protection: ShieldCheck,
    investigation: Search,
    execution: Skull,
    spy_reveal: Search,
};

const PLAYER_COLORS = [
    'text-red-500', 'text-blue-500', 'text-green-500', 'text-yellow-500',
    'text-purple-500', 'text-pink-500', 'text-indigo-500', 'text-teal-500'
];

export function DayPhase({ game, self }: DayPhaseProps) {
    const { toast } = useToast();
    const [isSubmittingVote, setIsSubmittingVote] = useState(false);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [message, setMessage] = useState("");

    const events = game.mafiaState?.events || [];
    const privateEvents = game.mafiaState?.privateEvents?.[self.id] || [];
    const publicChat = game.mafiaState?.publicChat || [];
    const isHost = game.hostId === self.id;

    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [publicChat]);

    const handleStartVoting = async () => {
        if (!isHost) return;
        setIsSubmittingVote(true);
        try {
            await transitionToVoting(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmittingVote(false);
        }
    };
    
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || self.status !== 'alive') return;

        setIsSendingMessage(true);
        try {
            await sendPublicMessage(game.id, {
                senderId: self.id,
                senderName: self.name,
                message: message.trim(),
            });
            setMessage("");
        } catch (error: any) {
            toast({ title: "فشل إرسال الرسالة", description: error.message, variant: 'destructive' });
        } finally {
            setIsSendingMessage(false);
        }
    };

    const playerColors = game.players.reduce((acc, player, index) => {
        acc[player.id] = PLAYER_COLORS[index % PLAYER_COLORS.length];
        return acc;
    }, {} as Record<string, string>);

    return (
        <Card className="w-full max-w-4xl h-[90vh] flex flex-col bg-gradient-to-b from-slate-800 via-slate-900 to-black backdrop-blur-sm border-slate-700 text-white">
            <CardHeader className="text-center shrink-0">
                <Sun className="w-16 h-16 mx-auto text-yellow-300 animate-pulse-glow" />
                <CardTitle className="text-4xl font-bold text-slate-100">أشرقت الشمس...</CardTitle>
                <CardDescription className="text-lg text-slate-400">
                    حان وقت النقاش. هذه هي أحداث الليلة الماضية:
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col min-h-0 gap-4">
                {privateEvents.length > 0 && (
                     <Alert className="mb-2 bg-purple-900/50 border-purple-700 shadow-md shrink-0">
                      <FileText className="h-5 w-5 text-purple-300" />
                      <AlertTitle className="text-purple-200 font-bold">تقرير سري لك فقط</AlertTitle>
                      <AlertDescription className="text-purple-300 text-base">
                         {privateEvents.join(' ')}
                      </AlertDescription>
                    </Alert>
                )}
                
                {events.length > 0 && (
                    <div className="p-2 bg-black/30 rounded-lg border border-slate-700 shrink-0">
                        <div className="flex justify-center gap-4">
                            <AnimatePresence>
                                {events.map((event, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0, transition: { delay: index * 0.3 } }}
                                        className={cn("flex items-center gap-2 p-2 rounded-md shadow-sm border text-sm", 
                                          event.type === 'death' ? 'bg-red-900/50 border-red-700 text-red-200' : 'bg-green-900/50 border-green-700 text-green-200'
                                        )}
                                    >
                                        <Icon className="w-4 h-4 flex-shrink-0" />
                                        <p className="font-medium">{event.message}</p>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
                
                {/* Chat Area */}
                <div className="flex-grow bg-black/40 rounded-lg p-4 border border-slate-800 min-h-0">
                    <ScrollArea className="h-full" ref={scrollAreaRef}>
                        <div className="space-y-4 pr-2">
                           {publicChat.map((msg, i) => (
                               <div key={i} className={cn("flex items-start gap-3", msg.senderId === self.id ? "flex-row-reverse" : "")}>
                                   <PlayerAvatar avatarId={game.players.find(p => p.id === msg.senderId)?.avatarId || 'Avatar01.png'} className="w-10 h-10 shrink-0 mt-1"/>
                                   <div className={cn("p-3 rounded-lg max-w-[80%]", msg.senderId === self.id ? "bg-primary/80 rounded-br-none" : "bg-slate-700 rounded-bl-none")}>
                                       <p className={cn("font-bold text-sm mb-1", playerColors[msg.senderId])}>{msg.senderName}</p>
                                       <p className="text-base text-slate-100 whitespace-pre-wrap">{msg.message}</p>
                                   </div>
                               </div>
                           ))}
                        </div>
                    </ScrollArea>
                </div>
                
                 {/* Message Input Form */}
                <form onSubmit={handleSendMessage} className="flex gap-2 shrink-0">
                    <Input 
                        placeholder={self.status === 'alive' ? "اكتب رسالتك..." : "لا يمكنك الحديث وأنت ميت."}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        disabled={isSendingMessage || self.status !== 'alive'}
                        className="bg-slate-800 border-slate-600 focus:ring-primary text-base"
                    />
                    <Button type="submit" size="icon" disabled={isSendingMessage || !message.trim() || self.status !== 'alive'}>
                        {isSendingMessage ? <Loader2 className="animate-spin" /> : <Send />}
                    </Button>
                </form>

                 <div className="mt-2 text-center shrink-0">
                    {isHost ? (
                        <Button size="lg" onClick={handleStartVoting} disabled={isSubmittingVote}>
                            <Gavel className="ml-2"/>
                            {isSubmittingVote ? 'جاري...' : 'بدء التصويت'}
                        </Button>
                    ) : (
                        <p className="text-slate-500 animate-pulse">في انتظار المضيف لبدء التصويت...</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

