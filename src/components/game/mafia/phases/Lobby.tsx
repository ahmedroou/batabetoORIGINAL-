import React, { useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Copy, Check, LogOut, ArrowRight, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { leaveGame, kickPlayerFromLobby } from '@/lib/actions/room';
import { startGame } from '@/lib/actions/mafia';
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
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";


interface LobbyProps {
    game: Game;
    self: Player;
    isHost: boolean;
}

export function Lobby({ game, self, isHost }: LobbyProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);

    const activePlayers = game.players.filter(p => p.status !== 'left');
    const minPlayers = 4;

    const handleStartGame = async () => {
        setIsSubmitting(true);
        try {
            await startGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleLeaveGame = async () => {
        setIsSubmitting(true);
        try {
            await leaveGame(game.id, self.id);
            sessionStorage.removeItem(`player-${game.id}`);
            router.push('/');
            toast({ title: "لقد غادرت الغرفة." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKickPlayer = async () => {
        if (!playerToKick) return;
        setIsSubmitting(true);
        try {
            await kickPlayerFromLobby(game.id, self.id, playerToKick.id);
            toast({ title: `تم طرد اللاعب ${playerToKick.name}` });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setPlayerToKick(null);
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
            <CardTitle className="text-2xl">لعبة خلف القناع</CardTitle>
            <CardDescription>اجمع اللاعبين (4-8) واستعد للكذب والخداع!</CardDescription>
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
              <Label>اللاعبون ({activePlayers.length}/8)</Label>
              <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
                {activePlayers.map(p => (
                  <div key={p.id} className="font-medium flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" />
                        <p className="font-bold text-lg">{p.name}</p>
                    </div>
                    {isHost && p.id !== self.id && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)}>
                            <UserX className="w-4 h-4" />
                        </Button>
                     )}
                  </div>
                ))}
              </div>
            </div>
             {isHost ? (
              <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < minPlayers} className="w-full" size="lg">
                {isSubmitting ? "..." : activePlayers.length < minPlayers
                  ? `تحتاج ${minPlayers} لاعبين على الأقل`
                  : "ابدأ اللعبة"} <ArrowRight />
              </Button>
            ) : (
              <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md animate-pulse">في انتظار صاحب الغرفة لبدء اللعبة...</p>
            )}
            <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
              <LogOut /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
            </Button>
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
