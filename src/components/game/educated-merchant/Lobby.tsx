// .
"use client";

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerAvatar } from '../PlayerAvatar';
import { LogOut, Copy, Check, UserX, Loader2, ArrowRight, Settings, Save } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { leaveGame, kickPlayerFromLobby } from '@/lib/actions/room';
import { startGame, updateEducatedMerchantSettings } from '@/lib/actions/educated-merchant';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';


interface LobbyProps {
    game: Game;
    self: Player;
}

export function Lobby({ game, self }: LobbyProps) {
    const { toast } = useToast();
    const router = useRouter();
    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState(game.educatedMerchantState?.settings || { maxRounds: 20 });

    const activePlayers = game.players.filter(p => p.status !== 'left');

    const handleLeaveGame = async () => {
        setIsSubmitting(true);
        const result = await leaveGame(game.id, self.id);
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
        if (!isHost) return;
        setIsSubmitting(true);
        const result = await startGame(game.id, self.id);
        if (result && result.error) {
            toast({title: "خطأ في بدء اللعبة", description: result.error, variant: "destructive"});
            setIsSubmitting(false);
        }
    };

    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };

    const handleSaveSettings = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await updateEducatedMerchantSettings(game.id, self.id, settings);
            toast({ title: "تم حفظ الإعدادات" });
            setIsSettingsOpen(false);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <Card className="w-full max-w-md animate-bounce-in">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">لوبي التاجر المتعلم</CardTitle>
                <CardDescription>ادعُ أصدقاءك. يمكن للمضيف بدء اللعبة.</CardDescription>
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
                        <div className="flex justify-between items-center">
                            <Label className='font-bold text-base'>إعدادات اللعبة</Label>
                            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                                <Settings className={cn("w-5 h-5", isSettingsOpen && "animate-spin")} />
                            </Button>
                        </div>
                        <AnimatePresence>
                        {isSettingsOpen && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                            >
                                <div className="space-y-1">
                                    <Label htmlFor="max-rounds">الحد الأقصى للجولات</Label>
                                    <Input 
                                        id="max-rounds" 
                                        type="number" 
                                        value={settings.maxRounds} 
                                        onChange={e => setSettings({ ...settings, maxRounds: parseInt(e.target.value, 10) || 1 })}
                                        min="5"
                                        max="50"
                                    />
                                </div>
                                <Button onClick={handleSaveSettings} disabled={isSubmitting} className="w-full">
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} حفظ الإعدادات
                                </Button>
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </div>
                )}
                <div className="space-y-2">
                    <h3 className="font-bold text-center">اللاعبون ({activePlayers.length})</h3>
                    <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
                        {activePlayers.map(p => (
                            <div key={p.id} className="font-medium flex items-center justify-between gap-3 animate-fade-in">
                                <div className="flex items-center gap-3">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" />
                                    <p className="font-bold text-lg">{p.name}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex-col gap-2">
                {isHost && (
                    <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full" size="lg">
                        <ArrowRight className="mr-2 h-4 w-4" />
                        {isSubmitting ? "..." : activePlayers.length < 2 ? `تحتاج لاعبين على الأقل` : "ابدأ اللعبة"}
                    </Button>
                )}
                <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                    <LogOut className="mr-2 h-4 w-4" /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                </Button>
            </CardFooter>
        </Card>
    );
}
