'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Game, Player, GeniusChallenge, SmartGridPuzzleData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Send, BrainCircuit } from 'lucide-react';
import { submitChallengeResult, updateChallengeProgress } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const TIME_LIMIT_SECONDS = 90;

export default function SmartGridPuzzle({ game, self, challenge }: { game: Game; player: Player; self: Player; challenge: GeniusChallenge }) {
  const { toast } = useToast();
  const puzzle = game.challengeState?.puzzle as SmartGridPuzzleData | undefined;
  const columns = puzzle?.columns ?? [];

  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);

  const [userAnswers, setUserAnswers] = useState<Record<string, string>>(myProgress?.answers || {});
  const [isGameOver, setIsGameOver] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // مراجع للحماية من الإرسال المكرر وإدارة المؤقّت
  const submittedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const debouncedUpdateRef = useRef<number | null>(null);
  const lastSentAnswersRef = useRef<Record<string, string>>(myProgress?.answers || {});
  const inputFocusRef = useRef<HTMLInputElement | null>(null);

  // حساب النقاط (سريع وآمن حتى لو اختلف طول الأعمدة/الحلول)
  const score = useMemo(() => {
    if (!columns.length) return 0;
    let correct = 0;
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const col = columns[colIndex];
      const cells = col?.cells ?? [];
      const sol = col?.solution ?? [];
      for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
        if (cells[rowIndex] === null) {
          const key = `${colIndex}-${rowIndex}`;
          const ua = userAnswers[key];
          const val = typeof ua === 'string' && /^-?\d+$/.test(ua) ? parseInt(ua, 10) : NaN;
          const corr = sol[rowIndex];
          if (!Number.isNaN(val) && typeof corr === 'number' && val === corr) {
            correct++;
          }
        }
      }
    }
    return correct;
  }, [columns, userAnswers]);

  const handleSubmit = useCallback(async (isTimeout = false) => {
    if (hasSubmitted || isSubmitting || submittedRef.current) return;

    submittedRef.current = true;
    setIsSubmitting(true);

    const finalScore = isTimeout ? 0 : score;
    const safeTime = Math.max(0, Math.min(TIME_LIMIT_SECONDS, TIME_LIMIT_SECONDS - timeLeft));

    try {
      await submitChallengeResult(game.id, self.id, {
        isCorrect: finalScore > 0,
        time: safeTime,
        score: finalScore
      });

      if (!isTimeout) {
        toast({
          title: "تم تسليم إجابتك النهائية!",
          description: `لقد حصلت على ${finalScore} نقاط.`,
          className: finalScore > 0
            ? "bg-green-100 border-green-500 text-green-700"
            : "bg-yellow-100 border-yellow-500 text-yellow-800",
        });
      }
    } catch {
      // تخفيف: في حال فشل الإرسال نبقي الحالة منتهية لكن نبلغ المستخدم
      toast({ title: "تعذّر إرسال النتيجة", description: "حاول مجددًا خلال ثوانٍ.", variant: "destructive" });
      submittedRef.current = false; // إتاحة إعادة المحاولة
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setHasSubmitted(true);
    setIsGameOver(true);
  }, [hasSubmitted, isSubmitting, score, timeLeft, game.id, self.id, toast]);

  // استعادة حالة الإرسال إن كانت موجودة مسبقًا
  useEffect(() => {
    if (myResult && !hasSubmitted) {
      setHasSubmitted(true);
      setIsGameOver(true);
      submittedRef.current = true;
    }
  }, [myResult, hasSubmitted]);

  // مؤقّت يعتمد على وقت النهاية من السيرفر، مع تنظيف صارم ومنع السباقات
  useEffect(() => {
    if (isGameOver || hasSubmitted || !game.challengeState?.challengeEndsAt) return;

    const endTime = game.challengeState.challengeEndsAt.toMillis();

    const tick = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        if (!submittedRef.current) {
          toast({
            title: "انتهى الوقت!",
            description: "سيتم تسليم إجابتك بصفر نقاط.",
            variant: "destructive"
          });
          void handleSubmit(true);
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    timerRef.current = window.setInterval(tick, 1000);
    tick(); // تحديث فوري

    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isGameOver, hasSubmitted, game.challengeState?.challengeEndsAt, handleSubmit, toast]);

  // Debounce لتقليل ضغط الشبكة على updateChallengeProgress
  const scheduleProgressUpdate = useCallback((draft: Record<string, string>) => {
    if (debouncedUpdateRef.current) window.clearTimeout(debouncedUpdateRef.current);
    debouncedUpdateRef.current = window.setTimeout(() => {
      // إرسال فقط إن تغيّر المحتوى فعلًا
      const last = lastSentAnswersRef.current;
      let changed = false;
      const keys = new Set([...Object.keys(last), ...Object.keys(draft)]);
      for (const k of keys) {
        if ((last[k] ?? '') !== (draft[k] ?? '')) { changed = true; break; }
      }
      if (!changed) return;

      lastSentAnswersRef.current = draft;
      // إطلاق دون await لتفادي حظر UI
      updateChallengeProgress(game.id, self.id, { answers: draft }).catch(() => {
        // خطأ غير مانع
      });
    }, 200); // 200ms كافية لسلاسة الإدخال
  }, [game.id, self.id]);

  // إدخال المستخدم مع فلترة آمنة للأرقام والسالب
  const handleInputChange = (colIndex: number, rowIndex: number, value: string) => {
    if (isGameOver || isSubmitting) return;
    // فقط أرقام واختياريًا سالب واحد في البداية
    const next = value.replace(/[^\d-]/g, '');
    if (!/^-?\d*$/.test(next)) return;

    const key = `${colIndex}-${rowIndex}`;
    const draft = { ...userAnswers, [key]: next };
    setUserAnswers(draft);
    scheduleProgressUpdate(draft);
  };

  // تركيز تلقائي على أول خانة قابلة للتحرير عند الجاهزية
  useEffect(() => {
    if (!columns.length || hasSubmitted || isGameOver) return;
    // محاولة العثور على أول حقل إدخال
    setTimeout(() => inputFocusRef.current?.focus(), 0);
  }, [columns.length, hasSubmitted, isGameOver]);

  // نِسَب الشريط البصري للوقت بدون إضافة استيرادات جديدة
  const pct = Math.max(0, Math.min(100, (timeLeft / TIME_LIMIT_SECONDS) * 100));
  const barTone = timeLeft <= 10 ? 'bg-red-500' : timeLeft <= 30 ? 'bg-yellow-500' : 'bg-green-500';

  if (!puzzle || !columns.length) {
    return (
      <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">جاري تحميل الشبكة الذكية...</p>
        </CardContent>
      </Card>
    );
  }

  if (hasSubmitted) {
    return (
      <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full h-screen flex flex-col bg-white/90 backdrop-blur-sm border-gray-200 p-2">
      <CardHeader className="text-center shrink-0">
        <BrainCircuit className="w-12 h-12 mx-auto text-primary" />
        <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        <CardDescription>
          اكتشف النمط في كل عمود واملأ الخانتين الفارغتين.
        </CardDescription>
      </CardHeader>

      {/* شريط الحالة العلوي */}
      <div
        className="w-full mx-auto max-w-3xl bg-muted p-2 rounded-lg text-center font-mono text-lg shrink-0 mb-3"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>النقاط: <span className="font-bold text-green-600 tabular-nums">{score}</span></span>
          </div>
          <div className="flex-1 mx-3 h-2 rounded bg-black/10 overflow-hidden">
            <div className={cn("h-full transition-[width] duration-300", barTone)} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-2">
            <Timer className="h-6 w-6" />
            <span className={cn("font-bold tabular-nums", timeLeft < 10 && "text-destructive")}>{timeLeft}</span>
          </div>
        </div>
      </div>

      {/* الشبكة */}
      <ScrollArea className="flex-grow min-h-0 w-full">
        <div className="flex justify-center p-4">
          <div className="flex gap-4">
            {columns.map((col, colIndex) => (
              <motion.div
                key={colIndex}
                className="flex flex-col items-center space-y-2 p-3 bg-muted/50 rounded-lg border"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: colIndex * 0.06 }}
              >
                {col.cells.map((cell, rowIndex) => {
                  const key = `${colIndex}-${rowIndex}`;
                  const isEditable = cell === null;
                  // إبراز فوري للصواب/الخطأ (اختياري لطيف)
                  const raw = userAnswers[key];
                  const isFilled = typeof raw === 'string' && raw.trim() !== '' && /^-?\d+$/.test(raw);
                  const correctVal = col.solution?.[rowIndex];
                  const isCorrect = isFilled && typeof correctVal === 'number' && parseInt(raw, 10) === correctVal;

                  return (
                    <div key={rowIndex} className="w-20 h-20 flex items-center justify-center">
                      {isEditable ? (
                        <Input
                          ref={input => {
                            // أول خانة قابلة للتحرير
                            if (!inputFocusRef.current) inputFocusRef.current = input;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="-?[0-9]*"
                          className={cn(
                            "w-full h-full text-2xl text-center font-bold p-0 bg-background border-2 ring-2 focus-visible:ring-2",
                            isFilled ? (isCorrect ? "border-green-500 ring-green-200" : "border-red-500 ring-red-200") : "border-primary ring-primary/20"
                          )}
                          value={userAnswers[key] || ''}
                          onChange={(e) => handleInputChange(colIndex, rowIndex, e.target.value)}
                          disabled={isGameOver || isSubmitting}
                          placeholder="?"
                          aria-label={`إدخال العمود ${colIndex + 1} الصف ${rowIndex + 1}`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl font-bold bg-muted rounded-md border">
                          {cell}
                        </div>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            ))}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <CardFooter className="shrink-0 pt-4 mt-auto border-t">
        <Button
          onClick={() => handleSubmit(false)}
          disabled={isGameOver || hasSubmitted || isSubmitting}
          className="w-full"
          size="lg"
          aria-label="إنهاء وتسليم الإجابة"
        >
          {isSubmitting ? <Loader2 className="mr-2 animate-spin" /> : <Send className="ml-2" />}
          إنهاء وتسليم الإجابة
        </Button>
      </CardFooter>
    </Card>
  );
}
