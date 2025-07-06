
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Game, Player } from "@/types";
import { submitAnswer, submitGuesses, nextRound } from "@/lib/actions/who-am-i";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowRight, Trophy, Check, Send, Award, UserCheck, Smile, CheckCircle2, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";

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

interface WhoAmIGameProps {
    game: Game;
    player: Player;
}

export function WhoAmIGame({ game, player }: WhoAmIGameProps) {
    const router = useRouter();
    const { toast } = useToast();

    const [answer, setAnswer] = useState("");
    const [guesses, setGuesses] = useState<Record<string, string>>({}); // { subjectPlayerId: guessedPlayerId }
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmitAnswer = async () => {
        if (!answer.trim() || !player) return;
        setIsSubmitting(true);
        await submitAnswer(game.id, player.id, answer);
        setIsSubmitting(false);
    };
    
    const handleSubmitGuesses = async () => {
        if (Object.keys(guesses).length !== game.players.length - 1) {
            toast({ title: "الرجاء تخمين كل الإجابات", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        await submitGuesses(game.id, player.id, guesses);
        setIsSubmitting(false);
    };

    const handleNextRound = async () => {
        setIsSubmitting(true);
        await nextRound(game.id);
        setIsSubmitting(false);
    }

    const shuffledAnswers = useMemo(() => {
        if (game.gameState !== 'guessing' || !game.answers) return [];
        const otherPlayersAnswers = Object.entries(game.answers).filter(
            ([authorId]) => authorId !== player.id
        );
        return shuffleArray(otherPlayersAnswers).map(([authorId, answer]) => ({ authorId, answer }));
    }, [game.gameState, game.answers, player.id]);

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
                              return (
                                  <TooltipProvider key={p.id}>
                                   <Tooltip>
                                    <TooltipTrigger>
                                      <div className="flex flex-col items-center gap-1">
                                          <div className="relative">
                                              <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12 rounded-full"/>
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
                          {shuffledAnswers.map(({ authorId, answer }) => (
                              <div key={authorId} className="p-4 border rounded-lg bg-muted/50 space-y-2">
                                  <p className="text-lg font-semibold leading-tight">"{answer}"</p>
                                  <Select onValueChange={(value) => setGuesses(g => ({...g, [authorId]: value}))}>
                                      <SelectTrigger>
                                          <SelectValue placeholder="اختر اللاعب..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                          {game.players
                                            .filter(p => p.id !== player.id)
                                            .map(p => (
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
                            {game.players.filter(p => !game.guesses?.[p.id]).map(p => (
                                <div key={p.id} className="flex items-center gap-2 bg-muted p-2 rounded-md">
                                     <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6 rounded-full"/>
                                    <span className="text-sm font-medium">{p.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardFooter>
            </Card>
         );
    };

    const renderRoundResults = () => {
        const lastRoundGuesses = game.guesses || {};
        return (
            <Card className="w-full max-w-4xl animate-pop-in">
                <CardHeader className="text-center">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1, transition: { type: "spring", delay: 0.2 } }}>
                        <Award className="w-24 h-24 mx-auto text-yellow-500"/>
                    </motion.div>
                    <CardTitle className="text-4xl text-primary">نتائج الجولة!</CardTitle>
                    <CardDescription className="text-center font-bold text-xl pt-2">{game.currentQuestion}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                      {Object.entries(game.answers || {}).map(([authorId, answer], index) => {
                        const author = game.players.find(p => p.id === authorId);
                        if (!author) return null;
                        
                        const correctGuessers = game.players.filter(p => p.id !== authorId && lastRoundGuesses[p.id]?.[authorId] === authorId);
                        const incorrectGuessers = game.players.filter(p => {
                            if (p.id === authorId) return false;
                            const guess = lastRoundGuesses[p.id]?.[authorId];
                            return guess && guess !== authorId;
                        });
    
                        return (
                            <motion.div 
                                key={authorId}
                                className="p-4 border rounded-lg bg-card shadow-md overflow-hidden"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0, transition: { delay: index * 0.1 } }}
                            >
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 p-3 bg-muted rounded-md">
                                  <div className="w-16 h-16 shrink-0 relative">
                                    <PlayerAvatar avatarId={author.avatarId} className="w-full h-full rounded-full border-4 border-primary"/>
                                  </div>
                                  <div className="flex-grow">
                                    <p className="text-sm text-muted-foreground">صاحب الإجابة هو {author.name}</p>
                                    <p className="text-xl font-bold text-primary leading-tight">"{answer}"</p>
                                  </div>
                                </div>
    
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <h4 className="font-bold flex items-center gap-2 text-green-600">
                                            <CheckCircle2 />
                                            <span>تخمينات صحيحة (+1 نقطة)</span>
                                        </h4>
                                        {correctGuessers.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {correctGuessers.map(p => (
                                                    <TooltipProvider key={p.id}>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <div className="relative">
                                                                    <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12 rounded-full"/>
                                                                    <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 border-2 border-card">
                                                                        <Check className="w-3 h-3 text-white" />
                                                                    </div>
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent>{p.name}</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">لا أحد خمن بشكل صحيح!</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                         <h4 className="font-bold flex items-center gap-2 text-red-600">
                                            <XCircle />
                                            <span>تخمينات خاطئة</span>
                                        </h4>
                                         {incorrectGuessers.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {incorrectGuessers.map(p => {
                                                    const guessedPlayer = game.players.find(g => g.id === lastRoundGuesses[p.id]?.[authorId]);
                                                    return (
                                                    <TooltipProvider key={p.id}>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <div className="relative">
                                                                    <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12 rounded-full"/>
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent>{p.name} خمّن: {guessedPlayer?.name || 'غير معروف'}</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )})}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">لا توجد تخمينات خاطئة.</p>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )
                      })}
                    </div>
                </CardContent>
                <CardFooter>
                     <Button onClick={handleNextRound} className="w-full" size="lg" disabled={isSubmitting}>
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
                      <div className="w-10 h-10"><PlayerAvatar avatarId={player.avatarId} className="w-full h-full rounded-full"/></div>
                      <span className="font-bold">{player.name}</span>
                    </div>
    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <UserCheck className="h-5 w-5 text-primary"/>
                        <span>أكثر من يعرفه هو</span>
                    </div>
    
                    {bestGuesser && maxScore > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{bestGuesser.name}</span>
                        <div className="w-10 h-10"><PlayerAvatar avatarId={bestGuesser.avatarId} className="w-full h-full rounded-full"/></div>
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
    };

    switch(game.gameState) {
        case 'answering': return renderAnswering();
        case 'guessing': return renderGuessing();
        case 'round_results': return renderRoundResults();
        case 'final_results': return renderFinalResults();
        default: return <p>حالة غير معروفة في لعبة "من أنا"...</p>;
    }
}
