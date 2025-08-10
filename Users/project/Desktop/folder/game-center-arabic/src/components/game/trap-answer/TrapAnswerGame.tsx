

"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Game, Player, EmojiReaction, EmojiReactionType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_TRAP_ANSWER_CATEGORIES } from '@/types';
import { startTrapAnswerGame, selectCategoryAndGetQuestion, handleTimeout, submitTrapAnswer, submitGuess, nextTrapAnswerRound, sendReaction, setPlayerPresence, updateGameSettings } from '@/lib/actions/trap-answer';
import { leaveGame, kickPlayerFromLobby } from '@/lib/actions/room';
import { Award, CheckCircle2, ListChecks, Loader2, Send, Server, Star, Users, Trophy, ArrowRight, Copy, Check, TimerIcon, ListX, ListPlus, LogOut, Laugh, MessageCircleOff, Handshake, Drama, UserX, VenetianMask, UserRound, Swords, Save, Settings, EyeOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { usePageVisibility } from '@/hooks/usePageVisibility';


const CountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number; onExpire: () => void }) => {
    const calculateTimeLeft = useCallback(() => Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000), [expiryTimestamp]);
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

const EmojiDisplay = ({ reaction }: { reaction: EmojiReaction | null }) => {
    if (!reaction) return null;

    const EMOJI_MAP: Record<EmojiReactionType, React.ReactNode> = {
        laugh: <Laugh className="w-16 h-16 text-yellow-400" />,
        mock: <MessageCircleOff className="w-16 h-16 text-red-500" />,
        apologize: <Handshake className="w-16 h-16 text-blue-400" />,
        shame: <Drama className="w-16 h-16 text-purple-400" />,
    };

    return (
        <motion.div
            key={reaction.timestamp.toMillis()}
            initial={{ scale: 0.5, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="absolute -top-8 -right-8 z-10 bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-lg"
        >
            {EMOJI_MAP[reaction.emoji]}
        </motion.div>
    );
};


export function TrapAnswerGame({ game, self }: TrapAnswerGameProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [settings, setSettings] = useState(game.trapAnswerState?.settings || { categories: [], rounds: 10, answerTime: 60 });
    const [isCopying, setIsCopying] = useState(false);
    
    const [trapAnswer, setTrapAnswer] = useState('');
    const [chosenGuess, setChosenGuess] = useState<string | null>(null);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    
    // State for emoji reactions
    const [visibleReactions, setVisibleReactions] = useState<Record<string, EmojiReaction | null>>({});

    const isHost = game.hostId === self.id;
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);
    const uniqueDisplayAnswers = useMemo(() => game.trapAnswerState?.shuffledAnswers || [], [game.trapAnswerState?.shuffledAnswers]);
    
    const isPageVisible = usePageVisibility();

    useEffect(() => {
        if (game.gameState === 'answer-submission' || game.gameState === 'guessing') {
            setPlayerPresence(game.id, self.id, isPageVisible ? 'present' : 'away');
        } else {
            // Ensure presence is reset to present when not in an active answering/guessing phase
            if (self.presence === 'away') {
                 setPlayerPresence(game.id, self.id, 'present');
            }
        }
    }, [isPageVisible, game.gameState, game.id, self.id, self.presence]);


    const onTimeout = useCallback(() => {
      if (isHost) {
        handleTimeout(game.id, self.id);
      }
    }, [isHost, game.id, self.id]);

    useEffect(() => {
        if (game.gameState === 'guessing') {
            setChosenGuess(null);
        }
    }, [game.gameState, game.round]);


    useEffect(() => {
        if (game.gameState === 'answer-submission') {
            setTrapAnswer(''); // Clear previous answer
        }
    }, [game.gameState, game.round]);

     useEffect(() => {
        const reactions = game.trapAnswerState?.reactions || {};
        const now = Date.now();
        const newVisibleReactions: Record<string, EmojiReaction | null> = {};

        Object.entries(reactions).forEach(([playerId, reaction]) => {
            if (reaction && (now - reaction.timestamp.toMillis() < 4000)) {
                newVisibleReactions[playerId] = reaction;
            } else {
                newVisibleReactions[playerId] = null;
            }
        });
        setVisibleReactions(newVisibleReactions);
    }, [game.trapAnswerState?.reactions]);
    
    const handleSettingsChange = (newSettings: Partial<typeof settings>) => {
        const updatedSettings = { ...settings, ...newSettings };
        setSettings(updatedSettings);
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
            await startTrapAnswerGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleCategorySelect = useCallback(async (category: string) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await selectCategoryAndGetQuestion(game.id, self.id, category);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, isSubmitting, toast]);
    
    const handleSubmitAnswer = useCallback(async () => {
        if (game.trapAnswerState?.playerAnswers?.hasOwnProperty(self.id)) return;

        setIsSubmitting(true);
        try {
            const result = await submitTrapAnswer(game.id, self.id, trapAnswer);
            if (result.error) {
                toast({ title: "خطأ", description: result.error, variant: "destructive" });
            }
        } catch (error: any) {
            toast({ title: "خطأ فادح", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, trapAnswer, toast, game.trapAnswerState?.playerAnswers]);

    const handleGuessSubmit = useCallback(async () => {
        if (game.trapAnswerState?.playerGuesses?.[self.id]) return;

        if (!chosenGuess) {
            toast({ title: "الرجاء اختيار إجابة", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            await submitGuess(game.id, self.id, chosenGuess);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, chosenGuess, toast, game.trapAnswerState?.playerGuesses]);


    const handleNextRound = async () => {
        setIsSubmitting(true);
        try {
            await nextTrapAnswerRound(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleSendReaction = (emoji: EmojiReactionType) => {
        sendReaction(game.id, self.id, emoji);
    };
    
    const handleLeaveGame = async () => {
        if (!self) return;
        setIsSubmitting(true);
        const result = await leaveGame(game.id, self.id);
        if (result.success) {
          sessionStorage.removeItem(`player-${game.id}`);
          router.push('/');
          toast({ title: "لقد غادرت الغرفة." })
        } else {
          toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleKickPlayer = async () => {
        if (!playerToKick || !isHost) return;
        setIsSubmitting(true);
        const result = await kickPlayerFromLobby(game.id, self.id, playerToKick.id);
        if (result.error) {
            toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
        }
        setPlayerToKick(null);
        setIsSubmitting(false);
    };
    
    const handleSaveSettings = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
         try {
            await updateGameSettings(game.id, self.id, settings);
            toast({ title: "تم حفظ الإعدادات بنجاح" });
        } catch (error: any) {
            toast({ title: "خطأ في حفظ الإعدادات", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };


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
                        <div className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50">
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
                                        <Button size="sm" variant="outline" onClick={() => handleSettingsChange({ categories: DEFAULT_TRAP_ANSWER_CATEGORIES })}>
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
                                        {DEFAULT_TRAP_ANSWER_CATEGORIES.map(cat => (
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
                                {isHost && (
                                    <Button onClick={handleSaveSettings} disabled={isSubmitting} className="w-full mt-2">
                                        {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} حفظ الإعدادات
                                    </Button>
                                )}
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
                            <div key={p.id} className="flex items-center gap-3 p-2 bg-muted rounded-md justify-between">
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" temporaryTitle={p.temporaryTitle} />
                                    <span className="font-bold">{p.name}</span>
                                </div>
                                {isHost && p.id !== self.id && (
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)}>
                                        <UserX className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2 p-0 mt-4">
                        {isHost ? (
                            <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full">
                            <ArrowRight className="mr-2 h-4 w-4" />
                            {isSubmitting ? '...' : activePlayers.length < 2 ? `تحتاج لاعبين على الأقل` : 'ابدأ اللعبة'}
                            </Button>
                        ) : (
                            <p className="w-full text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
                        )}
                        <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                           <LogOut /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                        </Button>
                    </CardFooter>
                </div>
            </CardContent>
        </Card>
    );

    const renderCategorySelection = () => {
        const turnOrder = game.trapAnswerState?.turnOrder || [];
        const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
        const playerWhoseTurnItIs = game.players.find(p => p.id === turnOrder[currentTurnIndex]);
        const isMyTurn = self.id === playerWhoseTurnItIs?.id;
        const categories = game.trapAnswerState?.fiveRandomCategories || [];

        return (
            <Card className="w-full max-w-lg animate-pop-in relative">
                {game.trapAnswerState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.trapAnswerState.timerEndsAt.toMillis()}
                            onExpire={onTimeout}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>الجولة {game.round || 1}</CardTitle>
                    <CardDescription>
                        حان دور <strong>{isMyTurn ? 'أنت' : playerWhoseTurnItIs?.name}</strong> لاختيار قسم.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="flex flex-col items-center gap-4">
                       <p className='text-muted-foreground text-center'>
                           {isMyTurn ? "اختر أحد الأقسام التالية لطرح سؤال منه." : `الأقسام المتاحة لـ ${playerWhoseTurnItIs?.name}:`}
                       </p>
                       <div className="grid grid-cols-2 gap-3 w-full">
                            {categories.map(cat => (
                                <Button 
                                    key={cat} 
                                    onClick={() => handleCategorySelect(cat)} 
                                    disabled={isSubmitting || !isMyTurn} 
                                    size="lg" 
                                    variant="outline" 
                                    className="text-base justify-center h-14"
                                >
                                    {(isSubmitting && isMyTurn) ? <Loader2 className="animate-spin" /> : cat}
                                </Button>
                            ))}
                       </div>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const renderAnswerSubmission = () => {
        const hasSubmitted = game.trapAnswerState?.playerAnswers?.hasOwnProperty(self.id);
        const answeredPlayers = game.trapAnswerState?.playerAnswers ? Object.keys(game.trapAnswerState.playerAnswers) : [];
        const pendingPlayers = activePlayers.filter(p => !answeredPlayers.includes(p.id));

        return (
            <Card className="w-full max-w-lg animate-pop-in">
                 {game.trapAnswerState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.trapAnswerState.timerEndsAt.toMillis()}
                            onExpire={onTimeout}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>السؤال</CardTitle>
                    <CardDescription className="text-2xl font-bold pt-2">{game.trapAnswerState?.currentQuestion?.question}</CardDescription>
                </CardHeader>
                 <CardContent>
                    {hasSubmitted ? (
                         <div className="text-center p-4 rounded-lg bg-green-100 text-green-800 space-y-4">
                            <p className="font-semibold">تم إرسال إجابتك! في انتظار بقية اللاعبين...</p>
                             <div className="space-y-2">
                                {pendingPlayers.map(p => {
                                    const player = game.players.find(player => player.id === p.id);
                                    const isAway = player?.presence === 'away';
                                    return (
                                        <div key={p.id} className="flex items-center justify-center gap-2 text-sm text-yellow-800">
                                            <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6" temporaryTitle={p.temporaryTitle}/>
                                            <span>في انتظار {p.name}...</span>
                                            {isAway ? <EyeOff className="w-4 h-4 text-red-500 animate-pulse" /> : <Loader2 className="w-4 h-4 animate-spin"/>}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                           <Textarea
                                placeholder={"اكتب إجابتك هنا..."}
                                value={trapAnswer}
                                onChange={(e) => setTrapAnswer(e.target.value)}
                                rows={4}
                            />
                            <Button onClick={() => handleSubmitAnswer()} disabled={isSubmitting || !trapAnswer.trim()} className="w-full">
                                <Send className="mr-2" /> {isSubmitting ? 'جاري الإرسال...' : 'إرسال الجواب'}
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
                            onExpire={onTimeout}
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
                                {uniqueDisplayAnswers.map((ans, i) => (
                                    <Label key={ans + i} htmlFor={`ans-${i}`} className={cn('flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all', chosenGuess === ans ? 'border-primary bg-primary/10' : 'border-muted bg-muted/50 hover:border-primary/50')}>
                                        <RadioGroupItem value={ans} id={`ans-${i}`} />
                                        <span className="text-base font-semibold">{ans}</span>
                                    </Label>
                                ))}
                            </RadioGroup>
                            <Button onClick={() => handleGuessSubmit()} disabled={isSubmitting || !chosenGuess} className="w-full">
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
        const timedOutPlayers = (results.timedOutGuesserIds || []).map(id => getPlayer(id)).filter((p): p is Player => !!p);

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
                     {timedOutPlayers.length > 0 && (
                        <Card className="border-yellow-500 bg-yellow-100/80 dark:bg-yellow-900/30 dark:text-yellow-200">
                            <CardHeader>
                                <CardTitle className="text-yellow-800 dark:text-yellow-200 text-base flex items-center gap-2"><TimerIcon/> لاعبون لم يجيبوا في الوقت</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-4">
                                {timedOutPlayers.map(p => (
                                    <div key={p.id} className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6"/>
                                        <span className="font-semibold text-sm">{p.name}</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
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
                                        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                                            <span>جواب:</span>
                                            {ans.authorIds && ans.authorIds.length > 0 ? (
                                                ans.authorIds.map(authorId => {
                                                    const author = getPlayer(authorId);
                                                    return author ? (
                                                        <div key={authorId} className="flex items-center gap-1.5">
                                                            <PlayerAvatar avatarId={author.avatarId} className="w-5 h-5" temporaryTitle={author.temporaryTitle}/>
                                                            <span className='font-bold'>{author.name}</span>
                                                        </div>
                                                    ) : null;
                                                })
                                            ) : (
                                                <span className='font-bold'>(تلقائي)</span>
                                            )}
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
                                                    <PlayerAvatar avatarId={guesser.avatarId} className="w-4 h-4" temporaryTitle={guesser.temporaryTitle}/>
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
                                <div key={p.id} className="flex flex-col p-2 rounded-md bg-muted">
                                    <div className="flex justify-between items-center">
                                        <div className="relative flex items-center gap-2">
                                            <AnimatePresence>
                                                <EmojiDisplay reaction={visibleReactions[p.id] || null} />
                                            </AnimatePresence>
                                            <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" temporaryTitle={p.temporaryTitle}/>
                                            <div className='flex-grow'>
                                                <span className="font-bold block">{p.name}</span>
                                                {roundScore && roundScore.points !== 0 && (
                                                    <div className='flex flex-wrap gap-x-2'>
                                                      {roundScore.breakdown.map((item, i) => (
                                                          <span key={i} className={cn("text-xs", item.points > 0 ? "text-green-600" : "text-red-600")}>({item.points > 0 ? `+${item.points}` : item.points} {item.reason})</span>
                                                      ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-lg text-primary">{game.playerScores?.[p.id] || 0}</span>
                                            {roundScore?.points > 0 && (
                                                <span className="text-xs font-bold text-green-500">+{roundScore.points}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-center gap-2 mt-2 pt-2 border-t border-background w-full">
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('laugh')}><Laugh className="h-4 w-4 text-yellow-500" /></Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('mock')}><MessageCircleOff className="h-4 w-4 text-red-500" /></Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('apologize')}><Handshake className="h-4 w-4 text-blue-500" /></Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('shame')}><Drama className="h-4 w-4 text-purple-500" /></Button>
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
        const sortedPlayers = game.players
            .map(p => ({ ...p, score: game.playerScores?.[p.id] || 0 }))
            .sort((a, b) => b.score - a.score);
            
        let rank = 0;
        let lastScore = -Infinity;
        
        const rankedPlayers = sortedPlayers.map((p, index) => {
            if (p.score !== lastScore) {
                rank = index + 1;
            }
            lastScore = p.score;
            return { ...p, rank };
        });

        const winner = rankedPlayers[0];
        const { cunningDeceiver, deceivedFool } = game.trapAnswerState?.finalAwards || {};
        
        return (
            <Card className="w-full max-w-2xl animate-pop-in">
                <CardHeader className="text-center">
                    <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                    <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                    {winner && <CardDescription className="text-2xl font-bold">الفائز هو {winner.name}!</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                        {cunningDeceiver && (
                            <div className="p-3 rounded-lg bg-red-100 border border-red-300">
                                <h3 className="font-bold text-red-800 flex items-center justify-center gap-2"><VenetianMask /> المخادع المكار</h3>
                                <PlayerAvatar avatarId={cunningDeceiver.avatarId} className="w-16 h-16 mx-auto my-2"/>
                                <p className="font-bold text-lg">{cunningDeceiver.name}</p>
                                <p className="text-sm text-muted-foreground">خدع {cunningDeceiver.count} لاعبين</p>
                            </div>
                        )}
                         {deceivedFool && (
                            <div className="p-3 rounded-lg bg-blue-100 border border-blue-300">
                                <h3 className="font-bold text-blue-800 flex items-center justify-center gap-2"><UserRound /> الأبله المخدوع</h3>
                                <PlayerAvatar avatarId={deceivedFool.avatarId} className="w-16 h-16 mx-auto my-2"/>
                                <p className="font-bold text-lg">{deceivedFool.name}</p>
                                <p className="text-sm text-muted-foreground">وقع في الفخ {deceivedFool.count} مرات</p>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2 pt-4">
                        <h3 className="font-bold text-center">الترتيب النهائي</h3>
                        {rankedPlayers.map((p) => (
                            <div key={p.id} className="flex justify-between items-center p-3 bg-muted rounded-lg text-lg">
                               <div className="flex items-center gap-2 font-bold">
                                    <span>{p.rank}.</span>
                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" temporaryTitle={p.temporaryTitle} />
                                    <span>{p.name}</span>
                               </div>
                               <span className="font-bold text-primary">{p.score} نقطة</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => router.push('/')} className="w-full">العب مرة أخرى</Button>
                </CardFooter>
            </Card>
        )
    };
    
    const renderGameContent = () => {
        switch (game.gameState) {
            case 'lobby': return renderLobby();
            case 'category-selection': return renderCategorySelection();
            case 'answer-submission': return renderAnswerSubmission();
            case 'guessing': return renderGuessing();
            case 'round-results': return renderRoundResults();
            case 'final_results': return renderFinalResults();
            default: return (
                <Card>
                    <CardHeader><CardTitle>لعبة الجواب المفخخ</CardTitle></CardHeader>
                    <CardContent>
                        <p>حالة غير معروفة: {game.gameState}</p>
                        <Loader2 className="animate-spin" />
                    </CardContent>
                </Card>
            );
        }
    };

    return (
        <>
            <AnimatePresence mode="wait">
                <motion.div
                    key={game.gameState + (game.round || 0)}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4 }}
                    className="w-full flex items-center justify-center"
                >
                    {renderGameContent()}
                </motion.div>
            </AnimatePresence>

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
                    {isSubmitting ? "جاري الطرد..." : "نعم، قم بالطرد"}
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
