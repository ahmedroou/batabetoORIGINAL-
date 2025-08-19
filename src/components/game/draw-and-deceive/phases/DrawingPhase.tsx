'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submitDrawing, submitCorrectAnswerAndStartDrawing } from '@/lib/actions/draw-and-deceive';
import { Loader2, Palette, Send, Timer, Eye, PenLine } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DrawingPhaseProps {
  game: Game;
  self: Player;
}

/** يحوّل أي dataURL إلى webp إن أمكن (لتخفيف الحجم) */
async function toWebPDataURL(dataUrl: string, quality = 0.92): Promise<string> {
  try {
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
          resolve(webp || dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = reject;
    });
    img.src = dataUrl;
    return await done;
  } catch {
    return dataUrl;
  }
}

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const isArtist = state.artistId === self.id;
  const artist = game.players.find(p => p.id === state.artistId);

  const totalTime = state.settings.drawingTime; // بالثواني من الخادم
  const hasSubmittedDescription = !!state.correctAnswer;

  /** تخزين صورة اللوحة */
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
  /** التوقيع الأولي للصورة الفارغة لتجاهل أول onDrawEnd */
  const blankSigRef = useRef<string | null>(null);

  /** تحكم عام في الإرسال */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false); // لمنع الإرسال المزدوج

  /** العداد: نثبّت الـ deadline ونحسب الوقت تبعًا له */
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const end = state.timerEndsAt?.toMillis() ?? 0;
    const now = Date.now();
    return end > 0 ? Math.max(0, Math.round((end - now) / 1000)) : totalTime;
  });

  const deadlineRef = useRef<number | null>(state.timerEndsAt ? state.timerEndsAt.toMillis() : null);

  /** عند تغيّر موعد الانتهاء من الخادم، نعيد ضبط العداد دون إعادة إنشاء interval كل ثانية */
  useEffect(() => {
    const newEnd = state.timerEndsAt?.toMillis() ?? null;
    if (newEnd !== deadlineRef.current) {
      deadlineRef.current = newEnd;
      const now = Date.now();
      setTimeLeft(newEnd ? Math.max(0, Math.round((newEnd - now) / 1000)) : totalTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timerEndsAt, totalTime]);

  /** تايمر خفيف ومستقر */
  useEffect(() => {
    if (!isArtist || !hasSubmittedDescription) return;

    const id = setInterval(() => {
      const end = deadlineRef.current ?? 0;
      if (!end) return;

      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      setTimeLeft(left);

      // عند الانتهاء نرسل تلقائيًا مرة واحدة فقط
      if (left <= 0 && !submittingRef.current) {
        void handleSubmit();
      }
    }, 500); // تحديث نصفي ثانية لنعطي إحساس أدق قرب النهاية
    return () => clearInterval(id);
  }, [isArtist, hasSubmittedDescription]); // مهم: لا تعتمد على timeLeft حتى لا تعيد إنشاء الـ interval

  /** إدخال الوصف ثم بدء الرسم */
  const [description, setDescription] = useState('');
  const handleDescriptionSubmit = useCallback(async () => {
    if (!isArtist || hasSubmittedDescription || isSubmitting) return;
    if (!description.trim()) {
      toast({ title: 'الوصف مطلوب', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      await submitCorrectAnswerAndStartDrawing(game.id, self.id, description.trim());
      // السيرفر سيحدث الحالة وينتقل للـ drawing
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'تعذر البدء', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [description, game.id, self.id, isArtist, hasSubmittedDescription, isSubmitting, toast]);

  /** إرسال الرسم */
  const handleSubmit = useCallback(async () => {
    if (!isArtist || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const webp = drawingDataUrl ? await toWebPDataURL(drawingDataUrl, 0.9) : null;
      await submitDrawing(game.id, self.id, webp || undefined);
      // النجاح: السيرفر سيقفل المرحلة/ينتقل
    } catch (error: any) {
      // في حالة الفشل، نسمح بالمحاولة مرة أخرى
      toast({ title: 'خطأ', description: error?.message ?? 'لم يتم الإرسال', variant: 'destructive' });
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [drawingDataUrl, game.id, self.id, isArtist, toast]);

  /** التغيّر القادم من اللوحة */
  const onCanvasChange = useCallback((dataUrl: string) => {
    // أول مرة: نحفظ توقيع الفراغ
    if (!blankSigRef.current) {
      blankSigRef.current = dataUrl;
      return;
    }
    // لا تحدّث الحالة إذا لم تتغير فعلاً (تخفيف re-renders)
    if (dataUrl === drawingDataUrl) return;
    // تجاهل الفراغ، أي تغيير بعد ذلك يعتبر رسم
    if (dataUrl !== blankSigRef.current) {
      setDrawingDataUrl(dataUrl);
    }
  }, [drawingDataUrl]);

  /** شاشة اللاعب غير الرسّام */
  if (!isArtist) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>مرحلة الرسم</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="animate-pulse text-lg">
            في انتظار الفنان <strong className="text-primary">{artist?.name || '...'}</strong> للانتهاء من رسمته.
          </p>
          <div className="w-24 h-24 mx-auto mt-4">
            <Eye className="w-full h-full text-muted-foreground animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  /** شريط الوقت */
  const pct = Math.max(0, Math.min(100, Math.round((timeLeft / totalTime) * 100)));
  const timerTone =
    timeLeft <= 10 ? '[&>*]:bg-red-500'
    : timeLeft <= 30 ? '[&>*]:bg-yellow-500'
    : '[&>*]:bg-primary';

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-6xl">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex flex-col sm:flex-row items-center justify-center gap-2 text-2xl md:text-3xl">
            <Palette /> دورك في الرسم!
          </CardTitle>
          <CardDescription>
            {hasSubmittedDescription
              ? `لديك الآن ${totalTime} ثانية لإتمام رسمتك.`
              : 'أولاً، اكتب وصف الرسمة (كلمة أو كلمتين).'}
          </CardDescription>
        </CardHeader>

        <AnimatePresence mode="wait">
          {!hasSubmittedDescription ? (
            <motion.div key="writing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CardContent className="space-y-4 max-w-lg mx-auto">
                <div className="space-y-2">
                  <Label htmlFor="description-input">الوصف الصحيح</Label>
                  <Input
                    id="description-input"
                    placeholder="مثال: قطة على شجرة"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSubmitting}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleDescriptionSubmit(); }}
                  />
                </div>
                <Button onClick={handleDescriptionSubmit} disabled={isSubmitting || !description.trim()} className="w-full">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : (<><PenLine className="mr-2" /> ابدأ الرسم</>)}
                </Button>
              </CardContent>
            </motion.div>
          ) : (
            <motion.div key="drawing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="px-3 sm:px-6">
                <div className="flex items-center justify-center gap-2 text-lg" aria-live="polite">
                  <Timer />
                  <span>الوقت المتبقي: {timeLeft}s</span>
                </div>
                <div
                  className="mt-2 h-2 w-full rounded bg-muted overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                >
                  <div className={cn('h-full transition-[width] duration-500', timerTone)} style={{ width: `${pct}%` }} />
                </div>
              </div>

              <CardContent className="space-y-4 pt-4 flex flex-col h-[calc(100vh-25rem)] min-h-[500px]">
                <div className="w-full flex-grow relative min-h-0">
                  <DrawingCanvas
                    onDrawEnd={onCanvasChange}
                    disabled={isSubmitting || timeLeft === 0}
                    className="mx-auto"
                    // لاحظ: لا نمرر أي key متغيّر هنا حتى لا يحدث remount
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pb-[env(safe-area-inset-bottom)] shrink-0">
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !drawingDataUrl}
                    className="w-full sm:w-auto"
                    size="lg"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : (<><Send className="mr-2" /> إرسال الرسمة</>)}
                  </Button>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
