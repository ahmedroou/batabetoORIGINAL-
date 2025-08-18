

'use client';

import { useState, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { LogOut, Copy, Check, ArrowRight, Loader2 } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { leaveGame } from '@/lib/actions/room';
import { startGame } from '@/lib/actions/draw-and-deceive';

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

    const activePlayers = useMemo(() => game.players.filter(p => p.status !== 'left'), [game.players]);

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
        try {
            await startGame(game.id, self.id);
        } catch (e: any) {
            toast({ title: 'خطأ في بدء اللعبة', description: e.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const copyGameId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        toast({ title: "تم نسخ رمز الغرفة!" });
        setTimeout(() => setIsCopying(false), 1500);
    };

    return (
        <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">لوبي ارسم واخدع</CardTitle>
                <CardDescription>ادعُ أصدقاءك. اللعبة تحتاج لاعبين اثنين على الأقل.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
                    <TooltipProvider>
                        <Tooltip open={isCopying}>
                            <TooltipTrigger asChild>
                                <Button onClick={copyGameId} size="lg" variant="secondary" className="px-4">
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
                        {activePlayers.map(p => (
                            <div key={p.id} className="flex items-center gap-3">
                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" temporaryTitle={p.temporaryTitle} />
                                <p className="font-bold text-lg">{p.name}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex-col gap-2">
                {isHost ? (
                    <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full" size="lg">
                        <ArrowRight className="mr-2 h-4 w-4" />
                        {isSubmitting ? "..." : (activePlayers.length < 2 ? `تحتاج لاعبًا آخر على الأقل` : "ابدأ اللعبة")}
                    </Button>
                ) : (
                    <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
                )}
                <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                    <LogOut className="mr-2 h-4 w-4" /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                </Button>
            </CardFooter>
        </Card>
    );
}
