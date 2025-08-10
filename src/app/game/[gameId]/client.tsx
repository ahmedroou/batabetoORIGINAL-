
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player, SocialRank } from "@/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, LogOut, Users, ArrowRight, UserX, Crown, Shield, Settings, Save, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KingOfGeniusGame } from "@/components/game/king-of-genius/KingOfGeniusGame";
import { TrapAnswerGame } from "@/components/game/trap-answer/TrapAnswerGame";
import { WordWarGame } from '@/components/game/word-war/WordWarGame';
import { BehindTheMaskGame } from '@/components/game/behind-the-mask/BehindTheMaskGame';
import { PrisonGame } from '@/components/game/prison/PrisonGame';
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
import { AnimatePresence, motion } from "framer-motion";
import { 
    leaveGame,
    setPlayerReady, 
} from '@/lib/actions/room';
import { startTrapAnswerGame } from '@/lib/actions/trap-answer';
import { startWordWarGame, updateGameSettings as updateWordWarSettings } from '@/lib/actions/word-war';
import { updateMafiaSettings, startGame as startBehindTheMaskGame } from '@/lib/actions/behind-the-mask';


export default function GameClient() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const { toast } = useToast();
  const { user, userProfile, socialRanks: allSocialRanks } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // This is the main listener for game updates. It's now more robust.
  useEffect(() => {
    if (!gameId) {
      router.push('/');
      return;
    }

    // We get the playerId from sessionStorage ONCE to establish who "we" are.
    let localPlayerId: string | null = null;
    try {
        const p = sessionStorage.getItem(`player-${gameId}`);
        if(p) {
            const parsedPlayer = JSON.parse(p) as Player;
            localPlayerId = parsedPlayer.id;
            setPlayer(parsedPlayer); // Set player state here
        } else {
            // This is a normal scenario if the user is just visiting the URL
            // We will redirect later if they are not actually in the game.
        }
    } catch (error) {
       console.error("Failed to read player data from session storage", error);
    }

    const gameDocRef = doc(db, "games", gameId);
    const unsub = onSnapshot(gameDocRef,
      (doc) => {
        setIsLoading(false);
        if (doc.exists()) {
          const gameData = { id: doc.id, ...doc.data() } as Game;
          setGame(gameData);
          
          // The crucial check: Is our player ID still in the game's player list?
          // This relies on localPlayerId which is stable and fetched once.
          const currentPlayerInGame = localPlayerId ? gameData.players.find(p => p.id === localPlayerId) : undefined;
          
          if (!currentPlayerInGame && localPlayerId) {
            if (gameData.gameState !== 'final_results') {
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
  }, [gameId, router, toast]);


  const handleLeaveGame = useCallback(async () => {
    if (!player) return;
    const result = await leaveGame(gameId, player.id);
    if (result.success) {
      sessionStorage.removeItem(`player-${gameId}`);
      router.push('/');
      toast({ title: "لقد غادرت الغرفة." })
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
  }, [gameId, player, router, toast]);

   const handleSetReady = useCallback(async () => {
    if (!player || !game?.challengeDetails) return;
    await setPlayerReady(game.id, player.id);
  }, [game, player]);
  

  if (isLoading || !game || !player) {
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

  const self = Array.isArray(game.players) ? game.players.find(p => p.id === player.id) : undefined;

  if (!self && game.gameState !== 'final_results') {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
            <Card className="w-full max-w-md text-center p-8">
                <CardTitle className="text-2xl font-bold text-destructive">خطأ في تحميل اللعبة</CardTitle>
                <CardDescription className="mt-2">
                    لا يمكن العثور على بياناتك في هذه اللعبة. قد تكون الغرفة قد حُذفت أو تم طردك.
                </CardDescription>
                <Button onClick={() => router.push('/')} className="mt-4">العودة إلى الصفحة الرئيسية</Button>
            </Card>
      </main>
    );
  }
  
  const renderLobbyContent = () => {
      const activePlayers = game.players.filter(p => p.status !== 'left');
      const canStart = activePlayers.length >= (game.challengeDetails?.minPlayersToStart || 2);
      const allReady = canStart && activePlayers.every(p => p.isReady);

      if (allReady) {
          return (
               <Card className="text-center p-8">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
                    <CardTitle className="mt-4">جميع اللاعبين مستعدون!</CardTitle>
                    <CardDescription>ستبدأ المباراة خلال لحظات...</CardDescription>
                </Card>
          )
      }
      return (
            <Card className="w-full max-w-lg">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">{game.challengeDetails?.title || `غرفة ${game.gameType}`}</CardTitle>
                    <CardDescription>
                        {game.challengeDetails
                            ? `في انتظار اللاعبين للانضمام والاستعداد لبدء مباراة التحدي.`
                            : `ادعُ أصدقاءك وانضموا للعبة.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-center">
                        <Users className="w-6 h-6 mr-2" />
                        <span>اللاعبون: {activePlayers.length} / {game.challengeDetails?.minPlayersToStart || 8}</span>
                    </div>
                     <div className="space-y-2">
                         {activePlayers.map(p => (
                            <div key={p.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" temporaryTitle={p.temporaryTitle} />
                                    <span className="font-bold">{p.name}</span>
                                </div>
                                {p.isReady ? (
                                    <span className="text-green-500 font-bold flex items-center gap-1">
                                        <Check /> مستعد
                                    </span>
                                ) : (
                                     <span className="text-yellow-500 font-bold flex items-center gap-1 animate-pulse">
                                         ...
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    {canStart && !self?.isReady && (
                        <Button onClick={handleSetReady} className="w-full bg-green-600 hover:bg-green-700">أنا مستعد</Button>
                    )}
                     <Button onClick={handleLeaveGame} variant="destructive" className="w-full">
                        <LogOut className="ml-2"/> مغادرة
                    </Button>
                </CardFooter>
            </Card>
      );
  }
  
  const renderGameContent = () => {
    if (!self) return renderLobbyContent(); // Fallback if self is not found but not kicked yet
    
    if (game.gameState === 'lobby' && game.challengeId) {
        return renderLobbyContent();
    }
    
    switch (game.gameType) {
      case 'trap-answer':
        return <TrapAnswerGame game={game} self={self} />;
      case 'word_war':
        return <WordWarGame game={game} self={self} />;
      case 'king-of-genius':
        return <KingOfGeniusGame game={game} player={player} self={self} isHost={game.hostId === self.id} />;
      case 'behind-the-mask':
        return <BehindTheMaskGame game={game} self={self} />;
      case 'prison':
        return <PrisonGame game={game} self={self} />;
      default:
        return <p>حالة غير معروفة في لعبة "{game.gameType}"...</p>;
    }
  };
  
  return (
    <>
      <main className={cn(
        "flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative bg-background transition-all duration-700"
      )}>
        <div className="absolute top-4 right-4 text-left z-10">
          <h1 className={cn("text-2xl font-bold text-primary")}>
            بطابيطو
          </h1>
        </div>

        {game.gameState !== 'lobby' && game.gameState !== 'final_results' && (
          <div className="absolute top-4 left-4 z-50">
            <Button variant="outline" size="sm" onClick={handleLeaveGame}>
              <LogOut className="ml-2 h-4 w-4" /> مغادرة
            </Button>
          </div>
        )}

        {renderGameContent()}
      </main>
    </>
  );
}
