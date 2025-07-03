
"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player, WhoAmIGameState, KillerGameState } from "@/types";
import * as actions from "@/app/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Users, Trophy, Copy, Check, LogOut, Send, Award, UserCheck, Smile, Skull, Glasses, UsersRound, Swords, Moon, Sunrise, Vote, Gavel, ShieldCheck, FileText, UserX, Search, KeyRound, Hand, MessageSquare, Briefcase, EyeOff, Lightbulb, UserSecret } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AVATAR_MAP, DefaultAvatar } from "@/components/game/avatars";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatePresence, motion } from "framer-motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";

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
  
  // Who Am I state
  const [answer, setAnswer] = useState("");
  const [guesses, setGuesses] = useState<Record<string, string>>({}); // { subjectPlayerId: guessedPlayerId }
  
  // Killer state
  const [alias, setAlias] = useState("");
  const [selectedVictim, setSelectedVictim] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [votedForId, setVotedForId] = useState<string | null>(null);
  const [isArrestModalOpen, setIsArrestModalOpen] = useState(false);
  const [arrestCandidateId, setArrestCandidateId] = useState<string | null>(null);

  const [isCopying, setIsCopying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const self = useMemo(() => game?.players.find(p => p.id === player?.id), [game, player]);
  const isHost = useMemo(() => game?.hostId === player?.id, [game, player]);
  const isDetective = useMemo(() => self?.role === 'detective', [self]);

  const chatScrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollAreaRef.current) {
        chatScrollAreaRef.current.scrollTo({
            top: chatScrollAreaRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }
  }, [game?.messages]);


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

  const handleSubmitAnswer = async () => {
    if (!answer.trim() || !player) return;
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

  const handleSubmitAlias = async () => {
    if (!alias.trim() || !player) return;
    setIsSubmitting(true);
    try {
        await actions.submitAlias(gameId, player.id, alias);
        toast({title: "تم حفظ اسمك المستعار"});
    } catch(e: any) {
        toast({title: "خطأ", description: e.message, variant: "destructive"});
    } finally {
        setIsSubmitting(false);
    }
  }
  
  const handlePerformKill = async () => {
    if (!selectedVictim || !self || self.role !== 'killer') return;
    setIsSubmitting(true);
    try {
        await actions.performNightKill(gameId, self.id, selectedVictim);
    } catch(e: any) {
        toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
        setSelectedVictim(null);
    }
  }

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !self) return;
    setIsSubmitting(true);
    try {
        await actions.submitMessage(gameId, self.id, chatMessage);
        setChatMessage("");
    } catch (e: any) {
        toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  }

  const handleSubmitVote = async (votedForId: string) => {
      if (!votedForId || !self) return;
      setIsSubmitting(true);
      try {
          await actions.submitVote(gameId, self.id, votedForId);
          setVotedForId(votedForId);
          toast({ title: "تم تسجيل صوتك بنجاح!" });
      } catch(e: any) {
          toast({ title: "خطأ", description: e.message, variant: "destructive" });
      } finally {
          setIsSubmitting(false);
      }
  }

  const handleDetectiveChoice = async (choice: 'discuss' | 'skip') => {
    if (!self || !isDetective) return;
    setIsSubmitting(true);
    try {
      await actions.detectiveMakesChoice(gameId, self.id, choice);
    } catch(e: any) {
      toast({title: "خطأ", description: e.message, variant: "destructive"});
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleArrest = async () => {
    if (!arrestCandidateId || !self || !isDetective) return;
    setIsSubmitting(true);
    try {
      await actions.detectiveArrest(gameId, self.id, arrestCandidateId);
    } catch(e: any) {
       toast({title: "خطأ", description: e.message, variant: "destructive"});
    } finally {
      setIsSubmitting(false);
      setIsArrestModalOpen(false);
      setArrestCandidateId(null);
    }
  }

  const handleAssignRoles = async () => {
    setIsSubmitting(true);
    try {
        await actions.assignRoles(gameId);
    } catch (e: any) {
        let errorMessage = e.message || "حدث خطأ غير متوقع عند توزيع الأدوار.";
        toast({ title: "خطأ في توزيع الأدوار", description: errorMessage, variant: "destructive", duration: 9000 });
    } finally {
        setIsSubmitting(false);
    }
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
            {isHost ? (
                <Button onClick={() => {
                    if (game.gameType === 'who-am-i') {
                        actions.startWhoAmIGame(gameId);
                    } else if (game.gameType === 'killer') {
                        actions.startKillerGame(gameId);
                    }
                }} disabled={game.players.length < (game.gameType === 'killer' ? 3 : 2)} className="w-full" size="lg">
                    {game.players.length < (game.gameType === 'killer' ? 3 : 2)
                        ? `تحتاج ${game.gameType === 'killer' ? '3 لاعبين' : 'لاعبين'} على الأقل`
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
                          {isSubmitting ? "جاري الإرسال..." : "إرسال الإجابة"} <Send />
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
            </CardContent>
            <CardFooter>
                 <Button onClick={() => actions.nextRound(gameId)} className="w-full" size="lg">
                    {game.round! >= TOTAL_ROUNDS - 1 ? 'عرض النتائج النهائية' : 'الجولة التالية'} <ArrowRight />
                </Button>
            </CardFooter>
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
                    <UserCheck className="h-5 w-5 text-primary"/>
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
          <Button onClick={() => router.push('/')} className="w-full" size="lg">
            <Trophy />
            العب مرة أخرى
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Killer Game Components
  const renderAliasSelection = () => {
      const self = game.players.find(p => p.id === player.id);
      const allAliasesSet = game.players.every(p => p.alias);

      return (
          <Card className="w-full max-w-md animate-pop-in">
              <CardHeader>
                  <CardTitle className="text-center">اختر اسمًا مستعارًا</CardTitle>
                  <CardDescription className="text-center">
                      اختر اسمًا سريًا لاستخدامه في هذه اللعبة. لا تخبر أحدًا باسمك!
                  </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  {!self?.alias ? (
                      <div className="flex gap-2">
                          <Input
                              placeholder="أدخل اسمك المستعار..."
                              value={alias}
                              onChange={e => setAlias(e.target.value)}
                              disabled={isSubmitting}
                          />
                          <Button onClick={handleSubmitAlias} disabled={isSubmitting || !alias.trim()}>
                              {isSubmitting ? "..." : "تأكيد"}
                          </Button>
                      </div>
                  ) : (
                      <div className="text-center p-3 bg-green-100 text-green-800 rounded-md">
                          تم حفظ اسمك المستعار: <span className="font-bold">{self.alias}</span>
                      </div>
                  )}

                  <div className="space-y-2">
                      <Label>حالة اللاعبين</Label>
                      <div className="grid grid-cols-2 gap-2">
                          {game.players.map(p => (
                              <div key={p.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                  <div className={`w-3 h-3 rounded-full ${p.alias ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                  <span>{p.name} {p.id === player.id && "(أنت)"}</span>
                              </div>
                          ))}
                      </div>
                  </div>
                  
                  {isHost && (
                      <Button onClick={handleAssignRoles} disabled={!allAliasesSet || isSubmitting} className="w-full">
                          {isSubmitting ? "جاري التوزيع..." : !allAliasesSet ? "في انتظار جميع اللاعبين..." : "توزيع الأدوار وبدء اللعبة"}
                      </Button>
                  )}
              </CardContent>
          </Card>
      )
  };

  const renderRoleReveal = () => {
    if (!self || !self.role) return null;

    const roleDetails = {
        killer: { title: "أنت القاتل", icon: Skull, color: "text-red-500", description: "مهمتك هي القضاء على الجميع دون أن يتم كشفك." },
        detective: { title: "أنت المحقق", icon: Glasses, color: "text-blue-500", description: "مهمتك هي كشف القاتل وتوجيه المدنيين للقبض عليه." },
        civilian: { title: "أنت مدني", icon: UsersRound, color: "text-gray-500", description: "مهمتك هي العمل مع الآخرين لكشف القاتل والتصويت لطرده." },
    };

    const details = roleDetails[self.role];

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <Card className="w-full max-w-sm text-center border-2 border-primary shadow-2xl">
                    <CardHeader>
                        <CardTitle className="text-xl">تم توزيع الأدوار</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-4">
                         <motion.div 
                            initial={{ scale: 0 }} 
                            animate={{ scale: 1, rotate: 360 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.5 }}
                         >
                            <details.icon className={`w-24 h-24 ${details.color}`} />
                         </motion.div>
                         <h2 className={`text-3xl font-bold ${details.color}`}>{details.title}</h2>
                         <p className="text-muted-foreground">{details.description}</p>
                    </CardContent>
                     <CardFooter>
                        <p className="text-xs text-center w-full text-muted-foreground animate-pulse">
                          ستبدأ اللعبة بعد لحظات...
                        </p>
                    </CardFooter>
                </Card>
            </motion.div>
        </AnimatePresence>
    )
  };

  const renderCrimeScene = () => {
    if (!game.crimeScene) return null;
  
    return (
      <div className="w-full max-w-2xl animate-pop-in overflow-hidden border-2 border-primary/20 shadow-2xl rounded-lg bg-background">
        <div className="p-6 bg-muted/30">
          <h3 className="flex items-center gap-3 text-3xl text-primary font-semibold">
            <FileText className="h-8 w-8" />
            <span>ملف القضية: 001</span>
          </h3>
          <p className="text-muted-foreground mt-1">تفاصيل مسرح الجريمة الوهمي لبدء التحقيق.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-1">
            <h4 className="flex items-center gap-3 font-semibold text-2xl">
              <UserX className="h-7 w-7 text-primary" />
              <span>الضحية</span>
            </h4>
            <p className="pr-10 text-muted-foreground leading-relaxed">{`${game.crimeScene.victimAlias} - ${game.crimeScene.victimBackground}`}</p>
          </div>
  
          <div className="space-y-1">
            <h4 className="flex items-center gap-3 font-semibold text-xl">
              <Skull className="h-6 w-6 text-primary" />
              <span>سبب الوفاة</span>
            </h4>
            <p className="pr-9 text-muted-foreground leading-relaxed">{game.crimeScene.method}</p>
          </div>
  
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-1">
            <h4 className="flex items-center gap-3 font-semibold text-xl">
              <Search className="h-6 w-6 text-primary" />
              <span>الدليل العام</span>
            </h4>
            <p className="pr-9 text-muted-foreground leading-relaxed">{game.crimeScene.publicClue}</p>
          </div>
  
          {(self.role === 'killer' || self.role === 'detective') && (
            <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg space-y-1">
              <h4 className="flex items-center gap-3 font-semibold text-xl">
                <KeyRound className="h-6 w-6 text-primary" />
                <span>تقرير سري (للقاتل والمحقق)</span>
              </h4>
              <p className="pr-9 text-muted-foreground leading-relaxed">{game.crimeScene.detailedClue}</p>
            </div>
          )}
        </div>
  
        <div className="p-4 bg-muted/30">
          {isDetective ? (
            <div className="w-full flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => handleDetectiveChoice('discuss')}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 flex-1"
              >
                <Vote />
                بدء النقاش والتصويت
              </button>
              <button
                onClick={() => handleDetectiveChoice('skip')}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-11 px-8 flex-1"
              >
                <Moon />
                تخطي إلى الليلة الأولى
              </button>
            </div>
          ) : (
            <p className="text-center text-muted-foreground p-3 w-full animate-pulse">في انتظار قرار المحقق...</p>
          )}
        </div>
      </div>
    );
  };

  const renderNightPhase = () => {
    if (!self) return null;
  
    if (self.role === 'killer' && self.status === 'alive') {
      const potentialVictims = game.players.filter(p => p.id !== self.id && p.status === 'alive');
      return (
        <Card className="w-full max-w-lg animate-pop-in">
          <CardHeader>
            <motion.div initial={{y: -20, opacity: 0}} animate={{y: 0, opacity: 1}}>
              <Skull className="w-16 h-16 mx-auto text-red-500"/>
            </motion.div>
            <CardTitle className="text-center text-2xl text-red-500">حان وقت الاصطياد</CardTitle>
            <CardDescription className="text-center">اختر ضحيتك التالية.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-lg font-semibold">اختر الضحية</Label>
              <RadioGroup value={selectedVictim || ""} onValueChange={setSelectedVictim} className="grid grid-cols-2 gap-4 mt-2">
                {potentialVictims.map((p, index) => {
                  const AvatarComp = AVATAR_MAP[p.avatarId] || DefaultAvatar;
                  return (
                    <motion.div key={p.id} initial={{opacity: 0}} animate={{opacity: 1, transition: {delay: 0.1 * index}}}>
                      <Label htmlFor={p.id} className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${selectedVictim === p.id ? 'border-red-500 bg-red-50' : 'border-transparent bg-muted'}`}>
                          <AvatarComp className="w-16 h-16 rounded-full"/>
                          <span className="font-bold text-lg">{p.alias}</span>
                          <RadioGroupItem value={p.id} id={p.id} className="sr-only"/>
                      </Label>
                    </motion.div>
                  )
                })}
              </RadioGroup>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="destructive" className="w-full" size="lg" disabled={!selectedVictim || isSubmitting} onClick={handlePerformKill}>
              <Swords />
              {isSubmitting ? 'جاري التنفيذ...' : 'تأكيد القتل'}
            </Button>
          </CardFooter>
        </Card>
      )
    }

    return (
       <Card className="w-full max-w-md text-center bg-gray-900 text-white border-indigo-500 shadow-2xl shadow-indigo-500/30">
           <CardHeader>
               <motion.div initial={{opacity: 0, scale: 0.5}} animate={{opacity: 1, scale: 1, transition: {delay: 0.5, type: 'spring'}}}>
                   <Moon className="w-24 h-24 mx-auto text-indigo-300"/>
               </motion.div>
               <CardTitle className="text-3xl">حل الظلام</CardTitle>
                <CardDescription className="text-indigo-200">
                    {self.status === 'alive' 
                        ? 'الجميع نيام... إلا القاتل. إنه يختار ضحيته التالية.'
                        : 'أنت خارج اللعبة، ولكن يمكنك مشاهدة الأحداث تتكشف.'
                    }
                </CardDescription>
           </CardHeader>
           <CardContent>
               <p className="text-indigo-400 animate-pulse">في انتظار شروق الشمس...</p>
           </CardContent>
       </Card>
    )
  }
  
  const renderDayPhase = () => {
    const victim = game.players.find(p => p.id === game.nightAction?.victimId);
    const hasVoted = !!votedForId;
    const votablePlayers = game.players.filter(p => p.status === 'alive');
    const eligibleVotersCount = game.players.filter(p => p.status === 'alive' || p.status === 'voted_out').length;

    return (
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>اليوم {game.turn || 1}</CardTitle>
            </CardHeader>
            <CardContent>
              {victim ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2 text-center">
                  <Sunrise className="w-12 h-12 mx-auto text-yellow-500" />
                  <p className="font-semibold">تم العثور على <strong className="text-destructive">{victim.alias}</strong> مقتولاً.</p>
                  {isDetective && game.nightAction?.method && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
                        <p><strong>دليل سري:</strong> {game.nightAction.method}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">بداية جولة النقاش الأولى.</p>
              )}
            </CardContent>
          </Card>
          
          {isDetective && self.status === 'alive' && !game.detectiveArrest?.used && (
            <Card className="border-amber-500">
                <CardHeader>
                    <CardTitle className="text-amber-600">صلاحية الاعتقال</CardTitle>
                    <CardDescription>لديك فرصة واحدة لاعتقال القاتل. إذا أخطأت، خسر فريقك.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="outline" className="w-full border-amber-500 text-amber-600 hover:bg-amber-50" onClick={() => setIsArrestModalOpen(true)}>
                        <Hand /> تنفيذ الاعتقال
                    </Button>
                </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
            <Card className="flex flex-col h-[70vh]">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MessageSquare /> غرفة التحقيق</CardTitle>
                    <CardDescription>ناقشوا الأدلة وحاولوا كشف القاتل. أصواتكم حاسمة.</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow overflow-hidden flex flex-col gap-4">
                   <ScrollArea className="flex-grow pr-4" ref={chatScrollAreaRef}>
                     <div className="space-y-4">
                        {(game.messages || []).map((msg, index) => {
                            const isSelfMsg = msg.senderId === self.id;
                            let displayName = "لاعب مجهول";
                            if (msg.isDetective) {
                                displayName = "المحقق";
                            } else if (isDetective || isSelfMsg) {
                                const sender = game.players.find(p => p.id === msg.senderId);
                                displayName = sender?.alias || "لاعب مجهول";
                            }

                            return (
                                <div key={index} className={cn("flex flex-col gap-1", isSelfMsg ? "items-end" : "items-start")}>
                                    <div className={cn("rounded-lg px-3 py-2 max-w-sm", isSelfMsg ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                        <p className="font-bold text-xs mb-1">{displayName}</p>
                                        <p className="text-sm">{msg.text}</p>
                                    </div>
                                </div>
                            )
                        })}
                     </div>
                   </ScrollArea>
                   {self.status === 'alive' || self.status === 'voted_out' ? (
                     <div className="flex gap-2 pt-2 border-t">
                        <Input 
                            placeholder="اكتب رسالتك..." 
                            value={chatMessage} 
                            onChange={(e) => setChatMessage(e.target.value)} 
                            onKeyPress={(e) => e.key === 'Enter' && !isSubmitting && handleSendMessage()}
                            disabled={isSubmitting}
                        />
                        <Button onClick={handleSendMessage} disabled={isSubmitting}><Send /></Button>
                     </div>
                   ) : (
                    <p className="text-center text-sm text-muted-foreground p-2 border-t">لا يمكنك المشاركة في النقاش.</p>
                   )}
                </CardContent>
            </Card>
        </div>
        
         <div className="lg:col-span-3">
            <Card>
                <CardHeader>
                    <CardTitle>لوحة التصويت</CardTitle>
                    <CardDescription>
                        {hasVoted ? `صوتك تم تسجيله. بانتظار ${eligibleVotersCount - Object.keys(game.votes || {}).length} لاعبين.` : 'صوّت للاعب الذي تشتبه بأنه القاتل.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {votablePlayers.map(p => {
                        const AvatarComp = AVATAR_MAP[p.avatarId] || DefaultAvatar;
                        const hasBeenVotedFor = votedForId === p.id;
                        return (
                            <div key={p.id} className="text-center space-y-2">
                                <AvatarComp className={`w-20 h-20 rounded-full mx-auto border-4 ${hasBeenVotedFor ? 'border-primary' : 'border-transparent'}`} />
                                <p className="font-bold">{p.alias}</p>
                                <Button 
                                    size="sm" 
                                    onClick={() => handleSubmitVote(p.id)}
                                    disabled={hasVoted || self.status === 'killed' || self.status === 'arrested' || isSubmitting}
                                >
                                    {hasVoted ? <Check/> : <Vote />}
                                    {hasVoted ? 'تم' : 'صوّت'}
                                </Button>
                            </div>
                        )
                    })}
                </CardContent>
            </Card>
        </div>
      </div>
    )
  }

  const renderVotingResultsPhase = () => {
    const { tied, eliminatedPlayerAlias } = game.lastVoteResult || {};
    return (
        <Card className="w-full max-w-md animate-pop-in text-center">
            <CardHeader>
                <Gavel className="w-20 h-20 mx-auto text-primary"/>
                <CardTitle className="text-3xl mt-2">نتيجة التصويت</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xl">
                {tied ? (
                    <p>حدث تعادل في الأصوات! <br/> لا أحد سيغادر هذه الجولة.</p>
                ) : (
                    <p>أجمعت الأغلبية على طرد <strong className="text-destructive text-2xl mx-1">{eliminatedPlayerAlias}</strong>.</p>
                )}
            </CardContent>
            <CardFooter>
                {isHost ? (
                    <Button onClick={() => actions.continueToNextNight(gameId)} size="lg" className="w-full">
                        <Moon /> بدء الليلة التالية
                    </Button>
                 ) : (
                    <p className="text-center text-muted-foreground p-3 bg-muted/50 rounded-md animate-pulse">في انتظار المضيف لبدء الليلة التالية...</p>
                 )}
            </CardFooter>
        </Card>
    )
  }
  
  const renderGameEndPhase = () => {
      const { winner, message } = game.gameResult || {};
      const isKillerWinner = winner === 'killer';
      return (
        <Card className={`w-full max-w-lg animate-pop-in text-center ${isKillerWinner ? 'border-destructive' : 'border-green-500'}`}>
            <CardHeader>
                {isKillerWinner ? <Skull className="w-24 h-24 mx-auto text-destructive"/> : <ShieldCheck className="w-24 h-24 mx-auto text-green-500"/>}
                <CardTitle className="text-4xl mt-4">انتهت اللعبة!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                 <h2 className={`text-2xl font-bold ${isKillerWinner ? 'text-destructive' : 'text-green-600'}`}>
                    {isKillerWinner ? 'القاتل يفوز!' : 'المحقق والمدنيون يفوزون!'}
                 </h2>
                 <p className="text-lg text-muted-foreground">{message}</p>
            </CardContent>
            <CardFooter>
                <Button onClick={() => router.push('/')} className="w-full" size="lg">
                    <Trophy /> العب مرة أخرى
                </Button>
            </CardFooter>
        </Card>
      )
  }

  const renderKillerModals = () => {
    const arrestablePlayers = game.players.filter(p => p.status === 'alive' && p.id !== self.id);
    return (
      <Dialog open={isArrestModalOpen} onOpenChange={setIsArrestModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تنفيذ أمر اعتقال</DialogTitle>
            <DialogDescription>
              اختر اللاعب الذي تشتبه بأنه القاتل. تذكر، هذا القرار نهائي ولا رجعة فيه.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
             <RadioGroup value={arrestCandidateId || ""} onValueChange={setArrestCandidateId} className="grid grid-cols-3 gap-4 mt-2">
                {arrestablePlayers.map(p => {
                  const AvatarComp = AVATAR_MAP[p.avatarId] || DefaultAvatar;
                  return (
                    <div key={p.id}>
                      <Label htmlFor={`arrest-${p.id}`} className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${arrestCandidateId === p.id ? 'border-red-500 bg-red-50' : 'border-transparent bg-muted'}`}>
                          <AvatarComp className="w-16 h-16 rounded-full"/>
                          <span className="font-bold text-lg">{p.alias}</span>
                          <RadioGroupItem value={p.id} id={`arrest-${p.id}`} className="sr-only"/>
                      </Label>
                    </div>
                  )
                })}
              </RadioGroup>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">إلغاء</Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={!arrestCandidateId || isSubmitting} onClick={handleArrest}>
              {isSubmitting ? "جاري الاعتقال..." : "تأكيد الاعتقال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            case 'aliases': return renderAliasSelection();
            case 'roles': return renderRoleReveal();
            case 'crime_scene': return renderCrimeScene();
            case 'night': return renderNightPhase();
            case 'discussion': return renderDayPhase();
            case 'voting_results': return renderVotingResultsPhase();
            case 'ended': return renderGameEndPhase();
            default: return (
              <Card>
                <CardHeader><CardTitle>لعبة المحقق والقاتل</CardTitle></CardHeader>
                <CardContent>
                    <p>هذه اللعبة قيد التطوير حالياً. حالة اللعبة الحالية: {game.gameState}</p>
                </CardContent>
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

      {game.gameState !== 'lobby' && game.gameState !== 'final_results' && game.gameState !== 'ended' && (
        <div className="absolute top-4 left-4 z-50">
            <Button variant="outline" size="sm" onClick={handleLeaveGame} disabled={isSubmitting}>
                <LogOut className="ml-2 h-4 w-4" /> مغادرة
            </Button>
        </div>
      )}
      
      {renderCurrentState()}
      {game.gameType === 'killer' && renderKillerModals()}
      
    </main>
  );
}

    