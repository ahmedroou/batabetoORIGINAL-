
"use client";

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import * as roomActions from '@/lib/actions/room';
import * as mafiaActions from '@/lib/actions/mafia';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Copy, Check, LogOut, ArrowRight, UserX, Settings } from 'lucide-react';
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
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface LobbyProps {
  game: Game;
  self: Player;
}

export function Lobby({ game, self }: LobbyProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [settings, setSettings] = useState(game.mafiaState?.settings || { nightDuration: 70, discussionDuration: 120, votingDuration: 60 });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);

    const isHost = game.hostId === self.id;
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
}
