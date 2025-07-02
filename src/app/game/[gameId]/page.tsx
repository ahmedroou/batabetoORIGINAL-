"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player } from "@/types";
import { CATEGORIES, AI_CATEGORIES, AiCategoryValue } from "@/data/questions";
import * as actions from "../actions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Wand2, Users, Trophy, Dices, Copy, Check, CircleUserRound } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const HappyFace = () => (
    <svg viewBox="0 0 100 100" className="w-full h-full text-primary" fill="currentColor">
        <circle cx="50" cy="50" r="45" fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary))" strokeWidth="2"/>
        <circle cx="35" cy="40" r="5" className="animate-pulse-glow"/>
        <circle cx="65" cy="40" r="5" className="animate-pulse-glow"/>
        <path d="M 30 65 Q 50 85, 70 65" stroke="hsl(var(--primary))" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
);
const SadFace = () => (
    <svg viewBox="0 0 100 100" className="w-full h-full text-destructive" fill="currentColor">
        <circle cx="50" cy="50" r="45" fill="hsl(var(--destructive) / 0.1)" stroke="hsl(var(--destructive))" strokeWidth="2"/>
        <circle cx="35" cy="40" r="5" fill="hsl(var(--destructive))"/>
        <circle cx="65" cy="40" r="5" fill="hsl(var(--destructive))"/>
        <path d="M 30 75 Q 50 55, 70 75" stroke="hsl(var(--destructive))" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
);
const ThinkingFace = () => (
     <svg viewBox="0 0 100 100" className="w-full h-full text-primary" fill="currentColor">
        <circle cx="50" cy="50" r="45" fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary))" strokeWidth="2"/>
        <circle cx="35" cy="40" r="5" />
        <circle cx="65" cy="40" r="5" />
        <line x1="35" y1="65" x2="65" y2="65" stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round" />
    </svg>
);

export default function GamePage() {
  const params = useParams();
  const gameId = params.gameId as string;
  const { toast } = useToast();

  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [answererAnswer, setAnswererAnswer] = useState("");
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  
  const [isCopying, setIsCopying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAI, setIsAI] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    try {
      const p = sessionStorage.getItem(`player-${gameId}`);
      if (p) {
        setPlayer(JSON.parse(p));
      }
    } catch (error) {
      console.error("Could not parse player from sessionStorage", error);
      // redirect to home?
    }

    const unsub = onSnapshot(doc(db, "games", gameId), (doc) => {
      if (doc.exists()) {
        setGame({ id: doc.id, ...doc.data() } as Game);
      } else {
        toast({ title: "خطأ", description: "الغرفة غير موجودة.", variant: "destructive" });
        // redirect to home?
      }
      setIsLoading(false);
    });
    return () => unsub();
  }, [gameId, toast]);

  const answerer = useMemo(() => {
    if (!game || game.players.length === 0) return null;
    return game.players[game.round % game.players.length];
  }, [game]);

  const guessers = useMemo(() => {
    if (!game || !answerer) return [];
    return game.players.filter((p) => p.id !== answerer.id);
  }, [game, answerer]);

  const handleCopyId = () => {
    setIsCopying(true);
    navigator.clipboard.writeText(gameId);
    setTimeout(() => setIsCopying(false), 2000);
  }

  const handleSelectCategory = async (category: (typeof CATEGORIES)[0]) => {
      const question = category.questions[Math.floor(Math.random() * category.questions.length)];
      await actions.selectCategory(gameId, category.name, question);
  }

  const handleGenerateAIQuestion = async (aiCategory: AiCategoryValue) => {
    setIsAI(true);
    await actions.getAIQuestionForGame(gameId, aiCategory);
    setIsAI(false);
  };
  
  const handleSubmitAnswer = async () => {
    if (!answererAnswer.trim()) {
        toast({ title: "مطلوب إجابة", description: "يجب على المجيب تقديم إجابة.", variant: "destructive" });
        return;
    }
    setIsSubmitting(true);
    await actions.submitAnswer(gameId, answererAnswer);
    setIsSubmitting(false);
    toast({ title: "تم", description: "تم حفظ إجابتك. في انتظار تخمينات الآخرين."});
  }
  
  const handleSubmitGuess = async (guesserId: string) => {
      const guess = guesses[guesserId];
      if(!guess || !guess.trim()){
          toast({ title: "مطلوب تخمين", description: "يجب عليك تقديم تخمين.", variant: "destructive" });
          return;
      }
      setIsSubmitting(true);
      await actions.submitGuess(gameId, guesserId, guess);
      setIsSubmitting(false);
      toast({ title: "تم", description: "تم حفظ تخمينك."});
  }

  const handleRevealResults = async () => {
      if (!game?.answererAnswer) {
          toast({ title: "إجابة ناقصة", description: "يجب على المجيب تقديم إجابته أولاً.", variant: "destructive" });
          return;
      }
      const submittedGuesses = Object.keys(game.guesses).length;
      if (submittedGuesses < guessers.length) {
          toast({ title: "تخمينات ناقصة", description: `في انتظار ${guessers.length - submittedGuesses} لاعبين لتقديم تخميناتهم.`, variant: "destructive" });
          return;
      }
      await actions.revealResults(gameId);
  }

  if (isLoading) {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
            <h1 className="text-2xl font-bold">جاري تحميل اللعبة...</h1>
            <Skeleton className="h-64 w-full max-w-md mt-4" />
        </main>
    );
  }
  
  if (!game) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
          <h1 className="text-2xl font-bold text-destructive">لم يتم العثور على اللعبة</h1>
          <Button onClick={() => window.location.href = '/'} className="mt-4">العودة إلى الصفحة الرئيسية</Button>
        </main>
      );
  }

  const renderLobby = () => (
    <Card className="w-full max-w-md animate-bounce-in">
        <CardHeader className="text-center">
            <CardTitle className="text-2xl">غرفة الانتظار</CardTitle>
            <CardDescription>شارك المعرف مع أصدقائك. ابدأ اللعبة عندما يكون الجميع جاهزًا.</CardDescription>
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
                        <TooltipContent>
                            <p>تم النسخ!</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
             <div className="space-y-2">
                <Label>اللاعبون ({game.players.length})</Label>
                <div className="rounded-md border p-2 space-y-2 bg-muted/50 min-h-[80px]">
                    {game.players.map(p => (
                        <div key={p.id} className="font-medium flex items-center gap-2">
                            <CircleUserRound className="text-muted-foreground"/> <span>{p.name}</span>
                            {p.id === player?.id && <span className="text-xs text-primary font-bold">(أنت)</span>}
                        </div>
                    ))}
                </div>
            </div>
            {game.players[0]?.id === player?.id ? (
                <Button onClick={() => actions.startGame(gameId)} disabled={game.players.length < 2} className="w-full" size="lg">
                    {game.players.length < 2 ? "تحتاج لاعبين على الأقل" : "ابدأ اللعبة"} <ArrowRight className="mr-2"/>
                </Button>
            ) : (
                <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md">في انتظار صاحب الغرفة لبدء اللعبة...</p>
            )}
        </CardContent>
    </Card>
  );

  const renderCategorySelect = () => (
    <div className="w-full max-w-4xl animate-fade-in">
        <div className="text-center mb-6">
            <div className="w-32 h-32 mx-auto mb-4 animate-bounce-in">
                <ThinkingFace />
            </div>
            <h1 className="text-3xl font-bold">اختر فئة</h1>
            <p className="text-muted-foreground text-lg">الجولة {game.round + 1}: دور <span className="font-bold text-primary">{answerer?.name}</span> للإجابة!</p>
        </div>
        
        {player?.id === answerer?.id ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {CATEGORIES.map(cat => (
                    <Card key={cat.name} className="hover:shadow-lg hover:-translate-y-1 transition-transform cursor-pointer" onClick={() => handleSelectCategory(cat)}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><cat.icon /> {cat.name}</CardTitle>
                            <CardDescription>{cat.description}</CardDescription>
                        </CardHeader>
                    </Card>
                ))}
            </div>
            <Card>
                <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wand2 /> مولد الأسئلة بالذكاء الاصطناعي</CardTitle>
                <CardDescription>هل تشعر بالمغامرة؟ دع الذكاء الاصطناعي يبتكر لك سؤالاً فريدًا.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                    {AI_CATEGORIES.map(cat => (
                        <Button key={cat.value} variant="secondary" onClick={() => handleGenerateAIQuestion(cat.value)} disabled={isAI}>
                            {isAI ? "جاري الإنشاء..." : cat.name}
                        </Button>
                    ))}
                </CardContent>
            </Card>
          </>
        ) : (
           <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md text-lg">في انتظار {answerer?.name} لاختيار فئة...</p>
        )}
    </div>
  );

  const renderQuestion = () => (
      <Card className="w-full max-w-2xl animate-bounce-in">
        <CardHeader>
          <CardTitle className="text-center text-primary">{game.selectedCategory}</CardTitle>
          <CardDescription className="text-center font-bold text-2xl pt-2 leading-relaxed">{game.currentQuestion}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {player?.id === answerer?.id ? (
                 <div className="space-y-2">
                    <Label htmlFor="answerer-answer" className="text-lg">إجابتك الصريحة <span className="font-bold text-primary">{answerer?.name}</span></Label>
                    <Input id="answerer-answer" placeholder="إجابتك السرية..." value={answererAnswer} onChange={e => setAnswererAnswer(e.target.value)} disabled={!!game.answererAnswer || isSubmitting}/>
                    <Button onClick={handleSubmitAnswer} className="w-full mt-2" disabled={!!game.answererAnswer || isSubmitting}>
                        {isSubmitting ? "جاري الحفظ..." : "حفظ الإجابة"}
                    </Button>
                    {game.answererAnswer && <p className="text-sm text-green-600 text-center">تم حفظ إجابتك!</p>}
                </div>
            ) : (
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">دورك لتخمين إجابة {answerer?.name}!</h3>
                    <div className="space-y-2">
                        <Label htmlFor={`guess-${player?.id}`}>{player?.name}، ما هو تخمينك؟</Label>
                        <Input id={`guess-${player?.id}`} placeholder={`ماذا تعتقد أن ${answerer?.name} سيقول؟`} value={guesses[player?.id || ''] || ''} onChange={e => setGuesses(prev => ({...prev, [player?.id || '']: e.target.value}))} disabled={!!game.guesses[player?.id || ''] || isSubmitting}/>
                         <Button onClick={() => handleSubmitGuess(player?.id || '')} className="w-full mt-2" disabled={!!game.guesses[player?.id || ''] || isSubmitting}>
                             {isSubmitting ? "جاري الحفظ..." : "حفظ التخمين"}
                         </Button>
                         {game.guesses[player?.id || ''] && <p className="text-sm text-green-600 text-center">تم حفظ تخمينك!</p>}
                    </div>
                </div>
            )}
           
            <Button onClick={handleRevealResults} className="w-full" size="lg">كشف الإجابات</Button>
        </CardContent>
      </Card>
  );
  
  const renderResults = () => {
    const correctGuessers = guessers.filter(p => game.guesses[p.id]?.trim().toLowerCase() === game.answererAnswer?.trim().toLowerCase());
    return (
        <Card className="w-full max-w-2xl animate-bounce-in">
            <CardHeader>
                <CardTitle className="text-center text-4xl">النتائج!</CardTitle>
                <CardDescription className="text-center text-lg font-semibold pt-2">{game.currentQuestion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="text-center p-4 rounded-lg bg-primary/10">
                    <Label className="text-sm font-semibold">الإجابة الصحيحة من {answerer?.name} كانت...</Label>
                    <p className="text-3xl font-bold text-primary animate-pulse-glow">{game.answererAnswer}</p>
                </div>
                
                <div className="space-y-3">
                    {guessers.map(p => {
                        const isCorrect = game.guesses[p.id]?.trim().toLowerCase() === game.answererAnswer?.trim().toLowerCase();
                        return (
                             <div key={p.id} className={`p-4 rounded-md border-2 flex items-center gap-4 ${isCorrect ? 'border-primary' : 'border-destructive'}`}>
                                <div className="w-12 h-12 shrink-0">{isCorrect ? <HappyFace /> : <SadFace />}</div>
                                <div>
                                    <p className="font-bold">{p.name} خمّن:</p>
                                    <p className="text-xl">{game.guesses[p.id]}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {correctGuessers.length > 0 ? (
                    <div className="text-center flex flex-col items-center gap-2">
                        <div className="w-24 h-24"><HappyFace /></div>
                        <p className="text-lg font-semibold">🎉 +10 نقاط لـ {correctGuessers.map(p => p.name).join('، ')}! 🎉</p>
                    </div>
                ) : (
                    <div className="text-center flex flex-col items-center gap-2">
                       <div className="w-24 h-24"><SadFace /></div>
                        <p className="text-center text-lg font-semibold">للأسف، لم يخمن أحد بشكل صحيح!</p>
                    </div>
                )}

                <Button onClick={() => actions.nextRound(gameId)} className="w-full" size="lg">الجولة التالية <ArrowRight className="mr-2" /></Button>
            </CardContent>
        </Card>
    );
  };
  
  const renderScoreboard = () => (
      <Card className="fixed bottom-4 left-4 w-64 hidden md:block animate-fade-in">
          <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trophy /> لوحة النتائج</CardTitle>
          </CardHeader>
          <CardContent>
              <ul className="space-y-2">
                  {[...game.players].sort((a,b) => b.score - a.score).map(p => (
                      <li key={p.id} className="flex justify-between font-medium">
                          <span>{p.name} {p.id === player?.id && "(أنت)"}</span>
                          <span>{p.score}</span>
                      </li>
                  ))}
              </ul>
          </CardContent>
      </Card>
  )

  const renderCurrentState = () => {
    switch(game.gameState) {
        case 'lobby': return renderLobby();
        case 'category_select': return renderCategorySelect();
        case 'question': return renderQuestion();
        case 'results': return renderResults();
        default: return <p>حالة غير معروفة</p>;
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative bg-background">
      <div className="absolute top-4 right-4 text-left">
          <h1 className="text-2xl font-bold text-primary">غوص عميق</h1>
          <p className="text-sm text-muted-foreground">لعبة الصداقة</p>
      </div>
      
      {renderCurrentState()}

      {game.gameState !== "lobby" && renderScoreboard()}
    </main>
  );
}
