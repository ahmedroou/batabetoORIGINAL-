"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player, WhoAmIGameState, KillerGameState } from "@/types";
import * as actions from "@/app/actions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Wand2, Users, Trophy, Dices, Copy, Check, LogOut, Send, Award, Sparkles, UserCheck, Smile } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AVATAR_MAP, DefaultAvatar } from "@/components/game/avatars";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatePresence, motion } from "framer-motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const TOTAL_ROUNDS = 15;

function shuffleArray<T>(array: T[]): T[] {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const { toast } = useToast();

  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [answer, setAnswer] = useState("");
  const [guesses, setGuesses] = useState<Record<string, string>>({}); // { subjectPlayerId: guessedPlayerId }
  
  const [isCopying, setIsCopying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // This effect runs once to get the player from session storage.
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
        // No player data, go home.
        router.push('/');
      }
    } catch (error) {
      // Failed to parse, go home.
      router.push('/');
    }
  }, [gameId, router]);

  // This effect subscribes to game updates from Firebase.
  useEffect(() => {
    // Don't run if we don't have a player yet.
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
          if (!currentPlayerInGame) {
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
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
      setIsSubmitting(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!answer.trim()) {
      toast({ title: "الرجاء إدخال إجابة", variant: "destructive" });
      return;
    }
    if (!player) return;
    setIsSubmitting(true);
    await actions.submitAnswer(gameId, player.id, answer);
    setIsSubmitting(false);
  };
  
  const handleSubmitGuesses = async () => {
    if (!game || !player) return;
    if (Object.keys(guesses).length !== game.players.length) {
      toast({ title: "الرجاء تخمين كل الإجابات", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    await actions.submitGuesses(gameId, player.id, guesses);
    setIsSubmitting(false);
  };
  
  const shuffledAnswers = useMemo(() => {
    if (!game || game.gameType !== 'who-am-i' || game.gameState !== 'guessing' || !game.answers) return [];
    const answerEntries = Object.entries(game.answers);
    return shuffleArray(answerEntries);
  }, [game]);

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
                    {game.players.map(p => {
                        const AvatarComponent = AVATAR_MAP[p.avatarId] || DefaultAvatar;
                        return (
                          <div key={p.id} className="font-medium flex items-center gap-3 animate-fade-in">
                              <AvatarComponent className="w-10 h-10 rounded-full shadow-md" />
                              <div className="flex-grow">
                                  <span className="font-bold text-lg">{p.name}</span>
                                  {p.id === player?.id && <span className="text-xs text-primary font-bold ml-2">(أنت)</span>}
                              </div>
                          </div>
                        )
                    })}
                </div>
            </div>
            {game.players[0]?.id === player?.id ? (
                <Button onClick={() => {
                    if (game.gameType === 'who-am-i') {
                        actions.startWhoAmIGame(gameId);
                    } else {
                        toast({ title: "قيد التطوير", description: "بدء لعبة المحقق والقاتل سيتم تفعيله قريباً." });
                    }
                }} disabled={game.players.length < 2} className="w-full" size="lg">
                    {game.players.length < 2 ? "تحتاج لاعبين على الأقل" : "ابدأ اللعبة"} <ArrowRight className="mr-2"/>
                </Button>
            ) : (
                <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md">في انتظار صاحب الغرفة لبدء اللعبة...</p>
            )}
            <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                <LogOut className="mr-2"/> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
            </Button>
        </CardContent>
    </Card>
  );

  const renderAnswering = () => {
    const answeredPlayers = new Set(Object.keys(game.answers || {}));
    const hasAnswered = answeredPlayers.has(player.id);
    return (
      <Card className="w-full max-w-2xl animate-pop-in">
          <CardHeader>
              <CardTitle className="text-center text-primary">الجولة {game.round! + 1} / {TOTAL_ROUNDS}</CardTitle>
              <CardDescription className="text-center font-bold text-2xl pt-2 leading-relaxed">{game.currentQuestion}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <Alert>
                <Smile className="h-4 w-4" />
                <AlertTitle>نصيحة!</AlertTitle>
                <AlertDescription>
                  جاوب بصدق بصراحة وحاول الا تظهر من أنت.
                </AlertDescription>
              </Alert>
              {hasAnswered ? (
                  <div className="text-center p-4 rounded-lg bg-muted text-muted-foreground">
                      <p className="font-semibold">تم إرسال إجابتك! في انتظار بقية اللاعبين...</p>
                  </div>
              ) : (
                  <div className="space-y-2">
                      <Label htmlFor="player-answer" className="text-lg">إجابتك</Label>
                      <Textarea id="player-answer" placeholder="اكتب إجابتك هنا..." value={answer} onChange={e => setAnswer(e.target.value)} rows={3} />
                      <Button onClick={handleSubmitAnswer} className="w-full mt-2" disabled={isSubmitting}>
                          {isSubmitting ? "جاري الإرسال..." : "إرسال الإجابة"} <Send className="mr-2" />
                      </Button>
                  </div>
              )}
          </CardContent>
          <CardFooter>
              <div className="w-full space-y-2">
                  <Label>الحالة</Label>
                  <div className="flex flex-wrap gap-4">
                      {game.players.map(p => {
                          const AvatarComponent = AVATAR_MAP[p.avatarId] || DefaultAvatar;
                          return (
                              <TooltipProvider key={p.id}>
                               <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex flex-col items-center gap-1">
                                      <div className="relative">
                                          <AvatarComponent className="w-12 h-12 rounded-full"/>
                                          {answeredPlayers.has(p.id) && 
                                            <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5">
                                              <Check className="w-3 h-3 text-white" />
                                            </div>
                                          }
                                      </div>
                                  </div>
                                  </TooltipTrigger>
                                  <TooltipContent>{p.name}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                          )
                      })}
                  </div>
              </div>
          </CardFooter>
      </Card>
    );
  };
  
  const renderGuessing = () => {
    const hasGuessed = !!game.guesses?.[player.id];
     return (
        <Card className="w-full max-w-3xl animate-pop-in">
            <CardHeader>
                <CardTitle className="text-center text-primary">خمن من أنا؟</CardTitle>
                <CardDescription className="text-center font-bold text-2xl pt-2 leading-relaxed">{game.currentQuestion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {hasGuessed ? (
                  <div className="text-center p-4 rounded-lg bg-muted text-muted-foreground">
                      <p className="font-semibold">تم إرسال تخميناتك! في انتظار بقية اللاعبين...</p>
                  </div>
                ) : (
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {shuffledAnswers.map(([playerId, playerAnswer]) => (
                          <div key={playerId} className="p-4 border rounded-lg bg-muted/50 space-y-2">
                              <p className="text-lg font-semibold leading-tight">"{playerAnswer}"</p>
                              <Select onValueChange={(value) => setGuesses(g => ({...g, [playerId]: value}))}>
                                  <SelectTrigger>
                                      <SelectValue placeholder="اختر اللاعب..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                      {game.players.map(p => (
                                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                      ))}
                                  </SelectContent>
                              </Select>
                          </div>
                      ))}
                  </div>
                  <Button onClick={handleSubmitGuesses} className="w-full" size="lg" disabled={isSubmitting}>
                      {isSubmitting ? "جاري الحفظ..." : "حفظ التخمينات"}
                  </Button>
                  </>
                )}
            </CardContent>
             <CardFooter>
                <div className="w-full space-y-2">
                    <Label>اللاعبون الذين لم يخمنوا بعد</Label>
                    <div className="flex flex-wrap gap-2">
                        {game.players.filter(p => !game.guesses?.[p.id]).map(p => {
                            const AvatarComp = AVATAR_MAP[p.avatarId] || DefaultAvatar;
                            return (
                                <div key={p.id} className="flex items-center gap-2 bg-muted p-2 rounded-md">
                                     <AvatarComp className="w-6 h-6 rounded-full"/>
                                    <span className="text-sm font-medium">{p.name}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </CardFooter>
        </Card>
     );
  };

  const AvatarComponent = ({ avatarId }: { avatarId: string }) => {
    const Comp = AVATAR_MAP[avatarId] || DefaultAvatar;
    return <Comp className="w-full h-full rounded-full" />;
  };
  
  const renderRoundResults = () => {
    const lastRoundGuesses = game.guesses || {};
    return (
        <Card className="w-full max-w-4xl animate-pop-in">
            <CardHeader>
                <CardTitle className="text-center text-4xl text-primary">نتائج الجولة!</CardTitle>
                <CardDescription className="text-center font-bold text-xl pt-2">{game.currentQuestion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                  {Object.entries(game.answers || {}).map(([authorId, answer]) => {
                    const author = game.players.find(p => p.id === authorId);
                    if (!author) return null;
                    return (
                      <div key={authorId} className="p-4 border rounded-lg bg-background/50">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 shrink-0"><AvatarComponent avatarId={author.avatarId}/></div>
                          <div>
                            <p className="text-sm text-muted-foreground">إجابة {author.name}</p>
                            <p className="text-xl font-bold text-primary">"{answer}"</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                           {game.players.map(guesser => {
                             const guess = lastRoundGuesses[guesser.id]?.[authorId];
                             const guessedPlayer = game.players.find(p => p.id === guess);
                             const isCorrect = guess === authorId;

                             return (
                               <div key={guesser.id} className={`relative p-2 rounded-md flex items-center gap-2 ${isCorrect ? 'bg-green-100/80' : 'bg-red-100/80'}`}>
                                 <div className="w-8 h-8 shrink-0"><AvatarComponent avatarId={guesser.avatarId}/></div>
                                 <div className="text-sm grow">
                                   <p className="font-bold">{guesser.name}</p>
                                   <p className="truncate text-muted-foreground">{guessedPlayer ? `خمّن: ${guessedPlayer.name}` : 'لم يخمن'}</p>
                                 </div>
                                 {isCorrect && <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl animate-point-pop">+1</div>}
                               </div>
                             )
                           })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <Button onClick={() => actions.nextRound(gameId)} className="w-full" size="lg">
                    {game.round! >= TOTAL_ROUNDS - 1 ? 'عرض النتائج النهائية' : 'الجولة التالية'} <ArrowRight className="mr-2"/>
                </Button>
            </CardContent>
        </Card>
    );
  };
  
  const renderFinalResults = () => {
    const getBestGuesserFor = (targetPlayerId: string) => {
      let bestGuesser: Player | null = null;
      let maxScore = -1;
      for (const guesser of game.players) {
        if (guesser.id === targetPlayerId) continue;
        const score = game.scoreMatrix?.[guesser.id]?.[targetPlayerId] || 0;
        if (score > maxScore) {
          maxScore = score;
          bestGuesser = guesser;
        }
      }
      return { bestGuesser, maxScore };
    };

    return (
      <Card className="w-full max-w-2xl animate-pop-in">
        <CardHeader className="text-center">
          <Award className="w-24 h-24 mx-auto text-yellow-500"/>
          <CardTitle className="text-4xl">النتائج النهائية!</CardTitle>
          <CardDescription>من يعرف من أفضل؟</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {game.players.map(player => {
            const { bestGuesser, maxScore } = getBestGuesserFor(player.id);
            return (
              <div key={player.id} className="p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10"><AvatarComponent avatarId={player.avatarId}/></div>
                  <span className="font-bold">{player.name}</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UserCheck className="text-primary"/>
                    <span>أكثر من يعرفه هو</span>
                </div>

                {bestGuesser && maxScore > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{bestGuesser.name}</span>
                    <div className="w-10 h-10"><AvatarComponent avatarId={bestGuesser.avatarId}/></div>
                    <span className="text-xs font-mono p-1 bg-primary text-primary-foreground rounded-md">{maxScore} مرات</span>
                  </div>
                ) : (
                  <span className="text-sm font-semibold">لا أحد بعد!</span>
                )}
              </div>
            )
          })}
        </CardContent>
        <CardFooter>
          <Button onClick={() => router.push('/')} className="w-full" size="lg">العب مرة أخرى</Button>
        </CardFooter>
      </Card>
    )
  }

  const renderCurrentState = () => {
    if (game.gameType === 'who-am-i') {
        switch(game.gameState as WhoAmIGameState) {
            case 'lobby': return renderLobby();
            case 'answering': return renderAnswering();
            case 'guessing': return renderGuessing();
            case 'round_results': return renderRoundResults();
            case 'final_results': return renderFinalResults();
            default: return <p>حالة غير معروفة...</p>;
        }
    }

    if (game.gameType === 'killer') {
        switch(game.gameState as KillerGameState) {
            case 'lobby': return renderLobby();
            // other cases to be added later
            default: return (
              <Card>
                <CardHeader><CardTitle>لعبة المحقق والقاتل</CardTitle></CardHeader>
                <CardContent><p>هذه اللعبة قيد التطوير حالياً. ابقوا مترقبين!</p></CardContent>
              </Card>
            );
        }
    }

    return <p>نوع لعبة غير معروف.</p>;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative bg-background">
      <div className="absolute top-4 right-4 text-left">
          <h1 className="text-2xl font-bold text-primary">
            {game.gameType === 'killer' ? 'المحقق والقاتل' : 'اكتشف من أنا؟'}
          </h1>
          <p className="text-sm text-muted-foreground">لعبة الصداقة</p>
      </div>
      
      {renderCurrentState()}
      
    </main>
  );
}
