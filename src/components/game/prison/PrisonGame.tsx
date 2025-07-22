

"use client";

import { Gavel, Send, Copy, Check, LogOut, ArrowRight, TimerIcon, Award, MessageSquare, ListChecks, CheckCircle2, Shield, Star, Users, Handshake, Drama, Laugh, MessageCircleOff, FileText, Skull, VenetianMask, Trash2, ThumbsUp, ThumbsDown, Trophy, Plus, Settings, UserX, UserMinus, UserCheck, RefreshCw, BarChartHorizontalBig } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

// Sub-component for the instructions countdown to avoid violating Rules of Hooks.
const InstructionsCountdown = ({ isHost, gameId, selfId }: { isHost: boolean; gameId: string; selfId: string }) => {
    const [countdown, setCountdown] = useState(5);
    const actionCalled = useRef(false);

    useEffect(() => {
        if (countdown <= 0 && isHost && !actionCalled.current) {
            actionCalled.current = true;
            prisonActions.proceedFromInstructions(gameId, selfId);
        }
    }, [countdown, isHost, gameId, selfId]);

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="text-center text-5xl font-bold font-mono text-primary animate-pulse">
            {countdown}
        </div>
    );
};


export function PrisonGame({ game, self }: PrisonGameProps) {
    const { toast } = useToast();
    const router = useRouter();
    const { user, socialRanks } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [bidAmount, setBidAmount] = useState<string>('');
    const [liveAnswerInput, setLiveAnswerInput] = useState<string>('');
    const [liveAnswersList, setLiveAnswersList] = useState<string[]>([]);
    const [settings, setSettings] = useState(game.prisonState?.settings || { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [judgedResults, setJudgedResults] = useState(game.prisonState?.aiJudgeResults || []);
    
    const isHost = game.hostId === self.id;
    
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);
    const contestants = useMemo(() => game?.players.filter(p => p.role === 'contestant' && p.status !== 'executed'), [game?.players]);
    const contestantsWithSubmissions = useMemo(() => {
        const submissions = game.prisonState?.openAuctionSubmissions || {};
        return Object.keys(submissions).map(playerId => contestants.find(p => p.id === playerId)).filter(Boolean) as Player[];
    }, [game.prisonState?.openAuctionSubmissions, contestants]);


    useEffect(() => {
        if (game.gameState === 'open_auction') {
            setLiveAnswersList([]);
            setLiveAnswerInput('');
            setJudgedResults([]);
        } else if (game.gameState === 'closed_auction_bidding') {
            setBidAmount('');
             setJudgedResults([]);
        } else if (game.gameState === 'closed_auction_answering') {
            setLiveAnswersList([]);
            setLiveAnswerInput('');
        }
    }, [game.gameState, game.round]);

    useEffect(() => {
        setJudgedResults(game.prisonState?.aiJudgeResults || []);
    }, [game.prisonState?.aiJudgeResults]);

    useEffect(() => {
        if (game.gameState === 'judging' && isHost && (game.prisonState?.aiJudgeResults || []).length === 0) {
            const submissions = game.prisonState?.openAuctionSubmissions;
            if (submissions && Object.keys(submissions).length > 0) {
                 prisonActions.judgeAnswersAndProceed(game.id, self.id);
            }
        }
    }, [game.gameState, isHost, game.prisonState?.openAuctionSubmissions, game.id, self.id, game.prisonState?.aiJudgeResults]);
    
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

    const handleAnswerSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!liveAnswerInput.trim()) return;
        setLiveAnswersList(prev => [...prev, liveAnswerInput.trim()]);
        setLiveAnswerInput('');
    };

    const removeAnswer = (indexToRemove: number) => {
        setLiveAnswersList(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleFinishAnswering = useCallback(async (isTimeout = false) => {
        if (game.prisonState?.openAuctionSubmissions?.[self.id]) return;
        setIsSubmitting(true);
        const answersToSubmit = isTimeout && liveAnswersList.length === 0 ? [] : liveAnswersList;
        const result = await prisonActions.submitOpenAuctionAnswers(game.id, self.id, answersToSubmit);
        if (result.success) {
             if (!isTimeout) {
                toast({ title: "تم إرسال إجابتك بنجاح!" });
            }
        } else {
             toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
       
        setIsSubmitting(false);
    }, [game.id, self.id, liveAnswersList, toast, game.prisonState?.openAuctionSubmissions]);

    const handleBidSubmit = async (withdraw: boolean = false) => {
        setIsSubmitting(true);
        const amount = parseInt(bidAmount, 10);

        if (!withdraw) {
            const highestBid = game.prisonState?.highestBid || 0;
            if (isNaN(amount) || amount <= highestBid) {
                toast({ title: "مزايدة غير صالحة", description: `يجب أن تكون مزايدتك أعلى من ${highestBid}.`, variant: "destructive" });
                setIsSubmitting(false);
                return;
            }
        }

        await prisonActions.submitBid(game.id, self.id, amount, withdraw).catch(e => {
            toast({ title: "خطأ في المزايدة", description: e.message, variant: "destructive" });
        });
        setIsSubmitting(false);
    };

    const handleClosedAuctionAnswer = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (liveAnswersList.length === 0) {
            toast({ title: "الإجابات مطلوبة", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        await prisonActions.submitClosedAuctionAnswer(game.id, self.id, liveAnswersList).catch(e => {
            toast({ title: "خطأ في الإرسال", description: e.message, variant: "destructive" });
        });
        setIsSubmitting(false);
    };

    const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        await prisonActions.nextRound(game.id).catch(e => toast({title: "خطأ", description: e.message, variant: "destructive"}));
        setIsSubmitting(false);
    };
    
    const handleProceedFromJudging = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        await prisonActions.proceedToResults(game.id, self.id).catch(e => toast({title: "خطأ", description: e.message, variant: "destructive"}));
        setIsSubmitting(false);
    }

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
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)}>
                                        <UserX className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        )})}
                    </div>
                    <div className="flex flex-col gap-2 p-0 mt-4">
                        {isHost ? (
                            <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full">
                                <ArrowRight className="mr-2 h-4 w-4" />
                                {isSubmitting ? 'جاري البدء...' : activePlayers.length < 2 ? "تحتاج لاعبين على الأقل" : "ابدأ اللعبة"}
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
    
    const renderInstructions = () => {
        return (
            <Card className="w-full max-w-lg animate-pop-in">
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl">مرحباً بكم في السجن!</CardTitle>
                    <CardDescription className="text-base">ستبدأ اللعبة بعد قليل...</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg text-center">
                        <h3 className="font-bold text-lg mb-2">الجولة الأولى: مزاد مفتوح</h3>
                        <p className="text-muted-foreground">
                            سيتم عرض سؤال عام، ومهمتكم هي كتابة أكبر عدد ممكن من الإجابات الصحيحة. اللاعب صاحب أعلى عدد من الإجابات الصحيحة يفوز، وصاحب أقل عدد يخسر ويدخل السجن.
                        </p>
                    </div>
                    <InstructionsCountdown isHost={isHost} gameId={game.id} selfId={self.id} />
                </CardContent>
            </Card>
        );
    };

    const renderOpenAuction = () => {
        const hasSubmitted = !!game.prisonState?.openAuctionSubmissions?.[self.id];

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
                            <form onSubmit={handleAnswerSubmit} className="space-y-4">
                                <div className="flex gap-2">
                                    <Input 
                                        placeholder='اكتب إجابة...'
                                        value={liveAnswerInput}
                                        onChange={(e) => setLiveAnswerInput(e.target.value)}
                                        disabled={isSubmitting}
                                    />
                                    <Button type="submit" disabled={isSubmitting || !liveAnswerInput.trim()}>إضافة</Button>
                                </div>
                                <ScrollArea className="h-48 p-2 border rounded-md bg-muted/50">
                                    {liveAnswersList.length > 0 ? (
                                        <div className='space-y-2'>
                                        {liveAnswersList.map((answer, index) => (
                                            <div key={index} className="flex justify-between items-center p-2 bg-background rounded-md">
                                                <span className='font-semibold'>{answer}</span>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAnswer(index)}>
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
                            </form>
                    )}
                </CardContent>
            </Card>
        );
    }
    
    const renderClosedAuctionBidding = () => {
        const myBid = game.prisonState?.bids?.[self.id];
        const hasWithdrawn = game.prisonState?.withdrawnBidders?.includes(self.id);
        const playersInPrison = contestants.filter(p => p.status === 'in_prison');
        const highestBid = game.prisonState?.highestBid || 0;
        
        return (
            <Card className="w-full max-w-lg relative animate-pop-in">
                {game.prisonState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={() => {}} // Bidding ends automatically
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>مزاد مغلق</CardTitle>
                    <CardDescription className="text-xl font-bold pt-2">{game.prisonState?.closedAuctionQuestion?.text}</CardDescription>
                     <div className="pt-2">
                        <p className="text-sm text-muted-foreground">اللاعبون في السجن:</p>
                        <div className="flex justify-center gap-4 mt-1">
                            {playersInPrison.length > 0 ? playersInPrison.map(p => (
                                <div key={p.id} className="flex flex-col items-center text-xs">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                    <span className="font-semibold">{p.name}</span>
                                </div>
                            )) : <p className="text-sm">لا أحد</p>}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="text-center p-3 rounded-lg bg-primary/10">
                        <p className="text-sm text-primary">أعلى مزايدة حاليًا</p>
                        <p className="text-3xl font-bold text-primary">{highestBid}</p>
                     </div>
                     {(myBid !== undefined || hasWithdrawn) ? (
                         <div className="text-center p-4 rounded-lg bg-green-100 text-green-800">
                             <p className="font-semibold">
                                 {hasWithdrawn ? 'لقد انسحبت من هذا المزاد.' : `تم تسجيل مزايدتك بـ ${myBid}. يمكنك تغييرها.`}
                            </p>
                         </div>
                     ) : null}
                    <Input
                        type="number"
                        placeholder={`زايد بأعلى من ${highestBid}...`}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        disabled={isSubmitting || hasWithdrawn}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => handleBidSubmit(false)} disabled={isSubmitting || hasWithdrawn || !bidAmount.trim()} className="w-full">
                            <Gavel /> {isSubmitting ? '...' : myBid ? 'تحديث المزايدة' : 'تأكيد المزايدة'}
                        </Button>
                        <Button onClick={() => handleBidSubmit(true)} variant="outline" disabled={isSubmitting || hasWithdrawn}>
                            <RefreshCw /> {isSubmitting ? '...' : 'تغيير السؤال'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const renderClosedAuctionAnswering = () => {
        const winner = game.players.find(p => p.id === game.prisonState?.auctionWinnerId);
        const myTurnToAnswer = self.id === winner?.id;
        const bidAmount = game.prisonState?.highestBid || 0;
        
        const handleAnswerKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAnswerSubmit();
            }
        };

        return (
            <Card className="w-full max-w-lg relative animate-pop-in">
                 {game.prisonState?.timerEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={() => { if(myTurnToAnswer) handleClosedAuctionAnswer() }}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>إجابة المزاد المغلق</CardTitle>
                    <CardDescription>
                       فاز اللاعب <strong>{winner?.name}</strong> بالمزاد. عليه الآن تقديم <strong className="text-primary">{bidAmount}</strong> إجابات صحيحة.
                    </CardDescription>
                    <p className="text-xl font-bold pt-2">{game.prisonState?.closedAuctionQuestion?.text}</p>
                </CardHeader>
                <CardContent>
                     {myTurnToAnswer ? (
                         <form onSubmit={handleClosedAuctionAnswer} className="space-y-4">
                            <div className="flex gap-2">
                                <Input 
                                    placeholder='اكتب إجابة...'
                                    value={liveAnswerInput}
                                    onChange={(e) => setLiveAnswerInput(e.target.value)}
                                    onKeyPress={handleAnswerKeyPress}
                                    disabled={isSubmitting}
                                />
                                <Button type="button" onClick={handleAnswerSubmit} disabled={isSubmitting || !liveAnswerInput.trim()}>إضافة</Button>
                            </div>
                            <ScrollArea className="h-48 p-2 border rounded-md bg-muted/50">
                                {liveAnswersList.length > 0 ? (
                                    <div className='space-y-2'>
                                    {liveAnswersList.map((answer, index) => (
                                        <div key={index} className="flex justify-between items-center p-2 bg-background rounded-md">
                                            <span className='font-semibold'>{answer}</span>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAnswer(index)}>
                                                <Trash2 className="w-4 h-4"/>
                                            </Button>
                                        </div>
                                    ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground pt-4">قائمة إجاباتك فارغة.</p>
                                )}
                            </ScrollArea>
                            <Button type="submit" className="w-full" disabled={isSubmitting || liveAnswersList.length === 0}>إرسال</Button>
                         </form>
                     ) : (
                         <p className="text-center text-muted-foreground animate-pulse">في انتظار {winner?.name} للإجابة...</p>
                     )}
                </CardContent>
            </Card>
        );
    };

    const renderJudging = () => {
        const allResultsIn = judgedResults.length >= contestantsWithSubmissions.length;

        return (
            <Card className="w-full max-w-4xl relative animate-pop-in">
                <CardHeader className="text-center pt-8">
                    <CardTitle>مرحلة الحكم</CardTitle>
                    <CardDescription>
                       الذكاء الاصطناعي يقوم بمراجعة الإجابات...
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-96">
                        <div className="space-y-4 pr-4">
                        {contestantsWithSubmissions.map(player => {
                            const playerResult = judgedResults.find(r => r.playerId === player.id);
                            const correctAnswers = playerResult?.correctAnswers || [];
                            const allAnswers = game.prisonState?.openAuctionSubmissions?.[player.id] || [];
                            
                            return (
                            <div key={player.id} className="p-3 bg-muted rounded-lg">
                                <h3 className="font-bold text-lg mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8"/>
                                        إجابات {player.name}
                                    </div>
                                    {playerResult ? (
                                        <span className="text-sm font-bold text-green-600">صحيحة: {playerResult.score}</span>
                                    ) : (
                                        <Loader2 className="w-4 h-4 animate-spin"/>
                                    )}
                                </h3>
                                <div className="space-y-2">
                                    {allAnswers.map((answer, i) => {
                                        const isCorrect = playerResult ? correctAnswers.includes(answer) : undefined;
                                        return (
                                            <motion.div 
                                                key={i} 
                                                className="flex items-center gap-2 p-2 bg-background rounded-md"
                                                initial={{ opacity: 0.5 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: i * 0.1 }}
                                            >
                                                <AnimatePresence>
                                                    {isCorrect !== undefined ? (
                                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 }}>
                                                            {isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-500"/> : <MessageCircleOff className="w-5 h-5 text-red-500"/>}
                                                        </motion.div>
                                                    ) : (
                                                        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                                                    )}
                                                </AnimatePresence>
                                                <span>{answer}</span>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            </div>
                        )})}
                        </div>
                    </ScrollArea>
                </CardContent>
                <CardFooter>
                     {isHost && allResultsIn && (
                        <Button onClick={handleProceedFromJudging} disabled={isSubmitting}>
                            {isSubmitting ? 'جاري التحميل...' : 'عرض النتائج والجولة التالية'}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );
    };

    const renderResults = () => {
        const result = game.prisonState?.lastRoundResult;
        if (!result) return <p>جاري تحميل النتائج...</p>;
        
        const sortedPlayers = [...game.players].sort((a,b) => (game.playerScores?.[b.id] || 0) - (a.playerScores?.[a.id] || 0));
        const playersInPrison = game.players.filter(p => p.status === 'in_prison');
        const executedPlayerName = result.executedPlayerName;

        return (
            <Card className="w-full max-w-5xl animate-pop-in">
                 <CardHeader className="text-center">
                    <CardTitle>نتيجة الجولة {game.round}</CardTitle>
                    <CardDescription className="text-lg font-bold p-2 bg-muted rounded-md mt-2">
                         {result.message}
                    </CardDescription>
                     {executedPlayerName && (
                        <motion.div 
                            className="mt-2 text-red-500 font-bold flex items-center justify-center gap-2"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                        >
                            <Skull className="w-8 h-8 animate-bounce"/>
                            تم إعدام اللاعب {executedPlayerName}!
                        </motion.div>
                    )}
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2 md:col-span-2">
                        <h3 className="font-bold text-center text-lg">الترتيب العام</h3>
                         {sortedPlayers.map(p => {
                            const prisonHistory = game.prisonState?.prisonHistory?.[p.id];
                            return (
                             <div key={p.id} className="flex justify-between items-center p-2 rounded-md bg-muted">
                                 <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                    <span className="font-semibold">{p.name}</span>
                                     {p.status === 'alive' && prisonHistory && prisonHistory.roundsWithoutWinningAuction > 0 && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <span className="text-xs font-bold text-yellow-600 bg-yellow-200 px-1.5 py-0.5 rounded-full">خامل لـ {prisonHistory.roundsWithoutWinningAuction}</span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>سيتم إرساله للسجن إذا لم يفز بمزاد خلال {3 - prisonHistory.roundsWithoutWinningAuction} جولات</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                </div>
                                <span className="font-bold text-lg text-primary">{game.playerScores?.[p.id] || 0}</span>
                             </div>
                            )
                         })}
                    </div>
                     <div className="space-y-4">
                         <h3 className="font-bold text-center text-lg">السجناء</h3>
                         <div className="p-4 bg-gray-800 rounded-lg space-y-3 min-h-[200px]">
                            {playersInPrison.length > 0 ? (
                                playersInPrison.map(p => (
                                <div key={p.id} className="relative w-full text-center bg-gray-700 p-2 rounded-md overflow-hidden">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12 mx-auto rounded-full border-2 border-gray-500"/>
                                    <p className="font-bold text-white mt-1">{p.name}</p>
                                    <p className="text-xs text-gray-300">مسجون لـ {game.prisonState?.prisonHistory?.[p.id]?.inPrison} جولات</p>
                                    <motion.div 
                                        className='absolute inset-0 pointer-events-none'
                                        initial={{ y: '-100%' }}
                                        animate={{ y: 0 }}
                                        transition={{ type: 'spring', stiffness: 50, damping: 10, delay: 0.5 }}
                                    >
                                        <div className="w-full h-full grid grid-cols-4 gap-2 opacity-50 p-1">
                                            <div className="bg-gray-900 rounded-sm"></div>
                                            <div className="bg-gray-900 rounded-sm"></div>
                                            <div className="bg-gray-900 rounded-sm"></div>
                                            <div className="bg-gray-900 rounded-sm"></div>
                                        </div>
                                    </motion.div>
                                </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-400 pt-8">لا يوجد سجناء حاليًا!</p>
                            )}
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
            
            return (
                <Card className="w-full max-w-2xl animate-pop-in">
                    <CardHeader className="text-center">
                        <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                        <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                        <CardDescription className="text-2xl font-bold">{game.gameResult?.message || `الفائز هو ${winner?.name || 'مجهول'}!`}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            {rankedPlayers.map((p) => (
                                <div key={p.id} className="flex justify-between items-center p-3 bg-muted rounded-lg text-lg">
                                    <div className="flex items-center gap-2 font-bold">
                                        <span>{p.rank}.</span>
                                        <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                        <span>{p.name}</span>
                                    </div>
                                    <span className="font-bold text-primary">{p.score} نقطة</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={() => router.push('/')} variant="outline" className="w-full">
                            العودة للرئيسية
                        </Button>
                    </CardFooter>
                </Card>
            )
    };

    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby': return renderLobby();
            case 'instructions': return renderInstructions();
            case 'open_auction': return renderOpenAuction();
            case 'closed_auction_bidding': return renderClosedAuctionBidding();
            case 'closed_auction_answering': return renderClosedAuctionAnswering();
            case 'judging': return renderJudging();
            case 'results': return renderResults();
            case 'final_results': return renderFinalResults();
            default: return (
                <Card>
                    <CardHeader>
                        <CardTitle>حالة غير معروفة</CardTitle>
                        <CardDescription>
                            حالة اللعبة الحالية هي: {game.gameState}. هذا لا ينبغي أن يحدث.
                        </CardDescription>
                    </CardHeader>
                </Card>
            );
        }
    }

    return (
        <>
            <AnimatePresence mode="wait">
                <motion.div
                    key={game.gameState + game.round}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full flex items-center justify-center p-4"
                >
                    {renderContent()}
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
                    {isSubmitting ? "جاري الطرد..." : "نعم، قم بطرده"}
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

    