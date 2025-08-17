'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { submitGuess } from '@/lib/actions/draw-and-deceive';
import { Loader2, HelpCircle, ZoomIn, Check, Users } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

interface GuessingPhaseProps {
  game: Game;
  self: Player;
}

export function GuessingPhase({ game, self }: GuessingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const submittingRef = useRef(false);

  const hasGuessed = !!state.playerGuesses[self.id];
  const artist = game.players.find((p) => p.id === state.artistId);

  const answers = state.shuffledAnswers ?? [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const guessedCount = useMemo(
    () => Object.keys(state.playerGuesses ?? {}).length,
    [state.playerGuesses]
  );
  const totalPlayers = game.players.length;
  const progress = totalPlayers ? Math.min(100, Math.round((guessedCount / totalPlayers) * 100)) : 0;

  // تنقّل بلوحة المفاتيح بين الخيارات + Enter للإرسال
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hasGuessed || isSubmitting) return;
      const idx = selectedAnswer ? answers.findIndex((a) => a === selectedAnswer) : -1;
      if (['ArrowRight', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const next = answers[(idx + 1 + answers.length) % answers.length];
        if (next) setSelectedAnswer(next);
      } else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const prev = answers[(idx - 1 + answers.length) % answers.length];
        if (prev) setSelectedAnswer(prev);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedAnswer) void handleSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnswer, answers, hasGuessed, isSubmitting]);

  const handleSubmit = async () => {
    if (!selectedAnswer) {
      toast({ title: 'اختر تخمينًا', description: 'يجب أن تختار أحد الأوصاف.', variant: 'destructive' });
      return;
    }
    if (isSubmitting || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submitGuess(game.id, self.id, selectedAnswer);
      // لا نعرض التوست هنا دائماً — ستنتقل الواجهة لحالة "تم التسجيل"
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'تعذر الإرسال', variant: 'destructive' });
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  // إغلاق اللايتبوكس بـ Escape
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setLightboxOpen(false);
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  if (hasGuessed) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>تم تسجيل تخمينك!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="animate-pulse text-lg">في انتظار بقية اللاعبين...</p>
          <div className="mt-4 w-full max-w-md mx-auto">
            <div className="h-2 w-full bg-muted rounded">
              <div
                className="h-full bg-primary rounded"
                style={{ width: `${progress}%` }}
                aria-hidden
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {guessedCount} من {totalPlayers} قاموا بالتخمين
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl">
          <HelpCircle /> ما هو الوصف الصحيح؟
        </CardTitle>
        <CardDescription>
          قام {artist?.name || 'الفنان'} برسم هذه اللوحة. اختر الوصف الذي تعتقد أنه الأصلي.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* المعاينة + لايتبوكس */}
        {state.drawingDataUrl ? (
          <>
            <div className="relative aspect-video w-full max-w-xl mx-auto rounded-lg overflow-hidden border bg-white">
              {!imgLoaded && (
                <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
              )}
              <Image
                src={state.drawingDataUrl}
                alt="لوحة الرسم"
                fill
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-contain"
                onLoadingComplete={() => setImgLoaded(true)}
                priority
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute bottom-2 left-2 gap-1"
                onClick={() => setLightboxOpen(true)}
                aria-label="تكبير الصورة"
              >
                <ZoomIn className="w-4 h-4" /> تكبير
              </Button>
            </div>

            {/* لايتبوكس بسيط */}
            <AnimatePresence>
              {lightboxOpen && (
                <motion.div
                  className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                  role="dialog"
                  aria-modal="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setLightboxOpen(false)}
                >
                  <motion.div
                    className="relative w-full max-w-5xl aspect-video"
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Image
                      src={state.drawingDataUrl}
                      alt="لوحة الرسم مكبرة"
                      fill
                      className="object-contain"
                      priority
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="absolute top-3 left-3"
                      onClick={() => setLightboxOpen(false)}
                    >
                      إغلاق
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="relative aspect-video w-full max-w-xl mx-auto rounded-lg overflow-hidden border bg-muted" />
        )}

        {/* تقدّم اللاعبين */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>
            {guessedCount} من {totalPlayers} قاموا بالتخمين
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded">
          <div className="h-full bg-primary rounded" style={{ width: `${progress}%` }} />
        </div>

        {/* خيارات التخمين */}
        <RadioGroup
          value={selectedAnswer ?? ''}
          onValueChange={(v) => setSelectedAnswer(v)}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {answers.map((answer, i) => {
            const id = `answer-${i}`;
            const isSelected = selectedAnswer === answer;
            const letter = letters[i] ?? '';
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                <Label
                  htmlFor={id}
                  className={[
                    'group relative p-4 border rounded-md cursor-pointer transition-all',
                    'hover:shadow-sm focus-within:ring-2 focus-within:ring-primary',
                    isSelected ? 'bg-primary/15 border-primary' : 'bg-background',
                  ].join(' ')}
                >
                  <div className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full bg-muted">
                    {letter}
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem id={id} value={answer} className="mt-1" />
                    <div className="flex-1">
                      <div className="font-semibold" dir="auto">{answer}</div>
                      {isSelected && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                          <Check className="w-3.5 h-3.5" /> اختيارك الحالي
                        </div>
                      )}
                    </div>
                  </div>
                </Label>
              </motion.div>
            );
          })}
        </RadioGroup>

        {/* إرسال */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <div
            className="text-xs text-muted-foreground self-center"
            aria-live="polite"
            aria-atomic="true"
          >
            يمكنك استخدام الأسهم للتنقّل وEnter للتأكيد.
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedAnswer}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد التخمين'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
