'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitTrap } from '@/lib/actions/draw-and-deceive';
import {
  Loader2, PenSquare, Brain, Send, ZoomIn, Users, Sparkles, CheckCircle2
} from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '../../PlayerAvatar';

interface TrappingPhaseProps {
  game: Game;
  self: Player;
}

export function TrappingPhase({ game, self }: TrappingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const isArtist = state.artistId === self.id;

  // إدخال الفخ
  const [trap, setTrap] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [optimisticSubmitted, setOptimisticSubmitted] = useState(false);
  const isLockedRef = useRef(false);

  const hasSubmitted = !!state.playerTraps?.[self.id] || optimisticSubmitted;

  // تقدّم اللاعبين (غير الفنان)
  const totalTrappers = Math.max(0, (game.players?.length ?? 1) - 1);
  const submittedCount = useMemo(
    () => Object.keys(state.playerTraps ?? {}).length,
    [state.playerTraps]
  );
  const progress = totalTrappers ? Math.min(100, Math.round((submittedCount / totalTrappers) * 100)) : 0;
  const artist = game.players.find((p) => p.id === state.artistId);

  // تطبيع عربي بسيط لمنع التكرارات السطحية
  const normalizeArabic = (s: string) =>
    s
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // إزالة التشكيل
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .toLowerCase();

  const isOneOrTwoWords = (s: string) => s.trim().split(/\s+/).length <= 2 && s.trim().length > 0;

  const isDuplicateTrap = (s: string) => {
    const norm = normalizeArabic(s);
    const existing = Object.values(state.playerTraps ?? {}).map((t) => normalizeArabic(String(t)));
    return existing.includes(norm);
  };

  const validateTrap = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, msg: 'أدخل وصفًا مخادعًا.' };
    if (!isOneOrTwoWords(trimmed)) return { ok: false, msg: 'الوصف يجب أن يكون كلمة أو كلمتين فقط.' };
    if (trimmed.length > 30) return { ok: false, msg: 'الحد الأقصى 30 حرفًا.' };
    if (isDuplicateTrap(trimmed)) return { ok: false, msg: 'هناك لاعب قدّم نفس الوصف تقريبًا. غيّر صياغتك.' };
    return { ok: true, msg: '' };
  };

  const handleSubmit = async () => {
    if (isArtist) return;
    const { ok, msg } = validateTrap(trap);
    if (!ok) {
      toast({ title: 'تنبيه', description: msg, variant: 'destructive' });
      return;
    }
    if (isSubmitting || isLockedRef.current) return;
    isLockedRef.current = true;
    setIsSubmitting(true);
    try {
      await submitTrap(game.id, self.id, trap.trim());
      setOptimisticSubmitted(true); // انتقال فوري لحالة الانتظار
      toast({ title: 'تم إرسال فخك بنجاح!' });
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'تعذر الإرسال', variant: 'destructive' });
      setIsSubmitting(false);
      isLockedRef.current = false;
    }
  };

  // Enter للإرسال
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hasSubmitted || isSubmitting || isArtist) return;
      if (e.key === 'Enter' && trap.trim()) {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasSubmitted, isSubmitting, isArtist, trap, handleSubmit]);

  // لايتبوكس
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setLightboxOpen(false);
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // اقتراحات سريعة (محلية – بدون API)
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const genSuggestions = () => {
    const nouns = ['سفينة', 'قمر', 'مروحة', 'تاج', 'نخلة', 'قطار', 'نقطة', 'مفتاح', 'نسر', 'قهوة', 'قلعة', 'مصباح', 'قبعة', 'تمساح'];
    const adjs = ['سريع', 'قديم', 'صغير', 'غامض', 'ساخن', 'بارد', 'مائل', 'ذهبي', 'مكسور', 'مضيء'];
    const twoWord = () => `${pick(nouns)} ${pick(adjs)}`;
    const oneWord = () => pick(nouns);
    const arr = new Set<string>();
    while (arr.size < 6) arr.add(Math.random() < 0.5 ? oneWord() : twoWord());
    return Array.from(arr);
  };
  const [suggestions, setSuggestions] = useState<string[]>(genSuggestions());

  // حالات الفنان/تم الإرسال
  const WaitingView = ({ title, description }: { title: string; description: string }) => (
    <Card className="w-full max-w-lg text-center">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="animate-pulse text-lg">{description}</p>
        <div className="w-24 h-24 mx-auto mt-4">
          <Brain className="w-full h-full text-muted-foreground animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );

  if (isArtist) {
    return (
      <WaitingView
        title="اللاعبون يكتبون الفخاخ"
        description="شاهد اللاعبين وهم يكتبون أوصافًا مخادعة لرسمتك!"
      />
    );
  }

  if (hasSubmitted) {
    return (
      <WaitingView
        title="تم استلام فخك!"
        description="في انتظار بقية اللاعبين..."
      />
    );
  }

  // شاشة الإدخال
  const charsLeft = 30 - trap.length;
  const valid = validateTrap(trap);
  const canSubmit = !isSubmitting && !isArtist && valid.ok;

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl">
          <PenSquare /> ضع فخك
        </CardTitle>
        <CardDescription>
          انظر إلى الرسمة واكتب وصفًا مخادعًا لها (كلمة أو كلمتين) لإيقاع اللاعبين الآخرين.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* الصورة + لايتبوكس */}
        {state.drawingDataUrl ? (
          <>
            <div className="relative aspect-video w-full max-w-xl mx-auto rounded-lg overflow-hidden border bg-white">
              {!imgLoaded && <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />}
              <Image
                src={state.drawingDataUrl}
                alt="لوحة الرسم"
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 640px"
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
                    <Image src={state.drawingDataUrl} alt="لوحة الرسم مكبرة" fill className="object-contain" priority />
                    <Button type="button" size="sm" className="absolute top-3 left-3" onClick={() => setLightboxOpen(false)}>
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

        {/* عدّاد المتقدمين */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>
            {submittedCount} من {totalTrappers} قدّموا الفخاخ
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded">
          <div className="h-full bg-primary rounded" style={{ width: `${progress}%` }} />
        </div>

        {/* الإدخال + مؤشرات صلاحية */}
        <div className="space-y-2">
          <div className="relative">
            <Input
              placeholder="اكتب وصفًا مخادعًا (كلمة أو كلمتين)..."
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              maxLength={30}
              disabled={isSubmitting}
              aria-invalid={!valid.ok}
              aria-describedby="trap-help"
              className={cn(valid.ok ? '' : 'border-destructive focus-visible:ring-destructive')}
            />
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {charsLeft}
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs">
              {valid.ok ? (
                <span className="text-emerald-500 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> صالح
                </span>
              ) : (
                <span className="text-destructive">{trap.trim() ? 'غير صالح' : ''}</span>
              )}
            </div>
          </div>
          <div id="trap-help" className="text-xs text-muted-foreground">
            يجب أن يكون الوصف كلمة أو كلمتين بحد أقصى، وتجنّب تكرار أوصاف لاعبين آخرين.
          </div>
        </div>

        {/* اقتراحات سريعة (محلية) */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Sparkles className="w-4 h-4" />
            اقتراحات سريعة (عشوائية)
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSuggestions(genSuggestions())}>
            إعادة التوليد
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTrap(s)}
              className="text-sm px-3 py-1 rounded-full border hover:bg-muted transition"
              aria-label={`استخدام الاقتراح: ${s}`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* إرسال */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <div className="text-xs text-muted-foreground self-center" aria-live="polite" aria-atomic="true">
            Enter للإرسال • لا يمكن للفنان إرسال فخ.
          </div>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full sm:w-auto">
            {isSubmitting ? <Loader2 className="animate-spin" /> : (<><Send className="mr-2" /> إرسال الفخ</>)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
