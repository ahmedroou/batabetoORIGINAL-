'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { submitAnswers, updatePlayerProgress } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2, Check, X } from 'lucide-react';
import { CountdownTimer } from '../../CountdownTimer';
import { motion } from 'framer-motion';

interface PlayingPhaseProps {
  game: Game;
  self: Player;
}

// Lightweight Arabic normalization to match server checks (ignores tashkeel/tatweel and normalizes alef/yaa)
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;
function normalizeArabic(text?: string) {
  if (!text) return '';
  return text
    .replace(TATWEEL, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .toLowerCase();
}
function startsWithLetter(word?: string, letter?: string) {
  if (!word || !letter) return false;
  const w = normalizeArabic(word);
  const l = normalizeArabic(letter);
  if (!w.length || !l.length) return false;
  return w[0] === l[0];
}

export default function PlayingPhase({ game, self }: PlayingPhaseProps) {
  const { toast } = useToast();
  const state = game.kingdomOfNamesState;

  const categories = state?.categories || [];
  const letter = state?.letter || '';

  const initialAnswers = state?.playerProgress?.[self.id]?.answers || {};
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const c of categories) init[c] = initialAnswers?.[c] || '';
    return init;
  });

  // keep inputs in sync when categories / round change
  useEffect(() => {
    setAnswers((prev) => {
      const next: Record<string, string> = {};
      for (const c of categories) next[c] = initialAnswers?.[c] ?? prev[c] ?? '';
      return next;
    });
  }, [JSON.stringify(categories), state?.currentRound]);

  const hasSubmitted = Boolean(state?.playerAnswers?.[self.id]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // refs for inputs to manage focus and keyboard navigation
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const setInputRef = useCallback((cat: string) => (el: HTMLInputElement | null) => { inputRefs.current[cat] = el; }, []);

  // debounced autosave
  const autosaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (hasSubmitted) return; // don't autosave after final submit
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      // best-effort save; ignore errors silently
      updatePlayerProgress(game.id, self.id, answers).catch(() => {});
    }, 1200);

    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [answers, game.id, self.id, hasSubmitted]);

  // cleanup on unmount
  useEffect(() => () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); }, []);

  // keyboard helpers: Enter moves to next field, Ctrl/Cmd+Enter submits
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const next = categories[idx + 1];
      if (next && inputRefs.current[next]) inputRefs.current[next]!.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') {
      e.preventDefault();
      // submit if possible
      (document.getElementById('kon-submit-button') as HTMLButtonElement | null)?.click();
    }
  }, [categories]);

  const handleChange = useCallback((category: string, value: string) => {
    // simple sanitization: collapse multiple spaces
    const sanitized = value.replace(/\s+/g, ' ');
    setAnswers((prev) => ({ ...prev, [category]: sanitized }));
  }, []);

  const filledCount = useMemo(() => categories.filter(c => (answers[c] || '').trim() !== '').length, [categories, answers]);

  const canSubmit = useMemo(() => {
    return categories.length > 0 && categories.every(cat => (answers[cat] || '').trim() !== '' && startsWithLetter(answers[cat], letter));
  }, [categories, answers, letter]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    // client-side validation
    const missingOrInvalid = categories.filter(cat => !(answers[cat] || '').trim() || !startsWithLetter(answers[cat], letter));
    if (missingOrInvalid.length) {
      toast({ title: 'الرجاء تصحيح الخانات', description: `تأكد من أن كل الإجابات تبدأ بالحرف: ${letter}` , variant: 'destructive' });
      // focus first invalid
      const first = missingOrInvalid[0];
      setTimeout(() => inputRefs.current[first]?.focus(), 80);
      return;
    }

    setIsSubmitting(true);
    try {
      await submitAnswers(game.id, self.id, answers);
      toast({ title: 'تم إرسال إجاباتك!' });
    } catch (err: any) {
      toast({ title: 'فشل الإرسال', description: err?.message || 'حاول مرة أخرى', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, categories, game.id, self.id, isSubmitting, letter, toast]);

  // focus first empty input on mount for convenience
  useEffect(() => {
    const firstEmpty = categories.find(c => !(answers[c] || '').trim());
    if (firstEmpty && inputRefs.current[firstEmpty]) {
      setTimeout(() => inputRefs.current[firstEmpty]?.focus(), 120);
    } else if (categories[0] && inputRefs.current[categories[0]]) {
      setTimeout(() => inputRefs.current[categories[0]]?.focus(), 120);
    }
  }, [JSON.stringify(categories)]);

  if (hasSubmitted) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>تم استلام إجاباتك</CardTitle>
          <CardDescription>في انتظار بقية اللاعبين...</CardDescription>
        </CardHeader>
        <CardContent>
          <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <Card className="w-full max-w-2xl">
        {state?.timerEndsAt && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <CountdownTimer gameId={game.id} gameType="kingdom-of-names" expiryTimestamp={state.timerEndsAt.toMillis()} selfId={self.id} isHost={game.hostId === self.id} />
          </div>
        )}

        <CardHeader className="text-center">
          <CardTitle className="text-5xl font-bold font-mono select-none">{letter}</CardTitle>
          <CardDescription>أكمل الجدول بكلمات تبدأ بالحرف الظاهر — اكتب بسرعة، يمكن الرجوع لاحقًا.</CardDescription>
          <div className="mt-3 text-sm text-zinc-600">مُعبأة: <strong>{filledCount}</strong> / <strong>{categories.length}</strong></div>
        </CardHeader>

        <CardContent className="space-y-4">
          {categories.map((category, idx) => {
            const val = answers[category] || '';
            const empty = val.trim() === '';
            const valid = !empty && startsWithLetter(val, letter);
            const invalid = !empty && !startsWithLetter(val, letter);

            return (
              <div key={category} className="grid md:grid-cols-[140px_1fr] items-center gap-3">
                <label htmlFor={`cat-${category}`} className="text-right font-semibold">{category}</label>

                <div className="relative">
                  <Input
                    id={`cat-${category}`}
                    ref={setInputRef(category)}
                    value={val}
                    onChange={(e) => handleChange(category, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    disabled={isSubmitting}
                    aria-invalid={invalid}
                    aria-describedby={`hint-${category}`}
                    placeholder={`اكتب ${category} يبدأ بـ ${letter}`}
                    className={invalid ? 'border-red-400' : ''}
                    maxLength={60}
                  />

                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {valid && <Check className="w-4 h-4 text-green-600" />}
                    {invalid && <X className="w-4 h-4 text-red-600" />}
                  </div>
                </div>

                <div className="md:col-span-2 text-xs text-zinc-500" id={`hint-${category}`}>
                  {invalid ? (
                    <span className="text-red-600">يجب أن تبدأ الكلمة بالحرف <strong className="font-mono">{letter}</strong></span>
                  ) : (
                    <span>اضغط Enter للانتقال للحقل التالي — Ctrl/Cmd+Enter للإرسال السريع.</span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>

        <CardFooter>
          <div className="flex gap-3 w-full">
            <Button id="kon-submit-button" className="flex-1" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> جاري الإرسال...</>
              ) : (
                <><Send className="mr-2" /> {canSubmit ? 'رفع القلم!' : `تأكد من جميع الخانات`}</>
              )}
            </Button>

            <Button variant="outline" onClick={() => { setAnswers(categories.reduce((a, c) => (a[c] = '', a), {} as Record<string,string>)); }}>
              مسح
            </Button>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
