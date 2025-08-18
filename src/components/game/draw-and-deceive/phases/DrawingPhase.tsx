
'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const isArtist = state.artistId === self.id;
  const artist = game.players.find(p => p.id === state.artistId);

  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!state.timerEndsAt) return state.settings.drawingTime;
    return Math.max(0, Math.round((state.timerEndsAt.toMillis() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!isArtist) return;
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
  }, [isArtist]);

  const handleSubmit = async () => {
    if (!isArtist || !drawingDataUrl || !correctAnswer.trim()) {
      toast({
        title: 'بيانات ناقصة',
        description: 'يجب أن ترسم شيئًا وتكتب الوصف الصحيح قبل الإرسال.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await submitDrawing(game.id, self.id, drawingDataUrl, correctAnswer.trim());
    } catch (error: any) {
      toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-4xl">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl">
            <Palette /> دورك في الرسم!
          </CardTitle>
          <CardDescription>
            الكلمة التي يجب عليك رسمها هي: <strong className="text-primary text-xl">{state.wordToDraw}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex justify-center items-center gap-2 text-lg">
                <Timer />
                <span>الوقت المتبقي: {timeLeft}</span>
            </div>
          <DrawingCanvas onDrawEnd={setDrawingDataUrl} />
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
                <Input
                placeholder="اكتب هنا الوصف الصحيح للرسمة..."
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                className="flex-grow"
                disabled={isSubmitting}
                maxLength={20}
                />
                <Button onClick={handleSubmit} disabled={isSubmitting || !drawingDataUrl || !correctAnswer.trim()} className="sm:w-auto w-full">
                {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2"/> إرسال الرسمة</>}
                </Button>
            </div>
            <p className="text-xs text-muted-foreground text-left pr-2">الأحرف المتبقية: {charsLeft}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
