
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, Player, Role, MafiaRole } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import * as roomActions from '@/lib/actions/room';
import * as mafiaActions from '@/lib/actions/mafia';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { cn } from '@/lib/utils';
import {
  Copy, Check, LogOut, ArrowRight, UserX, Settings, Eye, Loader2, VenetianMask, Moon, Timer, MessageSquare, Gavel, UserCheck, Shield, Trophy, HeartPulse, Skull, Search
} from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// --- START: Inlined Card Components ---

const DefaultCard = ({ role }: { role: Role }) => {
    const isMafia = role.team === 'mafia';
    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-gray-800 rounded-xl border-2 border-gray-600">
            <div className="text-center">
                <h2 className={`text-2xl font-bold ${isMafia ? 'text-red-400' : 'text-blue-400'}`}>{role.name}</h2>
                <p className={`text-sm font-semibold ${isMafia ? 'text-red-300' : 'text-blue-300'}`}>
                    أنت من فريق {isMafia ? 'المافيا' : 'الخير'}
                </p>
            </div>
            <div className="my-4">
                 <VenetianMask className="w-32 h-32 text-gray-500" />
            </div>
            <p className="text-center text-gray-300 text-sm px-2">
                {role.description}
            </p>
        </div>
    );
};

const DetectiveCard = ({ role }: { role: Role }) => {
    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-blue-900/50 rounded-xl border-2 border-blue-500">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-blue-300">{role.name}</h2>
                <p className="text-sm font-semibold text-blue-200">أنت من فريق الخير</p>
            </div>
            <div className="my-4">
                 <Search className="w-32 h-32 text-blue-400" />
            </div>
            <p className="text-center text-blue-100 text-sm px-2">
                {role.description}
            </p>
        </div>
    );
};

const DoctorCard = ({ role }: { role: Role }) => {
    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-green-900/50 rounded-xl border-2 border-green-500">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-green-300">{role.name}</h2>
                <p className="text-sm font-semibold text-green-200">أنت من فريق الخير</p>
            </div>
            <div className="my-4">
                 <HeartPulse className="w-32 h-32 text-green-400" />
            </div>
            <p className="text-center text-green-100 text-sm px-2">
                {role.description}
            </p>
        </div>
    );
};

const KillerCard = ({ role }: { role: Role }) => {
    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-red-900/50 rounded-xl border-2 border-red-500">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-red-300">{role.name}</h2>
                <p className="text-sm font-semibold text-red-200">أنت من فريق المافيا</p>
            </div>
            <div className="my-4">
                 <Skull className="w-32 h-32 text-red-400" />
            </div>
            <p className="text-center text-red-100 text-sm px-2">
                {role.description}
            </p>
        </div>
    );
};

// --- END: Inlined Card Components ---

// --- START: Inlined Overlay Component ---
const KillAnimationOverlay = ({ playerName, onAnimationEnd }: { playerName: string, onAnimationEnd: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onAnimationEnd();
        }, 3500); // Animation duration + buffer
        return () => clearTimeout(timer);
    }, [onAnimationEnd]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center text-white"
            >
                <motion.div
                    key="skull-icon"
                    initial={{ scale: 0, rotate: -45, y: 50 }}
                    animate={{ scale: 1, rotate: 0, y: 0, transition: { type: 'spring', stiffness: 150, damping: 10, delay: 0.5 } }}
                    className="mb-4"
                >
                    <Skull className="w-32 h-32 text-red-500 drop-shadow-lg" />
                </motion.div>
                <motion.h1
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="text-4xl font-bold mt-8"
                >
                    لقد تم اغتيال {playerName}!
                </motion.h1>
            </motion.div>
        </AnimatePresence>
    );
};
// --- END: Inlined Overlay Component ---

interface MafiaGameProps {
  game: Game;
  self: Player;
}

export function MafiaGame({ game, self }: MafiaGameProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const isHost = game.hostId === self.id;

  // --- START: Inlined Phase Components Logic ---

  // Shared state across phases
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Lobby Phase ---
  const renderLobby = () => {
    const [isCopying, setIsCopying] = useState(false);
    const [settings, setSettings] = useState(game.mafiaState?.settings || { nightDuration: 70, discussionDuration: 120, votingDuration: 60 });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);

    const handleSettingsChange = async (newSettings: Partial<typeof settings>) => {
        const updatedSettings = { ...settings, ...newSettings };
        setSettings(updatedSettings);
        if (isHost) {
            try {
                await mafiaActions.updateGameSettings(game.id, self.id, updatedSettings);
            } catch (error: any) {
                toast({ title: "خطأ في تحديث الإعدادات", description: error.message, variant: "destructive" });
            }
        }
    };

    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };

    const handleStartGame = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.startGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleLeaveGame = async () => {
        setIsSubmitting(true);
        const result = await roomActions.leaveGame(game.id, self.id);
        if (result.success) {
          sessionStorage.removeItem(`player-${game.id}`);
          router.push('/');
          toast({ title: "لقد غادرت الغرفة." })
        } else {
          toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleKickPlayer = async () => {
        if (!playerToKick || !isHost) return;
        setIsSubmitting(true);
        const result = await roomActions.kickPlayerFromLobby(game.id, self.id, playerToKick.id);
        if (result.error) {
            toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
        }
        setPlayerToKick(null);
        setIsSubmitting(false);
    };

    return (
        <>
            <Card className="w-full max-w-4xl animate-pop-in">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">لوبي لعبة المافيا</CardTitle>
                    <CardDescription>اجمع اللاعبين (4-8) واستعد لكشف الأسرار!</CardDescription>
                    <div className="flex gap-2 w-full max-w-sm mx-auto pt-2">
                        <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
                        <TooltipProvider>
                            <Tooltip open={isCopying}>
                                <TooltipTrigger asChild>
                                    <Button onClick={handleCopyId} size="lg" variant="secondary" className="px-4">
                                        {isCopying ? <Check /> : <Copy />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>تم النسخ!</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-0">
                    <div className="md:col-span-2 space-y-4">
                        <div className="flex justify-between items-center">
                            <Label className='font-bold text-base'>إعدادات اللعبة</Label>
                            {isHost && (
                                <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                                    <Settings className={cn("w-5 h-5", isSettingsOpen && "animate-spin")} />
                                </Button>
                            )}
                        </div>
                        <AnimatePresence>
                            {isSettingsOpen && isHost && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1">
                                            <Label htmlFor="night-duration">وقت الليل (ث)</Label>
                                            <Input id="night-duration" type="number" value={settings.nightDuration} onChange={e => handleSettingsChange({ nightDuration: parseInt(e.target.value, 10) || 30 })} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="discussion-duration">وقت النقاش (ث)</Label>
                                            <Input id="discussion-duration" type="number" value={settings.discussionDuration} onChange={e => handleSettingsChange({ discussionDuration: parseInt(e.target.value, 10) || 60 })} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="voting-duration">وقت التصويت (ث)</Label>
                                            <Input id="voting-duration" type="number" value={settings.votingDuration} onChange={e => handleSettingsChange({ votingDuration: parseInt(e.target.value, 10) || 30 })} />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                         <div className="pt-4">
                            <h3 className="font-bold text-base mb-2">اللاعبون ({activePlayers.length}/8)</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {activePlayers.map(p => (
                                    <div key={p.id} className="relative group flex flex-col items-center gap-2">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16"/>
                                        <p className="font-bold text-sm text-center truncate w-full">{p.name}</p>
                                        {isHost && p.id !== self.id && (
                                            <Button variant="destructive" size="icon" className="absolute top-0 right-0 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setPlayerToKick(p)}>
                                                <UserX className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col justify-end gap-2">
                        {isHost ? (
                            <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 4} className="w-full">
                                <ArrowRight className="mr-2 h-4 w-4" />
                                {isSubmitting ? '...' : activePlayers.length < 4 ? `تحتاج 4 لاعبين على الأقل` : 'ابدأ اللعبة'}
                            </Button>
                        ) : (
                            <p className="w-full text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
                        )}
                        <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                           <LogOut className="mr-2 h-4 w-4" /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
            <AlertDialog open={!!playerToKick} onOpenChange={(open) => !open && setPlayerToKick(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                        <AlertDialogDescription>
                            هل تريد حقًا طرد اللاعب "{playerToKick?.name}" من الغرفة؟ لن يتمكن من الانضمام مرة أخرى.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className={buttonVariants({ variant: "destructive" })}>
                            {isSubmitting ? "جاري الطرد..." : "نعم، قم بطرده"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
  };
  
  // --- Role Reveal Phase ---
  const renderRoleReveal = () => {
    const [isRevealed, setIsRevealed] = useState(false);
    const selfInGame = game.players.find(p => p.id === self.id);
    const roleInfo = MAFIA_ROLES.find(r => r.id === selfInGame?.role);

    const handleStartNight = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.hostProgressNextPhase(self.id);
        } catch (error: any) {
            toast({
                title: 'خطأ',
                description: error.message || 'فشل بدء الليل.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!selfInGame || !roleInfo) {
        return <Loader2 className="w-12 h-12 animate-spin" />;
    }

    const roleCardMap: Record<string, React.FC<{ role: Role }>> = {
        killer: KillerCard,
        detective: DetectiveCard,
        doctor: DoctorCard,
        default: DefaultCard,
    };
    const CardComponent = roleCardMap[roleInfo.id] || roleCardMap.default;

    return (
        <div className="flex flex-col items-center justify-center text-center text-white w-full">
            <h1 className="text-4xl font-bold tracking-tighter mb-2">اكشف عن دورك...</h1>
            <p className="text-lg text-muted-foreground mb-8">احفظ دورك جيدًا. سينقلك المضيف إلى الليل قريبًا.</p>
            
            <div className="w-[300px] h-[420px] [perspective:1000px]">
                <motion.div
                    className="relative w-full h-full transform-style-3d"
                    animate={{ rotateY: isRevealed ? 180 : 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="absolute w-full h-full backface-hidden flex flex-col items-center justify-center bg-gray-800 border-2 border-primary rounded-xl shadow-2xl shadow-primary/30">
                        <VenetianMask className="w-32 h-32 text-primary" />
                        <p className="mt-4 text-2xl font-bold">هويتك سرية</p>
                        <Button onClick={() => setIsRevealed(true)} className="mt-6">
                            <Eye className="ml-2" />
                            اكشف عن دوري
                        </Button>
                    </div>
                    <div className={cn("absolute w-full h-full backface-hidden [transform:rotateY(180deg)]", roleInfo.team === 'mafia' ? 'bg-red-900/20' : 'bg-blue-900/20')}>
                        <CardComponent role={roleInfo} />
                    </div>
                </motion.div>
            </div>
            <div className="mt-8">
                {isHost ? (
                    <Button onClick={handleStartNight} disabled={isSubmitting} size="lg">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <Moon className="ml-2" />}
                        بدء الليل
                    </Button>
                ) : (
                    <p className="text-muted-foreground animate-pulse">في انتظار المضيف لبدء الليل...</p>
                )}
            </div>
        </div>
    );
  };
  
  // --- Day Phase ---
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
  
  const renderDayPhase = () => {
    const selfInGame = game.players.find(p => p.id === self.id);
    const [showKillAnimation, setShowKillAnimation] = useState(!!game.mafiaState?.killedPlayer);
    const [killedPlayerInfo, setKilledPlayerInfo] = useState<{name: string, avatarId: string} | null>(null);
    const [selectedVoteTarget, setSelectedVoteTarget] = useState<string | null>(null);
    const [hasVoted, setHasVoted] = useState(false);
    
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
            await mafiaActions.hostProgressNextPhase(self.id);
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
  };
  
  // --- Night Phase ---
   const NightCountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number, onExpire: () => void }) => {
    const calculateTimeLeft = useCallback(() => Math.round((expiryTimestamp - Date.now()) / 1000), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setInterval(() => {
            const remaining = calculateTimeLeft();
            if (remaining <= 0) {
                clearInterval(timer);
                setTimeLeft(0);
                onExpire();
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [expiryTimestamp, onExpire, calculateTimeLeft]);
    
    return (
        <div className={cn("flex items-center gap-2 p-2 rounded-full", timeLeft <= 10 ? "text-red-400" : "text-gray-300")}>
            <Timer className="h-5 w-5" />
            <span className="font-mono font-bold text-lg">{timeLeft}</span>
        </div>
    );
  };
  
  const renderNightPhase = () => {
    const selfInGame = game.players.find(p => p.id === self.id);
    const roleInfo = MAFIA_ROLES.find(r => r.id === selfInGame?.role);
    
    const [targetId, setTargetId] = useState<string | undefined>(undefined);
    const [disguiseAs, setDisguiseAs] = useState<MafiaRole | undefined>(undefined);
    const [hasActed, setHasActed] = useState(false);
    
    const onTimeoutRef = useRef<() => void>();

    const handleHostAction = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.hostProgressNextPhase(self.id);
        } catch (error: any) {
            toast({ title: "Error progressing phase", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    useEffect(() => {
        onTimeoutRef.current = () => {
             // The host button will be enabled, this is a backup
        };
    });

    useEffect(() => {
        setTargetId(undefined);
        setDisguiseAs(undefined);
        setHasActed(!!game.mafiaState?.nightActions?.[self.id]);
    }, [game.mafiaState?.night, self.id, game.mafiaState?.nightActions]);

    const handleAction = async () => {
        if (!selfInGame || !roleInfo || hasActed) return;
        
        let action;
        switch(roleInfo.id) {
            case 'killer':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'kill', killTarget: targetId };
                break;
            case 'doctor':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'protect', targetId };
                break;
            case 'detective':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'investigate', targetId };
                break;
            case 'spy':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'spy', targetId };
                break;
            case 'shifter':
                 if (!disguiseAs) { toast({ title: "الرجاء اختيار شخصية للتنكر", variant: "destructive" }); return; }
                 action = { type: 'disguise', disguiseAs };
                 break;
            case 'explosive':
                if (!targetId) { toast({ title: "الرجاء اختيار هدف", variant: "destructive" }); return; }
                action = { type: 'trap', targetId };
                break;
            default:
                setHasActed(true);
                return;
        }

        setIsSubmitting(true);
        try {
            await mafiaActions.submitNightAction(game.id, self.id, action);
            setHasActed(true);
            toast({ title: "تم تنفيذ الإجراء بنجاح." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const getRoleInstructions = () => {
        switch (roleInfo?.id) {
            case 'killer': return 'اختر لاعبًا لتصفيته.';
            case 'doctor': return 'اختر لاعبًا لحمايته.';
            case 'detective': return 'اختر لاعبًا للتحقيق في هويته.';
            case 'spy': return 'اختر لاعبًا للتجسس على دوره.';
            case 'shifter': return 'اختر دورًا للتنكر به هذه الليلة.';
            case 'explosive': return 'اختر لاعبًا لتفجيره إذا تم قتلك.';
            default: return 'أنت مدني. حاول البقاء على قيد الحياة.';
        }
    };
    
    const getTargetablePlayers = () => {
        if (!selfInGame) return [];
        let players = game.players.filter(p => p.status === 'alive');
        if (roleInfo?.id !== 'doctor') {
            players = players.filter(p => p.id !== self.id);
        }
        return players;
    };

    if (!selfInGame || !roleInfo) return <Loader2 className="animate-spin" />;
    
    const canAct = roleInfo.id !== 'civilian' && roleInfo.id !== 'soldier';
    const timerExpired = !game.mafiaState?.timerEndsAt || Date.now() >= game.mafiaState.timerEndsAt.toMillis();
    const allActionsDone = game.players.filter(p => p.status === 'alive').every(p => {
        const r = MAFIA_ROLES.find(role => role.id === p.role);
        const playerCanAct = r && r.id !== 'civilian' && r.id !== 'soldier';
        return !playerCanAct || game.mafiaState?.nightActions?.[p.id];
    });
    const canHostProceed = timerExpired || allActionsDone;

    return (
        <Card className="w-full max-w-lg bg-gray-900/80 backdrop-blur-sm text-white border-primary/30">
            <CardHeader className="text-center relative">
                {game.mafiaState?.timerEndsAt && (
                     <div className="absolute top-2 left-2">
                        <NightCountdownTimer expiryTimestamp={game.mafiaState.timerEndsAt.toMillis()} onExpire={() => onTimeoutRef.current?.()} />
                    </div>
                )}
                <CardTitle>الليلة {game.mafiaState?.night}</CardTitle>
                <CardDescription className="text-gray-400">{getRoleInstructions()}</CardDescription>
            </CardHeader>
            <CardContent>
                {hasActed ? (
                    <div className="text-center p-8">
                        <p className="text-lg font-bold">لقد قمت بدورك. انتظر شروق الشمس...</p>
                    </div>
                ) : (
                    canAct ? (
                         <div className="space-y-4">
                            {roleInfo.id === 'shifter' ? (
                                <Select onValueChange={(value) => setDisguiseAs(value as MafiaRole)} value={disguiseAs}>
                                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                                        <SelectValue placeholder="اختر شخصية للتنكر..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-600 text-white">
                                        {MAFIA_ROLES.filter(r => r.id !== 'shifter').map(r => (
                                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {getTargetablePlayers().map(p => (
                                        <button key={p.id} onClick={() => setTargetId(p.id)} className={cn("p-2 rounded-lg text-center border-2 transition-all", targetId === p.id ? "border-primary bg-primary/20" : "border-transparent hover:bg-gray-700")}>
                                            <PlayerAvatar avatarId={p.avatarId} className="w-20 h-20 mx-auto" />
                                            <p className="mt-2 font-semibold truncate">{p.name}</p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <Button onClick={handleAction} disabled={isSubmitting} className="w-full">
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد'}
                            </Button>
                        </div>
                    ) : (
                         <div className="text-center p-8">
                            <p className="text-lg font-bold">ليس لديك أي إجراء لتتخذه. انتظر شروق الشمس...</p>
                        </div>
                    )
                )}
            </CardContent>
            {isHost && (
                 <CardFooter>
                    <Button onClick={handleHostAction} disabled={!canHostProceed || isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'الانتقال إلى الصباح'}
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
  };

  // --- Final Results Phase ---
  const renderFinalResults = () => {
    const result = game.gameResult;

    if (!result) return null;

    const winnerText = result.winner === 'good' ? 'فريق الخير' : 'المافيا';
    const WinnerIcon = result.winner === 'good' ? Shield : VenetianMask;

    return (
        <Card className="w-full max-w-2xl text-center animate-pop-in">
            <CardHeader>
                <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                <CardTitle className="text-4xl font-bold">انتهت اللعبة!</CardTitle>
                <CardDescription className="text-xl">
                    <div className="flex items-center justify-center gap-2 mt-2">
                        <WinnerIcon className="w-8 h-8"/>
                        <span>الفائز هو: {winnerText}</span>
                    </div>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-lg text-muted-foreground mb-6">{result.message}</p>
                <div className="space-y-3">
                    <h3 className="font-bold">الأدوار في هذه اللعبة كانت:</h3>
                    {game.players.map(p => {
                        const role = MAFIA_ROLES.find(r => r.id === p.role);
                        return (
                            <div key={p.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                <div className="flex items-center gap-3">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                    <p className="font-semibold">{p.name}</p>
                                </div>
                                <p className="font-bold text-primary">{role?.name || 'غير معروف'}</p>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={() => router.push('/')} className="w-full" size="lg">
                    العودة إلى اللوبي
                </Button>
            </CardFooter>
        </Card>
    );
  };

  // --- Main Render Logic ---
  const renderContent = () => {
    switch (game.gameState) {
      case 'lobby':
        return renderLobby();
      case 'role_reveal':
        return renderRoleReveal();
      case 'night':
        return renderNightPhase();
      case 'discussion':
      case 'voting':
      case 'voting_results':
        return renderDayPhase();
      case 'final_results':
        return renderFinalResults();
      default:
        return <div>حالة غير معروفة: {game.gameState}</div>;
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={game.gameState}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="w-full h-full flex items-center justify-center"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
