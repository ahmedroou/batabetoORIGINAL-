
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player } from "@/types";
import { leaveGame } from "@/lib/actions/room";
import { startWhoAmIGame, beginWhoAmIGame } from "@/lib/actions/who-am-i";
import { startKillerGame } from "@/lib/actions/killer";
import { progressToTeamSelection } from "@/lib/actions/king-of-genius";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, LogOut, Users, ArrowRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { WhoAmIGame } from "@/components/game/who-am-i/WhoAmIGame";
import { KillerGame } from "@/components/game/killer/KillerGame";
import { KingOfGeniusGame } from "@/components/game/king-of-genius/KingOfGeniusGame";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { cn } from "@/lib/utils";

export default function GameClient() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const { toast } = useToast();

  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopying, setIsCopying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const self = useMemo(() => game?.players.find(p => p.id === player?.id), [game, player]);
  const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);
  const isHost = useMemo(() => game?.hostId === player?.id, [game, player]);

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
            if (gameData.gameState !== 'ended' && gameData.gameState !== 'final_results') {
                sessionStorage.removeItem(`player-${gameId}`);
                toast({ title: "لقد غادرت اللعبة" });
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
      toast({ title: "لقد غادرت الغرفة."})
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleStartGame = async () => {
    if (!player || !isHost || !game) return;
    setIsSubmitting(true);
    try {
        if (game.gameType === 'who-am-i') {
            await startWhoAmIGame(gameId);
        } else if (game.gameType === 'killer') {
            await startKillerGame(gameId);
        } else if (game.gameType === 'king-of-genius') {
            await progressToTeamSelection(gameId);
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
              <Users className="w-16 h-16 mx-auto text-primary animate-pulse"/>
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
    'who-am-i': 'غرفة الانتظار',
    'king-of-genius': 'غرفة انتظار ساحة العباقرة',
  };

  const gameDescriptions = {
      'killer': 'استعدوا للغموض. سيتم توزيع الأدوار عند بدء اللعبة.',
      'who-am-i': 'شارك المعرف مع أصدقائك. ابدأ اللعبة عندما يكون الجميع جاهزًا.',
      'king-of-genius': 'شارك المعرف. سيتم تقسيم الفرق بعد بدء اللعبة.',
  };
  
  const getMinPlayers = (gameType: Game['gameType']) => {
      switch(gameType) {
          case 'killer': return 4;
          case 'who-am-i': return 2;
          case 'king-of-genius': return 2;
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
                <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[80px]">
                    {activePlayers.map(p => (
                      <div key={p.id} className="font-medium flex items-center gap-3 animate-fade-in">
                          <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" />
                          <div className="flex-grow">
                              <span className="font-bold text-lg">{p.name}</span>
                              {p.id === player?.id && <span className="text-xs text-primary font-bold ml-2">(أنت)</span>}
                          </div>
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
                <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md">في انتظار صاحب الغرفة لبدء اللعبة...</p>
            )}
            <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                <LogOut /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
            </Button>
        </CardContent>
    </Card>
  );

  const renderInstructions = () => {
    const handleBeginGame = async () => {
        if (!player || !isHost) return;
        setIsSubmitting(true);
        try {
            await beginWhoAmIGame(gameId, player.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const whoAmIInstructions = (
        <div className="space-y-4">
            <h3 className="text-2xl font-bold text-center">كيف تلعب "اكتشف من أنا؟"</h3>
            <ol className="list-decimal list-inside text-right space-y-2 text-lg marker:font-bold marker:text-primary">
                <li>في كل جولة، سيتم طرح سؤال غريب وشخصي.</li>
                <li>أجب على السؤال بصدق (أو بذكاء!) دون الكشف عن هويتك.</li>
                <li>بعد جمع كل الإجابات، سيتم عرضها بشكل عشوائي.</li>
                <li>خمّن من هو صاحب كل إجابة من اللاعبين الآخرين.</li>
                <li>اربح نقاطًا عن كل تخمين صحيح! اللاعب الذي يعرف أصدقاءه أفضل هو الفائز.</li>
            </ol>
        </div>
    );
    
    return (
        <Card className="w-full max-w-2xl animate-bounce-in">
            <CardHeader>
                <CardTitle className="text-center text-primary text-3xl">شرح اللعبة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {whoAmIInstructions}
            </CardContent>
            <CardFooter>
                 {isHost ? (
                     <Button onClick={handleBeginGame} className="w-full" size="lg" disabled={isSubmitting}>
                        {isSubmitting ? "جاري البدء..." : "ابدأ الجولة الأولى"}
                    </Button>
                ) : (
                    <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md w-full">
                        في انتظار صاحب الغرفة لبدء اللعبة...
                    </p>
                )}
            </CardFooter>
        </Card>
    );
  };

  const renderCurrentState = () => {
    // Lobby is common to all games
    if (game.gameState === 'lobby') {
      return renderLobby();
    }

    // Instructions are specific to 'who-am-i'
    if (game.gameState === 'instructions' && game.gameType === 'who-am-i') {
      return renderInstructions();
    }

    // After lobby/instructions, render the specific game component
    if (game.gameType === 'who-am-i') {
      return <WhoAmIGame game={game} player={player} />;
    }
    if (game.gameType === 'killer') {
      return <KillerGame game={game} player={player} self={self} isHost={isHost} setGame={setGame} />;
    }
    if (game.gameType === 'king-of-genius') {
      // The KingOfGeniusGame component handles its own internal states like 'team_selection', 'challenge_active', etc.
      return <KingOfGeniusGame game={game} player={player} self={self} isHost={isHost} />;
    }
    
    // Fallback for any unknown state
    return <p>نوع لعبة غير معروف أو حالة غير مدعومة.</p>;
  }


  return (
    <main className={cn(
      "flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative bg-background",
      (game?.gameType === 'killer' && game?.gameState === 'victim_reveal' && 'bg-gray-900 transition-colors duration-500'),
       (game?.gameType === 'king-of-genius' && 'bg-slate-50')
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
      
      {renderCurrentState()}
      
    </main>
  );
}
