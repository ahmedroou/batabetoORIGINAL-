

"use client";

import { useState, useMemo, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../../PlayerAvatar';
import { Loader2, CheckCircle2, MessageCircleOff, RefreshCw, AlertTriangle, Scale, Bot } from 'lucide-react';
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
    
    const judgedResults = game.prisonState?.aiJudgeResults || [];
    const contestantsWithSubmissions = useMemo(() => {
        const submissions = game.prisonState?.openAuctionSubmissions || {};
        const playerIds = Object.keys(submissions);
        if (playerIds.length === 0) return [];

        const auctionWinnerId = game.prisonState?.auctionWinnerId;
        if (auctionWinnerId && submissions[auctionWinnerId]) {
             const winner = game.players.find(p => p.id === auctionWinnerId);
             return winner ? [winner] : [];
        }
        return playerIds.map(playerId => game.players.find(p => p.id === playerId)).filter(p => p && p.role === 'contestant') as Player[];
    }, [game.prisonState?.openAuctionSubmissions, game.prisonState?.auctionWinnerId, game.players]);
    
    const allResultsIn = judgedResults.length >= contestantsWithSubmissions.length;
    const hasPlayerUsedRejudge = (game.prisonState?.rejudgeRequestsUsedBy || []).includes(self.id);
    const activeRejudgeRequest = game.prisonState?.activeRejudgeRequest;
    const isRejudging = game.gameState === 'rejudging';
    const judgingStarted = game.prisonState?.judgingStarted || false;
    
    const canHostProceed = allResultsIn && (!isRejudging || (game.prisonState?.timerEndsAt && Date.now() > game.prisonState.timerEndsAt.toMillis()));

    const handleCallJudge = async () => {
        if (!isHost || judgingStarted) return;
        setIsSubmitting(true);
        try {
            await prisonActions.judgeAnswersAndProceed(game.id, isRejudging);
        } catch(e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    };

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
        <Card className="w-full max-w-4xl relative animate-pop-in bg-slate-900 border-slate-700 text-white shadow-2xl shadow-primary/20">
            {isRejudging && game.prisonState?.timerEndsAt && (
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
                <Scale className="w-16 h-16 text-primary mx-auto animate-pulse" />
                <CardTitle className="text-4xl font-extrabold">{isRejudging ? 'إعادة التقييم' : 'مرحلة الحكم'}</CardTitle>
                <CardDescription className="text-base text-slate-300">
                   {isRejudging ? `القاضي يعيد النظر في حكمه بناءً على طلب ${activeRejudgeRequest?.name}...` : 'راجع الإجابات، ثم اطلب من القاضي تقييمها.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {game.prisonState?.judgeExplanation && (
                    <Alert className="mb-4 bg-yellow-900/30 border-yellow-500/50 text-yellow-200">
                      <Bot className="h-4 w-4 text-yellow-300" />
                      <AlertTitle className='text-yellow-300'>رأي القاضي بخصوص الاعتراض</AlertTitle>
                      <AlertDescription>
                        {game.prisonState.judgeExplanation}
                      </AlertDescription>
                    </Alert>
                )}
                <ScrollArea className="h-96">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
                    {contestantsWithSubmissions.length > 0 ? (
                        contestantsWithSubmissions.map(player => {
                            const playerResult = judgedResults.find(r => r.playerId === player.id);
                            const allAnswers = game.prisonState?.openAuctionSubmissions?.[player.id] || [];
                            
                            return (
                            <motion.div 
                                key={player.id} 
                                className="p-4 bg-slate-800/70 rounded-lg border border-slate-600 space-y-3"
                                initial={{opacity: 0, y: 20}}
                                animate={{opacity: 1, y: 0}}
                                transition={{delay: 0.1}}
                            >
                                <h3 className="font-bold text-lg mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8"/>
                                        إجابات {player.name}
                                    </div>
                                    {playerResult ? (
                                        <span className="text-sm font-bold text-green-400">النتيجة: {playerResult.score}</span>
                                    ) : (
                                        judgingStarted && <Loader2 className="w-4 h-4 animate-spin text-slate-400"/>
                                    )}
                                </h3>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                    {allAnswers.length > 0 ? allAnswers.map((answer, i) => {
                                        const isCorrect = playerResult ? playerResult.correctAnswers.some(correct => correct.toLowerCase() === answer.toLowerCase()) : undefined;
                                        return (
                                            <div key={i} className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-md text-sm">
                                                <AnimatePresence>
                                                    {(playerResult && isCorrect !== undefined) ? (
                                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                                            {isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0"/> : <MessageCircleOff className="w-5 h-5 text-red-500 shrink-0"/>}
                                                        </motion.div>
                                                    ) : (
                                                        (judgingStarted || isRejudging) && <Loader2 className="w-5 h-5 text-slate-500 animate-spin shrink-0" />
                                                    )}
                                                </AnimatePresence>
                                                <span>{answer}</span>
                                            </div>
                                        )
                                    }) : <p className='text-center text-slate-500 text-sm'>لم يقدم اللاعب أي إجابات.</p>}
                                </div>
                                {playerResult && playerResult.evaluation && playerResult.evaluation !== 'لا تعليق' && (
                                     <Alert className="bg-slate-700/50 border-slate-600 text-slate-300 text-xs">
                                        <Bot className="h-4 w-4 text-primary"/>
                                        <AlertTitle>تقييم القاضي</AlertTitle>
                                        <AlertDescription>{playerResult.evaluation}</AlertDescription>
                                     </Alert>
                                )}
                            </motion.div>
                        )})
                    ) : (
                         <div className="text-center py-10 md:col-span-2">
                             <p className="mt-4 text-slate-400">لم يتم تقديم أي إجابات بعد.</p>
                        </div>
                    )}
                    </div>
                </ScrollArea>
            </CardContent>
            <CardFooter className="flex-col gap-2 pt-4">
                 <div className="flex w-full gap-2 justify-center">
                     {isHost && !judgingStarted && (
                        <Button onClick={handleCallJudge} disabled={isSubmitting || contestantsWithSubmissions.length === 0}>
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Scale className="mr-2"/>} 
                            استدعاء القاضي
                        </Button>
                     )}
                     {judgingStarted && !allResultsIn && (
                        <p className="text-center text-slate-400 animate-pulse">القاضي يقوم بتقييم الإجابات...</p>
                     )}
                     {isHost && canHostProceed && (
                        <Button onClick={handleProceedFromJudging} disabled={isSubmitting} className="flex-grow bg-primary hover:bg-primary/90">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : 'عرض النتائج والجولة التالية'}
                        </Button>
                    )}
                    {isHost && allResultsIn && !canHostProceed && (
                        <p className="text-center text-slate-400 animate-pulse">انتظر قليلاً قبل المتابعة...</p>
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
                {!isHost && !judgingStarted && <p className="text-center text-slate-400 animate-pulse">في انتظار المضيف لاستدعاء القاضي...</p>}
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
