
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswer } from '@/lib/actions/draw-and-deceive';
import { Loader2, Timer, Send } from 'lucide-react';
import Image from 'next/image';

interface WritingPhaseProps {
  game: Game;
  self: Player;
}

export function WritingPhase({ game, self }: WritingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const isArtist = state.artistId === self.id;
  const artist = game.players.find(p => p.id === state.artistId);

  const [correctAnswer, setCorrectAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const totalTime = state.settings.writingTime;
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!state.timerEndsAt) return totalTime;
    return Math.max(0, Math.round((state.timerEndsAt.toMillis() - Date.now()) / 1000));
  });

  const handleSubmit = useCallback(async () => {
    if (!isArtist || submittingRef.current || !correctAnswer.trim()) {
      if(!correctAnswer.trim()){
        toast({title: "الوصف مطلوب", description: "يجب كتابة وصف للرسمة.", variant: "destructive"});
      }
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submitCorrectAnswer(game.id, self.id, correctAnswer);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'لم يتم الإرسال', variant: 'destructive' });
      setIsSubmitting(false); // Allow retry
      submittingRef.current = false;
    }
  }, [isArtist, correctAnswer, game.id, self.id, toast]);

  useEffect(() => {
    if (!isArtist) return;
    if (timeLeft <= 0 && !submittingRef.current) {
        // Timeout is handled by the server action `handleTimeout`
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
  }, [isArtist, timeLeft, handleSubmit]);


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
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
            <CardTitle>اكتب وصف الرسمة</CardTitle>
            <CardDescription>أمامك {totalTime} ثانية لكتابة الوصف الصحيح لرسمتك.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             {state.drawingDataUrl && (
                <div className="relative aspect-video w-full max-w-xl mx-auto rounded-lg overflow-hidden border bg-white">
                    <Image
                        src={state.drawingDataUrl}
                        alt="لوحة الرسم"
                        fill
                        className="object-contain"
                    />
                </div>
            )}
            <div className="flex items-center justify-center gap-2 text-lg">
                <Timer />
                <span>{timeLeft}</span>
            </div>
            <div className="max-w-xl mx-auto space-y-2">
                <Input 
                    placeholder="اكتب الوصف الصحيح لرسمتك هنا..."
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    disabled={isSubmitting || timeLeft === 0}
                    className="text-center"
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
            </div>
             <div className="flex justify-center">
                 <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || timeLeft === 0 || !correctAnswer.trim()}
                >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2" /> إرسال الوصف</>}
                </Button>
            </div>
        </CardContent>
    </Card>
  );
}
