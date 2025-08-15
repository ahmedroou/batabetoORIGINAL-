
'use client';

import { useState, useEffect, useRef } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Calculator } from 'lucide-react';
import { updateKingOfGeniusProgress, submitKingOfGeniusResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const TIME_LIMIT_SECONDS = 60;
const NUM_PROBLEMS = 5;

export function QuickMath({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
  const { toast } = useToast();
  const puzzle = game.challengeState?.puzzle;
  const problems = puzzle?.problems;

  // لوائح الحالة
  const [answer, setAnswer] = useState('');
  const [isGameOver, setIsGameOver] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SECONDS);

  const inputRef = useRef<HTMLInputElement>(null);

  // مراجع للحماية من الإرسال المكرر/الإغلاقات الراكدة
  const submittedRef = useRef(false);
  const gameOverRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  // تقديرات مشتقة
  const myProgress = game.challengeState?.playerProgress?.[self.id];
  const rawIndex = myProgress?.currentProblemIndex ?? 0;

  // عدد المسائل الفعلي (في حال كانت أقل من الثابت)
  const effectiveNumProblems = problems?.length ? Math.min(NUM_PROBLEMS, problems.length) : NUM_PROBLEMS;

  // فهرس آمن ضمن الحدود
  const currentProblemIndex = Math.max(0, Math.min(rawIndex, Math.max(0, effectiveNumProblems - 1)));

  // دالة مساعدة
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const parseIntSafe = (val: string) => {
    // يسمح بالسالب عند الحاجة: -?\d+
    const cleaned = (val || '').trim();
    if (!/^[-]?\d+$/.test(cleaned)) return NaN;
    return parseInt(cleaned, 10);
  };

  // تركيز الحقل عند توفّر المسائل وعدم وجود نتيجة سابقة
  useEffect(() => {
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    if (myResult) {
      setHasSubmitted(true);
      submittedRef.current = true;
      setIsGameOver(true);
      gameOverRef.current = true;
    } else if (problems && problems.length > 0) {
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.challengeState?.results, self.id, problems?.length]);

  // مؤقّت يعتمد على وقت النهاية القادم من السيرفر
  useEffect(() => {
    if (isGameOver || !game.challengeState?.challengeEndsAt) return;

    const endTimeMs = game.challengeState.challengeEndsAt.toMillis();

    const tick = () => {
      const remaining = Math.round((endTimeMs - Date.now()) / 1000);
      if (remaining <= 0) {
        const alreadySubmitted = submittedRef.current;
        setTimeLeft(0);
        if (!alreadySubmitted) {
          // إغلاق اللعبة مرة واحدة فقط
          submittedRef.current = true;
          setIsGameOver(true);
          gameOverRef.current = true;
          toast({
            title: "انتهى الوقت!",
            description: `للأسف، لم تكمل ${effectiveNumProblems} مسائل في الوقت المحدد.`,
            variant: "destructive"
          });
          // لا ننتظر هنا لتجنّب حظر الـ UI؛ مجرد إطلاق الوعد
          (async () => {
            try {
              await submitKingOfGeniusResult(game.id, self.id, { isCorrect: false, time: TIME_LIMIT_SECONDS, score: 0 });
            } catch {
              // في حال الفشل، نُظهر إشعارًا لطيفًا ولا نكسر الدورة
              toast({
                title: "تعذّر إرسال النتيجة",
                description: "سيتم حفظها تلقائيًا عند عودة الاتصال.",
                variant: "destructive"
              });
            } finally {
              setHasSubmitted(true);
            }
          })();
        }
        // إيقاف المؤقّت
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        setTimeLeft(remaining);
      }
    };

    // بدء المؤقّت
    intervalRef.current = window.setInterval(tick, 1000);
    tick(); // تحديث فوري

    // إعادة احتساب عند العودة من الخلفية
    const handleVisibility = () => !document.hidden && tick();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGameOver, game.challengeState?.challengeEndsAt, game.id, self.id]);

  // إعادة التركيز عند الانتقال إلى مسألة جديدة
  useEffect(() => {
    if (!gameOverRef.current) inputRef.current?.focus();
  }, [currentProblemIndex]);

  const handleAnswerSubmit = async () => {
    if (isGameOver || isSubmitting || !problems || !problems.length) return;
    const currentProblem = problems[currentProblemIndex];
    if (!currentProblem) return; // حماية إضافية

    const value = parseIntSafe(answer);
    if (Number.isNaN(value)) {
      toast({ title: "إدخال غير صالح", description: "الرجاء إدخال رقم صحيح.", variant: "destructive" });
      setAnswer('');
      inputRef.current?.focus();
      return;
    }

    const correct = value === currentProblem.answer;

    if (correct) {
      const isLastProblem = currentProblemIndex >= (effectiveNumProblems - 1);

      if (isLastProblem) {
        // الإرسال النهائي
        const timeTaken = clamp(TIME_LIMIT_SECONDS - timeLeft, 0, TIME_LIMIT_SECONDS);
        setIsSubmitting(true);
        try {
          await submitKingOfGeniusResult(game.id, self.id, { isCorrect: true, time: timeTaken, score: 5 });
          submittedRef.current = true;
          setHasSubmitted(true);
          setIsGameOver(true);
          gameOverRef.current = true;
          toast({
            title: "تحدي مكتمل!",
            description: `أحسنت! أكملت ${effectiveNumProblems}/${effectiveNumProblems} في ${timeTaken}s.`,
            className: "bg-green-100 border-green-500 text-green-700",
          });
        } catch {
          toast({
            title: "تعذّر إرسال النتيجة",
            description: "تحقق من الاتصال وحاول مجددًا.",
            variant: "destructive",
          });
        } finally {
          setIsSubmitting(false);
        }
      } else {
        // الانتقال للمسألة التالية
        setIsSubmitting(true);
        try {
          await updateKingOfGeniusProgress(game.id, self.id, { currentProblemIndex: currentProblemIndex + 1 });
          setAnswer('');
          inputRef.current?.focus();
          toast({
            title: "إجابة صحيحة!",
            description: "استعد للمسألة التالية...",
            className: "bg-green-100 border-green-500 text-green-700",
            duration: 1200,
          });
        } catch {
          toast({
            title: "تعذّر تحديث التقدّم",
            description: "أعد المحاولة بعد لحظات.",
            variant: "destructive",
          });
        } finally {
          setIsSubmitting(false);
        }
      }
    } else {
      toast({
        title: "إجابة خاطئة!",
        description: "حاول مرة أخرى.",
        variant: "destructive",
      });
      setAnswer('');
      inputRef.current?.focus();
    }
  };

  // اختصارات لوحة المفاتيح
  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleAnswerSubmit();
    }
  };

  // تلوين شريط الوقت ديناميكيًا
  const pct = clamp((timeLeft / TIME_LIMIT_SECONDS) * 100, 0, 100);
  const progressTone =
    timeLeft <= 10 ? '[&>*]:bg-red-500'
    : timeLeft <= 30 ? '[&>*]:bg-yellow-500'
    : '[&>*]:bg-green-500';

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

  if (!problems || !problems.length) {
    return (
      <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">جاري توليد المسائل...</p>
        </CardContent>
      </Card>
    );
  }

  const current = problems[currentProblemIndex];

  return (
    <Card className="w-full max-w-lg bg-white/90 backdrop-blur-sm border-gray-200">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        <CardDescription>{challenge.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col items-center space-y-4">
        {/* شريط الحالة العلوي */}
        <div
          className="w-full flex justify-between items-center bg-muted p-2 rounded-lg text-center font-mono text-lg"
          role="status"
          aria-live="polite"
        >
          <span>
            المسألة: <span className="font-bold">{currentProblemIndex + 1} / {effectiveNumProblems}</span>
          </span>
          <div className="flex items-center gap-2">
            <Timer className="h-6 w-6" aria-hidden="true" />
            <span
              className={cn("font-bold tabular-nums", timeLeft < 10 && "text-destructive")}
              aria-label={`الوقت المتبقي ${timeLeft} ثانية`}
            >
              {timeLeft}
            </span>
          </div>
        </div>

        <Progress value={pct} className={cn("w-full h-2", progressTone)} />

        {/* نص المسألة */}
        <div
          className="w-full text-center bg-slate-800 text-white p-4 md:p-6 rounded-lg shadow-inner flex items-center justify-center"
          dir="ltr"
          aria-label="المسألة الحالية"
        >
          <p className="font-mono text-3xl md:text-4xl tracking-tight">
            {current?.problem ?? '...'}
          </p>
        </div>

        {/* الإدخال والإرسال */}
        <div className="w-full flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="^-?\d*$"
            placeholder="أدخل إجابتك هنا..."
            value={answer}
            onChange={(e) => {
              // نسمح فقط بـ - والأرقام
              const next = e.target.value.replace(/[^\d-]/g, '');
              setAnswer(next);
            }}
            onKeyDown={handleKeyDown}
            className="text-center text-2xl h-16"
            disabled={isGameOver || isSubmitting}
            aria-label="حقل الإجابة"
            aria-disabled={isGameOver || isSubmitting}
            autoComplete="off"
          />
          <Button
            onClick={handleAnswerSubmit}
            disabled={isGameOver || isSubmitting || answer.trim() === ''}
            size="lg"
            className="h-16 min-w-28"
            aria-label="تأكيد الإجابة"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                جاري التحقق...
              </>
            ) : (
              <>
                <Calculator className="ml-2" />
                تأكيد
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
