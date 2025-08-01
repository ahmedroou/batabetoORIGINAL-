

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player, SocialRank } from "@/types";
import { leaveGame, kickPlayerFromLobby } from "@/lib/actions/room";
import { progressToTeamSelection } from "@/lib/actions/king-of-genius";
import { startPrisonGame } from '@/lib/actions/prison';
import { getSocialRankForUser } from "@/lib/actions/user";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, LogOut, Users, ArrowRight, UserX, Crown, Shield, Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KingOfGeniusGame } from "@/components/game/king-of-genius/KingOfGeniusGame";
import { TrapAnswerGame } from "@/components/game/trap-answer/TrapAnswerGame";
import { PrisonGame } from "@/components/game/prison/PrisonGame";
import { WordWarGame } from '@/components/game/word-war/WordWarGame';
import { BehindTheMaskGame } from '@/components/game/behind-the-mask/BehindTheMaskGame';
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
import * as trapAnswerActions from '@/lib/actions/trap-answer';
import * as behindTheMaskActions from '@/lib/actions/behind-the-mask';
import * as wordWarActions from '@/lib/actions/word-war';
import { AnimatePresence, motion } from "framer-motion";


export default function GameClient() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const { toast } = useToast();
  const { user, userProfile, socialRanks: allSocialRanks } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopying, setIsCopying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
  const [playerRanks, setPlayerRanks] = useState<Record<string, SocialRank | null>>({});

  const [mafiaSettings, setMafiaSettings] = useState(game?.mafiaState?.settings || { nightTime: 25, dayTime: 180 });
  const [wordWarSettings, setWordWarSettings] = useState(game?.wordWarState?.settings || { turnTime: 30 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
        router.push('/');
      }
    } catch (error) {
      router.push('/');
    }
  }, [gameId, router]);
  
  useEffect(() => {
    if (game?.players) {
        game.players.forEach(p => {
            if (p.id && !playerRanks[p.id] && p.leaderboardPoints !== undefined) {
                const rank = getSocialRankForUser(p.leaderboardPoints, allSocialRanks);
                setPlayerRanks(prev => ({...prev, [p.id]: rank}));
            }
        });
    }
  }, [game?.players, playerRanks, allSocialRanks]);

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
          if (gameData.mafiaState?.settings) {
            setMafiaSettings(gameData.mafiaState.settings);
          }
          if (gameData.wordWarState?.settings) {
            setWordWarSettings(gameData.wordWarState.settings);
          }

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


  const handleCopyId = useCallback(() => {
    setIsCopying(true);
    navigator.clipboard.writeText(gameId);
    setTimeout(() => setIsCopying(false), 2000);
  }, [gameId]);

  const handleLeaveGame = useCallback(async () => {
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
  }, [gameId, player, router, toast]);
  
  const handleKickPlayer = useCallback(async () => {
    if (!playerToKick || !isHost || !player) return;
    setIsSubmitting(true);
    const result = await kickPlayerFromLobby(gameId, player.id, playerToKick.id);
     if (result.error) {
        toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
    } else {
        toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
    }
    setPlayerToKick(null);
    setIsSubmitting(false);
  }, [playerToKick, isHost, player, gameId, toast]);


  const handleStartGame = useCallback(async () => {
    if (!user || !isHost || !game) return;
    setIsSubmitting(true);
    try {
      if (game.gameType === 'king-of-genius') {
        await progressToTeamSelection(game.id, user.uid);
      } else if (game.gameType === 'trap-answer') {
        await trapAnswerActions.startTrapAnswerGame(game.id, user.uid);
      } else if (game.gameType === 'prison') {
        await startPrisonGame(game.id, user.uid);
      } else if (game.gameType === 'behind-the-mask') {
        await behindTheMaskActions.startGame(game.id, user.uid);
      } else if (game.gameType === 'word_war') {
        await wordWarActions.startGame(game.id, user.uid);
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }, [user, isHost, game, toast]);

  const handleMafiaSettingsChange = async (newSettings: Partial<typeof mafiaSettings>) => {
    const updatedSettings = { ...mafiaSettings, ...newSettings };
    setMafiaSettings(updatedSettings); // Optimistic UI update
    if (isHost && game) {
        try {
            await behindTheMaskActions.updateMafiaSettings(game.id, self!.id, updatedSettings);
        } catch (error: any) {
            toast({ title: "خطأ في تحديث الإعدادات", description: error.message, variant: "destructive" });
        }
    }
  };

  const handleWordWarSettingsChange = async (newSettings: Partial<typeof wordWarSettings>) => {
    const updatedSettings = { ...wordWarSettings, ...newSettings };
    setWordWarSettings(updatedSettings); // Optimistic UI update
    if (isHost && game) {
        try {
            await wordWarActions.updateGameSettings(game.id, self!.id, updatedSettings);
        } catch (error: any) {
            toast({ title: "خطأ في تحديث الإعدادات", description: error.message, variant: "destructive" });
        }
    }
  };

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
  
  const getMinPlayers = (gameType: Game['gameType']) => {
    switch (gameType) {
      case 'king-of-genius': return 2;
      case 'trap-answer': return 2;
      case 'prison': return 2;
      case 'behind-the-mask': return 4;
      case 'word_war': return 4;
      default: return 2;
    }
  }

  const renderLobby = () => {
      const gameTitles: Record<Game['gameType'], string> = {
        'king-of-genius': 'غرفة انتظار ساحة العباقرة',
        'trap-answer': 'لوبي لعبة الجواب المفخخ',
        'prison': 'لوبي لعبة السجن',
        'behind-the-mask': 'لوبي لعبة خلف القناع',
        'word_war': 'لوبي لعبة حرب الكلمات',
      };

      const gameDescriptions: Record<Game['gameType'], string> = {
        'king-of-genius': 'شارك المعرف. سيتم تقسيم الفرق بعد بدء اللعبة.',
        'trap-answer': 'ادعُ أصدقاءك. يمكن للمضيف ضبط إعدادات اللعبة قبل البدء.',
        'prison': 'ادعُ أصدقاءك. يمكن للمضيف ضبط إعدادات اللعبة قبل البدء.',
        'behind-the-mask': 'اجمع اللاعبين واستعد لكشف الأدوار السرية!',
        'word_war': 'اجمع اللاعبين واستعد لمواجهة الكلمات!',
      };

      return (
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
             {game.gameType === 'behind-the-mask' && (
                  <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className='font-bold text-base'>إعدادات اللعبة</Label>
                        {isHost && (
                            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                                <Settings className={cn("w-5 h-5", isSettingsOpen && "animate-spin")} />
                            </Button>
                        )}
                    </div>
                    <AnimatePresence>
                        {isSettingsOpen && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                                className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                            >
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="night-time">وقت الليل (ث)</Label>
                                        <Input id="night-time" type="number" value={mafiaSettings.nightTime} disabled={!isHost} onChange={e => handleMafiaSettingsChange({ nightTime: parseInt(e.target.value, 10) || 25 })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="day-time">وقت النقاش (ث)</Label>
                                        <Input id="day-time" type="number" value={mafiaSettings.dayTime} disabled={!isHost} onChange={e => handleMafiaSettingsChange({ dayTime: parseInt(e.target.value, 10) || 180 })} />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                  </div>
              )}
               {game.gameType === 'word_war' && (
                  <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className='font-bold text-base'>إعدادات اللعبة</Label>
                        {isHost && (
                            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                                <Settings className={cn("w-5 h-5", isSettingsOpen && "animate-spin")} />
                            </Button>
                        )}
                    </div>
                    <AnimatePresence>
                        {isSettingsOpen && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                                className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                            >
                                <div className="space-y-1">
                                    <Label htmlFor="turn-time">وقت الدور (ث)</Label>
                                    <Input id="turn-time" type="number" value={wordWarSettings.turnTime} disabled={!isHost} onChange={e => handleWordWarSettingsChange({ turnTime: parseInt(e.target.value, 10) || 30 })} />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                  </div>
              )}
            <div className="space-y-2">
              <Label>اللاعبون ({activePlayers.length})</Label>
              <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
                {activePlayers.map(p => {
                  const rank = playerRanks[p.id];
                  const RankIcon = rank?.icon;
                  return (
                  <div key={p.id} className="font-medium flex items-center gap-3 animate-fade-in">
                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" />
                    <div className="flex-grow">
                        <p className="font-bold text-lg">{p.name}</p>
                        {rank && RankIcon && (
                            <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                                <RankIcon className="w-3 h-3 text-amber-500" />
                                {rank.name}
                            </p>
                        )}
                    </div>
                     {isHost && p.id !== player?.id && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)}>
                            <UserX className="w-4 h-4" />
                        </Button>
                     )}
                  </div>
                )})}
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
      )
  };

  const renderGameContent = () => {
    if (!self) {
        return <Skeleton className="w-full h-96" />;
    }
    
    // These games handle their own lobby/game views internally
    if (game.gameType === 'trap-answer') {
      return <TrapAnswerGame game={game} self={player!} />;
    }
     if (game.gameType === 'prison') {
      return <PrisonGame game={game} self={player!} />;
    }


    if (game.gameState === 'lobby') {
      return renderLobby();
    }
    
    switch (game.gameType) {
      case 'king-of-genius':
        return <KingOfGeniusGame game={game} player={player!} self={self} isHost={isHost} />;
      case 'behind-the-mask':
        return <BehindTheMaskGame game={game} self={self} />;
      case 'word_war':
        return <WordWarGame game={game} self={self} />;
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
