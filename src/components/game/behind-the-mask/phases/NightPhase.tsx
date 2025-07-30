
"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Game, Player, PlayerRole, NightAction, PrivateChatMessage, PrivateChat } from '@/types';
import { Button } from '@/components/ui/button';
import { ROLES } from '@/data/mafia-roles';
import { PlayerAvatar } from '../../PlayerAvatar';
import { submitNightAction, processNight, sendPrivateMessage } from '@/lib/actions/behind-the-mask';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Bed, Shield, Search, Eye, Bomb, VenetianMask, Send, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';

interface NightPhaseProps {
    game: Game;
    self: Player;
}

const NIGHT_PHASE_DURATION_SECONDS = 40;

const ACTION_ICONS: Record<string, React.ElementType> = {
    kill: Bed,
    heal: Shield,
    investigate: Search,
    spy: Eye,
    bomb: Bomb,
    shapeshift: VenetianMask,
};

const getActionTypeForRole = (role: PlayerRole): NightAction['action'] | null => {
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

const ROLES_WITH_NO_NIGHT_ACTION: PlayerRole[] = ['civilian', 'soldier'];

export function NightPhase({ game, self }: NightPhaseProps) {
    const { toast } = useToast();
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(NIGHT_PHASE_DURATION_SECONDS);
    const actionCalled = useRef(false);
    
    const [selectedDisguise, setSelectedDisguise] = useState<PlayerRole | null>(null);
    
    const [chatMessage, setChatMessage] = useState("");
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);


    const isHost = game.hostId === self.id;
    const myRoleDetails = self.role ? ROLES[self.role] : null;
    const myActionType = myRoleDetails ? getActionTypeForRole(myRoleDetails.id) : null;
    const hasSubmittedAction = !!game.mafiaState?.nightActions?.[self.id];
    
    const targetablePlayers = game.players.filter(p => {
        if (p.status !== 'alive') return false;
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

    const handleProcessNight = useCallback(() => {
        if (isHost && !actionCalled.current) {
            actionCalled.current = true;
            processNight(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);


    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        const endTime = game.mafiaState.timerEndsAt.toMillis();

        const updateTimer = () => {
            const now = Date.now();
            const remainingMillis = Math.max(0, endTime - now);
            const remainingSeconds = Math.round(remainingMillis / 1000);
            
            setTimeLeft(remainingSeconds);

            if (remainingSeconds <= 0) {
                handleProcessNight();
            }
        };

        const timer = setInterval(updateTimer, 1000);
        updateTimer();
        return () => clearInterval(timer);

    }, [game.mafiaState?.timerEndsAt, handleProcessNight]);


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
            return; 
        }
        
        setIsSubmitting(true);
        try {
            const result = await submitNightAction(game.id, finalAction);
            if (result.success) {
                toast({ title: "تم تسجيل قرارك بنجاح." });
            } else {
                toast({ title: "خطأ", description: result.error, variant: "destructive" });
            }
        } catch (e) {
            console.error(e)
            toast({ title: "خطأ", description: "فشل إرسال القرار.", variant: "destructive" });
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

    const { totalAlivePlayers, submittedCount, progress } = useMemo(() => {
        const alivePlayers = game.players.filter(p => p.status === 'alive');
        const total = alivePlayers.length;

        const passivePlayersCount = alivePlayers.filter(p => ROLES_WITH_NO_NIGHT_ACTION.includes(p.role!)).length;
        const submittedActionsCount = Object.keys(game.mafiaState?.nightActions || {}).length;

        const submitted = passivePlayersCount + submittedActionsCount;
        const progressPercentage = total > 0 ? (submitted / total) * 100 : 0;

        return { totalAlivePlayers: total, submittedCount: submitted, progress: progressPercentage };
    }, [game.players, game.mafiaState?.nightActions]);

    const timeProgress = (timeLeft / NIGHT_PHASE_DURATION_SECONDS) * 100;

    if (!myRoleDetails || ROLES_WITH_NO_NIGHT_ACTION.includes(self.role!)) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white text-center relative overflow-hidden">
                 <div className="stars"></div>
                 <div className="twinkling"></div>
                 <Bed className="w-24 h-24 text-blue-300 mb-4 z-10" />
                <h1 className="text-4xl font-bold z-10">حل الظلام...</h1>
                <p className="text-xl text-muted-foreground mt-2 animate-pulse z-10">أنت نائم... في انتظار مرور الليل.</p>
                <p className="font-mono text-2xl mt-4 z-10">{timeLeft}</p>
            </div>
        );
    }
    
    const ActionIcon = ACTION_ICONS[myActionType!] || Bed;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white relative overflow-hidden">
            <div className="stars"></div>
            <div className="twinkling"></div>
            
            <div className="absolute top-4 z-10 w-full max-w-4xl px-4">
                 <div className="flex justify-between items-center gap-4">
                    <div className="w-1/3">
                        <h3 className="font-bold text-xs text-center mb-1">التقدم</h3>
                        <Progress value={progress} className="w-full h-2 bg-slate-700" />
                        <span className="text-xs text-center block">{submittedCount}/{totalAlivePlayers}</span>
                    </div>
                     <p className="font-mono text-2xl">{timeLeft}</p>
                     <div className="w-1/3"></div>
                 </div>
                 <Progress value={timeProgress} className={cn("w-full h-1 mt-2 bg-slate-700", timeLeft < 10 && "[&>*]:bg-red-500 [&>*]:animate-pulse")}/>
            </div>

             <AnimatePresence mode="wait">
                {hasSubmittedAction ? (
                    <motion.div
                        key="submitted"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center z-10"
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
                        className="w-full max-w-4xl z-10"
                    >
                        <div className="text-center mb-6">
                             <ActionIcon className="w-16 h-16 text-primary mx-auto mb-2" />
                            <h1 className="text-4xl font-bold">دورك الآن يا {myRoleDetails.name}</h1>
                            <p className="text-lg text-muted-foreground mt-2">{myRoleDetails.description}</p>
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
                                                "p-3 rounded-lg border-2 bg-slate-800/50 cursor-pointer transition-all duration-200 text-center space-y-2",
                                                selectedDisguise === roleId ? "border-primary scale-105 shadow-lg shadow-primary/20" : "border-slate-700 hover:border-primary/50"
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
                                            "p-3 rounded-lg border-2 bg-slate-800/50 backdrop-blur-sm cursor-pointer transition-all duration-200 text-center space-y-2",
                                            selectedTargetId === player.id ? "border-primary scale-105 shadow-lg shadow-primary/20" : "border-slate-700 hover:border-primary/50",
                                            selectedTargetId && selectedTargetId !== player.id ? "opacity-50" : "opacity-100"
                                        )}
                                        whileHover={{ y: -5 }}
                                    >
                                        <PlayerAvatar avatarId={player.avatarId} className="w-24 h-24 mx-auto rounded-full border-4 border-transparent" />
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
                    className="absolute bottom-4 right-4 w-80 bg-background/90 text-foreground rounded-lg shadow-2xl border border-primary/50 z-20"
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

