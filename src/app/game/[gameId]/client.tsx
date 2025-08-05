

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
import { PrisonGame } from "@/components/game/prison/PrisonGame";
import { WordWarGame } from '@/components/game/word-war/WordWarGame';
import { BehindTheMaskGame } from '@/components/game/behind-the-mask/BehindTheMaskGame';
import { DrawAndGuessGame } from '@/components/game/draw-and-guess/DrawAndGuessGame';
import { TheCastleGame } from '@/components/game/the-castle/TheCastleGame';
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
    kickPlayerFromLobby, 
    progressToTeamSelection, 
    startPrisonGame, 
    updatePrisonSettings, 
    startGame as startBehindTheMaskGame,
    startTrapAnswerGame,
    startWordWarGame,
    updateWordWarSettings,
    updateMafiaSettings
} from '@/app/actions';
import { getSocialRankForUser } from '@/lib/actions/user';


export default function GameClient() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const { toast } = useToast();
  const { user, userProfile, socialRanks: allSocialRanks } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
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

  if (!game || !player) {
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

  const self = game.players.find(p => p.id === player.id);

  if (!self) {
      // This can happen briefly if the player has been kicked, before the effect reroutes them.
      return <div className="flex min-h-screen items-center justify-center">جاري المغادرة...</div>;
  }
  
  const renderGameContent = () => {
    switch (game.gameType) {
      case 'trap-answer':
        return <TrapAnswerGame game={game} self={self} />;
      case 'prison':
        return <PrisonGame game={game} self={self} />;
      case 'word_war':
        return <WordWarGame game={game} self={self} />;
      case 'king-of-genius':
        return <KingOfGeniusGame game={game} player={player} self={self} isHost={game.hostId === self.id} />;
      case 'behind-the-mask':
        return <BehindTheMaskGame game={game} self={self} />;
      case 'draw-and-guess':
        return <DrawAndGuessGame game={game} self={self} />;
      case 'the-castle':
        return <TheCastleGame game={game} self={self} />;
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
