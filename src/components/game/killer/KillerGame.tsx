

"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Game, Player, ChatMessage, NightAction, PlayerRole } from "@/types";
import { ROLE_CARD_IMAGES } from '@/data/roles';
import * as killerActions from "@/lib/actions/killer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Check, Send, UserCheck, Skull, Users, Moon, Sunrise, Vote, Gavel, ShieldCheck, FileText, Search, Hand, MessageSquare, Eye, HeartPulse, UserCog, Ghost, Swords, UserX, Loader2, Timer, Bomb, ArrowRight } from "lucide-react";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AnimatePresence, motion } from "framer-motion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import type { Timestamp } from "firebase/firestore";

interface KillerGameProps {
    game: Game;
    player: Player;
    self: Player;
    setGame: (game: Game) => void;
}

export function KillerGame({ game, player, self, setGame }: KillerGameProps) {
    const router = useRouter();
    const { toast } = useToast();
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [votedForId, setVotedForId] = useState<string | null>(null);
    const [chatMessage, setChatMessage] = useState("");
    const [timeLeft, setTimeLeft] = useState(0);
    
    // Night Action State
    const [selectedTargetId, setSelectedTargetId] = useState<string>('');
    const [selectedImpersonateRole, setSelectedImpersonateRole] = useState<PlayerRole>();
    const [showNightActionModal, setShowNightActionModal] = useState(false);
    const [showNightResults, setShowNightResults] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    
    const isHost = useMemo(() => game.hostId === self.id, [game.hostId, self.id]);
    const hasVoted = useMemo(() => !!(game.votes && game.votes[self.id]), [game.votes, self.id]);
    
    const votablePlayers = useMemo(() => {
        if (game.gameState === 'tie_breaker_voting' && game.lastVoteResult?.tiedPlayers) {
            return game.players.filter(p => game.lastVoteResult!.tiedPlayers!.includes(p.id) && p.status === 'alive');
        }
        return game.players.filter(p => p.status === 'alive');
    }, [game.players, game.gameState, game.lastVoteResult]);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [game?.messages]);
    
    useEffect(() => {
        if (game.gameState === 'discussion' && game.nightResults && Object.keys(game.nightResults).length > 0) {
            setShowNightResults(true);
        }
    }, [game.gameState, game.nightResults]);
    
    const handleProgressToNight = useCallback(async () => {
        setIsSubmitting(true);
        try {
            await killerActions.progressToNight(game.id, self.id);
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, toast]);
    
     useEffect(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        let phaseEndTime: number | undefined;
        let phaseEndTimestamp = game.discussionEndsAt;
        
        if (game.gameState === 'role_reveal') {
            phaseEndTime = game.discussionEndsAt instanceof Timestamp ? game.discussionEndsAt.toMillis() : new Date(game.discussionEndsAt as any).getTime();
        } else if (game.gameState === 'night' || game.gameState === 'discussion') {
            phaseEndTime = game.discussionEndsAt instanceof Timestamp ? game.discussionEndsAt.toMillis() : new Date(game.discussionEndsAt as any).getTime();
        }
        
        if (phaseEndTime) {
            const updateTimer = () => {
                const remaining = Math.round((phaseEndTime! - Date.now()) / 1000);
                if (remaining <= 0) {
                    setTimeLeft(0);
                    if (timerRef.current) clearInterval(timerRef.current);
                    
                    if (isHost) {
                        if (game.gameState === 'role_reveal') {
                           handleProgressToNight();
                        } else if(game.gameState === 'night') {
                            killerActions.progressToDiscussion(game.id, self.id);
                        } else if(game.gameState === 'discussion') {
                            killerActions.progressToNight(game.id, self.id);
                        }
                    }
                } else {
                    setTimeLeft(remaining);
                }
            };

            timerRef.current = setInterval(updateTimer, 1000);
            updateTimer(); // Initial call
        } else {
            setTimeLeft(0);
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [game.gameState, game.discussionEndsAt, game.id, self.id, isHost, handleProgressToNight]);

    const handleSendMessage = () => {
        if (!chatMessage.trim() || !self || self.status !== 'alive') return;
        killerActions.submitMessage(game.id, self.id, chatMessage.trim());
        setChatMessage("");
    }

    const handleSubmitVote = async (votedId: string) => {
        if (!votedId || !self) return;
        setIsSubmitting(true);
        try {
            await killerActions.submitVote(game.id, self.id, votedId);
            setVotedForId(votedId);
            toast({ title: "تم تسجيل صوتك بنجاح!" });
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleConfirmNightAction = async () => {
        if (!self.role) return;
        
        let action: NightAction = {};
        
        if (self.role === 'killer') action = { killTarget: selectedTargetId };
        if (self.role === 'doctor') action = { protectTarget: selectedTargetId };
        if (self.role === 'detective') action = { checkTarget: selectedTargetId };
        if (self.role === 'spy') action = { checkTarget: selectedTargetId };
        if (self.role === 'suicide_bomber') action = { setCurseTarget: selectedTargetId };
        if (self.role === 'impersonator') {
             if (selectedImpersonateRole) {
                action = { impersonateRole: selectedImpersonateRole };
            } else {
                toast({ title: 'خطأ', description: 'يجب اختيار دور لانتحاله', variant: 'destructive' });
                return;
            }
        }
        
        if (Object.keys(action).length === 0 || (action.checkTarget === '' || action.killTarget === '' || action.protectTarget === '' || action.setCurseTarget === '')) {
            toast({ title: 'خطأ', description: 'يجب اختيار إجراء', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        try {
            await killerActions.submitNightAction(game.id, self.id, action);
            setShowNightActionModal(false);
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const hasPlayerActed = useMemo(() => {
        return !!game.nightActions?.[self.id];
    }, [game.nightActions, self.id]);

    const handleEndNightEarly = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await killerActions.progressToDiscussion(game.id, self.id);
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }
    


    // RENDER FUNCTIONS
    const renderRoleReveal = () => {
        const roleDetails: Record<PlayerRole, { title: string; color: string; description: string }> = {
            killer: { title: "أنت القاتل", color: "text-red-500", description: "مهمتك هي القضاء على فريق الخير دون أن يتم كشفك." },
            spy: { title: "أنت الجاسوس", color: "text-red-600", description: "أنت مع المافيا. اكشف هويات الآخرين لمساعدة القاتل." },
            detective: { title: "أنت المحقق", color: "text-blue-500", description: "مهمتك هي كشف أدوار أعضاء المافيا وتوجيه فريق الخير." },
            doctor: { title: "أنت الطبيب", color: "text-green-500", description: "مهمتك هي حماية اللاعبين من هجمات القاتل." },
            soldier: { title: "أنت الجندي", color: "text-orange-500", description: "لديك مناعة ضد كشف الجاسوس. إذا حاول كشفك، سينكشف هو!" },
            impersonator: { title: "أنت المنتحل", color: "text-purple-500", description: "اختر دورًا لتنتحله كل ليلة وتضلل الجاسوس." },
            civilian: { title: "أنت مدني", color: "text-gray-500", description: "مهمتك هي العمل مع الآخرين لكشف القاتل والتصويت لطرده." },
            suicide_bomber: { title: "أنت الانتحاري", color: "text-yellow-600", description: "اختر لاعبًا كل ليلة. إذا قتلك هذا اللاعب، سيموت معك!" },
            contestant: { title: "أنت متسابق", color: "text-gray-500", description: "هذا دور احتياطي." },
        };
        const details = roleDetails[self.role!];
        
        return (
            <Card className="w-full max-w-md animate-pop-in text-center">
                <CardHeader>
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1, rotate: 360 }} transition={{ type: 'spring', delay: 0.2 }}>
                        <Image src={ROLE_CARD_IMAGES[self.role!]} alt={self.role!} width={120} height={120} className="mx-auto" />
                    </motion.div>
                    <CardTitle className={`text-3xl font-bold ${details.color}`}>{details.title}</CardTitle>
                    <CardDescription className="text-base">{details.description}</CardDescription>
                </CardHeader>
                <CardFooter className="flex-col gap-2">
                    <p className="w-full text-center text-muted-foreground animate-pulse">
                      {`الانتقال إلى الليل خلال: ${timeLeft} ثانية...`}
                    </p>
                    {isHost && game.id === 'KILLER_TEST' && (
                        <Button onClick={handleProgressToNight} size="sm">End Phase (Test)</Button>
                    )}
                </CardFooter>
            </Card>
        );
    };

    const renderNightPhase = () => (
        <Card className="w-full max-w-md animate-pop-in text-center">
            <CardHeader>
                <Moon className="w-20 h-20 mx-auto text-indigo-400" />
                <CardTitle className="text-3xl">حل الظلام</CardTitle>
                 <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-muted">
                    <Timer className="w-6 h-6"/>
                    <span className={cn("font-bold text-lg", timeLeft < 10 && "text-destructive")}>
                        {timeLeft > 0 ? `الوقت المتبقي: ${timeLeft}` : "انتهى الوقت!"}
                    </span>
                 </div>
                <CardDescription>
                    {self.status === 'alive' 
                        ? (hasPlayerActed ? 'لقد قمت بإجراءك. في انتظار بقية اللاعبين...' : 'الوقت مناسب لاستخدام قدراتك الخاصة.')
                        : 'أنت خارج اللعبة، ولكن يمكنك مشاهدة الأحداث تتكشف.'
                    }
                </CardDescription>
            </CardHeader>
            <CardContent>
                {self.status === 'alive' && self.role !== 'civilian' && self.role !== 'soldier' && (
                    <Button onClick={() => setShowNightActionModal(true)} disabled={hasPlayerActed} className="w-full" size="lg">
                        {hasPlayerActed ? 'تم استخدام القدرة' : 'استخدم قدرتك'}
                    </Button>
                )}
                {(self.role === 'civilian' || self.role === 'soldier') && <p className="text-muted-foreground">ليس لديك قدرة خاصة. انتظر شروق الشمس.</p>}
            </CardContent>
             <CardFooter className="flex-col gap-2">
                {isHost && (
                     <Button onClick={handleEndNightEarly} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'إنهاء الليل'}
                    </Button>
                )}
            </CardFooter>
        </Card>
    );

    const renderDayPhase = () => (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6 h-[85vh]">
             <div className="lg:col-span-2 flex flex-col h-full">
                <Card className="flex-grow flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 justify-between">
                            <div className="flex items-center gap-2">
                                <MessageSquare />
                                <span>غرفة التحقيق (اليوم {game.turn})</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted text-sm">
                                <Timer className="w-5 h-5"/>
                                <span className={cn("font-bold", timeLeft < 10 && "text-destructive")}>
                                    {timeLeft > 0 ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}` : "انتهى الوقت!"}
                                </span>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow overflow-hidden flex flex-col gap-4">
                       <ScrollArea className="flex-grow pr-4">
                         <div className="space-y-4" ref={messagesEndRef}>
                            {(game.messages || []).map((msg, index) => (
                                <div key={index} className={cn("flex flex-col gap-1", msg.senderId === self.id ? "items-end" : "items-start")}>
                                    <div className={cn("rounded-lg px-3 py-2 max-w-sm", msg.senderId === self.id ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                        <p className="font-bold text-xs mb-1">{msg.senderName}</p>
                                        <p className="text-sm">{msg.text}</p>
                                    </div>
                                </div>
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
                <Card>
                    <CardHeader><CardTitle>التصويت</CardTitle></CardHeader>
                    <CardContent>
                        {hasVoted ? (
                            <p className="text-center text-green-600 font-bold">تم تسجيل صوتك.</p>
                        ) : timeLeft === 0 ? (
                             <p className="text-center text-red-600 font-bold">انتهى وقت التصويت!</p>
                        ) : (
                            <p className="text-center text-muted-foreground">{game.gameState === 'tie_breaker_voting' ? 'صوّت لأحد المتهمين' : 'اختر لاعبًا للتصويت ضده.'}</p>
                        )}
                    </CardContent>
                </Card>
                <ScrollArea className="flex-grow bg-card p-2 border rounded-lg">
                    <div className="space-y-2">
                        {votablePlayers.map(p => (
                            <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted">
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                    <p className="font-bold">{p.name}</p>
                                </div>
                                {p.id !== self.id && self.status === 'alive' && (
                                    <Button size="sm" onClick={() => handleSubmitVote(p.id)} disabled={hasVoted || isSubmitting || timeLeft === 0}>
                                        <Vote />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
    
    const renderVotingResults = () => {
        const { wasTie, message, eliminatedPlayerName, eliminatedPlayerRole } = game.lastVoteResult || {};
        return (
             <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="w-full max-w-md animate-pop-in text-center">
                    <CardHeader>
                        <Gavel className="w-20 h-20 mx-auto text-primary"/>
                        <CardTitle className="text-3xl mt-2">نتيجة التصويت</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-xl">
                        <p>{message}</p>
                        {!wasTie && eliminatedPlayerName && (
                            <div className="p-3 bg-muted rounded-lg">
                                <p>دوره كان: <strong>{eliminatedPlayerRole}</strong></p>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter>
                       {isHost ? (
                            <Button onClick={handleProgressToNight} disabled={isSubmitting} className="w-full">
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'الانتقال إلى الليل'}
                                <ArrowRight />
                            </Button>
                        ) : (
                             <p className="w-full text-center text-muted-foreground animate-pulse">في انتظار المضيف...</p>
                        )}
                    </CardFooter>
                </Card>
            </motion.div>
        );
    };

    const renderGameEnd = () => {
        const { winner, message } = game.gameResult || {};
        const isMafiaWinner = winner === 'mafia';
        const isKillerFled = winner === 'killer_fled';

        let icon;
        let titleColor;
        if (isKillerFled) {
            icon = <Ghost className="w-24 h-24 mx-auto text-gray-400" />;
            titleColor = 'text-gray-600';
        } else if (isMafiaWinner) {
            icon = <Skull className="w-24 h-24 mx-auto text-destructive" />;
            titleColor = 'text-destructive';
        } else {
            icon = <ShieldCheck className="w-24 h-24 mx-auto text-green-500" />;
            titleColor = 'text-green-600';
        }
        
         return (
             <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className={`w-full max-w-lg animate-pop-in text-center ${isMafiaWinner ? 'border-destructive' : isKillerFled ? 'border-gray-400' : 'border-green-500'}`}>
                    <CardHeader>
                        {icon}
                        <CardTitle className="text-4xl mt-4">انتهت اللعبة!</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <h2 className={`text-2xl font-bold ${titleColor}`}>
                            {message}
                        </h2>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={() => router.push('/')} className="w-full" size="lg">
                            <Trophy /> العب مرة أخرى
                        </Button>
                    </CardFooter>
                </Card>
            </motion.div>
         );
    };

    const renderNightActionModal = () => {
        const modalInfo: Record<PlayerRole, { title: string, description: string, icon: React.ElementType, targetablePlayers: Player[] }> = {
            killer: { title: "اختر ضحية", description: "اختر لاعبًا لقتله هذا الليل.", icon: Swords, targetablePlayers: game.players.filter(p => p.id !== self.id && p.status === 'alive')},
            doctor: { title: "اختر من تحمي", description: "اختر لاعبًا لحمايته. يمكنك حماية نفسك.", icon: HeartPulse, targetablePlayers: game.players.filter(p => p.status === 'alive')},
            detective: { title: "اكشف هوية لاعب", description: "اختر لاعبًا لكشف دوره الحقيقي.", icon: Search, targetablePlayers: game.players.filter(p => p.id !== self.id && p.status === 'alive')},
            spy: { title: "تجسس على لاعب", description: "اختر لاعبًا لكشف دوره.", icon: Eye, targetablePlayers: game.players.filter(p => p.id !== self.id && p.status === 'alive') },
            impersonator: { title: "انتحل دورًا", description: "اختر دورًا لتظهر به للجاسوس إذا تحقق منك.", icon: UserCog, targetablePlayers: [] },
            suicide_bomber: { title: "ضع لعنتك", description: "اختر لاعبًا. إذا قتلك هذا اللاعب، سيموت معك.", icon: Bomb, targetablePlayers: game.players.filter(p => p.id !== self.id && p.status === 'alive')},
            soldier: { title: "أنت الجندي", description: "قدرتك سلبية وتعمل تلقائيًا.", icon: ShieldCheck, targetablePlayers: [] },
            civilian: { title: "مدني", description: "ليس لديك قدرة خاصة.", icon: Ghost, targetablePlayers: [] },
            contestant: { title: "متسابق", description: "ليس لديك قدرة خاصة.", icon: Ghost, targetablePlayers: [] }
        };

        const info = modalInfo[self.role!];
        if (!info || self.role === 'civilian' || self.role === 'soldier' || self.role === 'contestant') {
            return null;
        }

        return (
            <Dialog open={showNightActionModal} onOpenChange={setShowNightActionModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><info.icon />{info.title}</DialogTitle>
                        <DialogDescription>{info.description}</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {self.role === 'impersonator' ? (
                            <RadioGroup value={selectedImpersonateRole} onValueChange={(v) => setSelectedImpersonateRole(v as PlayerRole)}>
                                {(['doctor', 'detective', 'soldier', 'civilian'] as PlayerRole[]).map(role => (
                                    <div key={role} className="flex items-center space-x-2">
                                        <RadioGroupItem value={role} id={role} />
                                        <Label htmlFor={role}>{role}</Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        ) : (
                            <RadioGroup value={selectedTargetId} onValueChange={setSelectedTargetId} className="grid grid-cols-2 gap-2">
                                {info.targetablePlayers.map(p => (
                                    <Label key={p.id} htmlFor={p.id} className={cn("flex flex-col items-center gap-1 p-2 rounded-lg border-2 cursor-pointer", selectedTargetId === p.id ? 'border-primary bg-primary/10' : 'border-muted')}>
                                        <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16"/>
                                        <p>{p.name}</p>
                                        <RadioGroupItem value={p.id} id={p.id} className="sr-only"/>
                                    </Label>
                                ))}
                            </RadioGroup>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowNightActionModal(false)}>إلغاء</Button>
                        <Button onClick={handleConfirmNightAction} disabled={isSubmitting || (!selectedTargetId && self.role !== 'impersonator') || (!selectedImpersonateRole && self.role === 'impersonator')}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    };

    const renderNightResults = () => {
        const { killedPlayerName, wasSaved, detectiveCheckResult, spyCheckResult, spyWasSpotted } = game.nightResults || {};

        return (
            <Dialog open={showNightResults} onOpenChange={setShowNightResults}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>أحداث الليلة الماضية</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {killedPlayerName && <Alert variant="destructive"><Skull className="h-4 w-4" /><AlertTitle>جريمة قتل!</AlertTitle><AlertDescription>تم العثور على <strong>{killedPlayerName}</strong> مقتولاً هذا الصباح.</AlertDescription></Alert>}
                        {wasSaved && <Alert className="border-green-500 text-green-700"><ShieldCheck className="h-4 w-4 text-green-600" /><AlertTitle>نجاة!</AlertTitle><AlertDescription>نجا أحد اللاعبين من هجوم بفضل الطبيب.</AlertDescription></Alert>}
                        {detectiveCheckResult && self.role === 'detective' && <Alert className="border-blue-500 text-blue-700"><Search className="h-4 w-4 text-blue-600" /><AlertTitle>تقرير المحقق</AlertTitle><AlertDescription>اللاعب <strong>{detectiveCheckResult.targetName}</strong> دوره هو <strong>{detectiveCheckResult.role}</strong>.</AlertDescription></Alert>}
                        {spyCheckResult && self.role === 'spy' && <Alert className="border-purple-500 text-purple-700"><Eye className="h-4 w-4 text-purple-600" /><AlertTitle>تقرير الجاسوس</AlertTitle><AlertDescription>اللاعب <strong>{spyCheckResult.targetName}</strong> دوره هو <strong>{spyCheckResult.role}</strong>. {spyCheckResult.apparentRole && `(يظهر بدور ${spyCheckResult.apparentRole})`}</AlertDescription></Alert>}
                        {spyWasSpotted && self.role === 'spy' && <Alert variant="destructive"><FileText className="h-4 w-4" /><AlertTitle>تم كشفك!</AlertTitle><AlertDescription>لقد حاولت التجسس على الجندي، وتم كشف هويتك له.</AlertDescription></Alert>}
                        {!killedPlayerName && !wasSaved && <p className="text-muted-foreground text-center">مرت الليلة بسلام دون أي حوادث قتل.</p>}
                    </div>
                </DialogContent>
            </Dialog>
        );
    };

    const renderContent = () => {
        switch(game.gameState) {
            case 'lobby': return <p>في انتظار بدء اللعبة...</p>;
            case 'role_reveal': return renderRoleReveal();
            case 'night': return renderNightPhase();
            case 'discussion': return renderDayPhase();
            case 'tie_breaker_voting': return renderDayPhase(); // Render the same view for tie-breaking
            case 'voting_results': return renderVotingResults();
            case 'ended': return renderGameEnd();
            case 'final_results': return renderGameEnd(); // Also handle final_results here
            default: return <p>حالة غير معروفة: {game.gameState}</p>
        }
    };
    
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={game.gameState}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full flex items-center justify-center"
            >
                {renderContent()}
                {self.role !== 'civilian' && self.role !== 'soldier' && self.role !== 'contestant' && renderNightActionModal()}
                {renderNightResults()}
            </motion.div>
        </AnimatePresence>
    );
}
