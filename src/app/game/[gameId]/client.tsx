
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player } from "@/types";
import * as actions from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, LogOut, Users, ArrowRight, Skull, Glasses, Eye, UsersRound, FileText, MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { WhoAmIGame } from "@/components/game/who-am-i/WhoAmIGame";
import { KillerGame } from "@/components/game/killer/KillerGame";
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
          if (!currentPlayerInGame && gameData.gameState !== 'ended' && gameData.gameState !== 'final_results') {
            sessionStorage.removeItem(`player-${gameId}`);
            toast({ title: "تمت إزالتك من اللعبة" });
            router.push('/');
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
    const result = await actions.leaveGame(gameId, player.id);
    if (result.success) {
      sessionStorage.removeItem(`player-${gameId}`);
      router.push('/');
      toast({ title: "لقد غادرت اللعبة."})
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleStartGame = async () => {
    if (game?.gameType === 'who-am-i') {
        await actions.startWhoAmIGame(gameId);
    } else if (game?.gameType === 'killer') {
        await actions.startKillerGame(gameId);
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

  const renderLobby = () => (
    <Card className="w-full max-w-md animate-bounce-in">
        <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {game.gameType === 'killer' ? 'لوبي المحقق والقاتل' : 'غرفة الانتظار'}
            </CardTitle>
            <CardDescription>
              {game.gameType === 'killer' 
                ? 'استعدوا للغموض. سيتم توزيع الأدوار عند بدء اللعبة.'
                : 'شارك المعرف مع أصدقائك. ابدأ اللعبة عندما يكون الجميع جاهزًا.'
              }
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
                <Label>اللاعبون ({game.players.length})</Label>
                <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[80px]">
                    {game.players.map(p => (
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
                <Button onClick={handleStartGame} disabled={game.players.length < (game.gameType === 'killer' ? 4 : 2)} className="w-full" size="lg">
                    {game.players.length < (game.gameType === 'killer' ? 4 : 2)
                        ? `تحتاج ${game.gameType === 'killer' ? '4 لاعبين' : 'لاعبين'} على الأقل`
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
    const handleReady = async () => {
        if (!player) return;
        setIsSubmitting(true);
        try {
            await actions.playerReady(gameId, player.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleContinueToAliases = async () => {
        if (!player || !isHost) return;
        setIsSubmitting(true);
        try {
            await actions.progressToAliases(gameId, player.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const readyPlayers = new Set(game.readyPlayers || []);
    const isReady = readyPlayers.has(player.id);

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

    const killerInstructions = (
        <div className="space-y-6">
            <div className="text-center">
                <h3 className="text-3xl font-bold text-primary">المحقق والقاتل</h3>
                <p className="text-muted-foreground">لعبة خداع، غموض، وتحقيق</p>
            </div>
            
            <div>
                <h4 className="font-bold text-xl mb-2 text-center">الشخصيات الأربعة</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="p-3 bg-muted rounded-lg">
                        <Skull className="w-10 h-10 mx-auto text-red-500"/>
                        <p className="font-bold mt-1">القاتل</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                        <Glasses className="w-10 h-10 mx-auto text-blue-500"/>
                        <p className="font-bold mt-1">المحقق</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                        <Eye className="w-10 h-10 mx-auto text-yellow-500"/>
                        <p className="font-bold mt-1">الشاهد</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                        <UsersRound className="w-10 h-10 mx-auto text-gray-500"/>
                        <p className="font-bold mt-1">المدني</p>
                    </div>
                </div>
            </div>

            <div className="space-y-4 text-right">
                <p><strong>الاستعداد:</strong> على كل لاعب اختيار اسم وهمي سري. حاول ألا تكشف شخصيتك من خلاله!</p>
                
                <div>
                    <h5 className="font-semibold text-lg flex items-center gap-2 justify-end"><FileText/> ملف القضية</h5>
                    <ul className="list-disc list-inside pr-5 space-y-1 text-muted-foreground">
                        <li>تبدأ كل لعبة بقضية قتل وهمية.</li>
                        <li><strong className="text-foreground">القاتل والمحقق:</strong> يطلعان على تفاصيل القضية الدقيقة.</li>
                        <li><strong className="text-foreground">الشاهد والمدنيون:</strong> يعرفون فقط نظرة عامة عن القضية.</li>
                    </ul>
                </div>
                
                <div>
                    <h5 className="font-semibold text-lg flex items-center gap-2 justify-end"><MessageSquare/> التحقيق والمحادثة</h5>
                     <ul className="list-disc list-inside pr-5 space-y-1 text-muted-foreground">
                        <li>يمكن للمحقق البدء فوراً بالتحقيق أو منح القاتل ليلة لارتكاب جريمته الأولى.</li>
                        <li>داخل المحادثة، <strong className="text-foreground">المحقق هو الوحيد الذي يعرف الأسماء الوهمية للجميع</strong>. بالنسبة للبقية، تبقى الهويات مجهولة.</li>
                    </ul>
                </div>
                
                <div>
                    <h5 className="font-semibold text-lg flex items-center gap-2 justify-end"><Eye/> دور الشاهد</h5>
                     <ul className="list-disc list-inside pr-5 space-y-1 text-muted-foreground">
                        <li>سيكتشف الشاهد هوية القاتل إذا ارتكب القاتل خطأً.</li>
                        <li>مثال: أن يستهدف القاتل مدنياً على أنه المحقق في محاولة اغتيال.</li>
                    </ul>
                </div>

            </div>

            <div className="text-center pt-4 border-t">
                <p className="font-bold text-lg">مليت من الشرح؟</p>
                <p className="text-muted-foreground">الباقي تعرفوه لما تجربوا اللعبة لأول مرة... انبسطوا !!</p>
            </div>
        </div>
    );

    return (
        <Card className="w-full max-w-2xl animate-bounce-in">
            <CardHeader>
                <CardTitle className="text-center text-primary text-3xl">شرح اللعبة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {game.gameType === 'who-am-i' ? whoAmIInstructions : killerInstructions}
                
                {game.gameType === 'who-am-i' && (
                  <div className="border-t pt-4 space-y-2">
                      <Label className="text-center block font-bold">اللاعبون المستعدون ({readyPlayers.size}/{game.players.length})</Label>
                      <div className="flex flex-wrap justify-center gap-4 py-2">
                          {game.players.map(p => (
                              <div key={p.id} className="flex flex-col items-center gap-1 text-center w-20">
                                  <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16 rounded-full" />
                                  <span className="text-sm font-bold truncate w-full">{p.name}</span>
                                  {readyPlayers.has(p.id) ? (
                                      <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><Check className="w-4 h-4" /> مستعد</span>
                                  ) : (
                                      <span className="text-xs text-muted-foreground animate-pulse">ينتظر...</span>
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>
                )}
            </CardContent>
            <CardFooter>
                 {game.gameType === 'who-am-i' ? (
                     <Button onClick={handleReady} className="w-full" size="lg" disabled={isReady || isSubmitting}>
                        {isSubmitting ? "..." : isReady ? "في انتظار الآخرين..." : "أنا مستعد!"}
                    </Button>
                ) : (
                    isHost ? (
                        <Button onClick={handleContinueToAliases} className="w-full" size="lg" disabled={isSubmitting}>
                             {isSubmitting ? 'جاري المتابعة...' : 'الانتقال لاختيار الأسماء'} <ArrowRight className="mr-2"/>
                        </Button>
                    ) : (
                        <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md w-full">
                            في انتظار صاحب الغرفة للمتابعة...
                        </p>
                    )
                )}
            </CardFooter>
        </Card>
    );
  };

  const renderCurrentState = () => {
    switch (game.gameState) {
        case 'lobby':
            return renderLobby();
        case 'instructions':
            return renderInstructions();
        case 'who-am-i':
            return <WhoAmIGame game={game} player={player} />;
        case 'killer':
            return <KillerGame game={game} player={player} self={self} isHost={isHost} setGame={setGame} />;
        default:
            if (game.gameType === 'who-am-i') {
                return <WhoAmIGame game={game} player={player} />;
            }
            if (game.gameType === 'killer') {
                return <KillerGame game={game} player={player} self={self} isHost={isHost} setGame={setGame} />;
            }
            return <p>نوع لعبة غير معروف أو حالة غير مدعومة.</p>;
    }
  }

  return (
    <main className={cn(
      "flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative bg-background",
      game?.gameType === 'killer' && game?.gameState === 'victim_reveal' && 'bg-gray-900 transition-colors duration-500'
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
