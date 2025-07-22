

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
    const { user, socialRanks } = useAuth();
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
    
    const hasRated = game.prisonState?.lastRoundResult?.ratedBy?.includes(self.id);

    const isHost = game.hostId === self.id;
    const isJudge = game.prisonState?.judgeId === self.id;
    const isContestant = self.role === 'contestant';
    
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);
    const contestants = useMemo(() => game?.players.filter(p => p.role === 'contestant'), [game?.players]);
    const judge = useMemo(() => game?.players.find(p => p.role === 'judge'), [game?.players]);

    const prisonersWithRounds = useMemo(() => {
        const history = game.prisonState?.prisonHistory || {};
        return game.players
            .filter(p => p.status === 'in_prison')
            .map(p => ({
                player: p,
                roundsInPrison: history[p.id]?.inPrison || 0
            }));
    }, [game.players, game.prisonState?.prisonHistory]);

    useEffect(() => {
        if (game.gameState === 'judging') {
            setJudgeLiveAnswers(game.prisonState?.judgedAnswers || {});
        } else if (game.gameState === 'open_auction_answering' || game.gameState === 'answering') {
             setLiveAnswersList([]);
             setLiveAnswerInput('');
        } else if (game.gameState === 'bidding') {
             setBidAmount('');
        }
    }, [game.gameState, game.round]);
    
    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };

    const handleLeaveGame = async () => {
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
        if (result.error) toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
        else toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
        setPlayerToKick(null);
        setIsSubmitting(false);
    };

    const handleStartGame = async () => {
        setIsSubmitting(true);
        try {
            await prisonActions.startPrisonGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ في بدء اللعبة", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSettingsChange = async (newSettings: Partial<typeof settings>) => {
        const updatedSettings = { ...settings, ...newSettings };
        setSettings(updatedSettings);
        if (isHost) {
            await prisonActions.updateGameSettings(game.id, self.id, updatedSettings);
        }
    };

    const handleBid = async (amount?: number) => {
        setIsSubmitting(true);
        const bidValue = amount || parseInt(bidAmount, 10);
        if(isNaN(bidValue) || bidValue <= 0) {
             toast({title: "الرجاء إدخال رقم صحيح وموجب للمزايدة.", variant: "destructive"});
             setIsSubmitting(false);
             return;
        }
        const result = await prisonActions.submitBid(game.id, self.id, bidValue);
        if (result.success) {
            toast({ title: "تم تقديم مزايدتك بنجاح!" });
            setBidAmount('');
        } else if (result.error) {
            toast({ title: "خطأ في المزايدة", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleOpenAuctionAnswerSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!liveAnswerInput.trim()) return;
        setLiveAnswersList(prev => [...prev, liveAnswerInput.trim()]);
        setLiveAnswerInput('');
    };

    const removeOpenAuctionAnswer = (indexToRemove: number) => {
        setLiveAnswersList(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleFinishAnswering = useCallback(async (isTimeout = false) => {
        if (game.prisonState?.openAuctionSubmissions?.[self.id]) return;
        setIsSubmitting(true);
        const answersToSubmit = isTimeout && liveAnswersList.length === 0 ? [] : liveAnswersList;
        const result = await prisonActions.submitOpenAuctionAnswers(game.id, self.id, answersToSubmit);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        } else if (!isTimeout) {
            toast({ title: "تم إرسال إجابتك بنجاح!" });
        }
        setIsSubmitting(false);
    }, [game.id, self.id, liveAnswersList, toast, game.prisonState?.openAuctionSubmissions]);

    const handleJudgeLiveAnswerToggle = async (playerId: string, answerIndex: number, isCorrect: boolean) => {
        if (!isJudge || isSubmitting) return;
        const newJudged = { ...judgeLiveAnswers };
        if (!newJudged[playerId]) newJudged[playerId] = {};
        newJudged[playerId][answerIndex] = isCorrect;
        setJudgeLiveAnswers(newJudged);
        // Fire-and-forget update to the server
        prisonActions.judgeAnswerLive(game.id, self.id, playerId, answerIndex, isCorrect);
    };

    const handleFinalizeJudging = async () => {
        if (!isJudge) return;
        setIsSubmitting(true);
        try {
            await prisonActions.judgeOpenAuction(game.id, self.id);
        } catch(error: any) {
            toast({ title: "خطأ في الحكم", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        await prisonActions.nextRound(game.id).catch(e => toast({title: "خطأ", description: e.message, variant: "destructive"}));
        setIsSubmitting(false);
    };

    const handleRateJudge = async () => {
        if (judgeRating === 0 || hasRated) return;
        setIsSubmitting(true);
        const result = await prisonActions.rateJudgeAndFinish(game.id, self.id, judgeRating);
        if (result.success) {
            toast({ title: "شكراً لك!", description: "تم إرسال تقييمك." });
        } else if(result.error) {
            toast({title: "خطأ", description: result.error, variant: "destructive"});
        }
        setIsSubmitting(false);
    };

    const handleExecutePlayer = async (playerId: string) => {
        if (!isJudge) return;
        setIsSubmitting(true);
        const result = await prisonActions.executePlayer(game.id, self.id, playerId);
        if (result.success) toast({ title: "تم تنفيذ الحكم!" });
        else toast({ title: "خطأ", description: result.error, variant: "destructive" });
        setIsSubmitting(false);
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
                               className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                           >
                                <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
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
                            onExpire={() => handleFinishAnswering(true)}
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
                                <Button onClick={() => handleFinishAnswering(false)} disabled={isSubmitting || liveAnswersList.length === 0} className="w-full">
                                    <Send className="mr-2" /> {isSubmitting ? 'جاري الإرسال...' : 'إرسال الإجابات النهائية'}
                                </Button>
                            </div>
                    )}
                </CardContent>
            </Card>
        );
    }
    
    const renderBidding = () => {
        const bids = game.prisonState?.bids || {};
        const hasBid = !!bids[self.id];
        const highestBid = Object.values(bids).reduce((max, bid) => Math.max(max, bid), 0);
        const canBid = isContestant;

        return (
            <Card className="w-full max-w-lg animate-pop-in relative">
                {game.prisonState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={() => prisonActions.endTimerAndProceed(game.id)}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>{game.gameState === 'bidding_tiebreaker' ? "جولة كسر التعادل" : "سؤال المزاد"}</CardTitle>
                    <CardDescription className="text-xl font-bold pt-2">{game.prisonState?.currentQuestion?.text}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     {isJudge ? (
                        <p className="text-center text-muted-foreground p-2 bg-muted rounded-md animate-pulse">أنت القاضي، تراقب المزاد...</p>
                    ) : !canBid ? (
                         <p className="text-center text-muted-foreground p-2 bg-muted rounded-md">لا يمكنك المزايدة في هذه الجولة.</p>
                    ) : hasBid ? (
                        <p className="text-center text-green-500 font-bold p-2 bg-green-100 rounded-md">لقد قمت بالمزايدة بالفعل في هذه الجولة.</p>
                    ) : (
                       <div className="space-y-2">
                            <div className="text-center p-4 bg-muted rounded-lg">
                                <p className="text-muted-foreground">أعلى مزايدة حاليًا</p>
                                <p className="text-4xl font-bold text-primary">{highestBid}</p>
                            </div>
                            <Label htmlFor="bid-amount">مزايدتك</Label>
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
                    )}
                </CardContent>
            </Card>
        );
    };

    const renderAnswering = () => {
           const winner = game.players.find(p => p.id === game.prisonState?.bidWinnerId);
           if (!winner) return <p>خطأ: لم يتم العثور على الفائز بالمزاد.</p>;

           const bidAmount = game.prisonState.bids?.[winner.id] || 0;
           const isBidWinner = self.id === winner.id;
           
           const isTimeUp = !game.prisonState?.timerEndsAt;
           
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
                                onExpire={() => prisonActions.endTimerAndProceed(game.id)}
                            />
                        )}
                    </div>
                     <p className="font-bold text-foreground text-xl mt-4 bg-muted p-2 rounded-md">{game.prisonState?.currentQuestion?.text}</p>
                   </CardHeader>
                   <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                        <Card className="bg-muted/50 p-4">
                           <CardTitle className="text-lg mb-2">الإجابات المقدمة ({liveAnswersList.length})</CardTitle>
                            <ScrollArea className="h-64">
                               <div className="space-y-2 pr-2">
                                {liveAnswersList.map((ans, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-2 bg-background rounded-md border">
                                        <span className='font-semibold flex-grow'>{ans}</span>
                                    </div>
                                ))}
                               </div>
                            </ScrollArea>
                        </Card>
                        <div className="flex flex-col justify-center">
                        {isBidWinner ? (
                            isTimeUp ? (
                                <p className="p-4 text-center bg-red-100 text-red-800 rounded-lg animate-pulse">انتهى الوقت! في انتظار حكم القاضي...</p>
                            ) : (
                                <form onSubmit={handleOpenAuctionAnswerSubmit} className="space-y-2">
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
                                    <div className="text-xs text-muted-foreground">لديك {liveAnswersList.length} إجابة من {bidAmount}</div>
                                </form>
                            )
                        ) : isJudge ? (
                           <Card className="p-4 bg-yellow-100/60 border-yellow-300">
                               <CardTitle className="text-lg mb-2 text-yellow-900">أدوات القاضي</CardTitle>
                               <div className="space-y-3">
                                   <div className="text-base font-semibold">الإجابات الصحيحة: <span className="font-bold text-green-700">{liveAnswersList.length}</span></div>
                                   <div className="text-base font-semibold">المطلوب للنجاح: <span className="font-bold text-blue-700">{bidAmount}</span></div>
                                   <div className="grid grid-cols-2 gap-2">
                                       <Button onClick={() => prisonActions.judgeLiveAnswer(game.id, self.id, true)} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                                           <ThumbsUp /> {isSubmitting ? "..." : "إعلان النجاح"}
                                       </Button>
                                       <Button onClick={() => prisonActions.judgeLiveAnswer(game.id, self.id, false)} disabled={isSubmitting} variant="destructive">
                                           <ThumbsDown /> {isSubmitting ? "..." : "إعلان الفشل"}
                                       </Button>
                                   </div>
                               </div>
                           </Card>
                        ) : (
                           <p className="p-4 text-center bg-blue-100 text-blue-800 rounded-lg animate-pulse">في انتظار حكم القاضي...</p>
                        )}
                        </div>
                    </div>
                   </CardContent>
            </Card>
        )
    };

    const renderJudging = () => {
        const submissions = game.prisonState?.openAuctionSubmissions || {};
        const contestantsWithSubmissions = contestants.filter(p => submissions[p.id]);

        if (!isJudge) {
             return (
                <Card className="w-full max-w-lg text-center animate-pop-in">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 justify-center"><Gavel/> مرحلة الحكم</CardTitle>
                        <CardDescription>يقوم القاضي الآن بمراجعة الإجابات...</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card className="w-full max-w-4xl relative animate-pop-in">
                 {game.prisonState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={() => handleFinalizeJudging()}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>مرحلة الحكم</CardTitle>
                    <CardDescription>
                        راجع إجابات اللاعبين وحدد الصحيح منها.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-96">
                        <div className="space-y-4 pr-4">
                        {contestantsWithSubmissions.map(player => {
                            const correctCount = Object.values(judgeLiveAnswers[player.id] || {}).filter(Boolean).length;
                            return (
                            <div key={player.id} className="p-3 bg-muted rounded-lg">
                                <h3 className="font-bold text-lg mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8"/>
                                        إجابات {player.name}
                                    </div>
                                    <span className="text-sm font-bold text-green-600">صحيحة: {correctCount}</span>
                                </h3>
                                <div className="space-y-2">
                                    {(submissions[player.id] || []).map((answer, i) => (
                                        <div key={i} className="flex items-center justify-between p-2 bg-background rounded-md">
                                            <span>{answer}</span>
                                            <div className="flex gap-2">
                                                 <Button 
                                                    size="sm" 
                                                    variant={judgeLiveAnswers[player.id]?.[i] === true ? "default" : "outline"}
                                                    className={cn("bg-green-100 text-green-700 border-green-300 hover:bg-green-200", judgeLiveAnswers[player.id]?.[i] === true && "bg-green-500 text-white")}
                                                    onClick={() => handleJudgeLiveAnswerToggle(player.id, i, true)}
                                                 >
                                                    صح
                                                 </Button>
                                                 <Button 
                                                    size="sm" 
                                                    variant={judgeLiveAnswers[player.id]?.[i] === false ? "destructive" : "outline"}
                                                     className={cn("bg-red-100 text-red-700 border-red-300 hover:bg-red-200", judgeLiveAnswers[player.id]?.[i] === false && "bg-red-500 text-white")}
                                                    onClick={() => handleJudgeLiveAnswerToggle(player.id, i, false)}
                                                 >
                                                    خطأ
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )})}
                        </div>
                    </ScrollArea>
                </CardContent>
                <CardFooter>
                    <Button className="w-full" onClick={handleFinalizeJudging} disabled={isSubmitting}>
                        {isSubmitting ? "جاري الحساب..." : "إنهاء الحكم وإظهار النتائج"}
                    </Button>
                </CardFooter>
            </Card>
        )
    };

    const renderResults = () => {
        const result = game.prisonState?.lastRoundResult;
        if (!result) return <p>جاري تحميل النتائج...</p>;

        const playerRoundsInPrison = (playerId: string) => game.prisonState?.prisonHistory?.[playerId]?.inPrison || 0;

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
                                const rounds = playerRoundsInPrison(playerId);
                                const isFinalWarning = player.status === 'in_prison' && rounds === 2;

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
                      {isContestant && (
                          <div className="pt-4 border-t text-center space-y-3">
                              <h3 className="font-bold mb-2">قيّم أداء القاضي ({judge?.name})</h3>
                               <div className="flex flex-col items-center gap-2">
                                   <StarRating rating={judgeRating} setRating={setJudgeRating} disabled={!!hasRated} />
                                   <Button onClick={handleRateJudge} disabled={isSubmitting || judgeRating === 0 || !!hasRated} size="sm" className="mt-2">
                                       {isSubmitting ? "جاري الإرسال..." : hasRated ? "تم التقييم" : "أرسل التقييم"}
                                   </Button>
                               </div>
                          </div>
                      )}
                 </CardContent>
                 <CardFooter>
                     <Button onClick={() => router.push('/')} variant="outline" className="w-full">
                         العودة للرئيسية
                     </Button>
                 </CardFooter>
             </Card>
         )
     };

    if (game.gameState === 'lobby') {
        return (
        <>
            {renderLobby()}
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
        </>
        )
    }

    const renderContent = () => {
        switch (game.gameState) {
            case 'open_auction_answering': return renderOpenAuctionAnswering();
            case 'bidding': case 'bidding_tiebreaker': return renderBidding();
            case 'answering': return renderAnswering();
            case 'judging': return renderJudging();
            case 'results': return renderResults();
            case 'final_results': return renderFinalResults();
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
            </motion.div>
        </AnimatePresence>
    );
}
