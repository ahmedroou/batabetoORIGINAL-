

"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { TRAP_ANSWER_CATEGORIES } from '@/lib/actions/admin';
import * as actions from '@/lib/actions/trap-answer';
import { Award, CheckCircle2, ListChecks, Loader2, Send, Server, Star, Users, Trophy, ArrowRight, Copy, Check, TimerIcon, ListX, ListPlus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const CountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number; onExpire: () => void }) => {
    const calculateTimeLeft = useCallback(() => Math.round((expiryTimestamp - Date.now()) / 1000), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    useEffect(() => {
        const remaining = calculateTimeLeft();
        if (remaining <= 0) {
            onExpireRef.current();
            return;
        }
        
        const interval = setInterval(() => {
            const newRemaining = calculateTimeLeft();
            if (newRemaining > 0) {
                setTimeLeft(newRemaining);
            } else {
                setTimeLeft(0);
                clearInterval(interval);
                onExpireRef.current();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [expiryTimestamp, calculateTimeLeft]);

    if (timeLeft <= 0) {
        return <div className="text-lg font-bold text-destructive">انتهى الوقت!</div>;
    }

    const isLowTime = timeLeft <= 10;

    return (
        <div className={cn("flex items-center gap-2 p-2 rounded-full transition-all duration-300", 
            isLowTime ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-muted')}>
            <TimerIcon className="h-6 w-6" />
            <div className="text-lg font-bold font-mono">
               {String(timeLeft).padStart(2, '0')}
            </div>
        </div>
    );
};


interface TrapAnswerGameProps {
    game: Game;
    self: Player;
}

export function TrapAnswerGame({ game, self }: TrapAnswerGameProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [settings, setSettings] = useState(game.trapAnswerState?.settings || { categories: TRAP_ANSWER_CATEGORIES, rounds: 10, answerTime: 60 });
    const [isCopying, setIsCopying] = useState(false);
    
    const [trapAnswer, setTrapAnswer] = useState('');
    const [chosenGuess, setChosenGuess] = useState<string | null>(null);

    const isHost = game.hostId === self.id;
    const isMyTurn = game.trapAnswerState?.turnOrder?.[game.trapAnswerState?.currentTurnIndex || 0] === self.id;
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);

    const shuffledAnswers = useMemo(() => {
        if (game.gameState !== 'guessing') return [];
        const answers = [
            game.trapAnswerState?.currentQuestion?.answer,
            ...Object.values(game.trapAnswerState?.playerAnswers || {})
        ].filter(Boolean) as string[];
        return [...answers].sort(() => 0.5 - 0.5); // Use a stable "random" sort
    }, [game.gameState, game.trapAnswerState?.currentQuestion?.question]); // Shuffle only when question changes

    useEffect(() => {
        if (game.gameState === 'answer-submission') {
            setTrapAnswer(''); // Clear previous answer
        }
    }, [game.gameState, game.round]);
    
    const handleSettingsChange = async (newSettings: Partial<typeof settings>) => {
        const updatedSettings = { ...settings, ...newSettings };
        setSettings(updatedSettings);
        if (isHost) {
            try {
                await actions.updateGameSettings(game.id, self.id, updatedSettings);
            } catch (error: any) {
                toast({ title: "خطأ في تحديث الإعدادات", description: error.message, variant: "destructive" });
            }
        }
    };

    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    }
    
    const handleStartGame = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await actions.startTrapAnswerGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleCategorySelect = async (category: string) => {
        setIsSubmitting(true);
        try {
            await actions.selectCategoryAndGetQuestion(game.id, self.id, category);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleSubmitAnswer = useCallback(async (isTimeout = false) => {
        if (game.trapAnswerState?.playerAnswers?.[self.id]) return;

        setIsSubmitting(true);
        try {
            const result = await actions.submitTrapAnswer(game.id, self.id, trapAnswer.trim(), isTimeout);
             if (result?.error === "known_answer") {
                toast({
                    title: "لقد عرفت الجواب الصحيح!",
                    description: "مبروك! يرجى الآن إدخال جواب آخر مضلل لخداع أصدقائك.",
                    className: "bg-green-100 border-green-500 text-green-700",
                    duration: 5000,
                });
            } else if (result?.error) {
                toast({
                    title: "إجابة غير مقبولة",
                    description: result.error,
                    variant: "destructive",
                });
            }
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, trapAnswer, toast, game.trapAnswerState?.playerAnswers]);

    const handleGuessSubmit = useCallback(async (isTimeout = false) => {
        if (game.trapAnswerState?.playerGuesses?.[self.id]) return;

        const guessToSubmit = chosenGuess || (shuffledAnswers.length > 0 ? shuffledAnswers[0] : null);
        
        if (!guessToSubmit && !isTimeout) {
            toast({ title: "الرجاء اختيار إجابة", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            await actions.submitGuess(game.id, self.id, guessToSubmit);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, chosenGuess, shuffledAnswers, toast, game.trapAnswerState?.playerGuesses]);


    const handleNextRound = async () => {
        setIsSubmitting(true);
        try {
            await actions.nextTrapAnswerRound(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }


    const renderLobby = () => (
        <Card className="w-full max-w-4xl">
             <CardHeader className="text-center">
                <CardTitle className="text-2xl">
                    لوبي لعبة الجواب المفخخ
                </CardTitle>
                <div className="flex gap-2 w-full max-w-sm mx-auto pt-2">
                  <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
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
              </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-0">
                <div className="md:col-span-2 space-y-6">
                    <div>
                        <Label>إعدادات اللعبة {isHost ? '(يمكنك التعديل)' : '(عرض فقط)'}</Label>
                        <div className="p-4 border rounded-lg space-y-4 mt-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>عدد الجولات</Label>
                                    <Input type="number" value={settings.rounds} disabled={!isHost} onChange={e => handleSettingsChange({ rounds: parseInt(e.target.value, 10) || 1 })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>وقت الإجابة (بالثواني)</Label>
                                    <Input type="number" value={settings.answerTime} disabled={!isHost} onChange={e => handleSettingsChange({ answerTime: parseInt(e.target.value, 10) || 30 })} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>الأقسام المشاركة</Label>
                                {isHost && (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => handleSettingsChange({ categories: TRAP_ANSWER_CATEGORIES })}>
                                            <ListPlus /> تحديد الكل
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => {
                                             if(settings.categories.length > 1) {
                                                 handleSettingsChange({ categories: [settings.categories[0]] })
                                             } else {
                                                 toast({ title: "يجب اختيار قسم واحد على الأقل", variant: "destructive" });
                                             }
                                        }}>
                                            <ListX /> إلغاء تحديد الكل
                                        </Button>
                                    </div>
                                )}
                                <ScrollArea className="h-40 w-full rounded-md border p-4 bg-background">
                                    <div className="grid grid-cols-2 gap-2">
                                        {TRAP_ANSWER_CATEGORIES.map(cat => (
                                            <div key={cat} className="flex items-center space-x-2 space-x-reverse">
                                                <Checkbox
                                                    id={cat}
                                                    checked={settings.categories.includes(cat)}
                                                    disabled={!isHost}
                                                    onCheckedChange={(checked) => {
                                                        const newCategories = checked
                                                            ? [...settings.categories, cat]
                                                            : settings.categories.filter(c => c !== cat);
                                                        if (newCategories.length > 0) {
                                                        handleSettingsChange({ categories: newCategories });
                                                        } else {
                                                            toast({ title: "يجب اختيار قسم واحد على الأقل", variant: "destructive" });
                                                        }
                                                    }}
                                                />
                                                <label htmlFor={cat} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                    {cat}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col">
                    <CardHeader className="p-0 mb-2">
                        <CardTitle>اللاعبون ({activePlayers.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 p-0 flex-grow">
                        {activePlayers.map(p => (
                            <div key={p.id} className="flex items-center gap-3 p-2 bg-muted rounded-md">
                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10"/>
                                <span className="font-bold">{p.name}</span>
                            </div>
                        ))}
                    </CardContent>
                    <CardFooter className="p-0 mt-4">
                        {isHost ? (
                            <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full">
                            <ArrowRight className="mr-2 h-4 w-4" />
                            {isSubmitting ? '...' : activePlayers.length < 2 ? `تحتاج لاعبين على الأقل` : 'ابدأ اللعبة'}
                            </Button>
                        ) : (
                            <p className="w-full text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
                        )}
                    </CardFooter>
                </div>
            </CardContent>
        </Card>
    );

    const renderCategorySelection = () => {
        const chooser = game.players.find(p => p.id === game.trapAnswerState?.turnOrder?.[game.trapAnswerState.currentTurnIndex || 0]);
        return (
            <Card className="w-full max-w-lg animate-pop-in">
                <CardHeader className="text-center">
                    <CardTitle>الجولة {game.round || 1}</CardTitle>
                    <CardDescription>
                       دور اللاعب <strong>{chooser?.name}</strong> لاختيار قسم.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isMyTurn ? (
                        <div className="grid grid-cols-1 gap-3">
                           {game.trapAnswerState?.fiveRandomCategories?.map(cat => (
                               <Button key={cat} onClick={() => handleCategorySelect(cat)} disabled={isSubmitting} variant="outline" size="lg" className="text-lg justify-center h-14">
                                   {cat}
                               </Button>
                           ))}
                        </div>
                    ) : (
                         <div className="text-center p-4 rounded-lg bg-muted text-muted-foreground animate-pulse">
                            <p className="font-semibold">في انتظار {chooser?.name || 'اللاعب'} لاختيار قسم...</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    const renderAnswerSubmission = () => {
        const hasSubmitted = !!game.trapAnswerState?.playerAnswers?.[self.id];
        return (
            <Card className="w-full max-w-lg animate-pop-in">
                 {game.trapAnswerState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.trapAnswerState.timerEndsAt.toMillis()}
                            onExpire={() => handleSubmitAnswer(true)}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>السؤال</CardTitle>
                    <CardDescription className="text-2xl font-bold pt-2">{game.trapAnswerState?.currentQuestion?.question}</CardDescription>
                </CardHeader>
                 <CardContent>
                    {hasSubmitted ? (
                        <div className="text-center p-4 rounded-lg bg-green-100 text-green-800">
                            <p className="font-semibold">تم إرسال إجابتك المضللة! في انتظار بقية اللاعبين...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                           <Textarea
                                placeholder="اكتب إجابتك المضللة هنا..."
                                value={trapAnswer}
                                onChange={(e) => setTrapAnswer(e.target.value)}
                                rows={4}
                            />
                            <Button onClick={() => handleSubmitAnswer(false)} disabled={isSubmitting || !trapAnswer.trim()} className="w-full">
                                <Send className="mr-2" /> {isSubmitting ? 'جاري الإرسال...' : 'إرسال الجواب المفخخ'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    const renderGuessing = () => {
        const hasGuessed = !!game.trapAnswerState?.playerGuesses?.[self.id];
        return (
             <Card className="w-full max-w-lg animate-pop-in">
                 {game.trapAnswerState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.trapAnswerState.timerEndsAt.toMillis()}
                            onExpire={() => handleGuessSubmit(true)}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>أين هو الجواب الصحيح؟</CardTitle>
                    <CardDescription className="text-2xl font-bold pt-2">{game.trapAnswerState?.currentQuestion?.question}</CardDescription>
                </CardHeader>
                <CardContent>
                    {hasGuessed ? (
                         <div className="text-center p-4 rounded-lg bg-green-100 text-green-800">
                            <p className="font-semibold">تم تسجيل تخمينك! في انتظار بقية اللاعبين...</p>
                        </div>
                    ) : (
                       <div className="space-y-4">
                            <RadioGroup value={chosenGuess || ''} onValueChange={setChosenGuess} className="grid grid-cols-1 gap-3">
                                {shuffledAnswers.map((ans, i) => (
                                    <Label key={ans + i} htmlFor={`ans-${i}`} className={cn('flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all', chosenGuess === ans ? 'border-primary bg-primary/10' : 'border-muted bg-muted/50 hover:border-primary/50')}>
                                        <RadioGroupItem value={ans} id={`ans-${i}`} />
                                        <span className="text-base font-semibold">{ans}</span>
                                    </Label>
                                ))}
                            </RadioGroup>
                            <Button onClick={() => handleGuessSubmit(false)} disabled={isSubmitting || !chosenGuess} className="w-full">
                                <CheckCircle2 className="mr-2" /> {isSubmitting ? 'جاري التأكيد...' : 'تأكيد التخمين'}
                            </Button>
                       </div>
                    )}
                </CardContent>
             </Card>
        );
    };

    const renderRoundResults = () => {
        const results = game.trapAnswerState?.lastRoundResults;
        if (!results) return <p>جاري تحميل النتائج...</p>;
        
        const getPlayer = (playerId: string) => game.players.find(p => p.id === playerId);

        return (
            <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="text-center">
                            <Award className="w-16 h-16 mx-auto text-yellow-500"/>
                            <CardTitle>نتائج الجولة {game.round}</CardTitle>
                            <CardDescription className="text-base pt-2">
                                السؤال كان: <strong className="text-foreground">{game.trapAnswerState?.currentQuestion?.question}</strong>
                            </CardDescription>
                        </CardHeader>
                    </Card>
                    <ScrollArea className="h-[50vh] pr-4">
                        <div className="space-y-3">
                        {results.answers.map((ans, idx) => (
                            <motion.div
                                key={ans.text + idx}
                                className={cn("p-4 border-2 rounded-lg", ans.isCorrect ? "bg-green-100 border-green-500" : "bg-card border-border")}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.1 } }}
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-lg font-bold">{ans.text}</p>
                                    {ans.isCorrect ? (
                                        <div className="px-2 py-1 text-xs font-bold text-green-800 bg-green-200 rounded-full">الجواب الصحيح</div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                                            <span>جواب:</span>
                                            <PlayerAvatar avatarId={getPlayer(ans.authorId!)?.avatarId || ''} className="w-5 h-5"/>
                                            <span className='font-bold'>{getPlayer(ans.authorId!)?.name}</span>
                                        </div>
                                    )}
                                </div>
                                {ans.guesserIds.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                                        <span className="text-xs font-bold self-center">صوّت لها:</span>
                                        {ans.guesserIds.map(id => {
                                            const guesser = getPlayer(id);
                                            return guesser ? (
                                                <div key={id} className="flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-full">
                                                    <PlayerAvatar avatarId={guesser.avatarId} className="w-4 h-4"/>
                                                    <span>{guesser.name}</span>
                                                </div>
                                            ) : null
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        ))}
                        </div>
                    </ScrollArea>
                </div>
                
                <div className="space-y-4">
                    <Card>
                         <CardHeader>
                            <CardTitle>نقاط الجولة</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {game.players.sort((a,b) => (game.playerScores?.[b.id] || 0) - (game.playerScores?.[a.id] || 0)).map(p => {
                                const roundScore = results.scores[p.id];
                                return (
                                <div key={p.id} className="flex justify-between items-center p-2 rounded-md bg-muted">
                                    <div className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                        <div className='flex-grow'>
                                            <span className="font-bold block">{p.name}</span>
                                            {roundScore?.points > 0 && (
                                                <div className='flex flex-wrap gap-x-2'>
                                                  {roundScore.breakdown.map((item, i) => (
                                                      <span key={i} className="text-xs text-green-600">(+{item.points} {item.reason})</span>
                                                  ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-bold text-lg text-primary">{game.playerScores?.[p.id] || 0}</span>
                                        {roundScore?.points > 0 && (
                                            <span className="text-xs font-bold text-green-500 block">+{roundScore.points}</span>
                                        )}
                                    </div>
                                </div>
                            )})}
                        </CardContent>
                    </Card>
                    {isHost && (
                         <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full">
                            {isSubmitting ? 'جاري التحميل...' : (game.round || 0) >= (game.trapAnswerState?.settings.rounds || 10) ? 'عرض النتائج النهائية' : 'الجولة التالية'}
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    const renderFinalResults = () => {
        const sortedPlayers = game.players.sort((a, b) => (game.playerScores?.[b.id] || 0) - (game.playerScores?.[a.id] || 0));
        const winner = sortedPlayers[0];
        
        return (
            <Card className="w-full max-w-md animate-pop-in">
                <CardHeader className="text-center">
                    <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                    <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                    {winner && <CardDescription className="text-2xl font-bold">الفائز هو {winner.name}!</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-2">
                    {sortedPlayers.map((p, index) => (
                        <div key={p.id} className="flex justify-between items-center p-3 bg-muted rounded-lg text-lg">
                           <div className="flex items-center gap-2 font-bold">
                                <span>{index + 1}.</span>
                                <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                <span>{p.name}</span>
                           </div>
                           <span className="font-bold text-primary">{game.playerScores?.[p.id] || 0} نقطة</span>
                        </div>
                    ))}
                </CardContent>
                <CardFooter>
                    <Button onClick={() => router.push('/')} className="w-full">العب مرة أخرى</Button>
                </CardFooter>
            </Card>
        )
    };
    
    // Main render logic
    if (game.gameState === 'lobby') return renderLobby();
    if (game.gameState === 'category-selection') return renderCategorySelection();
    if (game.gameState === 'answer-submission') return renderAnswerSubmission();
    if (game.gameState === 'guessing') return renderGuessing();
    if (game.gameState === 'round-results') return renderRoundResults();
    if (game.gameState === 'final-results') return renderFinalResults();
    
    return (
        <Card>
            <CardHeader><CardTitle>لعبة الجواب المفخخ</CardTitle></CardHeader>
            <CardContent>
                <p>حالة غير معروفة: {game.gameState}</p>
                <Loader2 className="animate-spin" />
            </CardContent>
        </Card>
    );
}
