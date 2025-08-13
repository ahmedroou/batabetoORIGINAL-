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
  const [answerState, setAnswerState] = useState<'pending' | 'correct' | 'incorrect'>('pending');

  const question = game.educatedMerchantState?.currentQuestion ?? null;
  const pendingPurchase = game.educatedMerchantState?.pendingPurchase ?? null;
  const pendingFine = game.educatedMerchantState?.pendingFine ?? null;

  // modal open when server sets gameState 'question' and a pending action exists
  const isOpen = game.gameState === 'question' && (pendingPurchase !== null || pendingFine !== null);

  const questionPlayerId = pendingPurchase?.playerId ?? pendingFine?.playerId;
  const isMyTurnToAnswer = questionPlayerId === self.id;
  const isHost = game.hostId === self.id;
  const isFineQuestion = !!pendingFine;

  // reset local UI state when new question/pending or modal open/close
  useEffect(() => {
    if (isOpen && isMyTurnToAnswer) {
      setSelectedAnswer(null);
      setIsSubmitting(false);
      setAnswerState('pending');
    } else {
      // reset also when modal closed or it's not my turn
      setSelectedAnswer(null);
      setIsSubmitting(false);
      setAnswerState('pending');
    }
  }, [isOpen, question?.id, pendingPurchase?.playerId, pendingFine?.playerId, isMyTurnToAnswer]);

  const handleSubmit = useCallback(async () => {
    if (!selectedAnswer || !isMyTurnToAnswer || !question) return;

    // local instant feedback
    const isCorrect = selectedAnswer === question.answer;
    setAnswerState(isCorrect ? 'correct' : 'incorrect');
    setIsSubmitting(true);

    // short visual delay so player sees feedback, then call server
    setTimeout(async () => {
      try {
        await answerQuestion(game.id, self.id, selectedAnswer);
        // server will update game state (close modal or advance). we don't need to do more here.
      } catch (err) {
        // revert UI if server-side fails
        console.error('Failed to submit answer', err);
        setIsSubmitting(false);
        setAnswerState('pending');
        // keep selectedAnswer so user can retry if desired
      }
    }, 700); // 700ms feedback before sending (matches your previous UX)
  }, [selectedAnswer, isMyTurnToAnswer, question, game.id, self.id]);

  if (!isOpen) return null;

  const playerOnQuestion = game.players.find((p) => p.id === questionPlayerId) ?? null;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="max-w-xl bg-gray-900/80 backdrop-blur-md border-primary/30 text-white"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* overlays for immediate feedback */}
        <AnimatePresence>
          {answerState === 'correct' && isMyTurnToAnswer && (
            <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1.08 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <Check className="w-44 h-44 text-green-500/35" />
            </motion.div>
          )}
          {answerState === 'incorrect' && isMyTurnToAnswer && (
            <motion.div initial={{ opacity: 0, rotate: -12, scale: 0.8 }} animate={{ opacity: 1, rotate: 0, scale: 1.05 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <X className="w-44 h-44 text-red-500/35" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* countdown for answering player */}
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

        {/* if question object hasn't arrived from server yet, show loader */}
        {!question ? (
          <div className="py-8 flex flex-col items-center gap-4">
            <Loader2 className="animate-spin w-10 h-10 text-primary" />
            <div className="text-sm text-slate-300">جارٍ جلب السؤال... يرجى الانتظار</div>
          </div>
        ) : (
          <>
            {isMyTurnToAnswer ? (
              <motion.div animate={answerState === 'incorrect' ? { x: [-6, 6, -6, 6, 0] } : {}} transition={{ duration: 0.35 }}>
                <div className="py-4">
                  <RadioGroup value={selectedAnswer ?? ''} onValueChange={(v) => setSelectedAnswer(v || null)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {question.options.map((option, i) => {
                      const isTheSelected = option === selectedAnswer;
                      const isTheCorrect = option === question.answer;

                      return (
                        <Label
                          key={i}
                          htmlFor={`option-${i}`}
                          className={cn(
                            'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            // when still answering (pending) show selection highlight
                            answerState === 'pending' && (isTheSelected ? 'border-primary bg-primary/20' : 'border-slate-700 bg-slate-800/50'),
                            // feedback when correct
                            answerState === 'correct' && isTheSelected && 'border-green-500 bg-green-500/20 opacity-100',
                            // feedback when incorrect: selected -> red; correct -> highlight green ring
                            answerState === 'incorrect' && isTheSelected && 'border-red-500 bg-red-500/20 opacity-100',
                            answerState === 'incorrect' && isTheCorrect && 'ring-2 ring-green-400/30'
                          )}
                        >
                          <RadioGroupItem value={option} id={`option-${i}`} disabled={answerState !== 'pending'} />
                          <span className="text-base font-semibold">{option}</span>
                        </Label>
                      );
                    })}
                  </RadioGroup>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSubmit} disabled={!selectedAnswer || isSubmitting || answerState !== 'pending'} className="flex-1">
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإجابة'}
                  </Button>
                </div>
              </motion.div>
            ) : (
              // not my turn: show question and options read-only
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
