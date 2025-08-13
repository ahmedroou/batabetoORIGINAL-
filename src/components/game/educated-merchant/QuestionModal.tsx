'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { Game, Player } from '@/types';
import { useState, useEffect, useCallback } from 'react';
import { answerQuestion } from '@/lib/actions/educated-merchant';
import { Loader2, Check, X, HelpCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { CountdownTimer } from '@/components/game/CountdownTimer';

export function QuestionModal({ game, self }: { game: Game; self: Player }) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitFailed, setSubmitFailed] = useState<string | null>(null);

  const question = game.educatedMerchantState?.currentQuestion ?? null;
  const pendingPurchase = game.educatedMerchantState?.pendingPurchase ?? null;
  const pendingFine = game.educatedMerchantState?.pendingFine ?? null;

  const isOpen = game.gameState === 'question' && (pendingPurchase !== null || pendingFine !== null);
  const questionPlayerId = pendingPurchase?.playerId ?? pendingFine?.playerId;
  const isMyTurnToAnswer = questionPlayerId === self.id;
  const isHost = game.hostId === self.id;
  const isFineQuestion = !!pendingFine;

  // reset local state when a new question/pending appears or modal closes
  useEffect(() => {
    if (isOpen) {
      setSelectedAnswer(null);
      setIsSubmitting(false);
      setSubmitted(false);
      setSubmitFailed(null);
    } else {
      setSelectedAnswer(null);
      setIsSubmitting(false);
      setSubmitted(false);
      setSubmitFailed(null);
    }
  }, [isOpen, question?.id, pendingPurchase?.playerId, pendingFine?.playerId]);

  const handleSubmit = useCallback(async () => {
    if (!selectedAnswer || !isMyTurnToAnswer || !question) return;
    setIsSubmitting(true);
    setSubmitFailed(null);

    // We DO NOT check correctness locally here to avoid revealing the answer.
    // Show a 'submitted' state briefly, then call server action.
    setSubmitted(true);

    try {
      await answerQuestion(game.id, self.id, selectedAnswer);
      // server will update game state and modal will close (or update).
      // keep UI until server override (or you may close here).
    } catch (err: any) {
      console.error('Failed to submit answer', err);
      setSubmitFailed(err?.message || 'فشل إرسال الإجابة');
      setIsSubmitting(false);
      setSubmitted(false);
    }
  }, [selectedAnswer, isMyTurnToAnswer, question, game.id, self.id]);

  if (!isOpen) return null;

  const playerOnQuestion = game.players.find((p) => p.id === questionPlayerId) ?? null;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="max-w-xl bg-gray-900/80 backdrop-blur-md border-primary/30 text-white"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* show a generic submitted animation if user clicked confirm */}
        <AnimatePresence>
          {submitted && isMyTurnToAnswer && !isSubmitting && (
            <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <Check className="w-44 h-44 text-green-500/30" />
            </motion.div>
          )}
          {submitFailed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute top-8 left-1/2 -translate-x-1/2 z-30">
              <div className="bg-rose-700/80 text-white px-4 py-2 rounded">{submitFailed}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {game.educatedMerchantState?.timerEndsAt && isMyTurnToAnswer && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <CountdownTimer
              gameId={game.id}
              gameType="educated-merchant"
              expiryTimestamp={game.educatedMerchantState.timerEndsAt.toMillis()}
              selfId={self.id}
              isHost={isHost}
            />
          </div>
        )}

        <DialogHeader className="text-center pt-12 md:pt-20">
          {isFineQuestion ? <AlertTriangle className="w-12 h-12 mx-auto text-red-400" /> : <HelpCircle className="w-12 h-12 mx-auto text-primary" />}

          <DialogTitle className="text-2xl">
            {question?.question ?? (isFineQuestion ? 'سؤال الغرامة!' : 'سؤال')}
          </DialogTitle>

          {isFineQuestion && <p className="text-yellow-300 font-bold">أجب بشكل صحيح لتنجو من الغرامة!</p>}

          {!isMyTurnToAnswer && (
            <DialogDescription className="text-base text-yellow-300 animate-pulse">
              في انتظار {playerOnQuestion?.name ?? 'اللاعب'} للإجابة...
            </DialogDescription>
          )}
        </DialogHeader>

        {!question ? (
          <div className="py-8 flex flex-col items-center gap-4">
            <Loader2 className="animate-spin w-10 h-10 text-primary" />
            <div className="text-sm text-slate-300">جارٍ جلب السؤال... يرجى الانتظار</div>
          </div>
        ) : (
          <>
            {isMyTurnToAnswer ? (
              <motion.div animate={{}} transition={{ duration: 0.2 }}>
                <div className="py-4">
                  <RadioGroup value={selectedAnswer ?? ''} onValueChange={(v) => setSelectedAnswer(v || null)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {question.options.map((option, i) => (
                      <Label
                        key={i}
                        htmlFor={`option-${i}`}
                        className={cn(
                          'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                          submitted && 'pointer-events-none opacity-60',
                          !submitted && (selectedAnswer === option ? 'border-primary bg-primary/20' : 'border-slate-700 bg-slate-800/50')
                        )}
                      >
                        <RadioGroupItem value={option} id={`option-${i}`} disabled={submitted} />
                        <span className="text-base font-semibold">{option}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSubmit} disabled={!selectedAnswer || submitted || isSubmitting} className="flex-1">
                    {isSubmitting ? <Loader2 className="animate-spin" /> : (submitted ? 'مرسل...' : 'تأكيد الإجابة')}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <div className="py-4">
                <div className="mb-3 text-sm text-slate-300">السؤال:</div>
                <div className="mb-4 p-3 rounded bg-slate-800/40 border border-slate-700">{question.question}</div>

                <div className="text-sm text-slate-300 mb-2">الخيارات:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {question.options.map((opt, i) => (
                    <div key={i} className="p-3 rounded border border-slate-700 bg-slate-800/50 text-sm">
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
