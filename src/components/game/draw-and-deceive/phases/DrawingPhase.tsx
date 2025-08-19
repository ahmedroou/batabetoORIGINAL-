'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submitDrawing, submitCorrectAnswerAndStartDrawing } from '@/lib/actions/draw-and-deceive';
import { Loader2, Palette, Send, Timer as TimerIcon, Eye, PenLine } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Utils */
async function toWebPDataURL(dataUrl: string, quality = 0.92): Promise<string> {
  if (typeof window === 'undefined' || !dataUrl?.startsWith('data:image/')) return dataUrl;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const done = new Promise<string>((resolve, reject) => {
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      try {
        const webp = c.toDataURL('image/webp', quality);
        resolve(webp);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = reject;
  });
  img.src = dataUrl;
  return done;
}

interface DrawingPhaseProps {
  game: Game;
  self: Player;
}

type LocalSubPhase = 'writing' | 'drawing';

/**
 * ملاحظات توافق:
 * - إذا كان السيرفر يضبط timerEndsAt لوقت الكتابة → يظهر عدّاد الكتابة هنا.
 * - بعد إرسال الوصف، السيرفر يضبط timerEndsAt لوقت الرسم → يظهر عدّاد الرسم هنا.
 * - لو السيرفر قديم ولا يحدد timerEndsAt، نستخدم fallback محلي (غير مثالي لكنه لا يعلّق الواجهة).
 */
export function DrawingPhase({ game, self }: DrawingPhaseProps) {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const isArtist = state.artistId === self.id;
  const artist = game.players.find((p) => p.id === state.artistId);

  const settings = state.settings;
  const writingTotal = Math.max(1, settings?.writingTime ?? 20);
  const drawingTotal = Math.max(1, settings?.drawingTime ?? 120);

  const hasDescription = Boolean(state.correctAnswer);
  const subPhase: LocalSubPhase = isArtist ? (hasDescription ? 'drawing' : 'writing') : 'drawing';

  /** نص العنوان والوصف حسب المرحلة الفرعية */
  const header = useMemo(() => {
    if (!isArtist) {
      return {
        title: 'مرحلة الرسم',
        desc: `في انتظار الفنان ${artist?.name ?? '...'} للانتهاء من رسمة الجولة.`,
      };
    }
    if (subPhase === 'writing') {
      return {
        title: 'اكتب الوصف الصحيح',
        desc: `أمامك ${writingTotal} ثانية لكتابة الوصف (كلمة أو كلمتين).`,
      };
    }
    return {
      title: 'دورك في الرسم!',
      desc: `أمامك ${drawingTotal} ثانية لإتمام الرسم ثم الإرسال.`,
    };
  }, [isArtist, subPhase, artist?.name, writingTotal, drawingTotal]);

  /** إدارة الحالة المحلية */
  const [description, setDescription] = useState('');
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
  const [blankSig, setBlankSig] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  /** حساب الوقت المتبقي من timerEndsAt مع سقوط لطيف */
  const computeInitialTimeLeft = useCallback(() => {
    const endsAt = state.timerEndsAt?.toMillis?.() ?? null;
    // لو السيرفر محدد نهاية — نستخدمها
    if (endsAt) {
      const diff = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      return diff;
    }
    // سقوط لطيف: لو كتابة من غير endsAt → استخدم writingTotal، لو رسم → drawingTotal
    return subPhase === 'writing' ? writingTotal : drawingTotal;
  }, [state.timerEndsAt, subPhase, writingTotal, drawingTotal]);

  const [timeLeft, setTimeLeft] = useState<number>(computeInitialTimeLeft);

  /** حافظ على تزامن الوقت عند تغيّر phase/timerEndsAt من السيرفر */
  useEffect(() => {
    setTimeLeft(computeInitialTimeLeft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timerEndsAt?.seconds, subPhase]);

  /** مؤقّت مرن */
  useEffect(() => {
    if (!isArtist) return; // المشاهدين ما يحتاجوا عدّاد محلي
    if (timeLeft <= 0) return;

    const t = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [timeLeft, isArtist]);

  /** عند انتهاء وقت الرسم للفنان — أرسل تلقائيًا مرة واحدة */
  useEffect(() => {
    if (!isArtist) return;
    if (subPhase !== 'drawing') return; // لا نرسل شيء في انتهاء الكتابة؛ السيرفر يفتح تصويت الطرد لو لزم
    if (timeLeft > 0) return;
    if (submittingRef.current) return;

    // إرسال تلقائي حتى لو مافيش رسمة — السيرفر هيحوّل لـ trapping
    (async () => {
      submittingRef.current = true;
      setIsSubmitting(true);
      try {
        const webp = drawingDataUrl ? await toWebPDataURL(drawingDataUrl, 0.9) : null;
        await submitDrawing(game.id, self.id, webp || undefined);
      } catch (error: any) {
        toast({
          title: 'خطأ',
          description: error?.message ?? 'تعذّر الإرسال التلقائي.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        submittingRef.current = false;
      }
    })();
  }, [isArtist, subPhase, timeLeft, drawingDataUrl, game.id, self.id, toast]);

  /** استلام تغيّرات اللوحة */
  const onCanvasChange = useCallback(
    (dataUrl: string) => {
      // أول لقطة نخزنها كتوقيع "فارغ" للمقارنة — نتأكد أن فيه خط فعلي
      if (!blankSig) {
        setBlankSig(dataUrl);
        return;
      }
      if (dataUrl !== blankSig) setDrawingDataUrl(dataUrl);
    },
    [blankSig]
  );

  /** إرسال الوصف (بدء الرسم) */
  const handleDescriptionSubmit = useCallback(async () => {
    if (!isArtist || hasDescription || isSubmitting) return;

    const value = description.trim();
    if (!value) {
      toast({ title: 'الوصف مطلوب', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitCorrectAnswerAndStartDrawing(game.id, self.id, value);
      // بعد نجاح الإرسال، السيرفر سيضبط timerEndsAt للرسم — الـeffect سيعيد ضبط العداد
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'تعذّر الإرسال', variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
  }, [isArtist, hasDescription, isSubmitting, description, toast, game.id, self.id]);

  /** إرسال الرسم يدويًا */
  const handleSubmitDrawing = useCallback(async () => {
    if (!isArtist || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const webp = drawingDataUrl ? await toWebPDataURL(drawingDataUrl, 0.9) : null;
      await submitDrawing(game.id, self.id, webp || undefined);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'لم يتم الإرسال', variant: 'destructive' });
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }, [isArtist, drawingDataUrl, game.id, self.id, toast]);

  /** مكوّن المؤقّت والشريط */
  const totalTimeForBar = subPhase === 'writing' ? writingTotal : drawingTotal;
  const pct = Math.max(0, Math.min(100, Math.round((timeLeft / totalTimeForBar) * 100)));
  const timerTone =
    timeLeft <= 10 ? '[&>*]:bg-red-500' : timeLeft <= 30 ? '[&>*]:bg-yellow-500' : '[&>*]:bg-primary';

  /** مشاهد (غير الفنان) */
  if (!isArtist) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>{header.title}</CardTitle>
          <CardDescription>{header.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="animate-pulse text-lg">
            في انتظار الفنان <strong className="text-primary">{artist?.name || '...'}</strong> للانتهاء من الرسم.
          </p>
          <div className="w-24 h-24 mx-auto mt-4">
            <Eye className="w-full h-full text-muted-foreground animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-6xl"
      role="group"
      aria-label="واجهة الرسم"
    >
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex flex-col sm:flex-row items-center justify-center gap-2 text-2xl md:text-3xl">
            <Palette /> {header.title}
          </CardTitle>
          <CardDescription>{header.desc}</CardDescription>
        </CardHeader>

        {/* شريط الوقت أعلى الواجهة في كلتا المرحلتين */}
        <div className="px-3 sm:px-6" aria-live="polite">
          <div
            className="flex items-center justify-center gap-2 text-lg"
            role="timer"
            aria-atomic="true"
            aria-relevant="text"
          >
            <TimerIcon />
            <span>
              الوقت المتبقي: <span className="tabular-nums">{timeLeft}</span>s
            </span>
          </div>
          <div
            className="mt-2 h-2 w-full rounded bg-muted overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="شريط تقدم الوقت"
          >
            <div className={cn('h-full transition-[width] duration-500', timerTone)} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {subPhase === 'writing' ? (
            <motion.div key="writing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CardContent className="space-y-4 max-w-lg mx-auto pt-6">
                <div className="space-y-2">
                  <Label htmlFor="description-input">الوصف الصحيح (كلمة أو كلمتين)</Label>
                  <Input
                    id="description-input"
                    placeholder="مثال: قطة على شجرة"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSubmitting || timeLeft <= 0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleDescriptionSubmit();
                      }
                    }}
                    aria-disabled={isSubmitting || timeLeft <= 0}
                  />
                </div>
                <Button
                  onClick={handleDescriptionSubmit}
                  disabled={isSubmitting || !description.trim() || timeLeft <= 0}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <>
                      <PenLine className="mr-2" /> ابدأ الرسم
                    </>
                  )}
                </Button>
                {timeLeft <= 0 && (
                  <p className="text-sm text-muted-foreground text-center">
                    انتهى وقت كتابة الوصف — قد يبدأ تصويت الطرد تلقائيًا إذا لم تُرسل وصفًا.
                  </p>
                )}
              </CardContent>
            </motion.div>
          ) : (
            <motion.div key="drawing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CardContent className="space-y-4 pt-4 flex flex-col h-[calc(100vh-25rem)] min-h-[500px]">
                <div className="w-full flex-grow relative min-h-0">
                  <DrawingCanvas
                    onDrawEnd={onCanvasChange}
                    disabled={isSubmitting || timeLeft === 0}
                    className="mx-auto"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pb-[env(safe-area-inset-bottom)] shrink-0">
                  <Button
                    onClick={handleSubmitDrawing}
                    disabled={isSubmitting || !drawingDataUrl}
                    className="w-full sm:w-auto"
                    size="lg"
                  >
                    {isSubmitting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <>
                        <Send className="mr-2" /> إرسال الرسمة
                      </>
                    )}
                  </Button>
                </div>
                {timeLeft === 0 && (
                  <p className="text-sm text-muted-foreground text-center">
                    انتهى الوقت — سيتم الإرسال تلقائيًا إن لم تكن قد أرسلت.
                  </p>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
