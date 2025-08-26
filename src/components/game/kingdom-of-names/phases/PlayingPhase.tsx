
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { submitAnswers, updatePlayerProgress } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2 } from 'lucide-react';
import { CountdownTimer } from '../../CountdownTimer';
import { motion } from 'framer-motion';

interface PlayingPhaseProps {
  game: Game;
  self: Player;
}

// Arabic normalization (kept lightweight to match server checks)
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

  // keyboard helpers: Enter moves to next field, Ctrl/Cmd+Enter submits (kept, but without UI hints)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const next = categories[idx + 1];
      if (next && inputRefs.current[next]) inputRefs.current[next]!.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') {
      e.preventDefault();
      (document.getElementById('kon-submit-button') as HTMLButtonElement | null)?.click();
    }
  }, [categories]);

  const handleChange = useCallback((category: string, value: string) => {
    const sanitized = value.replace(/\s+/g, ' ');
    setAnswers((prev) => ({ ...prev, [category]: sanitized }));
  }, []);

  const filledCount = useMemo(() => categories.filter(c => (answers[c] || '').trim() !== '').length, [categories, answers]);
  const canSubmit = useMemo(() => {
    return categories.length > 0 && categories.every(cat => (answers[cat] || '').trim() !== '' && startsWithLetter(answers[cat], letter));
  }, [categories, answers, letter]);
  const progressPct = useMemo(() => (
    categories.length ? Math.round((filledCount * 100) / categories.length) : 0
  ), [filledCount, categories.length]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    const missingOrInvalid = categories.filter(cat => !(answers[cat] || '').trim() || !startsWithLetter(answers[cat], letter));
    if (missingOrInvalid.length) {
      toast({ title: 'الرجاء تصحيح الخانات', description: `تأكد أن كل الإجابات تبدأ بالحرف: ${letter}`, variant: 'destructive' });
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
      <Card className="w-full max-w-2xl overflow-hidden">
        <CardHeader className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <div className="h-12 w-12 grid place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 font-mono text-2xl">
              {letter}
            </div>
            {state?.timerEndsAt && (
              <div className="text-sm text-muted-foreground">
                <CountdownTimer
                  gameId={game.id}
                  gameType="kingdom-of-names"
                  expiryTimestamp={state.timerEndsAt.toMillis()}
                  selfId={self.id}
                  isHost={game.hostId === self.id}
                />
              </div>
            )}
          </div>

          <CardTitle className="text-xl">أكمل الحقول بكلمات تبدأ بالحرف الظاهر</CardTitle>
          <CardDescription>
            تقدّمك: <strong>{filledCount}</strong> / <strong>{categories.length}</strong> — {progressPct}%
          </CardDescription>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {categories.map((category, idx) => {
            const val = answers[category] || '';
            const empty = val.trim() === '';
            const valid = !empty && startsWithLetter(val, letter);
            const invalid = !empty && !startsWithLetter(val, letter);

            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.015 }}
                className="rounded-2xl border p-3 md:p-4 hover:shadow-sm transition"
              >
                <label htmlFor={`cat-${category}`} className="mb-2 block font-medium text-sm md:text-base">
                  {category}
                </label>

                <div className="relative">
                  <Input
                    id={`cat-${category}`}
                    ref={setInputRef(category)}
                    value={val}
                    onChange={(e) => handleChange(category, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    disabled={isSubmitting}
                    aria-invalid={invalid}
                    placeholder={`ابدأ بـ ${letter}`}
                    className={[
                      'pr-10',
                      invalid ? 'border-red-400 focus-visible:ring-red-400' : '',
                      valid ? 'border-green-500/60 focus-visible:ring-green-500/50' : '',
                    ].join(' ')}
                    maxLength={60}
                  />

                  {/* Minimal status dot (no text hints) */}
                  <span
                    className={[
                      'absolute right-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full',
                      valid ? 'bg-green-500' : '',
                      invalid ? 'bg-red-500' : '',
                      empty ? 'bg-zinc-300' : '',
                    ].join(' ')}
                  />
                </div>
              </motion.div>
            );
          })}
        </CardContent>

        <CardFooter className="sticky bottom-0 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t mt-2">
          <div className="flex gap-3 w-full">
            <Button id="kon-submit-button" className="flex-1" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> جاري الإرسال...</>
              ) : (
                <><Send className="mr-2" /> {canSubmit ? 'إرسال' : 'أكمل الإجابات'}</>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAnswers(categories.reduce((a, c) => (a[c] = '', a), {} as Record<string, string>));
              }}
            >
              مسح
            </Button>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
