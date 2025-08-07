
"use client";

import type { Game, Player } from '@/types';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../PlayerAvatar';
import { ArrowRight, Copy, Check, LogOut } from 'lucide-react';
import * as monopolyActions from '@/lib/actions/monopoly';
import * as roomActions from '@/lib/actions/room';
import { Input } from '@/components/ui/input';

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

    const handleStartGame = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await monopolyActions.startGame(game.id, self.id);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };

    return (
        <Card className="w-full max-w-md animate-bounce-in">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">لوبي مونوبولي</CardTitle>
                <CardDescription>ادعُ أصدقاءك. يمكن للمضيف بدء اللعبة.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
                    <Button onClick={handleCopyId} size="lg" variant="secondary" className="px-4">
                        {isCopying ? <Check /> : <Copy />}
                    </Button>
                </div>
                <div className="space-y-2">
                    {game.players.filter(p => p.status !== 'left').map(p => (
                        <div key={p.id} className="font-medium flex items-center gap-3 p-2 bg-muted rounded-md">
                            <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                            <p className="font-bold text-lg">{p.name}</p>
                        </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter className="flex-col gap-2">
                {isHost && (
                    <Button onClick={handleStartGame} disabled={isSubmitting || game.players.length < 2} className="w-full" size="lg">
                        <ArrowRight className="mr-2" />
                        {isSubmitting ? "جاري البدء..." : (game.players.length < 2 ? "تحتاج لاعبين على الأقل" : "ابدأ اللعبة")}
                    </Button>
                )}
                <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                    <LogOut className="mr-2" />
                    مغادرة الغرفة
                </Button>
            </CardFooter>
        </Card>
    );
}
