"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Player, EducatedMerchantQuestion } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Loader2, Timer, HelpCircle, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { answerQuestion } from '@/lib/actions/educated-merchant';

interface QuestionModalProps {
  game: Game;
  self: Player;
  onAnswered?: (answer: string | null, correct: boolean | null) => void; // optional callback
}

const QUESTION_TIME_LIMIT = 25; // seconds (UI fallback)

function TimerRing({ ratio }: { ratio: number }) {
  // ratio: 0..1 (1 = full time remaining)
  const circumference = 2 * Math.PI * 45; // r=45
  const dash = Math.max(0, Math.min(1, ratio)) * circumference;
  return (
    <svg viewBox="0 0 100 100" className="w-16 h-16">
      <circle cx="50" cy="50" r="45" strokeWidth="8" stroke="var(--muted)" fill="transparent" className="opacity-30" />
      <circle
        cx="50"
        cy="50"
        r="45"
        strokeWidth="8"
        stroke="var(--primary)"
        fill="transparent"
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
    </svg>
  );
}

export function QuestionModal({ game, self, onAnswered }: QuestionModalProps) {
  const { toast } = useToast();
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(QUESTION_TIME_LIMIT);
  const submitRef = useRef(false);

  const question: EducatedMerchantQuestion | undefined = game.educatedMerchantState?.currentQuestion as any;
  const turnOrder = game.educatedMerchantState?.turnOrder ?? [];
  const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
  const timerEndsAt = game.educatedMerchantState?.timerEndsAt;
  const activePlayerId = turnOrder[currentTurnIndex];
  const isMyTurn = activePlayerId === self.id;

  // compute end timestamp (ms)
  const endTimestamp = useMemo(() => {
    if (!timerEndsAt) return null;
    // support Firestore Timestamp-like objects
    if (typeof (timerEndsAt as any)?.toMillis === 'function') return (timerEndsAt as any).toMillis();
    if (typeof timerEndsAt === 'number') return timerEndsAt;
    return null;
  }, [timerEndsAt]);

  // update timer every 250ms for smooth ring animation
  useEffect(() => {
    if (!isMyTurn) {
      setTimeLeft(null);
      return;
    }
    let mounted = true;
    const update = () => {
      if (!mounted) return;
      const now = Date.now();
      if (!endTimestamp) {
        setTimeLeft(QUESTION_TIME_LIMIT);
        return;
      }
      const remaining = Math.max(0, Math.round((endTimestamp - now) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        // timeout
        handleTimeout();
      }
    };

    update();
    const id = setInterval(update, 250);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [endTimestamp, isMyTurn]);

  // guard to prevent double submissions
  const handleSubmitAnswer = useCallback(async (answer: string | null) => {
    if (!isMyTurn) return;
    if (submitRef.current) return;
    submitRef.current = true;
    setIsSubmitting(true);
    setSubmittedAnswer(answer);
    try {
      const result = await answerQuestion(game.id, self.id, answer);
      if (result?.error) {
        toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        // allow retry
        submitRef.current = false;
        setIsSubmitting(false);
        setSubmittedAnswer(null);
        return;
      }
      const correct = answer === question?.correctAnswer;
      onAnswered?.(answer, typeof correct === 'boolean' ? correct : null);
    } catch (e) {
      console.error(e);
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء إرسال إجابتك.', variant: 'destructive' });
      submitRef.current = false;
      setIsSubmitting(false);
      setSubmittedAnswer(null);
    }
  }, [game.id, self.id, isMyTurn, question, toast, onAnswered]);

  // timeout handler
  const handleTimeout = useCallback(async () => {
    if (!isMyTurn) return;
    if (submitRef.current) return;
    submitRef.current = true;
    setIsSubmitting(true);
    setSubmittedAnswer('__TIMEOUT__');
    try {
      const result = await answerQuestion(game.id, self.id, null);
      if (result?.error) {
        toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
      }
      onAnswered?.(null, null);
    } catch (e) {
      console.error(e);
      toast({ title: 'خطأ', description: 'فشل أثناء إرسال عدم الإجابة.', variant: 'destructive' });
      // allow retry? no — timeout is final
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, isMyTurn, toast, onAnswered]);

  // keyboard shortcuts: 1..4 select option, Enter to submit
  useEffect(() => {
    if (!isMyTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        if (question && idx >= 0 && idx < (question.options?.length ?? 0)) {
          setSelectedAnswer(question.options[idx]);
        }
      }
      if (e.key === 'Enter') {
        if (selectedAnswer && !submittedAnswer && !isSubmitting) {
          handleSubmitAnswer(selectedAnswer);
        }
      }
      if (e.key === 'Escape') {
        // optional: allow cancel? do nothing for safety
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMyTurn, question, selectedAnswer, submittedAnswer, isSubmitting, handleSubmitAnswer]);

  // reset local state when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setSubmittedAnswer(null);
    submitRef.current = false;
    setIsSubmitting(false);
  }, [question?.id]);

  if (!question) return null;

  // spectator view
  if (!isMyTurn) {
    const activePlayer = game.players.find(p => p.id === activePlayerId);
    return (
      <div className="absolute inset-0 z-40 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl">
          <Card className="bg-gradient-to-br from-purple-900/80 to-black/70 text-white">
            <CardHeader>
              <div className="flex items-center gap-3">
                <HelpCircle className="w-6 h-6 text-yellow-300" />
                <CardTitle>سؤال التاجر</CardTitle>
              </div>
              <CardDescription className="mt-2 text-lg font-semibold">{activePlayer?.name ?? '...'} يُجيب الآن</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-black/30 rounded-md text-center text-lg">{question.question}</div>
              <div className="mt-4 flex items-center gap-3 justify-center text-yellow-300">
                <Loader2 className="w-5 h-5 animate-spin" />
                <div>في انتظار إجابة اللاعب...</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // active player view
  const remaining = timeLeft ?? QUESTION_TIME_LIMIT;
  const ratio = Math.max(0, Math.min(1, remaining / QUESTION_TIME_LIMIT));

  const answerIsCorrect = (ans: string | null) => ans != null && ans === question.correctAnswer;

  return (
    <div className="absolute inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-6 h-6 text-violet-600" />
                <CardTitle>سؤال التاجر</CardTitle>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <TimerRing ratio={ratio} />
                  <div className="text-xs font-mono mt-1">{remaining}s</div>
                </div>
              </div>
            </div>
            <CardDescription className="mt-3 text-lg font-semibold">{question.question}</CardDescription>
          </CardHeader>

          <CardContent>
            <RadioGroup
              value={selectedAnswer ?? ''}
              onValueChange={(v) => setSelectedAnswer(v || null)}
              disabled={!!submittedAnswer}
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
              aria-label="اختيارات السؤال"
            >
              {question.options.map((option, i) => {
                const isSelected = selectedAnswer === option;
                const isSubmitted = submittedAnswer != null;
                const correct = answerIsCorrect(option);

                const base = 'flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all duration-200';
                let style = 'border-border bg-transparent hover:bg-muted/50';
                if (!isSubmitted && isSelected) style = 'border-primary bg-primary/10';
                if (isSubmitted) {
                  if (option === submittedAnswer) {
                    style = correct ? 'border-emerald-500 bg-emerald-100 text-emerald-800' : 'border-destructive bg-destructive/10 text-destructive';
                  } else if (correct) {
                    style = 'border-emerald-300 bg-emerald-50';
                  } else {
                    style = 'opacity-60 border-border bg-transparent';
                  }
                }

                return (
                  <Label key={i} htmlFor={`option-${i}`} className={cn(base, style)}>
                    <RadioGroupItem id={`option-${i}`} value={option} className="w-5 h-5 mt-1" />
                    <div className="flex-1">
                      <div className="text-base font-medium">{option}</div>
                      <div className="text-xs text-muted-foreground mt-1">اضغط {i + 1} لاختيار سريع</div>
                    </div>
                    {isSubmitted && option === submittedAnswer && (
                      <div className="shrink-0">
                        {correct ? <Check className="w-6 h-6 text-emerald-600" /> : <X className="w-6 h-6 text-destructive" />}
                      </div>
                    )}
                  </Label>
                );
              })}
            </RadioGroup>
          </CardContent>

          <CardFooter>
            <div className="w-full">
              <AnimatePresence mode="wait">
                {!submittedAnswer ? (
                  <motion.div key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Button
                      onClick={() => selectedAnswer ? handleSubmitAnswer(selectedAnswer) : toast({ title: 'تحذير', description: 'اختر إجابة أولاً', variant: 'default' })}
                      disabled={!selectedAnswer || isSubmitting}
                      size="lg"
                      className="w-full"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin w-4 h-4" /> : 'تأكيد الإجابة'}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full text-center p-2 bg-muted rounded-md">
                    <p className="font-bold animate-pulse">
                      {submittedAnswer === '__TIMEOUT__' ? 'انتهى الوقت!' : (answerIsCorrect(submittedAnswer) ? 'إجابة صحيحة!' : 'إجابة خاطئة!')}
                    </p>
                    <p className="text-sm mt-1">جاري توجيه النتيجة وعودة اللعبة تلقائياً...</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
