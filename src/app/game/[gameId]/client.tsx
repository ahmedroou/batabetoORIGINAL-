
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LogOut, Loader2 } from "lucide-react";
import { KingOfGeniusGame } from "@/components/game/king-of-genius/KingOfGeniusGame";
import { TrapAnswerGame } from "@/components/game/trap-answer/TrapAnswerGame";
import { WordWarGame } from '@/components/game/word-war/WordWarGame';
import { BehindTheMaskGame } from '@/components/game/behind-the-mask/BehindTheMaskGame';
import { PrisonGame } from '@/components/game/prison/PrisonGame';
import { EducatedMerchantGame } from '@/components/game/educated-merchant/EducatedMerchantGame';
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { leaveGame } from '@/lib/actions/room';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { setAwayStatus } from '@/lib/actions/trap-answer';

export default function GameClient() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const isVisible = usePageVisibility();

  const [game, setGame] = useState<Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // This effect runs once to get the player's session ID.
  const selfId = useMemo(() => {
    if (typeof window !== "undefined") {
      try {
        return sessionStorage.getItem(`player-id-${gameId}`);
      } catch (e) {
        console.error("Session storage is not available.");
        return null;
      }
    }
    return null;
  }, [gameId]);

  // This effect is responsible for listening to game state changes from Firestore.
  useEffect(() => {
    if (!gameId) {
      router.push('/');
      return;
    }
    
    const unsub = onSnapshot(
      doc(db, "games", gameId),
      (docSnap) => {
        setIsLoading(false);
        if (docSnap.exists()) {
          const gameData = { id: docSnap.id, ...docSnap.data() } as Game;
          setGame(gameData);
          
          const isPlayerInGame = Array.isArray(gameData.players) && gameData.players.some(p => p.id === selfId);
          if (selfId && !isPlayerInGame && gameData.gameState !== 'final_results') {
             sessionStorage.removeItem(`player-id-${gameId}`);
             toast({ title: "لقد غادرت اللعبة أو تم طردك" });
             router.push('/');
          }
        } else {
          toast({ title: "الغرفة لم تعد موجودة", variant: "destructive" });
          sessionStorage.removeItem(`player-id-${gameId}`);
          router.push('/');
        }
      },
      (error) => {
        console.error("Firebase snapshot error", error);
        toast({ title: "خطأ في الاتصال", description: "تحقق من اتصالك بالإنترنت", variant: "destructive" });
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [gameId, router, toast, selfId]);

  // This effect handles the AFK status for the player.
  useEffect(() => {
      if (selfId && game?.gameType === 'trap-answer') {
          setAwayStatus(game.id, selfId, !isVisible);
      }
  }, [isVisible, game?.id, game?.gameType, selfId]);

  const handleLeaveGame = useCallback(async () => {
    if (!selfId) return;
    const result = await leaveGame(gameId, selfId);
    if (result.success) {
      sessionStorage.removeItem(`player-id-${gameId}`);
      router.push('/');
      toast({ title: "لقد غادرت الغرفة." });
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
  }, [gameId, selfId, router, toast]);

  const self = useMemo(() => {
    if (game && Array.isArray(game.players) && selfId) {
      return game.players.find(p => p.id === selfId);
    }
    return null;
  }, [game, selfId]);


  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">جاري تحميل اللعبة...</p>
      </main>
    );
  }

  if (!game || !self) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8">
          <CardTitle className="text-2xl font-bold text-destructive">خطأ في تحميل اللعبة</CardTitle>
          <CardDescription className="mt-2">قد تكون الغرفة محذوفة أو تم طردك. حاول الانضمام مرة أخرى.</CardDescription>
          <Button onClick={() => router.push('/')} className="mt-4">العودة للصفحة الرئيسية</Button>
        </Card>
      </main>
    );
  }
  
  const renderGameContent = () => {
    switch (game.gameType) {
      case 'trap-answer': return <TrapAnswerGame game={game} self={self} />;
      case 'word_war': return <WordWarGame game={game} self={self} />;
      case 'king-of-genius': return <KingOfGeniusGame game={game} player={self} self={self} isHost={game.hostId === self.id} />;
      case 'behind-the-mask': return <BehindTheMaskGame game={game} self={self} />;
      case 'prison': return <PrisonGame game={game} self={self} />;
      case 'educated-merchant': return <EducatedMerchantGame game={game} self={self} />;
      default: return <p>حالة غير معروفة للعبة "{game.gameType}"</p>;
    }
  };

  return (
    <main className={cn("flex min-h-screen flex-col items-center justify-center p-1 md:p-2 relative bg-background")}> 
      {game.gameState !== 'lobby' && game.gameState !== 'final_results' && (
        <div className="absolute top-4 left-4 z-50">
          <Button variant="outline" size="sm" onClick={handleLeaveGame}>
            <LogOut className="ml-2 h-4 w-4" /> مغادرة
          </Button>
        </div>
      )}
      {renderGameContent()}
    </main>
  );
}
