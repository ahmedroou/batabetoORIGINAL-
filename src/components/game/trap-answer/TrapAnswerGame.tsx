
"use client";

import { useState, useMemo } from 'react';
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
import { Award, CheckCircle2, ListChecks, Loader2, Send, Server, Star, Users, Trophy, ArrowRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface TrapAnswerGameProps {
    game: Game;
    self: Player;
}

export function TrapAnswerGame({ game, self }: TrapAnswerGameProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [settings, setSettings] = useState(game.trapAnswerState?.settings || { categories: TRAP_ANSWER_CATEGORIES, rounds: 10, answerTime: 60 });
    
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
        return [...answers].sort(() => Math.random() - 0.5);
    }, [game.gameState, game.trapAnswerState?.currentQuestion, game.trapAnswerState?.playerAnswers]);
    
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
    
    const handleSubmitAnswer = async () => {
        setIsSubmitting(true);
        try {
            await actions.submitTrapAnswer(game.id, self.id, trapAnswer);
        } catch (error: any) {
            if (error.message === 'known_answer') {
                toast({
                    title: "لقد عرفت الجواب الصحيح!",
                    description: "مبروك! يرجى الآن إدخال جواب آخر مضلل لخداع أصدقائك.",
                    className: "bg-green-100 border-green-500 text-green-700",
                    duration: 5000,
                });
            } else {
                toast({ title: "خطأ", description: error.message, variant: "destructive" });
            }
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleGuessSubmit = async () => {
        if (!chosenGuess) {
            toast({ title: "الرجاء اختيار إجابة", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await actions.submitGuess(game.id, self.id, chosenGuess);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

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
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle>إعدادات لعبة الجواب الفخ</CardTitle>
                    <CardDescription>يا صاحب الغرفة، قم بتخصيص اللعبة كما تريد.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
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
                        <Label>الأقسام المشاركة في اللعبة</Label>
                        <ScrollArea className="h-40 w-full rounded-md border p-4">
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
                                                    toast({ title: "لا يمكن ترك الأقسام فارغة", variant: "destructive" });
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
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>اللاعبون ({activePlayers.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {activePlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-3 p-2 bg-muted rounded-md">
                            <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10"/>
                            <span className="font-bold">{p.name}</span>
                        </div>
                    ))}
                </CardContent>
                <CardFooter>
                     {isHost ? (
                        <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full">
                           <ArrowRight className="mr-2 h-4 w-4" />
                           {isSubmitting ? '...' : activePlayers.length < 2 ? `تحتاج لاعبين على الأقل` : 'ابدأ اللعبة'}
                        </Button>
                    ) : (
                        <p className="text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
                    )}
                </CardFooter>
            </Card>
        </div>
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
                <CardHeader className="text-center">
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
                            <Button onClick={handleSubmitAnswer} disabled={isSubmitting || !trapAnswer.trim()} className="w-full">
                                <Send className="mr-2" /> {isSubmitting ? 'جاري الإرسال...' : 'إرسال الجواب الفخ'}
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
                <CardHeader className="text-center">
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
                                    <Label key={i} htmlFor={`ans-${i}`} className={cn('flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all', chosenGuess === ans ? 'border-primary bg-primary/10' : 'border-muted bg-muted/50 hover:border-primary/50')}>
                                        <RadioGroupItem value={ans} id={`ans-${i}`} />
                                        <span className="text-base font-semibold">{ans}</span>
                                    </Label>
                                ))}
                            </RadioGroup>
                            <Button onClick={handleGuessSubmit} disabled={isSubmitting || !chosenGuess} className="w-full">
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
        const correctAnswer = results?.correctAnswer;
        const scores = results?.scores || {};

        return (
            <Card className="w-full max-w-2xl animate-pop-in">
                <CardHeader className="text-center">
                    <Award className="w-16 h-16 mx-auto text-yellow-500"/>
                    <CardTitle>نتائج الجولة {game.round}</CardTitle>
                    <CardDescription className="text-lg font-bold pt-2">الجواب الصحيح كان: {correctAnswer}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {game.players.map(p => {
                        const scoreInfo = scores[p.id];
                        if (!scoreInfo) return null;
                        return (
                            <motion.div 
                                key={p.id}
                                className="p-3 bg-muted rounded-lg flex justify-between items-center"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0, transition: { delay: 0.1 * game.players.indexOf(p) } }}
                            >
                                <div className="flex items-center gap-3">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                    <span className="font-bold">{p.name}</span>
                                </div>
                                <div className="text-left">
                                    <span className={`font-bold text-lg ${scoreInfo.points > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                                        {scoreInfo.points > 0 ? `+${scoreInfo.points}` : '0'} نقطة
                                    </span>
                                    <div className="text-xs text-muted-foreground">
                                        {scoreInfo.breakdown.map((b, i) => (
                                            <p key={i}>{b.reason === 'Correct Answer' ? 'إجابة صحيحة' : 'خدع لاعبًا'}</p>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                     <div className="mt-6 pt-4 border-t">
                        <h3 className="text-center font-bold mb-2">مجموع النقاط</h3>
                         {game.players.sort((a,b) => (game.playerScores?.[b.id] || 0) - (game.playerScores?.[a.id] || 0)).map(p => (
                             <div key={p.id} className="flex justify-between items-center p-2">
                                 <span>{p.name}</span>
                                 <span className="font-bold text-primary">{game.playerScores?.[p.id] || 0}</span>
                             </div>
                         ))}
                    </div>
                </CardContent>
                <CardFooter>
                    {isHost && (
                         <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full">
                            {isSubmitting ? 'جاري التحميل...' : (game.round || 0) >= (game.trapAnswerState?.settings.rounds || 10) ? 'عرض النتائج النهائية' : 'الجولة التالية'}
                        </Button>
                    )}
                </CardFooter>
            </Card>
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
            <CardHeader><CardTitle>لعبة الجواب الفخ</CardTitle></CardHeader>
            <CardContent>
                <p>حالة غير معروفة: {game.gameState}</p>
                <Loader2 className="animate-spin" />
            </CardContent>
        </Card>
    );
}
