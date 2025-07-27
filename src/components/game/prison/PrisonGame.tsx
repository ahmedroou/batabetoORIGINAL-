

"use client";

import { Gavel, Send, Copy, Check, LogOut, ArrowRight, TimerIcon, Award, MessageSquare, ListChecks, CheckCircle2, Shield, Star, Users, Handshake, Drama, Laugh, MessageCircleOff, FileText, Skull, VenetianMask, Trash2, ThumbsUp, ThumbsDown, Trophy, Plus, Settings, UserX, UserMinus, UserCheck, RefreshCw, BarChartHorizontalBig, KeyRound, Hand, Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox'; // Not used in provided code, but kept if user intends to use
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'; // Not used in provided code, but kept if user intends to use
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { Game, Player, SocialRank } from '@/types';
import { getSocialRankForUser } from '@/lib/actions/user';
import { ExecutionAnimationOverlay } from './ExecutionAnimationOverlay';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


/**
 * CountdownTimer component displays a countdown and triggers a callback when time expires.
 * @param {object} props - Component props.
 * @param {number} props.expiryTimestamp - The timestamp (in milliseconds) when the timer should expire.
 * @param {function} props.onExpire - Callback function to be called when the timer expires.
 */
const CountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number; onExpire: () => void }) => {
    // Calculate remaining time in seconds
    const calculateTimeLeft = useCallback(() => Math.round((expiryTimestamp - Date.now()) / 1000), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    
    // Use a ref for the onExpire callback to ensure it's always up-to-date without re-creating interval
    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    useEffect(() => {
        // Initial check for immediate expiration
        const remaining = calculateTimeLeft();
        if (remaining <= 0) {
            setTimeLeft(0);
            onExpireRef.current();
            return;
        }
        
        // Set up interval for countdown
        const interval = setInterval(() => {
            const newRemaining = calculateTimeLeft();
            if (newRemaining > 0) {
                setTimeLeft(newRemaining);
            } else {
                setTimeLeft(0);
                clearInterval(interval); // Clear interval when time is up
                onExpireRef.current(); // Call expire callback
            }
        }, 1000);

        // Cleanup function to clear interval on component unmount or dependency change
        return () => clearInterval(interval);
    }, [expiryTimestamp, calculateTimeLeft]); // Re-run effect if expiryTimestamp changes

    // Do not render if time is already up
    if (timeLeft <= 0) {
        return <div className="text-lg font-bold text-destructive">انتهى الوقت!</div>;
    }

    const isLowTime = timeLeft <= 10; // Highlight if time is low

    return (
        <div className={cn("flex items-center gap-2 p-2 rounded-full transition-all duration-300", 
            isLowTime ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-muted')}>
            <TimerIcon className="h-6 w-6" />
            <div className="text-lg font-bold font-mono">
               {String(timeLeft).padStart(2, '0')} {/* Format to always show two digits */}
            </div>
        </div>
    );
};


/**
 * InstructionsCountdown component manages a countdown before the game starts and triggers host action.
 * @param {object} props - Component props.
 * @param {boolean} props.isHost - True if the current player is the host.
 * @param {string} props.gameId - The ID of the current game.
 * @param {string} props.selfId - The ID of the current player.
 */
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


interface PrisonGameProps {
    game: Game;
    self: Player;
}

/**
 * Main PrisonGame component managing the game state and UI.
 * @param {object} props - Component props.
 * @param {Game} props.game - The current game object.
 * @param {Player} props.self - The current player's object.
 */
export function PrisonGame({ game, self }: PrisonGameProps) {
    const { toast } = useToast();
    const router = useRouter();
    const { user, socialRanks } = useAuth(); // Assuming useAuth provides socialRanks
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [bidAmount, setBidAmount] = useState<string>('');
    const [liveAnswerInput, setLiveAnswerInput] = useState<string>('');
    const [liveAnswersList, setLiveAnswersList] = useState<string[]>([]);
    const [settings, setSettings] = useState(game.prisonState?.settings || { biddingTime: 30, answeringTime: 45, judgingTime: 60, rounds: 10 });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [judgedResults, setJudgedResults] = useState(game.prisonState?.aiJudgeResults || []);
    
    // Animation states for execution/release overlays
    const [animState, setAnimState] = useState<{ type: 'execution' | 'release' | null, data: any }>({ type: null, data: null });
    // Tracks the round for which an animation was last shown to prevent re-triggering
    const [animationShownForRound, setAnimationShownForRound] = useState(0);

    const [isRejudgeDialogOpen, setIsRejudgeDialogOpen] = useState(false);
    const [rejudgeReason, setRejudgeReason] = useState("");
    const [timeIsUp, setTimeIsUp] = useState(false); // State to track if the current timer has expired

    const isHost = game.hostId === self.id;
    
    // Memoized list of active players (not 'left')
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);
    // Memoized list of contestants (role 'contestant' and not 'executed')
    const contestants = useMemo(() => game?.players.filter(p => p.role === 'contestant' && p.status !== 'executed'), [game?.players]);
    
    // Memoized list of contestants who have submitted answers for the current phase
    const contestantsWithSubmissions = useMemo(() => {
        const submissions = game.prisonState?.openAuctionSubmissions || {};
        const playerIds = Object.keys(submissions);
        if (playerIds.length === 0) return [];

        const auctionWinnerId = game.prisonState?.auctionWinnerId;
        // If there's an auction winner, only their submission is relevant for judging
        if (auctionWinnerId) {
             const winner = contestants.find(p => p.id === auctionWinnerId);
             return winner ? [winner] : [];
        }
        // Otherwise, all players who submitted in open auction
        return playerIds.map(playerId => contestants.find(p => p.id === playerId)).filter(Boolean) as Player[];

    }, [game.prisonState?.openAuctionSubmissions, game.prisonState?.auctionWinnerId, contestants]);

    /**
     * Callback for when a timer expires. Sets `timeIsUp` and triggers host action.
     */
     const onTimeout = useCallback(() => {
      if (!timeIsUp) { // Prevent multiple triggers
        setTimeIsUp(true);
        if (isHost) {
          prisonActions.handleTimeout(game.id, self.id);
        }
      }
    }, [isHost, game.id, self.id, timeIsUp]);
    
    /**
     * Handles submission of answers for the closed auction phase.
     * @param {React.FormEvent} [e] - Optional form event.
     */
    const handleClosedAuctionAnswer = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (liveAnswersList.length === 0) {
            toast({ title: "الإجابات مطلوبة", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await prisonActions.submitClosedAuctionAnswer(game.id, self.id, liveAnswersList);
        } catch (e: any) {
            toast({ title: "خطأ في الإرسال", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, liveAnswersList, toast]);

    /**
     * Effect to reset UI states based on game phase changes.
     */
    useEffect(() => {
        const myProgress = game.prisonState?.playerProgress?.[self.id]?.answers || [];
    
        if (game.gameState === 'open_auction') {
            setLiveAnswersList(myProgress);
            setLiveAnswerInput(''); 
            setTimeIsUp(false);
            setJudgedResults([]); 
        } else if (game.gameState === 'closed_auction_bidding') {
            setBidAmount(''); 
            setJudgedResults([]);
            setTimeIsUp(false);
        } else if (game.gameState === 'closed_auction_answering') {
            setLiveAnswersList(myProgress); // Always sync with saved progress
            setLiveAnswerInput('');
            setTimeIsUp(false);
        } else if (game.gameState === 'judging' || game.gameState === 'results' || game.gameState === 'rejudging') {
             setTimeIsUp(false); // Ensure timer is not marked as "up" during these phases
        }
    }, [game.gameState, game.round]);


    /**
     * Effect to trigger execution/release animations when a new round result is available.
     */
    const lastResult = game.prisonState?.lastRoundResult;
    useEffect(() => {
        if (game.round && game.round > animationShownForRound && lastResult) {
            if (lastResult?.executedPlayerName) {
                setAnimState({ type: 'execution', data: { name: lastResult.executedPlayerName, avatarId: lastResult.executedPlayerAvatarId } });
                setAnimationShownForRound(game.round); // Mark animation shown for this round
            } else if (lastResult?.freedPlayerName) {
                 // The animation is now inline, so no full-screen overlay needed.
                 // We still mark the round to prevent re-triggers of other logic.
                 setAnimationShownForRound(game.round);
            }
        }
    }, [lastResult, game.round, animationShownForRound]);

    /**
     * Effect to update judged results when they become available in game state.
     */
    useEffect(() => {
        setJudgedResults(game.prisonState?.aiJudgeResults || []);
    }, [game.prisonState?.aiJudgeResults]);

    /**
     * Effect for host to initiate judging once the judging phase starts and results are not yet available.
     * This now handles both 'judging' and 'rejudging' states.
     */
    useEffect(() => {
        // Condition for initial judging
        const isInitialJudging = game.gameState === 'judging' && isHost && (game.prisonState?.aiJudgeResults || []).length === 0 && (game.prisonState?.judgingStarted);
        
        // Condition for re-judging
        const isRejudging = game.gameState === 'rejudging' && isHost && !!game.prisonState?.activeRejudgeRequest;

        if (isInitialJudging || isRejudging) {
             prisonActions.judgeAnswersAndProceed(game.id, self.id);
        }
    }, [game.gameState, isHost, game.id, self.id, game.prisonState?.aiJudgeResults, game.prisonState?.judgingStarted, game.prisonState?.activeRejudgeRequest]);
    
    /**
     * Handles copying the game ID to the clipboard.
     */
    const handleCopyId = () => {
        setIsCopying(true);
        // Using document.execCommand('copy') for better iframe compatibility
        const tempInput = document.createElement('input');
        tempInput.value = game.id;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        setTimeout(() => setIsCopying(false), 2000);
    };

    /**
     * Handles leaving the current game.
     */
    const handleLeaveGame = async () => {
        setIsSubmitting(true);
        try {
            const result = await roomActions.leaveGame(game.id, self.id);
            if (result.success) {
                sessionStorage.removeItem(`player-${game.id}`); // Clear player session data
                router.push('/'); // Redirect to home
                toast({ title: "لقد غادرت الغرفة." });
            } else {
                toast({ title: "خطأ", description: result.error, variant: "destructive" });
            }
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    /**
     * Handles starting the game (host only).
     */
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
    
    /**
     * Handles updating game settings (host only).
     * @param {Partial<typeof settings>} newSettings - The new settings to apply.
     */
    const handleSettingsChange = async (newSettings: Partial<typeof settings>) => {
        const updatedSettings = { ...settings, ...newSettings };
        setSettings(updatedSettings); // Optimistic UI update
        if (isHost) {
            try {
                await prisonActions.updateGameSettings(game.id, self.id, updatedSettings);
            } catch (error: any) {
                toast({ title: "خطأ في تحديث الإعدادات", description: error.message, variant: "destructive" });
            }
        }
    };

    /**
     * Handles adding a new answer to the live answers list for open auction.
     * @param {React.FormEvent} [e] - Optional form event.
     */
    const handleAnswerSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!liveAnswerInput.trim()) return; // Prevent empty submissions
        const newAnswers = [...liveAnswersList, liveAnswerInput.trim()];
        setLiveAnswersList(newAnswers);
        setLiveAnswerInput('');
        if (game.gameState === 'open_auction' || game.gameState === 'closed_auction_answering') {
            // Update progress immediately for real-time display to others
            prisonActions.updateOpenAuctionProgress(game.id, self.id, newAnswers);
        }
    };

    /**
     * Handles removing an answer from the live answers list.
     * @param {number} indexToRemove - The index of the answer to remove.
     */
    const removeAnswer = (indexToRemove: number) => {
        const newAnswers = liveAnswersList.filter((_, index) => index !== indexToRemove);
        setLiveAnswersList(newAnswers);
        if (game.gameState === 'open_auction' || game.gameState === 'closed_auction_answering') {
            // Update progress immediately
            prisonActions.updateOpenAuctionProgress(game.id, self.id, newAnswers);
        }
    };

    /**
     * Handles submitting a bid or requesting a question change in closed auction.
     * @param {boolean} changeQuestion - True if the player wants to change the question.
     */
    const handleBidSubmit = async (changeQuestion: boolean = false) => {
        setIsSubmitting(true);
        const amount = parseInt(bidAmount, 10);

        if (!changeQuestion) {
            const highestBid = game.prisonState?.highestBid || 0;
            if (isNaN(amount) || amount <= highestBid) {
                toast({ title: "مزايدة غير صالحة", description: `يجب أن تكون مزايدتك أعلى من ${highestBid}.`, variant: "destructive" });
                setIsSubmitting(false);
                return;
            }
        }

        try {
            const result = await prisonActions.submitBid(game.id, self.id, amount, changeQuestion);

            if(result.error) {
                toast({ title: "خطأ", description: result.error, variant: "destructive" });
            } else if (changeQuestion) {
                toast({ title: "تم تغيير السؤال!", description: `لقد قام ${self.name} باستخدام قدرته لتغيير السؤال.` });
            } else {
                setBidAmount(''); // Clear input only on successful bid
            }
        } catch (error: any) {
            toast({ title: "خطأ في المزايدة", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    /**
     * Handles proceeding to the next round (host only).
     */
    const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await prisonActions.nextRound(game.id);
        } catch (e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    };
    
    /**
     * Handles proceeding from the judging phase to results (host only).
     */
    const handleProceedFromJudging = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await prisonActions.proceedToResults(game.id, self.id);
        } catch (e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    }

    /**
     * Handles a player requesting a re-judge of answers.
     */
    const handleRequestRejudge = async () => {
        if (!rejudgeReason.trim()) {
            toast({ title: "الرجاء كتابة سبب للاعتراض", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            const result = await prisonActions.requestRejudge(game.id, self.id, rejudgeReason);
            if (result.success) {
                toast({ title: "تم إرسال طلبك للمراجعة" });
            } else {
                 toast({ title: "خطأ", description: result.error, variant: "destructive" });
            }
        } catch (error: any) {
            toast({ title: "خطأ في طلب إعادة التقييم", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setIsRejudgeDialogOpen(false); // Close dialog regardless of success
            setRejudgeReason(""); // Clear reason
        }
    };

    const handleAddTimeToJudging = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await prisonActions.addTimeToJudging(game.id, self.id);
            toast({title: "تمت إضافة 20 ثانية", description: "أتيح للاعبين فرصة لمراجعة النتائج."})
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };


    /**
     * Handles kicking a player from the lobby (host only).
     */
    const handleKickPlayer = async () => {
        if (!playerToKick || !isHost) return;
        setIsSubmitting(true);
        try {
            const result = await roomActions.kickPlayerFromLobby(game.id, self.id, playerToKick.id);
            if (result.error) {
                toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
            } else {
                toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
            }
        } catch (error: any) {
            toast({ title: "خطأ في الطرد", description: error.message, variant: "destructive" });
        } finally {
            setPlayerToKick(null); // Clear player to kick state
            setIsSubmitting(false);
        }
    };


    /**
     * Renders the lobby screen.
     */
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
                    {/* Animated settings panel */}
                    <AnimatePresence>
                        {isSettingsOpen && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
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
                    </AnimatePresence>
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
                           <LogOut className="mr-2 h-4 w-4" /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
    
    /**
     * Renders the instructions screen.
     */
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

    /**
     * Renders the open auction phase screen.
     */
    const renderOpenAuction = () => {
        const hasSubmitted = !!game.prisonState?.openAuctionSubmissions?.[self.id];

        return (
            <Card className="w-full max-w-lg relative animate-pop-in">
                {/* Timer display */}
                {game.prisonState?.timerEndsAt && !timeIsUp && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={onTimeout}
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
                                        disabled={isSubmitting || timeIsUp}
                                    />
                                    <Button type="submit" disabled={isSubmitting || !liveAnswerInput.trim() || timeIsUp}>إضافة</Button>
                                </div>
                                <ScrollArea className="h-48 p-2 border rounded-md bg-muted/50">
                                    {liveAnswersList.length > 0 ? (
                                        <div className='space-y-2'>
                                        {liveAnswersList.map((answer, index) => (
                                            <div key={index} className="flex justify-between items-center p-2 bg-background rounded-md">
                                                <span className='font-semibold'>{answer}</span>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAnswer(index)} disabled={timeIsUp}>
                                                    <Trash2 className="w-4 h-4"/>
                                                </Button>
                                            </div>
                                        ))}
                                        </div>
                                    ) : (
                                        <p className="text-center text-muted-foreground pt-4">قائمة إجاباتك فارغة.</p>
                                    )}
                                </ScrollArea>
                            </form>
                    )}
                </CardContent>
            </Card>
        );
    }
    
    /**
     * Renders the closed auction bidding phase screen.
     */
    const renderClosedAuctionBidding = () => {
        const myBid = game.prisonState?.bids?.[self.id];
        const hasUsedQuestionChange = (game.prisonState?.questionChangersUsedBy || []).includes(self.id);
        const playersInPrison = contestants.filter(p => p.status === 'in_prison');
        const highestBid = game.prisonState?.highestBid || 0;
        
        return (
            <Card className="w-full max-w-lg relative animate-pop-in">
                {/* Timer display */}
                {game.prisonState?.timerEndsAt && !timeIsUp && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={onTimeout}
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
                            )) : <p className="text-sm text-muted-foreground">لا أحد</p>}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="text-center p-3 rounded-lg bg-primary/10">
                        <p className="text-sm text-primary">أعلى مزايدة حاليًا</p>
                        <p className="text-3xl font-bold text-primary">{highestBid}</p>
                     </div>
                     {(myBid !== undefined) && (
                         <div className="text-center p-4 rounded-lg bg-green-100 text-green-800">
                             <p className="font-semibold">
                                 {`تم تسجيل مزايدتك بـ ${myBid}. يمكنك تغييرها.`}
                            </p>
                         </div>
                     )}
                    <Input
                        type="number"
                        placeholder={`زايد بأعلى من ${highestBid}...`}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        disabled={isSubmitting || timeIsUp}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => handleBidSubmit(false)} disabled={isSubmitting || !bidAmount.trim() || timeIsUp} className="w-full">
                            <Gavel className="mr-2 h-4 w-4" /> {isSubmitting ? '...' : myBid ? 'تحديث المزايدة' : 'تأكيد المزايدة'}
                        </Button>
                        <Button onClick={() => handleBidSubmit(true)} variant="outline" disabled={isSubmitting || hasUsedQuestionChange || timeIsUp}>
                            <RefreshCw className="mr-2 h-4 w-4" /> {hasUsedQuestionChange ? 'تم الاستخدام' : 'تغيير السؤال'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    /**
     * Renders the closed auction answering phase screen.
     */
    const renderClosedAuctionAnswering = () => {
        const winner = game.players.find(p => p.id === game.prisonState?.auctionWinnerId);
        const myTurnToAnswer = self.id === winner?.id;
        const bidAmount = game.prisonState?.highestBid || 0;
        
        // Handle Enter key press for adding answers
        const handleAnswerKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAnswerSubmit();
            }
        };

        return (
            <Card className="w-full max-w-lg relative animate-pop-in">
                 {/* Timer display */}
                 {game.prisonState?.timerEndsAt && !timeIsUp && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                            onExpire={onTimeout}
                        />
                    </div>
                )}
                <CardHeader className="text-center pt-20">
                    <CardTitle>إجابة المزاد المغلق</CardTitle>
                    <CardDescription>
                       فاز اللاعب <strong>{winner?.name || '...'}</strong> بالمزاد. عليه الآن تقديم <strong className="text-primary">{bidAmount}</strong> إجابات صحيحة.
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
                                    disabled={isSubmitting || timeIsUp}
                                />
                                <Button type="button" onClick={handleAnswerSubmit} disabled={isSubmitting || !liveAnswerInput.trim() || timeIsUp}>إضافة</Button>
                            </div>
                            <ScrollArea className="h-48 p-2 border rounded-md bg-muted/50">
                                {liveAnswersList.length > 0 ? (
                                    <div className='space-y-2'>
                                    {liveAnswersList.map((answer, index) => (
                                        <div key={index} className="flex justify-between items-center p-2 bg-background rounded-md">
                                            <span className='font-semibold'>{answer}</span>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAnswer(index)} disabled={timeIsUp}>
                                                <Trash2 className="w-4 h-4"/>
                                            </Button>
                                        </div>
                                    ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground pt-4">قائمة إجاباتك فارغة.</p>
                                )}
                            </ScrollArea>
                            <Button type="submit" className="w-full" disabled={isSubmitting || liveAnswersList.length === 0 || timeIsUp}>إرسال</Button>
                         </form>
                     ) : (
                         <p className="text-center text-muted-foreground animate-pulse">في انتظار {winner?.name || 'اللاعب الفائز'} للإجابة...</p>
                     )}
                </CardContent>
            </Card>
        );
    };

    /**
     * Renders the judging phase screen.
     */
    const renderJudging = () => {
        const allResultsIn = judgedResults.length >= contestantsWithSubmissions.length;
        const hasPlayerUsedRejudge = (game.prisonState?.rejudgeRequestsUsedBy || []).includes(self.id);
        const activeRejudgeRequest = game.prisonState?.activeRejudgeRequest;
        const isRejudging = game.gameState === 'rejudging';

        return (
            <Card className="w-full max-w-4xl relative animate-pop-in">
                <CardHeader className="text-center pt-8">
                    <CardTitle>{isRejudging ? 'إعادة التقييم' : 'مرحلة الحكم'}</CardTitle>
                    <CardDescription>
                       {isRejudging ? `القاضي يعيد النظر في حكمه بناءً على طلب ${activeRejudgeRequest?.name}...` : 'الحكم يقوم بمراجعة الإجابات...'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {game.prisonState?.judgeExplanation && (
                        <Alert className="mb-4 bg-yellow-100 border-yellow-300">
                          <RefreshCw className="h-4 w-4 text-yellow-800" />
                          <AlertTitle className='text-yellow-900'>رأي القاضي بخصوص الاعتراض</AlertTitle>
                          <AlertDescription className='text-yellow-800'>
                            {game.prisonState.judgeExplanation}
                          </AlertDescription>
                        </Alert>
                    )}
                    <ScrollArea className="h-96">
                        <div className="space-y-4 pr-4">
                        {contestantsWithSubmissions.map(player => {
                            const playerResult = judgedResults.find(r => r.playerId === player.id);
                            // Get all answers submitted by this player for the current round/auction type
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
                                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground"/>
                                    )}
                                </h3>
                                <div className="space-y-2">
                                    {allAnswers.map((answer, i) => {
                                        const isCorrect = playerResult ? playerResult.correctAnswers.includes(answer) : undefined;
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
                <CardFooter className="flex flex-col gap-2">
                    <div className="flex w-full gap-2">
                         {/* Button to request re-judge */}
                         {allResultsIn && !isRejudging && (
                            <Button 
                                variant="secondary" 
                                onClick={() => setIsRejudgeDialogOpen(true)} 
                                disabled={isSubmitting || hasPlayerUsedRejudge || !!activeRejudgeRequest}
                            >
                                <RefreshCw className="mr-2" />
                                {hasPlayerUsedRejudge ? 'تم استخدام فرصتك' : activeRejudgeRequest ? 'إعادة تقييم جارية...' : 'طلب إعادة تقييم'}
                            </Button>
                        )}
                        {/* Host button to proceed to results */}
                        {isHost && allResultsIn && (
                            <Button onClick={handleProceedFromJudging} disabled={isSubmitting} className="flex-grow">
                                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : 'عرض النتائج والجولة التالية'}
                            </Button>
                        )}
                    </div>
                </CardFooter>
            </Card>
        );
    };

    /**
     * Renders the round results screen.
     */
    const renderResults = () => {
        const result = game.prisonState?.lastRoundResult;
        if (!result) return (
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>جاري تحميل النتائج...</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                </CardContent>
            </Card>
        );
        
        // Sort players by score for leaderboard display
        const sortedPlayers = [...game.players].sort((a,b) => (game.playerScores?.[b.id] || 0) - (game.playerScores?.[a.id] || 0));
        const playersInPrison = game.players.filter(p => p.status === 'in_prison');
        const freedPlayerId = game.players.find(p => p.name === result?.freedPlayerName)?.id;

        return (
            <Card className="w-full max-w-5xl animate-pop-in">
                 <CardHeader className="text-center">
                    <CardTitle>نتيجة الجولة {game.round}</CardTitle>
                    <CardDescription className="text-lg font-bold p-2 bg-muted rounded-md mt-2">
                         {result.message}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2 md:col-span-2">
                        <h3 className="font-bold text-center text-lg">الترتيب العام</h3>
                         {sortedPlayers.map(p => {
                             const roundData = result.points?.[p.id];
                             const prisonHistory = game.prisonState?.prisonHistory?.[p.id];
                             const wasFreed = p.id === freedPlayerId;
                            return (
                             <div key={p.id} className="relative flex flex-col p-2 rounded-md bg-muted overflow-hidden">
                                {wasFreed && (
                                     <motion.div 
                                        className="absolute top-1 right-1 z-10"
                                        initial={{ scale: 0, rotate: -45 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.5 }}
                                    >
                                        <KeyRound className="w-6 h-6 text-yellow-500" />
                                    </motion.div>
                                )}
                                <div className="flex justify-between items-center">
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
                                                        <p>سيتم إرساله للسجن إذا لم يفز بمزاد خلال {4 - prisonHistory.roundsWithoutWinningAuction} جولات</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                    </div>
                                    <span className="font-bold text-lg text-primary">{game.playerScores?.[p.id] || 0}</span>
                                </div>
                                {roundData && roundData.breakdown.length > 0 && (
                                <div className="text-xs flex flex-wrap gap-x-2 pl-10">
                                    {roundData.breakdown.map((item, i) => (
                                        <span key={i} className={cn("font-semibold", item.points > 0 ? "text-green-600" : "text-red-600")}>
                                            ({item.points > 0 ? `+${item.points}` : item.points} {item.reason})
                                        </span>
                                    ))}
                                </div>
                                )}
                             </div>
                            )
                         })}
                    </div>
                     <div className="space-y-4">
                         <h3 className="font-bold text-center text-lg">السجناء</h3>
                         <div className="p-4 bg-gray-800 rounded-lg space-y-3 min-h-[200px] flex flex-col justify-center items-center">
                            {playersInPrison.length > 0 ? (
                                playersInPrison.map(p => (
                                <div key={p.id} className="relative w-full text-center bg-gray-700 p-2 rounded-md overflow-hidden">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12 mx-auto rounded-full border-2 border-gray-500"/>
                                    <p className="font-bold text-white mt-1">{p.name}</p>
                                    <p className="text-xs text-gray-300">مسجون لـ {game.prisonState?.prisonHistory?.[p.id]?.inPrison} جولات</p>
                                    {/* Prison bars animation */}
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
                                <div className="text-center text-gray-400 pt-8 flex flex-col items-center gap-2">
                                    <KeyRound className="w-12 h-12"/>
                                    <p>لا يوجد سجناء حاليًا!</p>
                                </div>
                            )}
                         </div>
                     </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    {isHost && (
                        <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : (game.round || 0) >= (game.prisonState?.settings.rounds || 10) ? 'عرض النتائج النهائية' : 'الجولة التالية'}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );
    };

    /**
     * Renders the final results screen at the end of the game.
     */
    const renderFinalResults = () => {
            // Calculate final scores and ranks
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
                        <CardDescription className="text-lg font-bold">{game.gameResult?.message || `الفائز هو ${winner?.name || 'مجهول'}!`}</CardDescription>
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

    /**
     * Determines and renders the appropriate game screen or animation overlay.
     */
    const renderContent = () => {
        // Prioritize animations
        if (animState.type === 'execution') {
            return <ExecutionAnimationOverlay playerName={animState.data.name} playerAvatarId={animState.data.avatarId} onAnimationEnd={() => {
                 setAnimState({ type: null, data: null }); // Clear animation state after it finishes
            }} />
        }
        
        // Render game phase screens
        switch (game.gameState) {
            case 'lobby': return renderLobby();
            case 'instructions': return renderInstructions();
            case 'open_auction': return renderOpenAuction();
            case 'closed_auction_bidding': return renderClosedAuctionBidding();
            case 'closed_auction_answering': return renderClosedAuctionAnswering();
            case 'judging':
            case 'rejudging': // Both judging states use the same render logic
                return renderJudging();
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
            {/* Animate presence for smooth transitions between game screens */}
            <AnimatePresence mode="wait">
                <motion.div
                    // Key changes when game state, round, or animation state changes, triggering re-render and animation
                    key={game.gameState + game.round + (animState.type || '')} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full flex items-center justify-center p-4"
                >
                    {renderContent()}
                </motion.div>
            </AnimatePresence>

            {/* AlertDialog for kicking players */}
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

            {/* Dialog for requesting re-judge */}
            <Dialog open={isRejudgeDialogOpen} onOpenChange={setIsRejudgeDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>طلب إعادة تقييم</DialogTitle>
                        <DialogDescription>
                            اكتب سببًا وجيهًا لاعتراضك. سيتم إرسال هذا السبب إلى الحكم (الذكاء الاصطناعي) ليأخذه في الاعتبار عند إعادة التقييم.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea 
                            placeholder="مثال: إجابتي صحيحة ولكن الذكاء الاصطناعي لم يفهمها..."
                            value={rejudgeReason}
                            onChange={(e) => setRejudgeReason(e.target.value)}
                            rows={3}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsRejudgeDialogOpen(false)}>إلغاء</Button>
                        <Button onClick={handleRequestRejudge} disabled={isSubmitting || !rejudgeReason.trim()}>
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : 'إرسال الطلب'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
