
"use client";

import { useState, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Copy, Check, UserX, Settings, Loader2, Save, ArrowRight } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as roomActions from '@/lib/actions/room';
import * as snakesAndScissorsActions from '@/lib/actions/snakes-and-scissors';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LobbyPhaseProps {
    game: Game;
    self: Player;
}

export function LobbyPhase({ game, self }: LobbyPhaseProps) {
    const { toast } = useToast();
    const router = useRouter();
    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [settings, setSettings] = useState(game.snakesAndScissorsState?.settings || { rounds: 15 });

    
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);

    const handleLeaveGame = async () => {
        setIsSubmitting(true);
        const result = await roomActions.leaveGame(game.id, self.id);
        if (result.success) {
            sessionStorage.removeItem(`player-${game.id}`);
            router.push('/');
            toast({ title: "لقد غادرت الغرفة." });
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

    const handleStartGame = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await snakesAndScissorsActions.startGame(game.id, self.id);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSaveSettings = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await snakesAndScissorsActions.updateGameSettings(game.id, self.id, settings);
            toast({ title: "تم حفظ الإعدادات بنجاح" });
        } catch(e: any) {
            toast({ title: "خطأ في حفظ الإعدادات", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };


    return (
        <>
            <Card className="w-full max-w-md animate-bounce-in">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">بنك الحظ</CardTitle>
                    <CardDescription>ادعُ أصدقاءك. تبدأ اللعبة بلاعبين على الأقل.</CardDescription>
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
                     {isHost && (
                         <div className="space-y-2 pt-2">
                             <Label htmlFor="rounds">عدد الجولات</Label>
                             <div className="flex items-center gap-2">
                                <Input 
                                    id="rounds"
                                    type="number"
                                    value={settings.rounds}
                                    onChange={(e) => setSettings({ ...settings, rounds: parseInt(e.target.value, 10) || 1 })}
                                    className="flex-grow"
                                />
                                 <Button onClick={handleSaveSettings} disabled={isSubmitting}>
                                     {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
                                </Button>
                             </div>
                        </div>
                     )}
                    <div className="space-y-2">
                        <Label>اللاعبون ({activePlayers.length})</Label>
                        <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
                            {activePlayers.map(p => (
                                <div key={p.id} className="font-medium flex items-center justify-between gap-3 animate-fade-in">
                                    <div className="flex items-center gap-3">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" temporaryTitle={p.temporaryTitle} />
                                        <p className="font-bold text-lg">{p.name}</p>
                                    </div>
                                    {isHost && p.id !== self?.id && (
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)}>
                                            <UserX className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    {isHost ? (
                        <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full" size="lg">
                            <ArrowRight className="mr-2 h-4 w-4" />
                            {isSubmitting ? "..." : activePlayers.length < 2
                                ? `تحتاج ${2 - activePlayers.length} لاعبين على الأقل`
                                : "ابدأ اللعبة"}
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
                        <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className={cn(buttonVariants({ variant: "destructive" }))}>
                            {isSubmitting ? "جاري الطرد..." : "نعم، قم بالطرد"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
