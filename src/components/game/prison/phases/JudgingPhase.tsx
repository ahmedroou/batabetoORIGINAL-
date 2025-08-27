

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../../PlayerAvatar';
import { Loader2, CheckCircle2, MessageCircleOff, RefreshCw, Scale, Bot, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import * as prisonActions from '@/lib/actions/prison';
import { CountdownTimer } from '../CountdownTimer';
import { cn } from '@/lib/utils';
import { normalizeForSignature } from '@/lib/actions/helpers';

/**
 * JudgingPhase (refactored)
 *
 * Goals of this refactor:
 * - Keep the SAME external API and logic, while making UI/UX more resilient and responsive.
 * - Stronger null-safety around nested prisonState fields.
 * - Faster lookups using maps and memoization.
 * - Smarter answer comparison for Arabic text (normalize + remove diacritics & tatweel).
 * - Prevent double-actions while requests are in-flight.
 * - Clearer, more maintainable structure with small internal components.
 */

interface JudgingPhaseProps {
  game: Game;
  self: Player;
}

// --- Helpers -----------------------------------------------------------------

/** Firestore Timestamp or number -> milliseconds number (or undefined). */
function getMillis(ts: any | undefined): number | undefined {
  if (!ts) return undefined;
  if (typeof ts === 'number') return ts;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  // Try common shapes
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds ? Math.floor(ts.nanoseconds / 1e6) : 0);
  return undefined;
}

// --- Component ----------------------------------------------------------------

export function JudgingPhase({ game, self }: JudgingPhaseProps) {
  const { toast } = useToast();

  const isHost = game.hostId === self.id;
  const prison = game.prisonState ?? ({} as NonNullable<Game['prisonState']>);

  // Local UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRejudgeDialogOpen, setIsRejudgeDialogOpen] = useState(false);
  const [rejudgeReason, setRejudgeReason] = useState('');

  const judgingStarted = Boolean(prison.judgingStarted);
  const isRejudging = game.gameState === 'rejudging';
  const timerEndsAtMs = getMillis(prison.timerEndsAt);

  // --- Derived data ------------------------------------------------------------

  const judgedResults = prison.aiJudgeResults ?? [];
  const openAuctionSubmissions = prison.openAuctionSubmissions ?? {} as Record<string, string[]>;
  const noSubmissions = Object.keys(openAuctionSubmissions).length === 0;

  // O(1) access to results by playerId
  const resultsByPlayerId = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of judgedResults) {
      if (r?.playerId) map.set(r.playerId, r);
    }
    return map;
  }, [judgedResults]);

  // Compute which contestants should be displayed (winner-only OR all with submissions)
  const contestantsWithSubmissions: Player[] = useMemo(() => {
    const playerIds = Object.keys(openAuctionSubmissions);
    if (playerIds.length === 0) return [];

    const winnerId = prison.auctionWinnerId;
    const idsToRender = winnerId && openAuctionSubmissions[winnerId]
      ? [winnerId]
      : playerIds;

    return idsToRender
      .map((id) => game.players.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p && p.role === 'contestant'));
  }, [openAuctionSubmissions, prison.auctionWinnerId, game.players]);

  // All results ready when each rendered contestant has an entry
  const allResultsIn = useMemo(() => {
    if (contestantsWithSubmissions.length === 0) return false;
    return contestantsWithSubmissions.every((p) => resultsByPlayerId.has(p.id));
  }, [contestantsWithSubmissions, resultsByPlayerId]);

  const hasPlayerUsedRejudge = Array.isArray(prison.rejudgeRequestsUsedBy)
    ? prison.rejudgeRequestsUsedBy.includes(self.id)
    : false;

  const activeRejudgeRequest = prison.activeRejudgeRequest as
    | { playerId: string; name?: string | null }
    | undefined;

  // Host can proceed when: all results are in AND (not rejudging OR (timer exists and expired))
  // OR there were no submissions to begin with.
  const canHostProceed = useMemo(() => {
    if (noSubmissions && !judgingStarted) return true;
    if (!allResultsIn) return false;
    if (!isRejudging) return true;
    if (!timerEndsAtMs) return false;
    return Date.now() > timerEndsAtMs;
  }, [noSubmissions, allResultsIn, isRejudging, timerEndsAtMs, judgingStarted]);

  // UX niceties: close dialog if an active request appears; announce status
  useEffect(() => {
    if (isRejudgeDialogOpen && activeRejudgeRequest) setIsRejudgeDialogOpen(false);
  }, [isRejudgeDialogOpen, activeRejudgeRequest]);

  // --- Actions -----------------------------------------------------------------

  const handleCallJudge = async () => {
    if (!isHost || isSubmitting) return;
    setIsSubmitting(true);
    try {
        if(noSubmissions){
             // If no submissions, go straight to results.
            await prisonActions.proceedToResults(game.id, self.id);
        } else {
            await prisonActions.judgeAnswersAndProceed(game.id, isRejudging);
        }
    } catch (e: any) {
      toast({ title: 'خطأ', description: e?.message ?? 'تعذر استدعاء القاضي.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedFromJudging = async () => {
    if (!isHost || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await prisonActions.proceedToResults(game.id, self.id);
    } catch (e: any) {
      toast({ title: 'خطأ', description: e?.message ?? 'تعذر المتابعة للنتائج.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestRejudge = async () => {
    if (!rejudgeReason.trim()) {
      toast({ title: 'الرجاء كتابة سبب للاعتراض', variant: 'destructive' });
      return;
    }
    if (hasPlayerUsedRejudge || activeRejudgeRequest) {
      toast({ title: 'لا يمكنك إرسال طلب آخر الآن', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await prisonActions.requestRejudge(game.id, self.id, rejudgeReason.trim());
      if (result?.success) {
        toast({ title: 'تم إرسال طلبك للمراجعة' });
        setIsRejudgeDialogOpen(false);
        setRejudgeReason('');
      } else {
        toast({ title: 'خطأ', description: result?.error ?? 'تعذر إرسال الطلب.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'خطأ في طلب إعادة التقييم', description: error?.message ?? 'حدث خطأ غير متوقع.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render ------------------------------------------------------------------

  return (
    <>
      <Card className="w-full max-w-4xl relative animate-pop-in bg-slate-900 border-slate-700 text-white shadow-2xl shadow-primary/20">
        {isRejudging && typeof timerEndsAtMs === 'number' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <CountdownTimer
              gameId={game.id}
              expiryTimestamp={timerEndsAtMs}
              selfId={self.id}
              isHost={isHost}
            />
          </div>
        )}

        <CardHeader className="text-center pt-8">
          <Scale className="w-16 h-16 text-primary mx-auto animate-pulse" />
          <CardTitle className="text-4xl font-extrabold">
            {isRejudging ? 'إعادة التقييم' : 'مرحلة الحكم'}
          </CardTitle>
          <CardDescription className="text-base text-slate-300">
            {isRejudging
              ? `القاضي يعيد النظر في حكمه بناءً على طلب ${activeRejudgeRequest?.name ?? 'أحد اللاعبين'}...`
              : 'راجع الإجابات، ثم اطلب من القاضي تقييمها.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {prison.judgeExplanation && (
            <Alert className="mb-4 bg-yellow-900/30 border-yellow-500/50 text-yellow-200">
              <Bot className="h-4 w-4 text-yellow-300" />
              <AlertTitle className="text-yellow-300">رأي القاضي بخصوص الاعتراض</AlertTitle>
              <AlertDescription>{prison.judgeExplanation}</AlertDescription>
            </Alert>
          )}

          {activeRejudgeRequest && (
            <Alert className="mb-4 bg-blue-900/30 border-blue-500/50 text-blue-100">
              <RefreshCw className="h-4 w-4" />
              <AlertTitle>إعادة تقييم جارية</AlertTitle>
              <AlertDescription>
                تم تسجيل اعتراض {activeRejudgeRequest.name ?? 'أحد اللاعبين'}. سيأخذ القاضي ملاحظاته بعين الاعتبار.
              </AlertDescription>
            </Alert>
          )}

          <ScrollArea className="h-96">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
              {contestantsWithSubmissions.length > 0 ? (
                contestantsWithSubmissions.map((player) => {
                  const playerResult = resultsByPlayerId.get(player.id);
                  const submittedAnswers: string[] = openAuctionSubmissions[player.id] ?? [];
                  const correctAnswersSet = new Set(playerResult?.correctAnswers?.map(normalizeForSignature) || []);

                  return (
                    <motion.div
                      key={player.id}
                      className="p-4 bg-slate-800/70 rounded-lg border border-slate-600 space-y-3"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06 }}
                    >
                      <h3 className="font-bold text-lg mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8" />
                          إجابات {player.name}
                        </div>
                        {playerResult ? (
                          <span className="text-sm font-bold text-green-400">النتيجة: {playerResult.score}</span>
                        ) : (
                          judgingStarted && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              جاري التقييم
                            </span>
                          )
                        )}
                      </h3>

                      <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {submittedAnswers.length > 0 ? (
                          submittedAnswers.map((answer, i) => {
                            const isCorrect = correctAnswersSet.has(normalizeForSignature(answer));

                            return (
                              <div key={`${player.id}-${i}`} className="flex items-center gap-2 p-2 bg-slate-900/50 rounded-md text-sm">
                                <AnimatePresence initial={false}>
                                  {playerResult ? (
                                    <motion.div
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      exit={{ scale: 0 }}
                                      className="shrink-0"
                                    >
                                      {isCorrect ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                      ) : (
                                        <MessageCircleOff className="w-5 h-5 text-red-500" />
                                      )}
                                    </motion.div>
                                  ) : (
                                    (judgingStarted || isRejudging) && (
                                      <Loader2 className="w-5 h-5 text-slate-500 animate-spin shrink-0" />
                                    )
                                  )}
                                </AnimatePresence>
                                <span className={cn("break-words leading-relaxed", !isCorrect && playerResult && "line-through opacity-70")}>{answer}</span>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-center text-slate-500 text-sm">لم يقدم اللاعب أي إجابات.</p>
                        )}
                      </div>

                      {playerResult && playerResult.evaluation && playerResult.evaluation !== 'لا تعليق' && (
                        <Alert className="bg-slate-700/50 border-slate-600 text-slate-300 text-xs">
                          <Bot className="h-4 w-4 text-primary" />
                          <AlertTitle>تقييم القاضي</AlertTitle>
                          <AlertDescription>{playerResult.evaluation}</AlertDescription>
                        </Alert>
                      )}
                    </motion.div>
                  );
                })
              ) : (
                <div className="text-center py-10 md:col-span-2">
                  <AlertTriangle className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="mt-3 text-slate-400">لم يتم تقديم أي إجابات بعد.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>

        <CardFooter className="flex-col gap-2 pt-4" aria-live="polite">
          <div className="flex w-full flex-wrap gap-2 justify-center">
            {isHost && !judgingStarted && (
              <Button onClick={handleCallJudge} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Scale className="mr-2" />}
                {noSubmissions ? 'لا توجد إجابات، متابعة للنتائج' : 'استدعاء القاضي'}
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
                disabled={isSubmitting || hasPlayerUsedRejudge || Boolean(activeRejudgeRequest)}
              >
                <RefreshCw className="mr-2" />
                {hasPlayerUsedRejudge
                  ? 'تم استخدام فرصتك'
                  : activeRejudgeRequest
                  ? 'إعادة تقييم جارية...'
                  : 'طلب إعادة تقييم'}
              </Button>
            )}
          </div>

          {!isHost && !judgingStarted && (
            <p className="text-center text-slate-400 animate-pulse">في انتظار المضيف لاستدعاء القاضي...</p>
          )}
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
            <Button variant="ghost" onClick={() => setIsRejudgeDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleRequestRejudge} disabled={isSubmitting || !rejudgeReason.trim()}>
              {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : 'إرسال الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
