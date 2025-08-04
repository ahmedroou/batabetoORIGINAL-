
"use client";

import { useState, useMemo, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../../PlayerAvatar';
import { Loader2, CheckCircle2, MessageCircleOff, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import * as prisonActions from '@/lib/actions/prison';
import { CountdownTimer } from '../CountdownTimer';

interface JudgingPhaseProps {
    game: Game;
    self: Player;
}

export function JudgingPhase({ game, self }: JudgingPhaseProps) {
    const { toast } = useToast();
    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRejudgeDialogOpen, setIsRejudgeDialogOpen] = useState(false);
    const [rejudgeReason, setRejudgeReason] = useState("");
    
    const judgingStarted = !!game.prisonState?.judgingStarted;
    const judgedResults = game.prisonState?.aiJudgeResults || [];
    const contestantsWithSubmissions = useMemo(() => {
        const submissions = game.prisonState?.openAuctionSubmissions || {};
        const playerIds = Object.keys(submissions);
        if (playerIds.length === 0) return [];

        const auctionWinnerId = game.prisonState?.auctionWinnerId;
        if (auctionWinnerId) {
             const winner = game.players.find(p => p.id === auctionWinnerId);
             return winner ? [winner] : [];
        }
        return playerIds.map(playerId => game.players.find(p => p.id === playerId)).filter(p => p && p.role === 'contestant') as Player[];
    }, [game.prisonState?.openAuctionSubmissions, game.prisonState?.auctionWinnerId, game.players]);
    
    const allResultsIn = judgedResults.length >= contestantsWithSubmissions.length;
    const hasPlayerUsedRejudge = (game.prisonState?.rejudgeRequestsUsedBy || []).includes(self.id);
    const activeRejudgeRequest = game.prisonState?.activeRejudgeRequest;
    const isRejudging = game.gameState === 'rejudging';

    useEffect(() => {
        // Automatically trigger judging if it hasn't started yet and this is the host.
        if (isHost && !judgingStarted) {
            prisonActions.judgeAnswersAndProceed(game.id, self.id);
        }
    }, [isHost, judgingStarted, game.id, self.id]);

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
                // Immediately trigger the re-judge AI call
                await prisonActions.judgeAnswersAndProceed(game.id, self.id);
            } else {
                 toast({ title: "خطأ", description: result.error, variant: "destructive" });
            }
        } catch (error: any) {
            toast({ title: "خطأ في طلب إعادة التقييم", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setIsRejudgeDialogOpen(false);
            setRejudgeReason("");
        }
    };

    return (
        <>
        <Card className="w-full max-w-4xl relative animate-pop-in">
             {game.prisonState?.timerEndsAt && allResultsIn && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer 
                        gameId={game.id}
                        expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                        selfId={self.id}
                        isHost={isHost}
                    />
                </div>
            )}
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
                    {!judgingStarted ? (
                         <div className="text-center py-10">
                            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                            <p className="mt-4 text-muted-foreground">جاري إرسال الإجابات إلى الحكم...</p>
                        </div>
                    ) : (
                        contestantsWithSubmissions.map(player => {
                            const playerResult = judgedResults.find(r => r.playerId === player.id);
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
                        )})
                    )}
                    </div>
                </ScrollArea>
            </CardContent>
            <CardFooter className="flex-col gap-2">
                 <div className="flex w-full gap-2 justify-center">
                     {isHost && allResultsIn && (
                        <Button onClick={handleProceedFromJudging} disabled={isSubmitting} className="flex-grow">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : 'عرض النتائج والجولة التالية'}
                        </Button>
                    )}
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
                </div>
            </CardFooter>
        </Card>
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
