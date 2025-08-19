'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswerAndStartDrawing, endArtistTurn, saveDrawingProgress } from '@/lib/actions/draw-and-deceive';
import { Loader2, Send } from 'lucide-react';
import DrawingCanvas, { type DrawingCanvasRef } from './DrawingCanvas';

// ====================================================================================
// Writing View (Internal Component)
// ====================================================================================
const WritingView = React.memo(({ onSubmit, isSubmitting }: { onSubmit: (text: string) => Promise<void>; isSubmitting: boolean }) => {
  const [correctAnswer, setCorrectAnswer] = useState('');

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctAnswer.trim() || isSubmitting) return;
    onSubmit(correctAnswer.trim());
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
  const canvasRef = useRef<DrawingCanvasRef>(null);

  // ---------- Countdown ----------
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const ends = state.timerEndsAt?.toMillis();
    return ends ? Math.max(0, Math.round((ends - Date.now()) / 1000)) : 0;
  });
  useEffect(() => {
    const ends = state.timerEndsAt?.toMillis();
    if (!ends) return;
    const tick = () => setTimeLeft(Math.max(0, Math.round((ends - Date.now()) / 1000)));
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [state.timerEndsAt]);

  const hasAnswerBeenSet = !!state.correctAnswer;

  // ---------- Auto-save (debounced + stale-protection) ----------
  // 1) debounce timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 2) latest data URL we've drawn locally (to decide whether to ignore server echoes)
  const latestLocalDataUrlRef = useRef<string | null>(state.drawingDataUrl ?? null);
  // 3) after the first local edit, we freeze external `initialImage` to avoid overwriting live work by server echoes
  const hasLocalEditsRef = useRef(false);
  // 4) sequence for in-flight saves to avoid racing older responses
  const saveSeqRef = useRef(0);
  const latestStartedSaveSeqRef = useRef(0);

  const handleDrawEnd = useCallback(
    (dataUrl: string) => {
      hasLocalEditsRef.current = true; // we started local edits in this session
      latestLocalDataUrlRef.current = dataUrl;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        const mySeq = ++saveSeqRef.current;
        latestStartedSaveSeqRef.current = mySeq;
        try {
          await saveDrawingProgress(game.id, self.id, dataUrl);
          // If a newer save has already started, this one is considered stale; do nothing special.
        } catch {
          // ignore
        }
      }, 2000);
    },
    [game.id, self.id]
  );

  useEffect(() => () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); }, []);

  // ---------- Initial image application with echo-guard ----------
  const [appliedInitialImage, setAppliedInitialImage] = useState<string | null>(state.drawingDataUrl ?? null);

  useEffect(() => {
    const incoming = state.drawingDataUrl ?? null;

    // If we haven't started local edits, always accept server image.
    if (!hasLocalEditsRef.current) {
      setAppliedInitialImage(incoming);
      latestLocalDataUrlRef.current = incoming;
      return;
    }

    // If we have local edits, only accept the server image when it matches our latest local snapshot.
    if (incoming && latestLocalDataUrlRef.current && incoming === latestLocalDataUrlRef.current) {
      setAppliedInitialImage(incoming);
    }
    // Otherwise, ignore to prevent overwriting the user's most recent strokes.
  }, [state.drawingDataUrl]);

  // ---------- Actions ----------
  const handleAnswerSubmit = async (correctAnswer: string) => {
    if (isSubmitting) return;
    setIsSubmitting('answer');
    try {
      await submitCorrectAnswerAndStartDrawing(game.id, self.id, correctAnswer);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message ?? 'حدث خطأ غير متوقع', variant: 'destructive' });
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
      toast({ title: 'تم استلام الرسمة!', description: 'بانتظار اللاعبين لوضع فخاخهم.' });
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message ?? 'تعذّر إرسال الرسمة', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasAnswerBeenSet) {
    return <WritingView onSubmit={handleAnswerSubmit} isSubmitting={isSubmitting === 'answer'} />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center gap-2 min-h-0">
      <Card className="w-full py-1 text-center flex-shrink-0">
        <CardDescription>
          كلمتك للرسم هي: <strong className="text-primary">{state.correctAnswer}</strong>. أمامك{' '}
          <strong className="font-mono">{timeLeft}</strong> ثانية للرسم.
        </CardDescription>
      </Card>

      {/* مساحة الرسم: لا نستخدم absolute هنا لتفادي اختفاء الكانفس */}
      <div className="w-full flex-1 min-h-0">
        <DrawingCanvas
          ref={canvasRef}
          onDrawEnd={handleDrawEnd}
          initialImage={appliedInitialImage}
          className="h-[65vh] min-h-[320px]" // يمكنك تعديل الارتفاع كما تريد
        />
      </div>

      <div className="w-full flex-shrink-0">
        <Button size="lg" className="w-full" onClick={handleManualDrawingSubmit} disabled={isSubmitting === 'drawing'}>
          {isSubmitting === 'drawing' ? <Loader2 className="animate-spin" /> : 'إرسال الرسمة النهائية'}
        </Button>
      </div>
    </div>
  );
}
