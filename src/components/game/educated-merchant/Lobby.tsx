
'use client';

import type { Game, Player } from '@/types';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import * as roomActions from '@/lib/actions/room';
import * as merchantActions from '@/lib/actions/educated-merchant';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerAvatar } from '../PlayerAvatar';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Copy, Check, LogOut, ArrowRight, UserX, Settings, Save, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

interface LobbyPhaseProps {
    game: Game;
    self: Player;
}

export function EducatedMerchantLobby({ game, self }: LobbyPhaseProps) {
    const { toast } = useToast();
    const router = useRouter();
    const { getSocialRankForUser } = useAuth(); // <-- Get rank function
    const [isCopying, setIsCopying] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);

    const isHost = game.hostId === self.id;
    const activePlayers = useMemo(() => game.players.filter(p => p.status !== 'left'), [game.players]);

    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };

    const handleLeaveGame = async () => {
        setIsSubmitting(true);
        const result = await roomActions.leaveGame(game.id, self.id);
        if (result.success) {
            sessionStorage.removeItem(`player-id-${game.id}`);
            router.push('/');
            toast({ title: "لقد غادرت الغرفة." });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleStartGame = async () => {
        setIsSubmitting(true);
        try {
            await merchantActions.startGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ في بدء اللعبة", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
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
            <Card className="w-full max-w-lg animate-pop-in">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">لوبي التاجر المتعلم</CardTitle>
                    <CardDescription>ادعُ أصدقاءك للانضمام باستخدام معرف الغرفة.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
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
                    <div className="space-y-2">
                        <Label>اللاعبون ({activePlayers.length})</Label>
                        <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
                            {activePlayers.map(p => {
                                const rank = getSocialRankForUser(p.leaderboardPoints);
                                const RankIcon = rank?.icon;
                                return (
                                    <div key={p.id} className="font-medium flex items-center justify-between gap-3 animate-fade-in">
                                        <div className="flex items-center gap-3">
                                            <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" temporaryTitle={p.temporaryTitle} />
                                            <div>
                                                <p className="font-bold text-lg">{p.name}</p>
                                                {rank && RankIcon && (
                                                    <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                                                        <RankIcon className="w-3 h-3 text-amber-500" />
                                                        {rank.name}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {isHost && p.id !== self.id && (
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)}>
                                                <UserX className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    {isHost ? (
                        <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full" size="lg">
                            <ArrowRight className="mr-2 h-4 w-4" />
                            {isSubmitting ? "..." : activePlayers.length < 2 ? `تحتاج ${2 - activePlayers.length} لاعبين على الأقل` : "ابدأ اللعبة"}
                        </Button>
                    ) : (
                        <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md animate-pulse">في انتظار صاحب الغرفة لبدء اللعبة...</p>
                    )}
                    <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                        <LogOut className="mr-2 h-4 w-4" /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                    </Button>
                </CardFooter>
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
                    {isSubmitting ? "جاري الطرد..." : "نعم، قم بالطرد"}
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
