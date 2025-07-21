

"use client";

import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, TimerIcon } from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import * as roomActions from '@/lib/actions/room';
import * as prisonActions from '@/lib/actions/prison';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Copy, Check, LogOut, Users, ArrowRight, UserX, Send } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';


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

export function PrisonGame({ game, self }: PrisonGameProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [openAuctionAnswer, setOpenAuctionAnswer] = useState("");

    const isHost = game.hostId === self.id;
    const isJudge = game.prisonState?.judgeId === self.id;
    const isContestant = self.role === 'contestant';
    
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);
    const contestants = useMemo(() => game?.players.filter(p => p.role === 'contestant'), [game?.players]);
    const judge = useMemo(() => game?.players.find(p => p.role === 'judge'), [game?.players]);

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
            const result = await prisonActions.submitOpenAuctionAnswers(game.id, self.id, openAuctionAnswer, isTimeout);
            if (result.error) {
                toast({ title: "خطأ", description: result.error, variant: "destructive" });
            } else {
                 toast({ title: "تم إرسال إجابتك بنجاح!" });
            }
        } catch (error: any) {
            toast({ title: "خطأ فادح", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }, [game.id, self.id, openAuctionAnswer, toast, game.prisonState?.openAuctionSubmissions]);


    const renderLobby = () => (
        <Card className="w-full max-w-lg">
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
            <CardContent>
                <div className="space-y-2">
                    <h3 className="font-bold">اللاعبون ({activePlayers.length})</h3>
                    <div className="space-y-2">
                        {activePlayers.map(p => (
                            <div key={p.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                    <span>{p.name}</span>
                                </div>
                                {isHost && p.id !== self.id && (
                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setPlayerToKick(p)}>
                                        <UserX />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex-col gap-2">
                {isHost && (
                    <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 3} className="w-full">
                        <ArrowRight />
                        {isSubmitting ? 'جاري البدء...' : activePlayers.length < 3 ? "تحتاج 3 لاعبين على الأقل" : "ابدأ اللعبة"}
                    </Button>
                )}
                <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                    <LogOut /> مغادرة
                </Button>
            </CardFooter>
        </Card>
    );

    const renderOpenAuctionAnswering = () => {
        const hasSubmitted = !!game.prisonState?.openAuctionSubmissions?.[self.id];

        if (isJudge) {
            return (
                <Card className="w-full max-w-lg text-center">
                    <CardHeader>
                        <CardTitle>أنت القاضي</CardTitle>
                        <CardDescription>في انتظار المتسابقين لتقديم إجاباتهم...</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card className="w-full max-w-lg relative">
                 {game.prisonState?.answeringEndsAt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                        <CountdownTimer 
                            expiryTimestamp={game.prisonState.answeringEndsAt.toMillis()}
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
                           <Textarea
                                placeholder={"اكتب قائمة إجاباتك هنا، كل إجابة في سطر..."}
                                value={openAuctionAnswer}
                                onChange={(e) => setOpenAuctionAnswer(e.target.value)}
                                rows={8}
                                disabled={isSubmitting}
                            />
                            <Button onClick={() => handleSubmitOpenAuction(false)} disabled={isSubmitting || !openAuctionAnswer.trim()} className="w-full">
                                <Send className="mr-2" /> {isSubmitting ? 'جاري الإرسال...' : 'إرسال الإجابات'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }
    
    const renderFallbackState = (state: string) => (
         <Card>
            <CardHeader><CardTitle>لعبة السجن</CardTitle></CardHeader>
            <CardContent>
                <p>حالة قيد الإنشاء: {state}</p>
                <Loader2 className="animate-spin" />
            </CardContent>
        </Card>
    );

    // Main render logic based on gameState
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
        );
    }
    
    if (game.gameState === 'open_auction_answering') {
        return renderOpenAuctionAnswering();
    }
    
    // Placeholder for other game states
    return renderFallbackState(game.gameState);
}
