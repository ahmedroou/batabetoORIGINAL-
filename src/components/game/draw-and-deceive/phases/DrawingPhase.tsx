'use client';

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswerAndStartDrawing, submitDrawing } from '@/lib/actions/draw-and-deceive';
import { Loader2, Send, Wand2, Eye, Brain, Timer } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';

interface DrawingPhaseProps {
  game: Game;
  self: Player;
}

const WritingView = ({ onSubmit, isSubmitting }: { onSubmit: (text: string) => Promise<void>; isSubmitting: boolean }) => {
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
};


export function DrawingPhase({ game, self }: DrawingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<'answer' | 'drawing' | false>(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
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
    if (!drawingDataUrl || isSubmitting) return;
    setIsSubmitting('drawing');
    try {
      await submitDrawing(game.id, self.id, drawingDataUrl);
      toast({title: "تم استلام الرسمة!", description: "بانتظار اللاعبين لوضع فخاخهم."});
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrawEnd = useCallback((dataUrl: string) => {
    setDrawingDataUrl(dataUrl);
    if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
        submitDrawing(game.id, self.id, dataUrl).catch(() => {});
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
    <div className="w-full h-full flex flex-col items-center gap-4">
       <div className="flex items-center gap-2 text-lg font-mono">
            <Timer /> {timeLeft}s
       </div>
      <div className="w-full flex-grow min-h-0">
        <DrawingCanvas onDrawEnd={handleDrawEnd} />
      </div>
      <Button size="lg" onClick={handleManualDrawingSubmit} disabled={isSubmitting === 'drawing' || !drawingDataUrl} className="w-full max-w-md">
        {isSubmitting === 'drawing' ? <Loader2 className="animate-spin" /> : "إرسال الرسمة النهائية"}
      </Button>
    </div>
  );
}
