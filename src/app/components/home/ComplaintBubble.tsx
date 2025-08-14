'use client';

import * as React from 'react';
import type { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { ComplaintDialog } from './HomeHeader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ComplaintBubbleProps {
  userProfile: UserProfile | null;
}

/**
 * GPT‑5 Creative Redesign
 * - سحب وإفلات مع تذكّر الموضع (localStorage)
 * - هالات وتوهّج متدرّج + Pulse رقيق
 * - Tooltip عربي، اختصار لوحة مفاتيح (Shift + C)
 * - احترام تفضيل تقليل الحركة
 */
export default function ComplaintBubble({ userProfile }: ComplaintBubbleProps) {
  if (!userProfile) return null;

  const SIZE = 56; // w-14 h-14
  const STORAGE_KEY = 'complaint-bubble-pos-v1';

  const prefersReducedMotion = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const loadPos = () => {
    if (typeof window === 'undefined') return { left: 20, bottom: 20 };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { left: 20, bottom: 20 };
      const parsed = JSON.parse(raw);
      return { left: Number(parsed.left) || 20, bottom: Number(parsed.bottom) || 20 };
    } catch {
      return { left: 20, bottom: 20 };
    }
  };

  const [pos, setPos] = React.useState<{ left: number; bottom: number }>(loadPos);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);

  // احفظ الموضع
  const persist = (p: { left: number; bottom: number }) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
  };

  // التثبيت داخل حدود النافذة
  const clampToViewport = React.useCallback((left: number, bottom: number) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pad = 12; // حد داخلي بسيط
    const clampedLeft = Math.min(Math.max(left, pad), Math.max(pad, W - SIZE - pad));
    const clampedBottom = Math.min(Math.max(bottom, pad), Math.max(pad, H - SIZE - pad));
    return { left: clampedLeft, bottom: clampedBottom };
  }, []);

  // استمع لتغيّر حجم النافذة لإبقاء الفقّاعة ضمن الحدود
  React.useEffect(() => {
    const onResize = () => setPos((p) => clampToViewport(p.left, p.bottom));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampToViewport]);

  // اختصار لوحة مفاتيح لفتح الحوار: Shift + C
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.code === 'KeyC' || e.key?.toLowerCase() === 'c')) {
        e.preventDefault();
        btnRef.current?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDragEnd = (_: any, info: { point: { x: number; y: number } }) => {
    const { x, y } = info.point; // إحداثيات المؤشر في نافذة العرض
    const left = x - SIZE / 2;
    const bottom = window.innerHeight - y - SIZE / 2;
    const clamped = clampToViewport(left, bottom);
    setPos(clamped);
    persist(clamped);
  };

  const onClick = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { (navigator as any).vibrate(12); } catch {}
    }
  };

  return (
    <motion.div
      className="fixed z-50"
      style={{ left: pos.left, bottom: pos.bottom }}
      drag
      dragElastic={0.12}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      // تحركات خفيفة عند الظهور/التحويم (تعطَّل إذا المستخدِم يفضّل تقليل الحركة)
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9, y: 8 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      dir="rtl"
      aria-label="زر فتح نموذج الشكاوى والاقتراحات"
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              {/* توهّج متدرّج حول الزر */}
              <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-full opacity-60">
                <div className="absolute inset-0 rounded-full blur-lg bg-[conic-gradient(from_180deg_at_50%_50%,hsl(var(--primary)/.35),transparent,hsl(var(--secondary)/.25),transparent,hsl(var(--primary)/.35))]" />
              </div>

              {/* نبضة رقيقة */}
              <span aria-hidden className="pointer-events-none absolute -inset-2 rounded-full animate-pulse opacity-20 bg-primary" />

              <ComplaintDialog
                userProfile={userProfile}
                trigger={
                  <Button
                    ref={btnRef}
                    onClick={onClick}
                    size="icon"
                    className="relative grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-1 ring-primary/40 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-offset-2"
                    aria-label="إرسال شكوى أو اقتراح (Shift + C)"
                  >
                    {/* لمعان داخلي خفيف */}
                    <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(70%_70%_at_50%_30%,hsl(var(--primary)/.25),transparent_70%)]" />
                    <motion.span
                      whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                      className="relative"
                    >
                      <MessageSquarePlus className="h-7 w-7" />
                      <span className="sr-only">فتح نموذج الشكاوى والاقتراحات</span>
                    </motion.span>
                  </Button>
                }
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-center">
            <p>أرسل ملاحظة / شكوى</p>
            <p className="text-xs text-muted-foreground">الاختصار: Shift + C</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </motion.div>
  );
}
