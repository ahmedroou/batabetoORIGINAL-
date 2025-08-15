
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
import { kickPlayerFromLobby, leaveGame } from '@/lib/actions/room';
import { startTrapAnswerGame, updateGameSettings } from '@/lib/actions/trap-answer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { getTrapAnswerCategories } from '@/lib/actions/admin/settings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface LobbyPhaseProps {
    game: Game;
    self: Player;
}

export default function TrapAnswerLobby({ game, self }: LobbyPhaseProps) {
    const { toast } = useToast();
    const router = useRouter();
    const { getSocialRankForUser } = useAuth();
    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    const [lobbySettings, setLobbySettings] = useState(game.trapAnswerState?.settings || { rounds: 10, answerTime: 60, categories: [] });
    const [allCategories, setAllCategories] = useState<string[]>([]);
    
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);

     useEffect(() => {
        const fetchCategories = async () => {
            if (isHost) {
                const result = await getTrapAnswerCategories();
                if (result.success && result.categories) {
                    setAllCategories(result.categories);
                    if (!lobbySettings.categories || lobbySettings.categories.length === 0) {
                        setLobbySettings(s => ({...s, categories: result.categories!}));
                    }
                }
            }
        };
        fetchCategories();
    }, [isHost]);


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

    const handleStartGame = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await startTrapAnswerGame(game.id, self.id);
        } catch(e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
            setIsSubmitting(false);
        }
    }
    
    const handleSaveLobbySettings = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await updateGameSettings(game.id, self.id, lobbySettings);
            toast({ title: "تم حفظ الإعدادات" });
        } catch(e: any) {
             toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setIsSettingsOpen(false);
        }
    };


    return (
        <>
        <Card className="w-full max-w-md animate-pop-in">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">لوبي الجواب المفخخ</CardTitle>
            <CardDescription>ادعُ أصدقاءك. يمكن للمضيف ضبط إعدادات اللعبة قبل البدء.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
              <TooltipProvider>
                <Tooltip open={isCopying}>
                  <TooltipTrigger asChild>
                    <Button onClick={() => { setIsCopying(true); navigator.clipboard.writeText(game.id); setTimeout(() => setIsCopying(false), 2000); }} size="lg" variant="secondary" className="px-4">
                      {isCopying ? <Check /> : <Copy />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>تم النسخ!</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="space-y-2">
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
                           <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="rounds-setting">الجولات</Label>
                                    <Input id="rounds-setting" type="number" value={lobbySettings.rounds} disabled={!isHost} onChange={e => setLobbySettings({ ...lobbySettings, rounds: parseInt(e.target.value, 10) || 1 })} />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="answering-time">وقت الإجابة (ث)</Label>
                                    <Input id="answering-time" type="number" value={lobbySettings.answerTime} disabled={!isHost} onChange={e => setLobbySettings({ ...lobbySettings, answerTime: parseInt(e.target.value, 10) || 30 })} />
                                </div>
                            </div>
                             <div className="space-y-1">
                                <Label htmlFor="categories-setting">الأقسام</Label>
                                <p className="text-xs text-muted-foreground">اختر الأقسام التي تريدها في اللعبة. اتركها فارغة لتشمل الكل.</p>
                                 <Select
                                    value={lobbySettings.categories.join(',')}
                                    onValueChange={(value) => setLobbySettings({ ...lobbySettings, categories: value ? value.split(',') : [] })}
                                    disabled={!isHost}
                                >
                                <SelectTrigger>
                                    <SelectValue placeholder="اختر الأقسام..." />
                                </SelectTrigger>
                                <SelectContent className="h-48">
                                    {allCategories.map(cat => (
                                        <SelectItem key={cat} value={cat}
                                            // This is a simplified multi-select-like behavior.
                                            // A proper multi-select component would be better.
                                            onClick={(e) => {
                                                e.preventDefault();
                                                const current = lobbySettings.categories || [];
                                                const newCategories = current.includes(cat)
                                                    ? current.filter(c => c !== cat)
                                                    : [...current, cat];
                                                setLobbySettings({ ...lobbySettings, categories: newCategories });
                                            }}
                                        >
                                           <div className="flex items-center gap-2">
                                                <div className={`w-4 h-4 rounded border-2 ${lobbySettings.categories?.includes(cat) ? "bg-primary border-primary" : "bg-transparent border-border"}`}/>
                                                {cat}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                                </Select>
                             </div>
                             <Button onClick={handleSaveLobbySettings} disabled={isSubmitting} className="w-full">
                                {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} حفظ الإعدادات
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
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
                <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className={buttonVariants({ variant: "destructive" })}>
                {isSubmitting ? "جاري الطرد..." : "نعم، قم بالطرد"}
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
