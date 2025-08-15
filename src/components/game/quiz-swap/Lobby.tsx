
'use client';

import { useState, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerAvatar } from '../PlayerAvatar';
import { LogOut, Copy, Check, ArrowRight } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { leaveGame } from '@/lib/actions/room';
import { startGame } from '@/lib/actions/quiz-swap';

interface QuizSwapLobbyProps {
  game: Game;
  self: Player;
}

export function QuizSwapLobby({ game, self }: QuizSwapLobbyProps) {
  const { toast } = useToast();
  const router = useRouter();
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);

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
    } catch(e: any) {
        toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">لوبي تبديل الأسئلة</CardTitle>
        <CardDescription>ادعُ أصدقاءك. اللعبة تتطلب 2-4 لاعبين.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
            <Input value={game.id} readOnly className="text-center tracking-widest font-mono" />
            <TooltipProvider>
                <Tooltip open={isCopying}>
                    <TooltipTrigger asChild>
                        <Button onClick={() => { setIsCopying(true); navigator.clipboard.writeText(game.id); setTimeout(() => setIsCopying(false), 1200);}} variant="secondary">
                            {isCopying ? <Check/> : <Copy/>}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>تم النسخ!</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
        <div className="space-y-2">
            <h3 className="font-bold text-center">اللاعبون ({activePlayers.length}/4)</h3>
            <div className="grid grid-cols-2 gap-4 p-2 border rounded-lg min-h-[100px]">
                {activePlayers.map(p => (
                    <div key={p.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10"/>
                        <span className="font-semibold">{p.name}</span>
                    </div>
                ))}
            </div>
        </div>
      </CardContent>
       <CardFooter className="flex-col gap-2">
        {isHost ? (
          <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2 || activePlayers.length > 4} className="w-full">
            <ArrowRight className="mr-2 h-4 w-4" />
            {isSubmitting ? 'جاري البدء...' : 'ابدأ اللعبة'}
          </Button>
        ) : (
          <p className="text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
        )}
        <Button onClick={handleLeaveGame} variant="destructive" className="w-full">
          <LogOut className="mr-2 h-4 w-4" /> مغادرة الغرفة
        </Button>
      </CardFooter>
    </Card>
  );
}

