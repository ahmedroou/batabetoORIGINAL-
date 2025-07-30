
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Game, Player, MafiaRole, Team, PrivateChat, ChatMessage } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { Timer, Loader2, ArrowRight, Send, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

// --- Role Card Imports ---
import { CivilianCard } from '../cards/CivilianCard';
import { SoldierCard } from '../cards/SoldierCard';
import { KillerCard } from '../cards/KillerCard';
import { DoctorCard } from '../cards/DoctorCard';
import { DetectiveCard } from '../cards/DetectiveCard';
import { SpyCard } from '../cards/SpyCard';
import { ExplosiveCard } from '../cards/ExplosiveCard';
import { ShifterCard } from '../cards/ShifterCard';

const CountdownTimer = ({ expiryTimestamp, onTimeUp }: { expiryTimestamp: number; onTimeUp: () => void; }) => {
    const calculateTimeLeft = useCallback(() => Math.max(0, Math.round((expiryTimestamp - Date.now()) / 1000)), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const onTimeUpRef = useRef(onTimeUp);
    onTimeUpRef.current = onTimeUp;

    useEffect(() => {
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
            isLowTime ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-gray-700 text-gray-200',
            timeLeft === 0 && 'bg-destructive/20 text-destructive'
            )}>
            <Timer className="h-6 w-6" />
            <div className="text-lg font-bold font-mono">
               {timeLeft > 0 ? String(timeLeft).padStart(2, '0') : "انتهى الوقت"}
            </div>
        </div>
    );
};

const PrivateChatComponent = ({ chat, selfId, gameId }: { chat: PrivateChat; selfId: string; gameId: string }) => {
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [chat.messages]);

    const handleSendMessage = async () => {
        if (!message.trim() || isSending) return;
        setIsSending(true);
        await mafiaActions.sendPrivateChatMessage(gameId, selfId, chat.id, message);
        setMessage('');
        setIsSending(false);
    };

    return (
        <Card className="bg-gray-800/50 border-gray-700 mt-4">
            <CardHeader className="p-3">
                <CardTitle className="text-base flex items-center gap-2 text-yellow-300"><MessagesSquare /> دردشة خاصة</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
                <ScrollArea className="h-32 pr-2">
                     <div ref={scrollAreaRef} className="space-y-2">
                        {chat.messages.map((msg, index) => (
                             <div key={index} className={cn("flex flex-col", msg.senderId === selfId ? "items-end" : "items-start")}>
                                <div className={cn("p-2 rounded-lg max-w-[80%]", msg.senderId === selfId ? "bg-blue-900" : "bg-gray-700")}>
                                    <p className="text-xs font-bold text-yellow-400">{msg.senderName}</p>
                                    <p className="text-sm">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
            <CardFooter className="p-3">
                 <div className="flex gap-2 w-full">
                    <Input value={message} onChange={(e) => setMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="اكتب رسالتك..." className="bg-gray-900 border-gray-600 text-white" />
                    <Button onClick={handleSendMessage} disabled={isSending || !message.trim()} size="icon">
                        {isSending ? <Loader2 className="animate-spin" /> : <Send />}
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
};

interface NightPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
    isSubmitting: boolean;
    setIsSubmitting: (isSubmitting: boolean) => void;
}

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


export function NightPhase({ game, self, isHost, isSubmitting, setIsSubmitting }: NightPhaseProps) {
    const { toast } = useToast();
    const selfRoleDetails = useMemo(() => MAFIA_ROLES.find(r => r.id === self.role), [self.role]);
    const hasActed = !!game.mafiaState?.nightActions?.[self.id];
    const [isTimeUp, setIsTimeUp] = useState(false);

    const alivePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    const myPrivateChat = useMemo(() => game.mafiaState?.privateChats?.find(c => c.members.includes(self.id)), [game.mafiaState?.privateChats, self.id]);

     useEffect(() => {
        setIsTimeUp(!game.mafiaState?.timerEndsAt || Date.now() >= game.mafiaState.timerEndsAt.toMillis());
    }, [game.mafiaState?.timerEndsAt]);

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

    const handleProceed = async () => {
        if (!isHost || !isTimeUp) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.hostProgressNextPhase(game.id, self.id);
        } catch(e) {
            console.error(e)
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // Get the specific component for the player's role.
    const SpecificRoleCard = self.role ? roleCardMap[self.role] : null;

    return (
        <Card className="w-full max-w-lg bg-gray-900/80 backdrop-blur-sm text-white border-gray-700 relative">
             {game.mafiaState?.timerEndsAt && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10"><CountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} onTimeUp={() => setIsTimeUp(true)} /></div>}
            <CardHeader className="text-center pt-20">
                <CardTitle className="text-3xl">الليل</CardTitle>
                <CardDescription className="text-gray-400">حل الظلام... يقوم أصحاب الأدوار الخاصة بتنفيذ حركاتهم.</CardDescription>
            </CardHeader>
            <CardContent>
                {!self.role || !SpecificRoleCard ? (
                    <div className="w-full max-w-md text-center text-gray-300">
                        <CardHeader className="p-2">
                            <CardTitle className="text-xl">جاري عرض دورك...</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                        </CardContent>
                    </div>
                ) : (
                    <SpecificRoleCard self={self} alivePlayers={alivePlayers} hasActed={hasActed} handleAction={handleAction} isSubmitting={isSubmitting || isTimeUp} />
                )}
                {myPrivateChat && <PrivateChatComponent chat={myPrivateChat} selfId={self.id} gameId={game.id} />}
            </CardContent>
            {isHost && (
                <CardFooter>
                    <Button onClick={handleProceed} disabled={!isTimeUp || isSubmitting} className="w-full">
                         {isSubmitting ? <Loader2 className="animate-spin" /> : 
                          isTimeUp ? 'الانتقال إلى النهار' : 'انتظر انتهاء الوقت'} 
                         <ArrowRight />
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
