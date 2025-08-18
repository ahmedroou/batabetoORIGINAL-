'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswer } from '@/lib/actions/draw-and-deceive';
import { Loader2, PenLine, Send, Timer, Eye } from 'lucide-react';
import { motion } from 'framer-motion';

interface WritingPhaseProps {
  game: Game;
  self: Player;
}

export default function WritingPhase({ game, self }: WritingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const isArtist = state.artistId === self.id;
  const artist = game.players.find(p => p.id === state.artistId);

  const [correctAnswer, setCorrectAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [timeLeft, setTimeLeft] = useState(() => {
    if (!state.timerEndsAt) return state.settings.writingTime || 20;
    return Math.max(0, Math.round((state.timerEndsAt.toMillis() - Date.now()) / 1000));
  });

  const handleSubmit = useCallback(async () => {
    if (!isArtist) return;
    setIsSubmitting(true);
    try {
      // If the answer is empty, the server will assign a random word.
      await submitCorrectAnswer(game.id, self.id, correctAnswer.trim());
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'لم يتم إرسال الوصف', variant: 'destructive' });
      setIsSubmitting(false); // Allow retry on failure
    }
  }, [isArtist, correctAnswer, game.id, self.id, toast]);

  useEffect(() => {
    if (!isArtist) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit(); // Submit whatever is there (or empty) on timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isArtist, handleSubmit]);

  if (!isArtist) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>مرحلة الكتابة</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="animate-pulse text-lg">
            في انتظار الفنان <strong className="text-primary">{artist?.name || '...'}</strong> لكتابة وصف رسمته.
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
  
  const total = state.settings.writingTime || 20;
  const pct = Math.max(0, Math.min(100, Math.round((timeLeft / total) * 100)));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-lg"
    >
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl">
            <PenLine /> اكتب وصف الرسمة
          </CardTitle>
          <CardDescription>
            لديك 20 ثانية لكتابة وصف دقيق لرسمتك.
          </CardDescription>
        </CardHeader>
        
        <div className="px-6">
          <div className="flex items-center justify-center gap-2 text-lg" aria-live="polite">
            <Timer />
            <span>الوقت المتبقي: {timeLeft}s</span>
          </div>
          <div className="mt-2 h-2 w-full rounded bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <CardContent className="space-y-4 mt-4">
          <div className="space-y-2">
            <Input
              placeholder="وصف الرسمة (كلمة أو كلمتين)..."
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              className="flex-grow text-lg h-14 text-center"
              disabled={isSubmitting || timeLeft === 0}
              maxLength={20}
              aria-label="الوصف الصحيح للرسمة"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <p className={`text-xs text-left pr-2 ${charsLeftClass}`}>
              الأحرف المتبقية: {Math.max(0, charsLeft)}
            </p>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || timeLeft === 0}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2" /> تأكيد الوصف</>}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            إذا لم تكتب شيئًا، سيتم اختيار وصف عشوائي لضمان استمرار اللعبة.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
