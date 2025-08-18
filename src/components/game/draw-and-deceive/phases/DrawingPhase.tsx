

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submitDrawing, submitCorrectAnswerAndStartDrawing } from '@/lib/actions/draw-and-deceive';
import { Loader2, Palette, Send, Timer, Eye, PenLine } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DrawingPhaseProps {
  game: Game;
  self: Player;
}

function useResponsiveCanvasSize(containerRef: React.RefObject<HTMLDivElement>) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 450 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const cw = Math.max(320, Math.floor(el.clientWidth));
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const isPortrait = vh > vw;

      const targetH = isPortrait
        ? Math.min(Math.round(cw * 1.1), Math.round(vh * 0.5))
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

async function toWebPDataURL(dataUrl: string, quality = 0.92): Promise<string> {
  if (typeof window === 'undefined' || !dataUrl.startsWith('data:image/')) return dataUrl;
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
        resolve(dataUrl);
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

  const [description, setDescription] = useState('');
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
  const [blankSig, setBlankSig] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const totalTime = state.settings.drawingTime;
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!state.timerEndsAt) return totalTime;
    return Math.max(0, Math.round((state.timerEndsAt.toMillis() - Date.now()) / 1000));
  });
  
  const hasSubmittedDescription = !!state.correctAnswer;
  
  const handleDescriptionSubmit = async () => {
      if (!isArtist || hasSubmittedDescription || isSubmitting) return;
      if (!description.trim()) {
        toast({ title: "الوصف مطلوب", variant: "destructive" });
        return;
      }
      setIsSubmitting(true);
      try {
          await submitCorrectAnswerAndStartDrawing(game.id, self.id, description.trim());
      } catch (error: any) {
          toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleSubmit = useCallback(async () => {
    if (!isArtist || submittingRef.current) return;
    
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const webp = drawingDataUrl ? await toWebPDataURL(drawingDataUrl, 0.9) : null;
      await submitDrawing(game.id, self.id, webp || undefined);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'لم يتم الإرسال', variant: 'destructive' });
      setIsSubmitting(false); // Allow retry
      submittingRef.current = false;
    }
  }, [isArtist, drawingDataUrl, game.id, self.id, toast]);
  
  useEffect(() => {
    if (!isArtist || !hasSubmittedDescription) return;
    if (timeLeft <= 0) {
        if (!submittingRef.current) {
             handleSubmit();
        }
        return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isArtist, timeLeft, handleSubmit, hasSubmittedDescription]);

  const onCanvasChange = useCallback((dataUrl: string) => {
    if (!blankSig) {
      setBlankSig(dataUrl);
      return;
    }
    if (dataUrl !== blankSig) setDrawingDataUrl(dataUrl);
  }, [blankSig]);

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

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const { w: canvasW, h: canvasH } = useResponsiveCanvasSize(canvasWrapRef);

  const pct = Math.max(0, Math.min(100, Math.round((timeLeft / totalTime) * 100)));
  const timerTone = timeLeft <= 10 ? '[&>*]:bg-red-500' : timeLeft <= 30 ? '[&>*]:bg-yellow-500' : '[&>*]:bg-primary';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-6xl"
    >
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex flex-col sm:flex-row items-center justify-center gap-2 text-2xl md:text-3xl">
            <Palette /> دورك في الرسم!
          </CardTitle>
          <CardDescription>
            {hasSubmittedDescription ? 'لديك الآن دقيقتان لإتمام رسمتك.' : 'أولاً، اكتب وصف الرسمة (كلمة أو كلمتين).'}
          </CardDescription>
        </CardHeader>

        <AnimatePresence mode="wait">
            {!hasSubmittedDescription ? (
                 <motion.div key="writing" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                    <CardContent className="space-y-4 max-w-lg mx-auto">
                        <div className="space-y-2">
                             <Label htmlFor="description-input">الوصف الصحيح</Label>
                             <Input 
                                id="description-input"
                                placeholder="مثال: قطة على شجرة"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={isSubmitting}
                                onKeyDown={(e) => { if(e.key === 'Enter') handleDescriptionSubmit()}}
                             />
                        </div>
                        <Button onClick={handleDescriptionSubmit} disabled={isSubmitting || !description.trim()} className="w-full">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : <><PenLine className="mr-2"/> ابدأ الرسم</>}
                        </Button>
                    </CardContent>
                 </motion.div>
            ) : (
                <motion.div key="drawing" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                    <div className="px-3 sm:px-6">
                      <div className="flex items-center justify-center gap-2 text-lg" aria-live="polite">
                        <Timer />
                        <span>الوقت المتبقي: {timeLeft}s</span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                        <div className={cn("h-full transition-[width] duration-500", timerTone)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <CardContent className="space-y-4 pt-4">
                      <div ref={canvasWrapRef} className="w-full">
                        <DrawingCanvas
                          width={canvasW}
                          height={canvasH}
                          onDrawEnd={onCanvasChange}
                          disabled={isSubmitting || timeLeft === 0}
                          className="mx-auto"
                        />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pb-[env(safe-area-inset-bottom)]">
                          <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !drawingDataUrl}
                            className="w-full sm:w-auto"
                            size="lg"
                          >
                            {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2" /> إرسال الرسمة</>}
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
