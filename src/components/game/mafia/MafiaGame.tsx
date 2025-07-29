
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, Player, Role, MafiaRole, Team } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import * as roomActions from '@/lib/actions/room';
import * as mafiaActions from '@/lib/actions/mafia';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { getSocialRankForUser } from '@/lib/actions/user';
import { AnimatePresence, motion } from 'framer-motion';

// UI Components
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Award, Check, Copy, Crown, Gem, LogOut, Settings, Shield, ShieldCheck, Star, UserX, ArrowRight, Sun, Vote, Users, Skull, Loader2, VenetianMask, Trophy } from 'lucide-react';


const iconMap: Record<string, React.ElementType> = {
    Shield, ShieldCheck, Award, Gem, Crown, Star
};

// --- Sub-components defined inside MafiaGame.tsx ---

// RoleCard Component
const RoleCard = ({ role, children }: { role: Role; children?: React.ReactNode; }) => {
    const isMafia = role.team === 'mafia';
    return (
        <Card className={cn("w-80 text-center border-4 shadow-xl", isMafia ? "border-red-500 bg-red-50" : "border-blue-500 bg-blue-50")}>
            <CardHeader>
                <div className={cn("w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center", isMafia ? "bg-red-500" : "bg-blue-500")}>
                    {isMafia ? <VenetianMask className="w-12 h-12 text-white" /> : <Shield className="w-12 h-12 text-white" />}
                </div>
                <CardTitle className={cn("text-3xl", isMafia ? "text-red-800" : "text-blue-800")}>{role.name}</CardTitle>
                <CardDescription className="font-semibold">أنت من فريق: {isMafia ? 'المافيا' : 'الخير'}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">{role.description}</p>
                {children && <div className="mt-4 pt-4 border-t">{children}</div>}
            </CardContent>
        </Card>
    );
};

// --- Role Action Cards ---

const CivilianCard = () => {
    return (
        <Card className="w-full max-w-md text-center bg-transparent border-none shadow-none">
            <CardHeader>
                <CardTitle className="text-xl text-gray-300">مهمتك في الليل</CardTitle>
                <CardDescription className="text-gray-400">ليس لديك مهمة خاصة في الليل. انتظر طلوع النهار!</CardDescription>
            </CardHeader>
            <CardContent>
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <p className="mt-2 text-gray-500">في انتظار بقية اللاعبين...</p>
            </CardContent>
        </Card>
    );
};


const SoldierCard = () => {
    return (
        <Card className="w-full max-w-md text-center bg-transparent border-none shadow-none">
            <CardHeader>
                <CardTitle className="text-xl text-gray-300">مهمتك في الليل</CardTitle>
                <CardDescription className="text-gray-400">أنت في حالة تأهب. إذا حاول الجاسوس كشف هويتك، ستكتشفه!</CardDescription>
            </CardHeader>
            <CardContent>
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <p className="mt-2 text-gray-500">في انتظار بقية اللاعبين...</p>
            </CardContent>
        </Card>
    );
}

const KillerCard = ({ self, alivePlayers, hasActed, handleAction }: { self: Player; alivePlayers: Player[]; hasActed: boolean; handleAction: (killTarget: string) => void; }) => {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد اخترت ضحيتك. انتظر الصباح.</p>;
    }
    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-red-300">اختر ضحيتك لهذه الليلة.</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {alivePlayers.filter(p => p.team !== 'mafia').map(p => (
                        <Button key={p.id} variant="destructive" className="h-auto flex-col gap-2 p-2" onClick={() => handleAction(p.id)}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                            <span>{p.name}</span>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};

const DoctorCard = ({ self, alivePlayers, hasActed, handleAction }: { self: Player; alivePlayers: Player[]; hasActed: boolean; handleAction: (targetId: string) => void; }) => {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد قمت بحماية هدفك. انتظر الصباح.</p>;
    }
    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-gray-300">اختر لاعبًا لحمايته من القتل هذه الليلة (يمكنك حماية نفسك).</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {alivePlayers.map(p => (
                        <Button key={p.id} variant="outline" className="h-auto flex-col gap-2 p-2 bg-gray-800 text-white hover:bg-gray-700" onClick={() => handleAction(p.id)}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                            <span>{p.name}</span>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};

const DetectiveCard = ({ self, alivePlayers, hasActed, handleAction }: { self: Player; alivePlayers: Player[]; hasActed: boolean; handleAction: (targetId: string) => void; }) => {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد قمت بالتحقيق. انتظر الصباح.</p>;
    }
    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-gray-300">اختر لاعبًا للكشف عن فريقه (خير أم مافيا).</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {alivePlayers.filter(p => p.id !== self.id).map(p => (
                        <Button key={p.id} variant="outline" className="h-auto flex-col gap-2 p-2 bg-gray-800 text-white hover:bg-gray-700" onClick={() => handleAction(p.id)}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                            <span>{p.name}</span>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};

const SpyCard = ({ self, alivePlayers, hasActed, handleAction }: { self: Player; alivePlayers: Player[]; hasActed: boolean; handleAction: (targetId: string) => void; }) => {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد قمت بالتجسس. انتظر الصباح.</p>;
    }
    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-gray-300">اختر لاعبًا للكشف عن دوره.</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {alivePlayers.filter(p => p.id !== self.id).map(p => (
                        <Button key={p.id} variant="outline" className="h-auto flex-col gap-2 p-2 bg-gray-800 text-white hover:bg-gray-700" onClick={() => handleAction(p.id)}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                            <span>{p.name}</span>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};


const ExplosiveCard = ({ self, alivePlayers, hasActed, handleAction }: { self: Player; alivePlayers: Player[]; hasActed: boolean; handleAction: (targetId: string) => void; }) => {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد زرعت فخك. انتظر الصباح.</p>;
    }
    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-gray-300">اختر لاعبًا لتفجيره معك إذا تم قتلك هذه الليلة.</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {alivePlayers.filter(p => p.id !== self.id).map(p => (
                        <Button key={p.id} variant="destructive" className="h-auto flex-col gap-2 p-2" onClick={() => handleAction(p.id)}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                            <span>{p.name}</span>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};


const ShifterCard = ({ hasActed, handleAction }: { hasActed: boolean; handleAction: (targetId: string | undefined, disguiseAs?: MafiaRole) => void; }) => {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد اخترت تنكرك. انتظر الصباح.</p>;
    }
    const possibleDisguises = MAFIA_ROLES.filter(r => r.id !== 'shifter');
    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-gray-300">اختر دورًا لتنتحله هذه الليلة.</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {possibleDisguises.map(role => (
                        <Button key={role.id} variant="outline" className="bg-gray-800 text-white hover:bg-gray-700" onClick={() => handleAction(undefined, role.id)}>
                            {role.name}
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};

// --- Game Phase Components ---

const LoadingState = ({ text }: { text: string }) => (
    <Card className="w-full max-w-md text-center">
        <CardHeader><CardTitle>{text}</CardTitle></CardHeader>
        <CardContent><Loader2 className="w-12 h-12 mx-auto animate-spin" /></CardContent>
    </Card>
);

const Lobby = ({ game, self, isHost, isSubmitting, setIsSubmitting, handleLeaveGame }: { game: Game, self: Player, isHost: boolean, isSubmitting: boolean, setIsSubmitting: (isSubmitting: boolean) => void, handleLeaveGame: () => void }) => {
    const { toast } = useToast();
    const { socialRanks } = useAuth();
    const [settings, setSettings] = useState(game.mafiaState?.settings || { nightDuration: 70, discussionDuration: 120, votingDuration: 60 });
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const activePlayers = game.players.filter(p => p.status !== 'left');
    
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
    
    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
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
                    <CardDescription>اجمع اللاعبين واستعد للكذب والخداع!</CardDescription>
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
                            {isSettingsOpen && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                                >
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-1">
                                            <Label htmlFor="night-duration">وقت الليل (ث)</Label>
                                            <Input id="night-duration" type="number" value={settings.nightDuration} disabled={!isHost} onChange={e => handleSettingsChange({ nightDuration: parseInt(e.target.value, 10) || 30 })} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="discussion-duration">وقت النقاش (ث)</Label>
                                            <Input id="discussion-duration" type="number" value={settings.discussionDuration} disabled={!isHost} onChange={e => handleSettingsChange({ discussionDuration: parseInt(e.target.value, 10) || 120 })} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="voting-duration">وقت التصويت (ث)</Label>
                                            <Input id="voting-duration" type="number" value={settings.votingDuration} disabled={!isHost} onChange={e => handleSettingsChange({ votingDuration: parseInt(e.target.value, 10) || 60 })} />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                     </div>
                     <div className="flex flex-col">
                        <h3 className="font-bold text-base mb-2">اللاعبون ({activePlayers.length})</h3>
                        <div className="space-y-2 flex-grow">
                            {activePlayers.map(p => {
                                const playerRank = getSocialRankForUser(p.leaderboardPoints, socialRanks);
                                const RankIcon = playerRank ? iconMap[playerRank.icon] || Shield : Shield;
                                return (
                                <div key={p.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                    <div className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                        <div>
                                           <p className="font-bold">{p.name}</p>
                                            {RankIcon && (
                                                <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                                                    <RankIcon className="w-3 h-3 text-amber-500" />
                                                    <span>{playerRank?.name}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {isHost && p.id !== self.id && (
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)}>
                                            <UserX className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            )})}
                        </div>
                         <CardFooter className="flex flex-col gap-2 p-0 mt-4">
                            {isHost ? (
                                <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 4} className="w-full">
                                <ArrowRight className="mr-2 h-4 w-4" />
                                {isSubmitting ? '...' : activePlayers.length < 4 ? `تحتاج 4 لاعبين على الأقل` : 'ابدأ اللعبة'}
                                </Button>
                            ) : (
                                <p className="w-full text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
                            )}
                            <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                               <LogOut /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                            </Button>
                        </CardFooter>
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

const RoleRevealPhase = ({ game, self, isHost }: { game: Game, self: Player, isHost: boolean }) => {
    const [timeLeft, setTimeLeft] = useState(15);
    const selfRoleDetails = MAFIA_ROLES.find(r => r.id === self.role);

    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        
        const endTime = game.mafiaState.timerEndsAt.toMillis();
        
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0 && isHost) {
                mafiaActions.hostProgressNextPhase(game.id, self.id);
                clearInterval(timer);
            }
        }, 1000);
        
        return () => clearInterval(timer);
    }, [isHost, self.id, game.id, game.mafiaState?.timerEndsAt]);
    
    if (!selfRoleDetails) {
        return <LoadingState text="جاري تحميل دورك..." />;
    }

    return (
        <div className="flex flex-col items-center justify-center h-full w-full">
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
                <RoleCard role={selfRoleDetails} />
            </motion.div>
            <div className="mt-8 text-center">
                 <p className="text-muted-foreground">ستبدأ اللعبة خلال:</p>
                 <p className="text-4xl font-bold font-mono text-primary">{timeLeft}</p>
            </div>
        </div>
    );
};

const NightPhase = ({ game, self, isHost, setIsSubmitting }: { game: Game, self: Player, isHost: boolean, setIsSubmitting: (isSubmitting: boolean) => void }) => {
    const { toast } = useToast();
    const [timeLeft, setTimeLeft] = useState(game.mafiaState?.settings.nightDuration || 70);
    const selfRoleDetails = MAFIA_ROLES.find(r => r.id === self.role);
    const hasActed = !!game.mafiaState?.nightActions?.[self.id];
    
    const alivePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);

    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        const endTime = game.mafiaState.timerEndsAt.toMillis();
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0 && isHost) {
                mafiaActions.hostProgressNextPhase(game.id, self.id);
                clearInterval(timer);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [isHost, self.id, game.id, game.mafiaState?.timerEndsAt]);

    const handleAction = async (targetId?: string, disguiseAs?: MafiaRole) => {
        if (!selfRoleDetails) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.submitNightAction(game.id, self.id, { 
                type: selfRoleDetails.id as any, 
                targetId: targetId, 
                disguiseAs: disguiseAs,
                killTarget: selfRoleDetails.id === 'killer' ? targetId : undefined
            });
            toast({ title: "تم تسجيل حركتك." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const roleCardMap: Record<MafiaRole, React.FC<any>> = {
        killer: KillerCard, detective: DetectiveCard, doctor: DoctorCard, spy: SpyCard, shifter: ShifterCard, soldier: SoldierCard, explosive: ExplosiveCard, civilian: CivilianCard
    };
    const SpecificRoleCard = selfRoleDetails ? roleCardMap[selfRoleDetails.id] : null;

    return (
        <Card className="w-full max-w-lg bg-gray-950 text-white border-gray-800">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl">الليل</CardTitle>
                <CardDescription className="text-gray-400">حل الظلام... يقوم أصحاب الأدوار الخاصة بتنفيذ حركاتهم.</CardDescription>
                <div className="text-2xl font-bold font-mono text-primary">{timeLeft}</div>
            </CardHeader>
            <CardContent>
                {SpecificRoleCard ? <SpecificRoleCard self={self} alivePlayers={alivePlayers} hasActed={hasActed} handleAction={handleAction} /> : <p>جاري تحميل دورك...</p>}
            </CardContent>
        </Card>
    );
};

const DayPhase = ({ game, self, isHost, isSubmitting, setIsSubmitting }: { game: Game, self: Player, isHost: boolean, isSubmitting: boolean, setIsSubmitting: (isSubmitting: boolean) => void }) => {
    const { toast } = useToast();
    const [timeLeft, setTimeLeft] = useState(180);
    const [selectedVote, setSelectedVote] = useState<string | null>(null);
    const eventsContainerRef = useRef<HTMLDivElement>(null);

    const investigationResult = game.mafiaState?.investigationResult;
    const spyResult = game.mafiaState?.spyResult;
    const lastVotedOut = game.mafiaState?.lastVotedOut;
    const votes = game.mafiaState?.votes || {};

    const alivePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    const deadPlayers = useMemo(() => game.players.filter(p => p.status !== 'alive' && p.status !== 'left'), [game.players]);
    const rolesInGame = useMemo(() => game.mafiaState?.rolesInGame || [], [game.mafiaState?.rolesInGame]);
    const hasVoted = useMemo(() => votes[self.id] !== undefined, [votes, self.id]);

    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        const endTime = game.mafiaState.timerEndsAt.toMillis();
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0 && isHost) {
                mafiaActions.hostProgressNextPhase(game.id, self.id);
                clearInterval(timer);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [isHost, self.id, game.id, game.mafiaState?.timerEndsAt]);
    
    useEffect(() => {
        if (eventsContainerRef.current) {
            eventsContainerRef.current.scrollTop = eventsContainerRef.current.scrollHeight;
        }
    }, [game.mafiaState?.events]);

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
    
    const renderDiscussion = () => {
        return (
            <Card className="w-full max-w-4xl bg-white border-gray-200">
                <CardHeader className="text-center">
                    <Sun className="w-16 h-16 mx-auto text-yellow-400" />
                    <CardTitle className="text-3xl">النهار - يوم النقاش</CardTitle>
                    <CardDescription className="text-gray-600">حان وقت النقاش. حاولوا كشف القاتل قبل فوات الأوان!</CardDescription>
                    <div className="text-2xl font-bold font-mono text-primary">{timeLeft}</div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-4">
                         <div className="p-4 bg-muted rounded-lg h-64 overflow-y-auto" ref={eventsContainerRef}>
                            <h4 className="font-bold mb-2">أحداث الليلة الماضية:</h4>
                            <ul className="space-y-2 text-sm">
                                {(game.mafiaState?.events || []).length > 0 ? (
                                    game.mafiaState?.events?.map((event, index) => (
                                    <motion.li key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.2 }}>
                                        {event.message}
                                    </motion.li>
                                ))
                                ) : (
                                    <li>لم يحدث شيء مهم هذه الليلة.</li>
                                )}
                            </ul>
                             {self.role === 'detective' && investigationResult && (
                                <p className="mt-2 p-2 bg-blue-100 text-blue-800 rounded">
                                    نتيجتك: {game.players.find(p => p.id === investigationResult.playerId)?.name} هو من فريق {investigationResult.team === 'good' ? 'الخير' : 'المافيا'}.
                                </p>
                            )}
                            {self.role === 'spy' && spyResult && (
                                 <p className="mt-2 p-2 bg-purple-100 text-purple-800 rounded">
                                    تقريرك: {game.players.find(p => p.id === spyResult.playerId)?.name} يظهر بدور '{MAFIA_ROLES.find(r => r.id === spyResult.role)?.name}'.
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="space-y-4">
                         <Card>
                            <CardHeader className="p-3"><CardTitle className="text-base">المقبرة</CardTitle></CardHeader>
                            <CardContent className="p-3 space-y-2">
                                {deadPlayers.length > 0 ? deadPlayers.map(p => (
                                    <div key={p.id} className="flex items-center gap-2 text-sm opacity-70">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                        <div>
                                            <p className="font-semibold line-through">{p.name}</p>
                                            <p className="text-xs">{MAFIA_ROLES.find(r => r.id === p.role)?.name}</p>
                                        </div>
                                    </div>
                                )) : <p className="text-xs text-muted-foreground text-center">لا يوجد موتى بعد.</p>}
                            </CardContent>
                        </Card>
                    </div>
                </CardContent>
                 {isHost && (
                     <CardFooter>
                        <Button onClick={() => mafiaActions.hostProgressNextPhase(game.id, self.id)} className="w-full">
                            الانتقال لمرحلة التصويت
                        </Button>
                    </CardFooter>
                )}
            </Card>
        );
    }
    
    const renderVoting = () => {
        const votesByPlayer: Record<string, string[]> = {};
        Object.entries(votes).forEach(([voterId, targetId]) => {
            if (targetId) {
                if (!votesByPlayer[targetId]) votesByPlayer[targetId] = [];
                votesByPlayer[targetId].push(voterId);
            }
        });
        return (
          <Card className="w-full max-w-2xl">
              <CardHeader className="text-center">
                  <Vote className="w-16 h-16 mx-auto text-primary" />
                  <CardTitle className="text-3xl">التصويت</CardTitle>
                  <CardDescription className="text-gray-600">صوتوا للاعب الذي تشكون بأنه القاتل. لديكم {timeLeft} ثانية.</CardDescription>
              </CardHeader>
              <CardContent>
                  <ScrollArea className="h-72">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-1">
                          {alivePlayers.map(p => (
                              <div key={p.id}>
                                  <motion.div onClick={() => !hasVoted && setSelectedVote(p.id)} className={cn("p-2 rounded-lg border-2 cursor-pointer text-center", selectedVote === p.id ? "border-primary bg-primary/10" : "border-transparent bg-muted", hasVoted && "cursor-not-allowed opacity-60")} whileTap={{ scale: hasVoted ? 1 : 0.95 }}>
                                      <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16 mx-auto" />
                                      <p className="font-bold mt-2">{p.name}</p>
                                  </motion.div>
                                  {votesByPlayer[p.id] && (
                                      <div className="flex justify-center flex-wrap gap-1 mt-1">
                                          {votesByPlayer[p.id].map(voterId => (<PlayerAvatar key={voterId} avatarId={game.players.find(pl => pl.id === voterId)?.avatarId || ''} className="w-5 h-5" />))}
                                      </div>
                                  )}
                              </div>
                          ))}
                          <div key="no_one">
                            <motion.div onClick={() => !hasVoted && setSelectedVote('no_one')} className={cn("p-2 rounded-lg border-2 cursor-pointer text-center h-full flex flex-col justify-center", selectedVote === 'no_one' ? "border-primary bg-primary/10" : "border-transparent bg-muted", hasVoted && "cursor-not-allowed opacity-60")} whileTap={{ scale: hasVoted ? 1 : 0.95 }}>
                                <Users className="w-16 h-16 mx-auto text-muted-foreground"/>
                                <p className="font-bold mt-2">لا أحد</p>
                            </motion.div>
                          </div>
                      </div>
                  </ScrollArea>
              </CardContent>
              <CardFooter>
                  {hasVoted ? (<p className="text-center w-full text-green-600 font-bold">تم التصويت بنجاح. في انتظار الآخرين...</p>) : (<Button onClick={handleVote} disabled={isSubmitting || selectedVote === null} className="w-full">تأكيد التصويت</Button>)}
              </CardFooter>
          </Card>
        );
    };
    
     const renderVotingResults = () => {
        const votedOutPlayer = lastVotedOut?.playerId ? game.players.find(p => p.id === lastVotedOut.playerId) : null;
        return (
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <Users className="w-16 h-16 mx-auto text-gray-500" />
                    <CardTitle className="text-3xl">نتيجة التصويت</CardTitle>
                </CardHeader>
                 <CardContent className="text-center space-y-4">
                    {votedOutPlayer ? (
                        <div className="flex flex-col items-center gap-2">
                            <Skull className="w-12 h-12 text-destructive" />
                            <p className="text-xl">لقد قررت المدينة التضحية بـ:</p>
                            <PlayerAvatar avatarId={votedOutPlayer.avatarId} className="w-24 h-24" />
                            <p className="text-2xl font-bold">{votedOutPlayer.name}</p>
                            <p className="text-lg text-muted-foreground">(كان {MAFIA_ROLES.find(r => r.id === votedOutPlayer.role)?.name})</p>
                        </div>
                    ) : (
                        <p className="text-xl text-muted-foreground">{lastVotedOut?.tie ? "تعادل في الأصوات! لم يتم إقصاء أحد." : "لم يصوت أحد! لقد نجا الجميع هذه المرة."}</p>
                    )}
                 </CardContent>
            </Card>
        );
     };

    switch (game.gameState) { // Note: using gameState directly as phase is now internal
        case 'discussion': return renderDiscussion();
        case 'voting': return renderVoting();
        case 'voting_results': return renderVotingResults();
        default: return null;
    }
};

const FinalResultsPhase = ({ game, handleLeaveGame }: { game: Game, handleLeaveGame: () => void }) => {
    const { winner, message } = game.gameResult || {};
    const winnerText = winner === 'good' ? "فريق الخير" : "المافيا";
    const allPlayersWithRoles = game.players.map(p => ({
        ...p,
        roleName: MAFIA_ROLES.find(r => r.id === p.role)?.name || 'غير معروف'
    }));

    return (
        <Card className="w-full max-w-xl text-center">
            <CardHeader>
                <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                <CardDescription className="text-2xl font-bold mt-2">الفائز هو: {winnerText}!</CardDescription>
                 <p className="text-lg text-muted-foreground">{message}</p>
            </CardHeader>
            <CardContent>
                <h3 className="font-bold mb-2">الأدوار النهائية</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {allPlayersWithRoles.map(p => (
                         <div key={p.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                            <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                            <div>
                               <p className="font-semibold">{p.name}</p>
                               <p className="text-xs text-muted-foreground">{p.roleName}</p>
                            </div>
                         </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter><Button onClick={handleLeaveGame} className="w-full">العودة إلى اللوبي</Button></CardFooter>
        </Card>
    );
};


// --- Main MafiaGame Component ---
interface MafiaGameProps {
  game: Game;
  self: Player;
}

export function MafiaGame({ game, self }: MafiaGameProps) {
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLeaveGame = useCallback(async () => {
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
  }, [game.id, self.id, router, toast]);

  const renderContent = () => {
    switch (game.gameState) {
      case 'lobby':
        return <Lobby game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} handleLeaveGame={handleLeaveGame} />;
      case 'role_reveal':
        return <RoleRevealPhase game={game} self={self} isHost={isHost} />;
      case 'night':
        return <NightPhase game={game} self={self} isHost={isHost} setIsSubmitting={setIsSubmitting} />;
      case 'discussion':
      case 'voting':
      case 'voting_results':
        return <DayPhase game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} />;
      case 'final_results':
        return <FinalResultsPhase game={game} handleLeaveGame={handleLeaveGame} />;
      default:
         return <LoadingState text={`حالة غير معروفة: ${game.gameState}`} />;
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div key={game.gameState} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease: 'easeInOut' }} className="w-full h-full flex items-center justify-center">
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
