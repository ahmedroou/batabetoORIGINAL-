"use client";

import type { Game, Player } from '@/types';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { motion } from 'framer-motion';
import { LogOut, Copy, Check, UserX, Settings, Loader2, Save, ArrowRight } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as roomActions from '@/lib/actions/room';
import * as drawAndGuessActions from '@/lib/actions/draw-and-guess';
import { cn } from '@/lib/utils';

interface LobbyPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
}

export function LobbyPhase({ game, self, isHost }: LobbyPhaseProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [lobbySettings, setLobbySettings] = useState(game.drawAndGuessState?.settings || { drawingTime: 120, guessingTime: 120, roundsPerPlayer: 2 });
    
    const activePlayers = game.players.filter(p => p.status !== 'left');

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
            await drawAndGuessActions.startDrawAndGuessGame(game.id, self.id);
        } catch(e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveLobbySettings = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await drawAndGuessActions.updateGameSettings(game.id, self.id, lobbySettings);
            toast({ title: "تم حفظ الإعدادات" });
        } catch(e: any) {
             toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setIsSettingsOpen(false);
        }
    };
    
    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };

    return (
        <>
            <Card className="w-full max-w-md animate-bounce-in">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">لوبي لعبة رسمة</CardTitle>
                    <CardDescription>ادعُ أصدقاءك. يمكن للمضيف ضبط إعدادات اللعبة قبل البدء.</CardDescription>
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
                        <div className="space-y-2">
                             <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                                className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                            >
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="drawing-time">وقت الرسم (ث)</Label>
                                        <Input id="drawing-time" type="number" value={lobbySettings.drawingTime} onChange={e => setLobbySettings({ ...lobbySettings, drawingTime: parseInt(e.target.value, 10) || 60 })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="guessing-time">وقت التخمين (ث)</Label>
                                        <Input id="guessing-time" type="number" value={lobbySettings.guessingTime} onChange={e => setLobbySettings({ ...lobbySettings, guessingTime: parseInt(e.target.value, 10) || 60 })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="rounds-per-player">جولات لكل لاعب</Label>
                                        <Input id="rounds-per-player" type="number" value={lobbySettings.roundsPerPlayer} onChange={e => setLobbySettings({ ...lobbySettings, roundsPerPlayer: parseInt(e.target.value, 10) || 2 })} />
                                    </div>
                                </div>
                                <Button onClick={handleSaveLobbySettings} disabled={isSubmitting} className="w-full">
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} حفظ الإعدادات
                                </Button>
                            </motion.div>
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label>اللاعبون ({activePlayers.length})</Label>
                        <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
                            {activePlayers.map(p => (
                                <div key={p.id} className="font-medium flex items-center justify-between gap-3 animate-fade-in">
                                    <div className="flex items-center gap-3">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" />
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
                            {isSubmitting ? "جاري الطرد..." : "نعم، قم بطرده"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
