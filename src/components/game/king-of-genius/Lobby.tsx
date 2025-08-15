
'use client';

import { useState, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion } from 'framer-motion';
import { LogOut, Copy, Check, UserX, Settings, Loader2, Save, ArrowRight } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { leaveGame, kickPlayerFromLobby } from '@/lib/actions/room';
import { moveToTeamSelection } from '@/lib/actions/king-of-genius';
import { useAuth } from '@/hooks/useAuth';

interface LobbyProps {
    game: Game;
    self: Player;
    isHost: boolean;
}

export function KingOfGeniusLobby({ game, self, isHost }: LobbyProps) {
    const { toast } = useToast();
    const router = useRouter();
    const { getSocialRankForUser } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);

    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);

    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };

    const handleLeaveGame = async () => {
        setIsSubmitting(true);
        const result = await leaveGame(game.id, self.id);
        if (result.success) {
            sessionStorage.removeItem(`player-id-${game.id}`);
            router.push('/');
            toast({ title: "لقد غادرت الغرفة." })
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleStartSelection = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await moveToTeamSelection(game.id, self.id);
        } catch (e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleKickPlayer = async () => {
        if (!playerToKick || !isHost) return;
        setIsSubmitting(true);
        const result = await kickPlayerFromLobby(game.id, self.id, playerToKick.id);
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
                    <CardTitle className="text-2xl">لوبي ساحة العباقرة</CardTitle>
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
                        <h3 className="font-bold text-center">اللاعبون ({activePlayers.length})</h3>
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
                                        {isHost && p.id !== self?.id && (
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
                        <Button onClick={handleStartSelection} disabled={isSubmitting || activePlayers.length < 2} className="w-full" size="lg">
                            <ArrowRight className="mr-2 h-4 w-4" />
                            {isSubmitting ? "..." : "الانتقال لاختيار الفرق"}
                        </Button>
                    ) : (
                        <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
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
                        <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                            {isSubmitting ? "جاري الطرد..." : "نعم، قم بالطرد"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

