'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitDrawing } from '@/lib/actions/draw-and-deceive';
import { Loader2, Palette, Send, Timer, Eye } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { motion } from 'framer-motion';

interface DrawingPhaseProps {
  game: Game;
  self: Player;
}

/** احسب مقاسات مثالية للكانفس بناءً على عرض الحاوية واتجاه الشاشة */
function useResponsiveCanvasSize(containerRef: React.RefObject<HTMLDivElement>) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 450 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const cw = Math.max(320, Math.floor(el.clientWidth));      // عرض الحاوية
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const isPortrait = vh > vw;

      // ارتفاع ديناميكي:
      // - في العرض (Landscape): 16:9
      // - في الطول (Portrait): حد أعلى 70vh، مع ارتفاع تقريبي 0.9 * عرض الحاوية
      const targetH = isPortrait
        ? Math.min(Math.round(cw * 0.9), Math.round(vh * 0.7))
        : Math.round(cw * 9 / 16);

      setSize({ w: cw, h: Math.max(220, targetH) });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('orientationchange', compute);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', compute);
      window.removeEventListener('resize', compute);
    };
  }, [containerRef]);

  return size;
}

/** حوّل DataURL إلى WebP لتخفيف الحجم */
async function toWebPDataURL(dataUrl: string, quality = 0.92): Promise<string> {
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
      } catch (e) {
        resolve(dataUrl); // fallback PNG
      }
    };
    img.onerror = reject;
  });
  img.src = dataUrl;
  return done;
}

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const isArtist = state.artistId === self.id;
  const artist = game.players.find(p => p.id === state.artistId);

  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
  const [blankSig, setBlankSig] = useState<string | null>(null); // بصمة الصورة الفارغة
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // توقيت
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!state.timerEndsAt) return state.settings.drawingTime;
    return Math.max(0, Math.round((state.timerEndsAt.toMillis() - Date.now()) / 1000));
  });

  const handleSubmit = useCallback(async () => {
    if (!isArtist) return;
    setIsSubmitting(true);
    try {
      const finalAnswer = correctAnswer.trim() || undefined; // undefined triggers random word on server
      const webp = drawingDataUrl ? await toWebPDataURL(drawingDataUrl, 0.9) : undefined;
      await submitDrawing(game.id, self.id, webp, finalAnswer);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'لم يتم الإرسال', variant: 'destructive' });
      setIsSubmitting(false); // Allow retry
    }
  }, [isArtist, drawingDataUrl, correctAnswer, game.id, self.id, toast]);
  
  useEffect(() => {
    if (!isArtist) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isArtist, handleSubmit]);

  const onCanvasChange = useCallback((dataUrl: string) => {
    if (!blankSig) {
      setBlankSig(dataUrl);
      return;
    }
    if (dataUrl !== blankSig) setDrawingDataUrl(dataUrl);
  }, [blankSig]);

  // ليس فنانًا
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

  const charsLeft = 20 - correctAnswer.length;
  const charsLeftClass = charsLeft < 0 ? 'text-red-500' : charsLeft <= 3 ? 'text-amber-600' : 'text-muted-foreground';

  // حاوية للتجاوب
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const { w: canvasW, h: canvasH } = useResponsiveCanvasSize(canvasWrapRef);

  // نسبة الوقت لتقدّم بصري
  const total = state.settings.drawingTime || Math.max(timeLeft, 1);
  const pct = Math.max(0, Math.min(100, Math.round((timeLeft / total) * 100)));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-6xl"
    >
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl">
            <Palette /> دورك في الرسم!
          </CardTitle>
          <CardDescription>
            ارسم ما يخطر في بالك! ثم اكتب وصفًا دقيقًا له من كلمة أو كلمتين.
          </CardDescription>
        </CardHeader>

        {/* شريط الوقت */}
        <div className="px-6">
          <div className="flex items-center justify-center gap-2 text-lg" aria-live="polite">
            <Timer />
            <span>الوقت المتبقي: {timeLeft}s</span>
          </div>
          <div className="mt-2 h-2 w-full rounded bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <CardContent className="space-y-4">
          {/* حاوية مرنة للكانفس */}
          <div ref={canvasWrapRef} className="w-full">
            <DrawingCanvas
              width={canvasW}
              height={canvasH}
              onDrawEnd={onCanvasChange}
              disabled={isSubmitting || timeLeft === 0}
              className="mx-auto"
            />
          </div>

          {/* الإدخال + الإرسال */}
          <div className="space-y-2 pb-[env(safe-area-inset-bottom)]">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="اكتب هنا الوصف الصحيح للرسمة..."
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                className="flex-grow"
                disabled={isSubmitting || timeLeft === 0}
                maxLength={20}
                aria-label="الوصف الصحيح للرسمة"
              />
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !drawingDataUrl || timeLeft === 0}
                className="sm:w-auto w-full"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2" /> إرسال الرسمة</>}
              </Button>
            </div>
            <p className={`text-xs text-left pr-2 ${charsLeftClass}`}>
              الأحرف المتبقية: {Math.max(0, charsLeft)}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
