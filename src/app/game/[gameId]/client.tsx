
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player } from "@/types";
import { leaveGame, kickPlayerFromLobby } from "@/lib/actions/room";
import { startKillerGame } from "@/lib/actions/killer";
import { progressToTeamSelection } from "@/lib/actions/king-of-genius";
import { startTheSlapGame } from "@/lib/actions/the-slap-game";
import { startTrapAnswerGame } from '@/lib/actions/trap-answer';
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, LogOut, Users, ArrowRight, UserX, Crown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KillerGame } from "@/components/game/killer/KillerGame";
import { KingOfGeniusGame } from "@/components/game/king-of-genius/KingOfGeniusGame";
import { TheSlapGame } from "@/components/game/the-slap-game/TheSlapGame";
import { TrapAnswerGame } from "@/components/game/trap-answer/TrapAnswerGame";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
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


export default function GameClient() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const { toast } = useToast();
  const { user } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopying, setIsCopying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<Player | null>(null);


  const self = useMemo(() => game?.players.find(p => p.id === player?.id), [game, player]);
  const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);
  const isHost = useMemo(() => game?.hostId === user?.uid, [game, user]);

  useEffect(() => {
    if (!gameId) {
      router.push('/');
      return;
    }
    try {
      const p = sessionStorage.getItem(`player-${gameId}`);
      if (p) {
        setPlayer(JSON.parse(p));
      } else {
        // If there's no player data in session, it's safer to just go home.
        // The join logic will handle creating the player session item.
        router.push('/');
      }
    } catch (error) {
      router.push('/');
    }
  }, [gameId, router]);

  useEffect(() => {
    if (!gameId || !player?.id) {
      return;
    }

    const unsub = onSnapshot(doc(db, "games", gameId),
      (doc) => {
        setIsLoading(false);
        if (doc.exists()) {
          const gameData = { id: doc.id, ...doc.data() } as Game;
          setGame(gameData);

          const currentPlayerInGame = gameData.players.find(p => p.id === player.id);
          if (!currentPlayerInGame || currentPlayerInGame.status === 'left') {
            // Player was removed or left
            if (gameData.gameState !== 'ended' && gameData.gameState !== 'final_results') {
              sessionStorage.removeItem(`player-${gameId}`);
              toast({ title: "لقد غادرت اللعبة أو تم طردك" });
              router.push('/');
            }
          }

        } else {
          toast({ title: "الغرفة لم تعد موجودة", variant: "destructive" });
          sessionStorage.removeItem(`player-${gameId}`);
          router.push('/');
        }
      },
      (error) => {
        console.error("Firebase snapshot error: ", error);
        toast({ title: "خطأ في الاتصال", description: "لا يمكن الاتصال باللعبة. تحقق من اتصالك بالإنترنت.", variant: "destructive" });
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [gameId, player?.id, toast, router]);

  const handleCopyId = () => {
    setIsCopying(true);
    navigator.clipboard.writeText(gameId);
    setTimeout(() => setIsCopying(false), 2000);
  }

  const handleLeaveGame = async () => {
    if (!player) return;
    setIsSubmitting(true);
    const result = await leaveGame(gameId, player.id);
    if (result.success) {
      sessionStorage.removeItem(`player-${gameId}`);
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
    const result = await kickPlayerFromLobby(gameId, self.id, playerToKick.id);
     if (result.error) {
        toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
    } else {
        toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
    }
    setPlayerToKick(null);
    setIsSubmitting(false);
  };


  const handleStartGame = async () => {
    if (!user || !isHost || !game) return;
    setIsSubmitting(true);
    try {
      if (game.gameType === 'killer') {
        await startKillerGame(game.id, user.uid);
      } else if (game.gameType === 'king-of-genius') {
        await progressToTeamSelection(game.id, user.uid);
      } else if (game.gameType === 'the-slap-game') {
        await startTheSlapGame(game.id, user.uid);
      } else if (game.gameType === 'trap-answer') {
        await startTrapAnswerGame(game.id, user.uid);
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8">
          <Users className="w-16 h-16 mx-auto text-primary animate-pulse" />
          <CardTitle className="mt-4">جاري تحميل اللعبة...</CardTitle>
          <CardDescription className="mt-2">لحظات من فضلك...</CardDescription>
        </Card>
      </main>
    );
  }

  if (!game || !player || !self) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8">
          <CardTitle className="text-2xl font-bold text-destructive">خطأ في تحميل اللعبة</CardTitle>
          <CardDescription className="mt-2">لا يمكن العثور على بيانات اللعبة أو اللاعب. قد تكون الغرفة قد حُذفت.</CardDescription>
          <Button onClick={() => router.push('/')} className="mt-4">العودة إلى الصفحة الرئيسية</Button>
        </Card>
      </main>
    );
  }

  const gameTitles = {
    'killer': 'لوبي المحقق والقاتل',
    'king-of-genius': 'غرفة انتظار ساحة العباقرة',
    'the-slap-game': 'غرفة انتظار لعبة الصفعة',
    'trap-answer': 'لوبي لعبة الجواب المفخخ',
  };

  const gameDescriptions = {
    'killer': 'استعدوا للغموض. سيتم توزيع الأدوار عند بدء اللعبة.',
    'king-of-genius': 'شارك المعرف. سيتم تقسيم الفرق بعد بدء اللعبة.',
    'the-slap-game': 'استعد لوصف أصدقائك... أو تلقي الصفعات!',
    'trap-answer': 'ادعُ أصدقاءك. يمكن للمضيف ضبط إعدادات اللعبة قبل البدء.',
  };

  const getMinPlayers = (gameType: Game['gameType']) => {
    switch (gameType) {
      case 'killer': return 4;
      case 'king-of-genius': return 2;
      case 'the-slap-game': return 2;
      case 'trap-answer': return 2;
      default: return 2;
    }
  }

  const renderLobby = () => (
    <Card className="w-full max-w-md animate-bounce-in">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          {gameTitles[game.gameType] || 'غرفة الانتظار'}
        </CardTitle>
        <CardDescription>
          {gameDescriptions[game.gameType] || 'شارك المعرف لبدء اللعبة.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={gameId} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
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
          <Label>اللاعبون ({activePlayers.length})</Label>
          <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
            {activePlayers.map(p => (
              <div key={p.id} className="font-medium flex items-center gap-3 animate-fade-in">
                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" />
                <div className="flex-grow">
                  <span className="font-bold text-lg">{p.name}</span>
                  {p.id === game.hostId && <Crown className="inline w-4 h-4 ml-1 text-yellow-500" />}
                  {p.id === player?.id && <span className="text-xs text-primary font-bold ml-2">(أنت)</span>}
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
          <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < getMinPlayers(game.gameType)} className="w-full" size="lg">
            {isSubmitting ? "..." : activePlayers.length < getMinPlayers(game.gameType)
              ? `تحتاج ${getMinPlayers(game.gameType)} لاعبين على الأقل`
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
  );

  const renderGameContent = () => {
    // Trap Answer game has its own lobby/game views handled internally
    if (game.gameType === 'trap-answer') {
      return <TrapAnswerGame game={game} self={self} />;
    }

    if (game.gameState === 'lobby') {
      return renderLobby();
    }

    switch (game.gameType) {
      case 'killer':
        return <KillerGame game={game} player={player} self={self} setGame={setGame} />;
      case 'king-of-genius':
        return <KingOfGeniusGame game={game} player={player} self={self} isHost={isHost} />;
      case 'the-slap-game':
        return <TheSlapGame game={game} self={self} />;
      default:
        return <p>حالة غير معروفة في لعبة "{game.gameType}"...</p>;
    }
  };

  return (
    <>
      <main className={cn(
        "flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative bg-background",
        (game?.gameType === 'killer' && game?.gameState === 'victim_reveal' && 'bg-gray-900 transition-colors duration-500'),
        (game?.gameType === 'king-of-genius' && 'bg-slate-50'),
        (game?.gameType === 'trap-answer' && 'bg-gray-100 dark:bg-gray-900'),
        (self?.isTraitor && game.gameType === 'killer' && "bg-[url('https://www.transparenttextures.com/patterns/gplay.png')] bg-red-900/90")
      )}>
        <div className="absolute top-4 right-4 text-left">
          <h1 className="text-2xl font-bold text-primary">
            بطابيطو
          </h1>
        </div>

        {game.gameState !== 'lobby' && game.gameState !== 'final_results' && game.gameState !== 'ended' && game.gameState !== 'instructions' && (
          <div className="absolute top-4 left-4 z-50">
            <Button variant="outline" size="sm" onClick={handleLeaveGame} disabled={isSubmitting}>
              <LogOut className="ml-2 h-4 w-4" /> مغادرة
            </Button>
          </div>
        )}

        {renderGameContent()}
      </main>

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
