
"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Game, Player, PlayerRole, NightAction, PrivateChatMessage, PrivateChat } from '@/types';
import { Button } from '@/components/ui/button';
import { ROLES } from '@/data/mafia-roles';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { submitNightAction, processNight, sendPrivateMessage } from '@/lib/actions/behind-the-mask';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Bed, Shield, Search, Eye, Bomb, VenetianMask, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface NightPhaseProps {
    game: Game;
    self: Player;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
    kill: Bed,
    heal: Shield,
    investigate: Search,
    spy: Eye,
    bomb: Bomb,
    shapeshift: VenetianMask,
};

const getActionTypeForRole = (role: PlayerRole): NightActionType | null => {
    switch (role) {
        case 'killer': return 'kill';
        case 'doctor': return 'heal';
        case 'detective': return 'investigate';
        case 'spy': return 'spy';
        case 'bomber': return 'bomb';
        case 'shapeshifter': return 'shapeshift';
        default: return null;
    }
}

export function NightPhase({ game, self }: NightPhaseProps) {
    const { toast } = useToast();
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(40);
    const actionCalled = useRef(false);
    
    const [selectedDisguise, setSelectedDisguise] = useState<PlayerRole | null>(null);
    
    // Chat states
    const [chatMessage, setChatMessage] = useState("");
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);


    const isHost = game.hostId === self.id;
    const myRoleDetails = self.role ? ROLES[self.role] : null;
    const myActionType = myRoleDetails ? getActionTypeForRole(myRoleDetails.id) : null;
    const hasSubmittedAction = !!game.mafiaState?.nightActions?.[self.id];
    
    const targetablePlayers = game.players.filter(p => {
        if (p.status !== 'alive') return false;
        // Doctor cannot target themselves
        if (myActionType === 'heal' && p.id === self.id) return false;
        return true;
    });

    const disguiseOptions: PlayerRole[] = ['doctor', 'detective', 'soldier', 'civilian'];


    const myPrivateChat: {id: string, chat: PrivateChat} | null = useMemo(() => {
        const chats = game.mafiaState?.privateChats || {};
        const chatEntry = Object.entries(chats).find(([_, chat]) => chat.participants.includes(self.id));
        return chatEntry ? { id: chatEntry[0], chat: chatEntry[1] } : null;
    }, [game.mafiaState?.privateChats, self.id]);

    useEffect(() => {
        if(scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [myPrivateChat?.chat.messages]);


    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        const endTime = game.mafiaState.timerEndsAt.toMillis();

        const updateTimer = () => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0 && isHost && !actionCalled.current) {
                actionCalled.current = true;
                processNight(game.id, self.id);
            }
        };

        const timer = setInterval(updateTimer, 1000);
        updateTimer();
        return () => clearInterval(timer);

    }, [game.mafiaState?.timerEndsAt, isHost, game.id, self.id]);


    const handleTargetSelection = (targetId: string) => {
        if (hasSubmittedAction || isSubmitting) return;
        setSelectedTargetId(targetId);
    };

    const handleSubmit = async () => {
        if (hasSubmittedAction) return;

        let finalAction: NightAction | null = null;
        if (myActionType === 'shapeshifter') {
            if (!selectedDisguise) {
                toast({ title: "الرجاء اختيار شخصية للتنكر", variant: "destructive" });
                return;
            }
            finalAction = {
                actorId: self.id,
                action: 'shapeshift',
                targetId: self.id,
                disguiseRole: selectedDisguise,
            };
        } else if (myActionType && selectedTargetId) {
             finalAction = {
                actorId: self.id,
                action: myActionType,
                targetId: selectedTargetId,
            };
        } else if (myActionType) {
            toast({ title: "الرجاء اختيار هدف", variant: "destructive" });
            return;
        } else {
            return; // No action to submit
        }
        
        setIsSubmitting(true);
        const result = await submitNightAction(game.id, finalAction);

        if (result.success) {
            toast({ title: "تم تسجيل قرارك بنجاح." });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };
    
     const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatMessage.trim() || !myPrivateChat) return;

        setIsSendingMessage(true);
        try {
            await sendPrivateMessage(game.id, myPrivateChat.id, {
                senderId: self.id,
                senderName: self.name,
                message: chatMessage.trim(),
            });
            setChatMessage("");
        } catch (error: any) {
            toast({ title: "فشل إرسال الرسالة", description: error.message, variant: 'destructive' });
        } finally {
            setIsSendingMessage(false);
        }
    };

    if (!myRoleDetails || !myActionType) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white text-center">
                 <Bed className="w-24 h-24 text-blue-300 mb-4" />
                <h1 className="text-4xl font-bold">حل الظلام...</h1>
                <p className="text-xl text-muted-foreground mt-2 animate-pulse">أنت نائم... في انتظار مرور الليل.</p>
                <p className="font-mono text-2xl mt-4">{timeLeft}</p>
            </div>
        );
    }
    
    const ActionIcon = ACTION_ICONS[myActionType] || Bed;

    return (
        <div className="w-full max-w-4xl h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white">
            <p className="font-mono text-2xl absolute top-4">{timeLeft}</p>
             <AnimatePresence mode="wait">
                {hasSubmittedAction ? (
                    <motion.div
                        key="submitted"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <CheckCircle className="w-24 h-24 text-green-400 mx-auto mb-4" />
                        <h1 className="text-3xl font-bold">تم تسجيل قرارك</h1>
                        <p className="text-lg text-muted-foreground mt-2 animate-pulse">في انتظار بقية اللاعبين...</p>
                    </motion.div>
                ) : (
                    <motion.div
                        key="action"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full"
                    >
                        <div className="text-center mb-6">
                             <ActionIcon className="w-16 h-16 text-primary mx-auto mb-2" />
                            <h1 className="text-4xl font-bold">دورك الآن يا {myRoleDetails.name}</h1>
                            <p className="text-lg text-muted-foreground mt-2">اختر هدفك لهذه الليلة.</p>
                        </div>
                        
                        {myActionType === 'shapeshifter' ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {disguiseOptions.map(roleId => {
                                    const roleDetails = ROLES[roleId];
                                    return (
                                        <motion.div
                                            key={roleId}
                                            onClick={() => setSelectedDisguise(roleId)}
                                            className={cn(
                                                "p-3 rounded-lg border-2 bg-gray-800/50 cursor-pointer transition-all duration-200 text-center space-y-2",
                                                selectedDisguise === roleId ? "border-primary scale-105 shadow-lg shadow-primary/20" : "border-gray-700 hover:border-primary/50"
                                            )}
                                            whileHover={{ y: -5 }}
                                        >
                                            <p className="font-bold text-lg">{roleDetails.name}</p>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {targetablePlayers.map(player => (
                                    <motion.div
                                        key={player.id}
                                        onClick={() => handleTargetSelection(player.id)}
                                        className={cn(
                                            "p-3 rounded-lg border-2 bg-gray-800/50 cursor-pointer transition-all duration-200 text-center space-y-2",
                                            selectedTargetId === player.id ? "border-primary scale-105 shadow-lg shadow-primary/20" : "border-gray-700 hover:border-primary/50"
                                        )}
                                        whileHover={{ y: -5 }}
                                    >
                                        <PlayerAvatar avatarId={player.avatarId} className="w-24 h-24 mx-auto" />
                                        <p className="font-bold text-lg">{player.name}</p>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                        
                        <div className="mt-8 flex justify-center">
                            <Button 
                                onClick={handleSubmit} 
                                disabled={isSubmitting || (myActionType !== 'shapeshifter' && !selectedTargetId) || (myActionType === 'shapeshifter' && !selectedDisguise)}
                                size="lg"
                                className="w-full max-w-xs"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : `تأكيد`}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {myPrivateChat && (
                <motion.div
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="absolute bottom-4 right-4 w-80 bg-background/90 text-foreground rounded-lg shadow-2xl border border-primary/50"
                >
                    <div className="p-3 border-b border-primary/30">
                        <h4 className="font-bold text-center">قناة سرية</h4>
                    </div>
                    <ScrollArea className="h-64 p-3" ref={scrollAreaRef}>
                        <div className="space-y-3">
                        {myPrivateChat.chat.messages.map((msg, i) => (
                            <div key={i} className={cn("flex flex-col", msg.senderId === self.id ? "items-end" : "items-start")}>
                                <div className={cn("p-2 rounded-lg max-w-[80%]", msg.senderId === self.id ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                    <p className="text-sm">{msg.message}</p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {msg.senderName} - {formatDistanceToNow(msg.timestamp.toDate(), { addSuffix: true, locale: ar })}
                                </p>
                            </div>
                        ))}
                        </div>
                    </ScrollArea>
                    <form onSubmit={handleSendMessage} className="p-2 border-t flex gap-2">
                        <Input 
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            placeholder="اكتب رسالتك..."
                            disabled={isSendingMessage}
                        />
                        <Button type="submit" size="icon" disabled={isSendingMessage || !chatMessage.trim()}>
                            {isSendingMessage ? <Loader2 className="animate-spin" /> : <Send />}
                        </Button>
                    </form>
                </motion.div>
            )}
        </div>
    );
}
