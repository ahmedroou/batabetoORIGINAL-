'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswerAndStartDrawing, endArtistTurn, saveDrawingProgress } from '@/lib/actions/draw-and-deceive';
import { Loader2, Send, Brain } from 'lucide-react';
import DrawingCanvas, { type DrawingCanvasRef } from './DrawingCanvas';

// ====================================================================================
// Writing View (Internal Component)
// ====================================================================================
const WritingView = React.memo(({ onSubmit, isSubmitting }: { onSubmit: (text: string) => Promise<void>; isSubmitting: boolean }) => {
  const [correctAnswer, setCorrectAnswer] = useState('');
  
  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctAnswer.trim() || isSubmitting) return;
    onSubmit(correctAnswer);
  };

  return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>أنت الفنان!</CardTitle>
          <CardDescription>اكتب الوصف الصحيح لرسمتك (كلمة أو كلمتين فقط).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAnswerSubmit} className="flex gap-2">
            <Input
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="مثال: قطار سريع"
              maxLength={30}
              disabled={isSubmitting}
            />
            <Button type="submit" disabled={isSubmitting || !correctAnswer.trim()}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </form>
        </CardContent>
      </Card>
  );
});
WritingView.displayName = 'WritingView';

// ====================================================================================
// Main Phase Component
// ====================================================================================
export function DrawingPhase({ game, self }: { game: Game; self: Player }) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const [isSubmitting, setIsSubmitting] = useState<'answer' | 'drawing' | false>(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<DrawingCanvasRef>(null);

  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const ends = state.timerEndsAt?.toMillis();
    return ends ? Math.max(0, Math.round((ends - Date.now()) / 1000)) : 0;
  });

  const hasAnswerBeenSet = !!state.correctAnswer;

  useEffect(() => {
    const ends = state.timerEndsAt?.toMillis();
    if (!ends) return;
    const update = () => {
        const remaining = Math.max(0, Math.round((ends - Date.now())/1000));
        setTimeLeft(remaining);
    };
    const timer = setInterval(update, 1000);
    update();
    return () => clearInterval(timer);
  }, [state.timerEndsAt]);

  const handleAnswerSubmit = async (correctAnswer: string) => {
    if (isSubmitting) return;
    setIsSubmitting('answer');
    try {
      await submitCorrectAnswerAndStartDrawing(game.id, self.id, correctAnswer);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualDrawingSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting('drawing');
    try {
      const dataUrl = canvasRef.current?.getDrawingDataUrl();
      await endArtistTurn(game.id, self.id, dataUrl);
      toast({title: "تم استلام الرسمة!", description: "بانتظار اللاعبين لوضع فخاخهم."});
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrawEnd = useCallback((dataUrl: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveDrawingProgress(game.id, self.id, dataUrl).catch(() => {});
    }, 2000);
  }, [game.id, self.id]);
  
  useEffect(() => {
    return () => {
      if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    }
  }, []);

  if (!hasAnswerBeenSet) {
    return <WritingView onSubmit={handleAnswerSubmit} isSubmitting={isSubmitting === 'answer'} />;
  }

  return (
    <div className="w-full h-full flex flex-col items-center gap-2">
      <Card className="w-full text-center py-1 flex-shrink-0">
        <CardDescription>
            كلمتك للرسم هي: <strong className="text-primary">{state.correctAnswer}</strong>. أمامك <strong className="font-mono">{timeLeft}</strong> ثانية للرسم.
        </CardDescription>
      </Card>
      
      <div className="flex-grow w-full h-full relative">
        <DrawingCanvas 
            ref={canvasRef}
            onDrawEnd={handleDrawEnd}
            initialImage={state.drawingDataUrl}
            className="absolute inset-0"
        />
      </div>

      <div className="w-full flex-shrink-0">
          <Button size="lg" className="w-full" onClick={handleManualDrawingSubmit} disabled={isSubmitting === 'drawing'}>
              {isSubmitting === 'drawing' ? <Loader2 className="animate-spin" /> : "إرسال الرسمة النهائية"}
          </Button>
      </div>
    </div>
  );
}
