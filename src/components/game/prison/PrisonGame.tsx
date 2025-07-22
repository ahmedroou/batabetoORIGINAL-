
"use client";

import { Gavel, Send, Copy, Check, LogOut, ArrowRight, UserX, TimerIcon, Award, MessageSquare, ListChecks, CheckCircle2, Shield, Star, Users, Handshake, Drama, Laugh, MessageCircleOff, FileText, Skull, VenetianMask, Trash2, ThumbsUp, ThumbsDown, Trophy, Plus, Settings } from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import * as roomActions from '@/lib/actions/room';
import * as prisonActions from '@/lib/actions/prison';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { AnimatePresence, motion } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { Game, Player, SocialRank } from '@/types';
import { getSocialRankForUser } from '@/lib/actions/user';
import { Slider } from '@/components/ui/slider';


const CountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number; onExpire: () => void }) => {
    const calculateTimeLeft = useCallback(() => Math.round((expiryTimestamp - Date.now()) / 1000), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const onExpireRef = React.useRef(onExpire);
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


interface PrisonGameProps {
    game: Game;
    self: Player;
}

const PrisonSidebar = ({ prisoners }: { prisoners: {player: Player, roundsInPrison: number}[] }) => {
    return (
        <Card className="w-full lg:w-56 xl:w-64 shrink-0 bg-gray-800 text-white border-gray-700">
            <CardHeader className="text-center">
                <Skull className="mx-auto w-10 h-10 text-red-400" />
                <CardTitle className="text-xl">السجناء ({prisoners.length})</CardTitle>
            </CardHeader>
            <CardContent>
                {prisoners.length > 0 ? (
                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                        {prisoners.map(({player, roundsInPrison}) => (
                            <div key={player.id} className="flex flex-col items-center gap-2 text-center bg-gray-900/50 p-2 rounded-lg">
                                <div className="relative">
                                    <PlayerAvatar avatarId={player.avatarId} className="w-16 h-16" />
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
                                        <VenetianMask className="w-8 h-8 text-white/80" />
                                    </div>
                                    <div className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-gray-800">
                                        {roundsInPrison}
                                    </div>
                                </div>
                                <span className="font-bold text-sm line-clamp-1">{player.name}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-gray-400">لا يوجد سجناء حاليًا.</p>
                )}
            </CardContent>
        </Card>
    );
};

const StarRating = ({ rating, setRating, disabled }: { rating: number; setRating: (r: number) => void, disabled: boolean }) => (
    <div className="flex justify-center gap-1">
        {[...Array(5)].map((_, i) => {
            const ratingValue = i + 1;
            return (
                 <motion.div
                    key={i}
                    whileHover={{ scale: disabled ? 1 : 1.2 }}
                    whileTap={{ scale: disabled ? 1 : 0.9 }}
                >
                    <Star
                        key={i}
                        className={cn("w-8 h-8 cursor-pointer transition-colors",
                            ratingValue <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300',
                            disabled && "cursor-not-allowed opacity-70"
                        )}
                        onClick={() => !disabled && setRating(ratingValue)}
                    />
                </motion.div>
            );
        })}
    </div>
);

export function PrisonGame({ game, self }: PrisonGameProps) {
    const { toast } = useToast();
    const router = useRouter();
    const { user, userProfile, socialRanks } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [bidAmount, setBidAmount] = useState<string>('');
    const [liveAnswerInput, setLiveAnswerInput] = useState<string>('');
    const [liveAnswersList, setLiveAnswersList] = useState<string[]>([]);
    const [judgeLiveAnswers, setJudgeLiveAnswers] = useState<Record<string, Record<number, boolean>>>({});
    const [judgeRating, setJudgeRating] = useState(0);
    const [settings, setSettings] = useState(game.prisonState?.settings || { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [hasRated, setHasRated] = useState(false);
    const [playerDecisions, setPlayerDecisions] = useState<Record<string, 'imprison' | 'free'>>({});


    const isHost = game.hostId === self.id;
    const isJudge = game.prisonState?.judgeId === self.id;
    const isContestant = self.role === 'contestant';
    
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);
    const contestants = useMemo(() => game?.players.filter(p => p.role === 'contestant'), [game?.players]);
    const prisonersWithRounds = useMemo(() => {
        const log = game.prisonState?.prisonLog || [];
        return game.players
            .filter(p => p.status === 'in_prison')
            .map(p => ({
                player: p,
                roundsInPrison: log.find(entry => entry.playerId === p.id)?.roundsInPrison || 0
            }));
    }, [game.players, game.prisonState?.prisonLog]);
    const judge = useMemo(() => game?.players.find(p => p.role === 'judge'), [game?.players]);
    const isBidWinner = game.prisonState?.bidWinnerId === self.id;
    const myBid = game.prisonState?.bids?.[self.id];
    
    const serverLiveAnswers = useMemo(() => {
        if (!isJudge) return []; // Only the judge needs to see this
        const winnerId = game.prisonState?.bidWinnerId;
        if (!winnerId) return [];
        const submissions = game.prisonState?.openAuctionSubmissions || {};
        return submissions[winnerId] || [];
    }, [game.prisonState, isJudge]);


    useEffect(() => {
        if (game.gameState === 'judging') {
            setJudgeLiveAnswers({});
            setPlayerDecisions({});
        } else if (game.gameState === 'bidding' || game.gameState === 'open_auction_answering') {
             setLiveAnswersList([]);
             setLiveAnswerInput('');
             setBidAmount(''); // Also reset bid amount
        }
    }, [game.gameState, game.round]);
    
    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };

    const handleLeaveGame = async () => {
        if (!self) return;
        setIsSubmitting(true);
        const result = await roomActions.leaveGame(game.id, self.id);
        if (result.success) {
            sessionStorage.removeItem(`player-${game.id}`);
            router.push('/');
            toast({ title: "لقد غادرت الغرفة." });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleKickPlayer = async () => {
        if (!playerToKick || !isHost) return;
        setIsSubmitting(true);
        const result = await roomActions.kickPlayerFromLobby(game.id, self.id, playerToKick.id);
        if (result.error) {
            toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
        }
        setPlayerToKick(null);
        setIsSubmitting(false);
    };

    const handleStartGame = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await prisonActions.startPrisonGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ في بدء اللعبة", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSubmitOpenAuction = useCallback(async (isTimeout = false) => {
        if (game.prisonState?.openAuctionSubmissions?.[self.id]) return;

        setIsSubmitting(true);
        try {
            const answersToSubmit = isTimeout && liveAnswersList.length === 0 ? [] : liveAnswersList;
            
            const result = await prisonActions.submitOpenAuctionAnswers(game.id, self.id, answersToSubmit);
            if (result.error) {
                toast({ title: "خطأ", description: result.error, variant: "destructive" });
            } else if (!isTimeout) {
                 toast({ title: "تم إرسال إجابتك بنجاح!" });
            }
        } catch (error: any) {
            toast({ title: "خطأ فادح", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, liveAnswersList, toast, game.prisonState?.openAuctionSubmissions]);

    
    const handleJudgeSubmissions = async () => {
        if (!isJudge) return;
        setIsSubmitting(true);
        try {
            await prisonActions.judgeOpenAuction(game.id, self.id, judgeLiveAnswers);
        } catch(error: any) {
            toast({ title: "خطأ في الحكم", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await prisonActions.nextRound(game.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleBid = async (amount?: number) => {
        setIsSubmitting(true);
        try {
            const bid = amount || parseInt(bidAmount, 10);
            if(isNaN(bid) || bid <= 0) {
                 toast({title: "الرجاء إدخال رقم صحيح وموجب للمزايدة.", variant: "destructive"});
                 setIsSubmitting(false);
                 return;
            }
            const result = await prisonActions.submitBid(game.id, self.id, bid);
            if (result.success) {
                toast({ title: "تم تقديم مزايدتك بنجاح!" });
                setBidAmount(''); // Clear input after successful bid
            } else if (result.error) {
                toast({ title: "خطأ في المزايدة", description: result.error, variant: "destructive" });
            }
        } catch(error: any) {
             toast({title: "خطأ", description: error.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleOpenAuctionAnswerSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!liveAnswerInput.trim()) return;
        const newAnswers = [...liveAnswersList, liveAnswerInput.trim()];
        setLiveAnswersList(newAnswers);
        setLiveAnswerInput('');
    };

    const removeOpenAuctionAnswer = (indexToRemove: number) => {
        const newAnswers = liveAnswersList.filter((_, index) => index !== indexToRemove);
        setLiveAnswersList(newAnswers);
    };

    const handleJudgeLiveAnswer = useCallback(async (wasSuccess: boolean) => {
        if (!isJudge) return;
        setIsSubmitting(true);
        try {
            await prisonActions.judgeLiveAnswer(game.id, self.id, wasSuccess);
        } catch (error: any) {
            toast({title: "خطأ في الحكم", description: error.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    }, [isJudge, game.id, self.id, toast]);
    
    const handleFinishGame = () => {
        router.push('/');
    };

    const handleRateJudge = async () => {
        if (judgeRating === 0) return;
        if (hasRated) {
            toast({title: "لقد قمت بالتقييم بالفعل."});
            return;
        }

        setIsSubmitting(true);
        try {
            await prisonActions.rateJudgeAndFinish(game.id, self.id, judgeRating);
            setHasRated(true);
            toast({ title: "شكراً لك!", description: "تم إرسال تقييمك بنجاح." });
        } catch (error: any) {
             toast({title: "خطأ", description: error.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSettingsChange = async (newSettings: Partial<typeof settings>) => {
        const updatedSettings = { ...settings, ...newSettings };
        setSettings(updatedSettings);
        if (isHost) {
            try {
                await prisonActions.updateGameSettings(game.id, self.id, updatedSettings);
            } catch (error: any) {
                toast({ title: "خطأ في تحديث الإعدادات", description: error.message, variant: "destructive" });
            }
        }
    };

    const renderLobby = () => (
        <Card className="w-full max-w-4xl animate-pop-in">
             <CardHeader className="text-center">
                <CardTitle className="text-2xl">لوبي لعبة السجن</CardTitle>
                <CardDescription>اجمع اللاعبين واستعد للمزاد والمحاكمة!</CardDescription>
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
                <div className="md:col-span-2 space-y-4">
                     <div className="flex justify-between items-center">
                        <Label className='font-bold text-base'>إعدادات اللعبة</Label>
                        {isHost && (
                           <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                               <Settings className={cn("w-5 h-5", isSettingsOpen && "animate-spin")} />
                           </Button>
                        )}
                     </div>
                     {isSettingsOpen && (
                           <motion.div 
                               initial={{ opacity: 0, height: 0 }}
                               animate={{ opacity: 1, height: 'auto' }}
                               exit={{ opacity: 0, height: 0 }}
                               className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                           >
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="rounds-setting">جولات</Label>
                                        <Input id="rounds-setting" type="number" value={settings.rounds} disabled={!isHost} onChange={e => handleSettingsChange({ rounds: parseInt(e.target.value, 10) || 1 })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="bidding-time">وقت المزاد (ث)</Label>
                                        <Input id="bidding-time" type="number" value={settings.biddingTime} disabled={!isHost} onChange={e => handleSettingsChange({ biddingTime: parseInt(e.target.value, 10) || 30 })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="answering-time">وقت الإجابة (ث)</Label>
                                        <Input id="answering-time" type="number" value={settings.answeringTime} disabled={!isHost} onChange={e => handleSettingsChange({ answeringTime: parseInt(e.target.value, 10) || 45 })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="judging-time">وقت الحكم (ث)</Label>
                                        <Input id="judging-time" type="number" value={settings.judgingTime} disabled={!isHost} onChange={e => handleSettingsChange({ judgingTime: parseInt(e.target.value, 10) || 60 })} />
                                    </div>
                                </div>
                           </motion.div>
                     )}
                </div>

                <div className="flex flex-col">
                    <h3 className="font-bold text-base mb-2">اللاعبون ({activePlayers.length})</h3>
                    <div className="space-y-2 flex-grow">
                        {activePlayers.map(p => {
                            const playerRank = getSocialRankForUser(p.leaderboardPoints, socialRanks);
                            const RankIcon = playerRank?.icon;
                            return (
                            <div key={p.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                    <div>
                                     <p className="font-bold">{p.name}</p>
                                        {RankIcon && (
                                             <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                                                 <RankIcon className="w-3 h-3 text-amber-500" />
                                                 <span>{playerRank.name}</span>
                                             </div>
                                        )}
                                    </div>
                                </div>
                                {isHost && p.id !== self.id && (
                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setPlayerToKick(p)}>
                                        <UserX />
                                    </Button>
                                )}
                            </div>
                        )})}
                    </div>
                    <div className="flex flex-col gap-2 p-0 mt-4">
                        {isHost ? (
                            <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 3} className="w-full">
                                <ArrowRight className="mr-2 h-4 w-4" />
                                {isSubmitting ? 'جاري البدء...' : activePlayers.length < 3 ? "تحتاج 3 لاعبين على الأقل" : "ابدأ اللعبة"}
                            </Button>
                        ) : (
                            <p className="w-full text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
                        )}
                        <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                           <LogOut /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    const renderOpenAuctionAnswering = () => {
        const hasSubmitted = !!game.prisonState?.openAuctionSubmissions?.[self.id];

        if (isJudge) {
            return (
                <Card className="w-full max-w-lg text-center animate-pop-in">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 justify-center"><Gavel/> أنت القاضي</CardTitle>
                        <CardDescription>في انتظار المتسابقين لتقديم إجاباتهم...</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card className="w-full max-w-lg relative animate-pop-in">
                 {game.prisonState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={() => handleSubmitOpenAuction(true)}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>سؤال المزاد المفتوح</CardTitle>
                    <CardDescription className="text-xl font-bold pt-2">{game.prisonState?.currentQuestion?.text}</CardDescription>
                </CardHeader>
                <CardContent>
                    {hasSubmitted ? (
                        <div className="text-center p-4 rounded-lg bg-green-100 text-green-800">
                            <p className="font-semibold">تم إرسال إجابتك! في انتظار بقية اللاعبين...</p>
                        </div>
                    ) : (
                           <div className="space-y-4">
                                <form onSubmit={handleOpenAuctionAnswerSubmit} className="flex gap-2">
                                    <Input 
                                        placeholder='اكتب إجابة...'
                                        value={liveAnswerInput}
                                        onChange={(e) => setLiveAnswerInput(e.target.value)}
                                        disabled={isSubmitting}
                                    />
                                    <Button type="submit" disabled={isSubmitting || !liveAnswerInput.trim()}>إضافة</Button>
                                </form>
                                <ScrollArea className="h-48 p-2 border rounded-md bg-muted/50">
                                    {liveAnswersList.length > 0 ? (
                                        <div className='space-y-2'>
                                        {liveAnswersList.map((answer, index) => (
                                            <div key={index} className="flex justify-between items-center p-2 bg-background rounded-md">
                                                <span className='font-semibold'>{answer}</span>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeOpenAuctionAnswer(index)}>
                                                    <Trash2 className="w-4 h-4"/>
                                                </Button>
                                            </div>
                                        ))}
                                        </div>
                                    ) : (
                                        <p className="text-center text-muted-foreground pt-4">قائمة إجاباتك فارغة.</p>
                                    )}
                                </ScrollArea>
                                <Button onClick={() => handleSubmitOpenAuction(false)} disabled={isSubmitting || liveAnswersList.length === 0} className="w-full">
                                    <Send className="mr-2" /> {isSubmitting ? 'جاري الإرسال...' : 'إرسال الإجابات النهائية'}
                                </Button>
                            </div>
                    )}
                </CardContent>
            </Card>
        );
    }
    
    const renderJudging = () => {
        const submissions = game.prisonState?.openAuctionSubmissions || {};
        const playersToJudge = contestants.filter(p => submissions.hasOwnProperty(p.id));

        return (
            <div className="flex w-full max-w-7xl gap-6">
                <div className="flex-grow">
                    <Card className="w-full animate-pop-in relative">
                         {game.prisonState?.timerEndsAt && isJudge && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                                <CountdownTimer 
                                    expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                                    onExpire={() => prisonActions.endJudgingByTimer(game.id, judge!.id)}
                                />
                            </div>
                        )}
                        <CardHeader className="text-center pt-20">
                             <Gavel className="mx-auto w-12 h-12 text-primary" />
                            <CardTitle className="text-3xl">منصة القضاء</CardTitle>
                            <CardDescription>
                                {isJudge ? 'حدد الإجابات الصحيحة لكل لاعب. الفشل والنجاح سيُحتسب تلقائيًا.' : 'القاضي يقوم بمراجعة الإجابات...'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[65vh] pr-4">
                                <div className="space-y-4">
                                {playersToJudge.map(player => {
                                    const playerAnswers = submissions[player.id] || [];
                                    const playerJudgedAnswers = judgeLiveAnswers[player.id] || {};
                                    const correctCount = Object.values(playerJudgedAnswers).filter(Boolean).length;
                                    
                                    return (
                                        <Card key={player.id} className="p-4 bg-muted overflow-hidden">
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center gap-3 text-lg font-bold">
                                                    <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10"/>
                                                    <span>إجابات: {player.name}</span>
                                                </div>
                                                <span className="font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full text-sm">
                                                    {correctCount}
                                                </span>
                                            </div>
                                            <div className="space-y-2 mb-2">
                                                {playerAnswers.length > 0 ? (
                                                    playerAnswers.map((answer, index) => (
                                                        <div key={index} className="flex items-center space-x-2 space-x-reverse bg-background p-2 rounded-lg border">
                                                            <Checkbox
                                                                id={`${player.id}-${index}`}
                                                                checked={!!(judgeLiveAnswers[player.id] && judgeLiveAnswers[player.id][index])}
                                                                onCheckedChange={(checked) => prisonActions.judgeAnswerLive(game.id, judge!.id, player.id, index, !!checked)}
                                                                disabled={!isJudge || isSubmitting}
                                                                className="w-6 h-6 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-600"
                                                            />
                                                            <label htmlFor={`${player.id}-${index}`} className="flex-grow font-medium text-base">{answer}</label>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-sm text-center text-muted-foreground p-4 bg-background rounded-lg">لم يقدم اللاعب أي إجابات.</p>
                                                )}
                                            </div>
                                        </Card>
                                    )
                                })}
                                </div>
                            </ScrollArea>
                        </CardContent>
                        {isJudge && (
                             <CardFooter>
                                <Button onClick={handleJudgeSubmissions} disabled={isSubmitting} className="w-full text-lg h-12">
                                    <Gavel className="mr-2"/> 
                                    {isSubmitting ? 'جاري الحفظ...' : `تأكيد الحكم`}
                                </Button>
                            </CardFooter>
                        )}
                    </Card>
                </div>
                 <PrisonSidebar prisoners={prisonersWithRounds} />
            </div>
        );
    }
    
    const renderBidding = () => {
        const bids = game.prisonState?.bids || {};
        const hasBid = !!bids[self.id];
        const highestBid = Object.values(bids).reduce((max, bid) => Math.max(max, bid), 0);
        const tieBreakerContestants = game.prisonState?.tieBreakerContestants || [];
        
        const canBid = isContestant && (game.gameState === 'bidding' || (game.gameState === 'bidding_tiebreaker' && tieBreakerContestants.includes(self.id)));
        
        return (
            <Card className="w-full max-w-lg animate-pop-in relative">
                {game.prisonState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={() => prisonActions.endBiddingByTimer(game.id)}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>{game.gameState === 'bidding_tiebreaker' ? "جولة كسر التعادل" : "سؤال المزاد"}</CardTitle>
                    <CardDescription className="text-xl font-bold pt-2">{game.prisonState?.currentQuestion?.text}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                        <p className="text-muted-foreground">أعلى مزايدة حاليًا</p>
                        <p className="text-4xl font-bold text-primary">{highestBid}</p>
                    </div>
                    
                    {isJudge ? (
                        <p className="text-center text-muted-foreground p-2 bg-muted rounded-md animate-pulse">تراقب المزاد...</p>
                    ) : canBid ? ( 
                        hasBid ? (
                            <p className="text-center text-green-500 font-bold p-2 bg-green-100 rounded-md">لقد قمت بالمزايدة بالفعل في هذه الجولة.</p>
                        ) : (
                           <div className="space-y-2">
                                <Label htmlFor="bid-amount">{myBid ? `مزايدتك الحالية: ${myBid}` : 'مزايدتك'}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="bid-amount" 
                                        type="number" 
                                        placeholder={`أعلى من ${highestBid}`}
                                        value={bidAmount}
                                        onChange={e => setBidAmount(e.target.value)}
                                        disabled={isSubmitting}
                                    />
                                    <Button onClick={() => handleBid()} disabled={isSubmitting}>
                                        {isSubmitting ? '...' : 'مزايدة'}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-4 gap-2 pt-2">
                                    {[3, 5, 8, 10].map(val => (
                                        <Button key={val} variant="outline" size="sm" onClick={() => handleBid(val)} disabled={isSubmitting}>
                                            {val}
                                        </Button>
                                    ))}
                                </div>
                           </div>
                        )
                    ) : ( 
                           <p className="text-center text-muted-foreground p-2 bg-muted rounded-md">
                               {'لا يمكنك المزايدة في هذه الجولة.'}
                           </p>
                    )}

                    <div className="space-y-2 pt-4 border-t">
                        <h4 className="font-bold">المزايدون:</h4>
                        {contestants.map(p => {
                            const playerBid = bids[p.id];
                            const isHighestBidder = playerBid && playerBid === highestBid;
                             return (
                             <div key={p.id} className={cn("flex justify-between items-center p-2 rounded-md", isHighestBidder ? 'bg-primary/10 border border-primary' : 'bg-background')}>
                                 <div className="flex items-center gap-2">
                                     <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                     <span>{p.name} {p.status === 'in_prison' && '(سجين)'}</span>
                                 </div>
                                 {playerBid ? (
                                     <span className="text-sm font-bold text-primary">{playerBid}</span>
                                 ) : (
                                     <span className="text-xs text-muted-foreground animate-pulse">يفكر...</span>
                                 )}
                             </div>
                         )})}
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    const renderAnswering = () => {
           const winner = game.players.find(p => p.id === game.prisonState?.bidWinnerId);
           if (!winner) return <p>خطأ: لم يتم العثور على الفائز بالمزاد.</p>;

           const bidAmount = game.prisonState.bids?.[winner.id] || 0;
           const currentJudgedAnswers = judgeLiveAnswers[winner.id] || {};
           const correctCount = Object.values(currentJudgedAnswers).filter(Boolean).length;
           const isTimeUp = !game.prisonState?.timerEndsAt;
           const answersToShow = isJudge ? serverLiveAnswers : liveAnswersList;
           
        return (
            <Card className="w-full max-w-3xl animate-pop-in relative">
                 <CardHeader className="text-center pt-8">
                    <div className='flex items-center justify-between'>
                        <div />
                        <div>
                             <CardTitle className="text-2xl">دور اللاعب {winner.name}</CardTitle>
                             <CardDescription className="text-lg">
                                 عليه/عليها ذكر {bidAmount} إجابة صحيحة!
                             </CardDescription>
                        </div>
                        {game.prisonState?.timerEndsAt && (
                            <CountdownTimer
                                expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                                onExpire={() => prisonActions.endAnsweringByTimer(game.id)}
                            />
                        )}
                    </div>
                     <p className="font-bold text-foreground text-xl mt-4 bg-muted p-2 rounded-md">{game.prisonState?.currentQuestion?.text}</p>
                   </CardHeader>
                   <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                        <Card className="bg-muted/50 p-4">
                           <CardTitle className="text-lg mb-2">الإجابات المقدمة ({answersToShow.length})</CardTitle>
                            <ScrollArea className="h-64">
                               <div className="space-y-2 pr-2">
                                {answersToShow.map((ans, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-2 bg-background rounded-md border">
                                        <Checkbox 
                                            id={`judge-check-${idx}`}
                                            checked={!!(judgeLiveAnswers[winner.id] && judgeLiveAnswers[winner.id][idx])}
                                            disabled={!isJudge || isSubmitting}
                                            onCheckedChange={(checked) => {}}
                                        />
                                        <label htmlFor={`judge-check-${idx}`} className='font-semibold flex-grow'>{ans}</label>
                                    </div>
                                ))}
                               </div>
                            </ScrollArea>
                        </Card>
                        <div>
                        {isBidWinner ? (
                            isTimeUp ? (
                                <p className="p-4 text-center bg-red-100 text-red-800 rounded-lg animate-pulse">انتهى الوقت! في انتظار حكم القاضي...</p>
                            ) : (
                                <form className="space-y-2">
                                    <Label htmlFor="live-answer-input">أضف إجابة</Label>
                                    <div className="flex gap-2">
                                        <Input 
                                            id="live-answer-input"
                                            placeholder="اكتب إجابتك هنا..."
                                            value={liveAnswerInput}
                                            onChange={e => setLiveAnswerInput(e.target.value)}
                                            disabled={isSubmitting}
                                        />
                                        <Button type="submit" size="icon" disabled={isSubmitting || !liveAnswerInput.trim()}><Plus/></Button>
                                    </div>
                                    <div className="text-xs text-muted-foreground">لديك {answersToShow.length} إجابة من {bidAmount}</div>
                                </form>
                            )
                        ) : (
                           <Card className="p-4 bg-yellow-100/60 border-yellow-300">
                               <CardTitle className="text-lg mb-2 text-yellow-900">أدوات القاضي</CardTitle>
                               <div className="space-y-3">
                                   <div className="text-base font-semibold">الإجابات الصحيحة: <span className="font-bold text-green-700">{correctCount}</span></div>
                                   <div className="text-base font-semibold">المطلوب للنجاح: <span className="font-bold text-blue-700">{bidAmount}</span></div>
                                   {isJudge && (
                                   <div className="grid grid-cols-2 gap-2">
                                       <Button onClick={() => handleJudgeLiveAnswer(true)} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                                           <ThumbsUp /> {isSubmitting ? "..." : "إعلان النجاح"}
                                       </Button>
                                       <Button onClick={() => handleJudgeLiveAnswer(false)} disabled={isSubmitting} variant="destructive">
                                           <ThumbsDown /> {isSubmitting ? "..." : "إعلان الفشل"}
                                       </Button>
                                   </div>
                                   )}
                               </div>
                           </Card>
                        )}
                        </div>
                    </div>
                   </CardContent>
            </Card>
        )
    };


    const renderResults = () => {
        const result = game.prisonState?.lastRoundResult;
        if (!result) return <p>جاري تحميل النتائج...</p>;

        const playerRoundsInPrison = (playerId: string) => {
            const log = game.prisonState?.prisonLog || [];
            return log.find(entry => entry.playerId === playerId)?.roundsInPrison || 0;
        };

        return (
            <Card className="w-full max-w-lg text-center animate-pop-in">
                <CardHeader>
                    <CardTitle>نتيجة الجولة</CardTitle>
                    {result.executedPlayerName && (
                        <CardDescription className="text-lg font-bold text-destructive p-2 bg-destructive/10 rounded-md">
                            تم إعدام {result.executedPlayerName} لبقائه في السجن 3 جولات!
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="p-4 bg-muted rounded-lg">
                        <p className="text-xl font-bold">{result.message}</p>
                    </div>
                    <div>
                        <h3 className="font-bold">تغيرات النقاط:</h3>
                         <div className="space-y-1 mt-2">
                            {result.points && Object.keys(result.points).length > 0 ? Object.entries(result.points).map(([playerId, pointsData]) => {
                                const player = game.players.find(p => p.id === playerId);
                                if (!player || pointsData.points === 0) return null;
                                const roundsInPrison = playerRoundsInPrison(playerId);
                                const isFinalWarning = roundsInPrison === 2;

                                return (
                                <div key={playerId} className={cn("p-2 rounded-md", isFinalWarning ? "bg-red-100 border border-red-500 animate-pulse" : "bg-background")}>
                                     <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8"/>
                                            <div className="text-right">
                                                <span className="font-semibold">{player.name}</span>
                                                <div className="flex gap-2 text-xs font-mono">
                                                    {pointsData.breakdown.map((item, i) => <span key={i} className={cn(item.points > 0 ? "text-green-500" : "text-red-500")}>({item.reason} {item.points > 0 ? `+${item.points}`: item.points})</span>)}
                                                </div>
                                            </div>
                                        </div>
                                        <span className={cn('font-bold', pointsData.points > 0 ? 'text-green-500' : 'text-red-500')}>
                                            {pointsData.points > 0 ? `+${pointsData.points}` : pointsData.points}
                                        </span>
                                    </div>
                                    {isFinalWarning && <p className="text-xs text-red-600 font-bold mt-1">تحذير: هذه فرصتك الأخيرة للهروب!</p>}
                                </div>
                                )
                            }) : <p className='text-sm text-muted-foreground'>لا توجد تغييرات في النقاط</p>}
                         </div>
                    </div>
                </CardContent>
                 <CardFooter>
                    {isHost && (
                        <Button onClick={handleNextRound} disabled={isSubmitting}>
                            {isSubmitting ? 'جاري التحميل...' : 'الجولة التالية'}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );
    };

     const renderFinalResults = () => {
         const contestantsAndJudge = game.players.filter(p => p.role !== 'executed');
         const sortedPlayers = contestantsAndJudge
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

         const winner = rankedPlayers.find(p => p.role === 'contestant');
         
         return (
             <Card className="w-full max-w-2xl animate-pop-in">
                 <CardHeader className="text-center">
                     <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                     <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                     {winner && <CardDescription className="text-2xl font-bold">الفائز هو {winner.name}!</CardDescription>}
                 </CardHeader>
                 <CardContent className="space-y-4">
                      <div className="space-y-2">
                         {rankedPlayers.map((p) => (
                             <div key={p.id} className="flex justify-between items-center p-3 bg-muted rounded-lg text-lg">
                                <div className="flex items-center gap-2 font-bold">
                                     <span>{p.rank}.</span>
                                     <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                     <span>{p.name} {p.role === 'judge' && '(القاضي)'}</span>
                                </div>
                                <span className="font-bold text-primary">{p.score} نقطة</span>
                             </div>
                         ))}
                      </div>
                      {self.role !== 'judge' && (
                          <div className="pt-4 border-t text-center space-y-3">
                              <h3 className="font-bold mb-2">قيّم أداء القاضي ({judge?.name})</h3>
                               <div className="flex flex-col items-center gap-2">
                                   <StarRating rating={judgeRating} setRating={setJudgeRating} disabled={hasRated} />
                               </div>
                          </div>
                      )}
                 </CardContent>
                 <CardFooter className="flex-col gap-2">
                      {self.role !== 'judge' && (
                        <Button onClick={handleRateJudge} disabled={isSubmitting || judgeRating === 0 || hasRated} className="w-full">
                            {isSubmitting ? "جاري الإرسال..." : hasRated ? "تم التقييم" : "أرسل التقييم"}
                        </Button>
                      )}
                     <Button onClick={handleFinishGame} variant="outline" className="w-full">
                         العودة للرئيسية
                     </Button>
                 </CardFooter>
             </Card>
         )
     };
     
     const renderJudgeLeft = () => (
         <Card className="w-full max-w-lg text-center animate-pop-in">
              <CardHeader>
                 <CardTitle className="text-3xl text-destructive">لقد غادر القاضي!</CardTitle>
                 <CardDescription>انتهت اللعبة بشكل مفاجئ. سيتم تسجيل النتائج الحالية.</CardDescription>
              </CardHeader>
              <CardContent>
                  <p>سيتم توجيهك إلى الصفحة الرئيسية.</p>
              </CardContent>
              <CardFooter>
                  <Button onClick={() => router.push('/')} className="w-full">العودة للرئيسية</Button>
              </CardFooter>
         </Card>
     );


    // Main render logic based on gameState
    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby': return renderLobby();
            case 'open_auction_answering': return renderOpenAuctionAnswering();
            case 'bidding': case 'bidding_tiebreaker': return renderBidding();
            case 'answering': return renderAnswering();
            case 'judging': return renderJudging();
            case 'results': return renderResults();
            case 'final_results': return renderFinalResults();
            case 'judge_left': return renderJudgeLeft();
            default: return <p>حالة غير معروفة: {game.gameState}</p>;
        }
    }


    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={game.gameState}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full flex items-center justify-center p-4"
            >
                {renderContent()}
                <AlertDialog open={!!playerToKick} onOpenChange={(open) => !open && setPlayerToKick(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                            <AlertDialogDescription>
                                هل تريد حقًا طرد اللاعب "{playerToKick?.name}" من الغرفة؟
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                                {isSubmitting ? "جاري الطرد..." : "نعم، قم بطرده"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </motion.div>
        </AnimatePresence>
    );
}
