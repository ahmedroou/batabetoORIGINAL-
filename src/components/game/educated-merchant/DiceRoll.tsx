

'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2 } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

/* ---------------- helpers: Dice face with pips (no external files) ---------------- */
const PIP_MAP: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function DiceFace({
  value,
  className = '',
  pipClassName = '',
  title,
}: {
  value: number;
  className?: string;
  pipClassName?: string;
  title?: string;
}) {
  const cells = Array.from({ length: 9 }, (_, i) => i + 1);
  const active = PIP_MAP[Math.min(6, Math.max(1, value))] || [];
  return (
    <div
      aria-label={title ?? `وجه النرد: ${value}`}
      className={`grid grid-cols-3 grid-rows-3 gap-1 rounded-2xl bg-slate-900/80 border border-primary/40 shadow-xl ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {cells.map((idx) => (
        <div key={idx} className="flex items-center justify-center">
          <span
            className={`block rounded-full w-2.5 h-2.5 ${active.includes(idx) ? 'bg-white' : 'bg-white/10'} ${pipClassName}`}
            style={{ boxShadow: active.includes(idx) ? '0 0 6px rgba(255,255,255,0.5)' : undefined }}
          />
        </div>
      ))}
    </div>
  );
}

/* ---------------- component ---------------- */
interface DiceRollProps { game: Game; self: Player }

export function DiceRoll({ game, self }: DiceRollProps) {
  const { toast } = useToast();

  // UI state
  const [isRolling, setIsRolling] = useState(false);
  const [localHistory, setLocalHistory] = useState<number[]>([]);

  // overlay (small centered rolling screen)
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayNumber, setOverlayNumber] = useState<number | null>(null);
  const [overlayPhase, setOverlayPhase] = useState<'idle' | 'rolling' | 'final' | 'error'>('idle');

  // refs for timers/nonce
  const handledNonceRef = useRef<number | string | null>(null);
  const serverResponseTimerRef = useRef<number | null>(null);
  const rollingIntervalRef = useRef<number | null>(null);
  const rollStartRef = useRef<number | null>(null);
  const overlayCloseTimerRef = useRef<number | null>(null);
  const pendingFinalizeTimerRef = useRef<number | null>(null);

  // server-driven fields
  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
  const currentTurnPlayerId = turnOrder[currentTurnIndex];
  const isMyTurn = self.id === currentTurnPlayerId;

  // server "displaying" payload (يُحدَّث من السيرفر)
  const displaying =
    (game.educatedMerchantState as any)?.displayingRollResult as { number: number; nonce: number } | undefined;

  // animation timing constants (يمكن تعديلها إن رغبت)
  const ROLLING_INTERVAL_MS = 90;     // سرعة تبديل أرقام النرد أثناء الدوران المحلي
  const MIN_ROLL_DURATION_MS = 2000;  // مدة الدوران الدنيا قبل إعلان الرقم النهائي (عدة ثوانٍ)
  const FINAL_HOLD_MS = 1600;         // مدة تثبيت النتيجة على الشاشة الصغيرة قبل الإغلاق
  const SERVER_FALLBACK_MS = 10000;   // مهلة رد السيرفر

  /* ---------- cleanup on unmount ---------- */
  useEffect(() => {
    return () => {
      if (serverResponseTimerRef.current) { clearTimeout(serverResponseTimerRef.current); serverResponseTimerRef.current = null; }
      if (rollingIntervalRef.current) { clearInterval(rollingIntervalRef.current); rollingIntervalRef.current = null; }
      if (overlayCloseTimerRef.current) { clearTimeout(overlayCloseTimerRef.current); overlayCloseTimerRef.current = null; }
      if (pendingFinalizeTimerRef.current) { clearTimeout(pendingFinalizeTimerRef.current); pendingFinalizeTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- handle server "displayingRollResult" ---------- */
  useEffect(() => {
    if (!displaying) return;
    const { number, nonce } = displaying;
    if (nonce === undefined || nonce === null) return;

    // تجنّب تكرار المعالجة لنفس الـ nonce
    if (handledNonceRef.current === nonce) return;
    handledNonceRef.current = nonce;

    // حدّث السجل المحلي
    setLocalHistory((prev) => [number, ...prev].slice(0, 5));

    // أوقف مؤقّت مهلة السيرفر
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }

    // انتقل إلى "النتيجة النهائية" بعد ضمان مدة الدوران الدنيا
    const start = rollStartRef.current ?? Date.now();
    const elapsed = Date.now() - start;

    const finalize = () => {
      if (rollingIntervalRef.current) {
        clearInterval(rollingIntervalRef.current);
        rollingIntervalRef.current = null;
      }
      setOverlayNumber(number);
      setOverlayPhase('final');   // يفعّل أنيميشن "الاستقرار"
      setIsRolling(false);

      if (overlayCloseTimerRef.current) {
        clearTimeout(overlayCloseTimerRef.current);
        overlayCloseTimerRef.current = null;
      }
      overlayCloseTimerRef.current = window.setTimeout(() => {
        setOverlayVisible(false);
        setOverlayPhase('idle');
        setOverlayNumber(null);
        overlayCloseTimerRef.current = null;
      }, FINAL_HOLD_MS) as unknown as number;
    };

    if (elapsed >= MIN_ROLL_DURATION_MS) {
      finalize();
    } else {
      const remaining = MIN_ROLL_DURATION_MS - elapsed;
      if (pendingFinalizeTimerRef.current) {
        clearTimeout(pendingFinalizeTimerRef.current);
        pendingFinalizeTimerRef.current = null;
      }
      pendingFinalizeTimerRef.current = window.setTimeout(() => {
        pendingFinalizeTimerRef.current = null;
        finalize();
      }, remaining) as unknown as number;
    }
  }, [displaying]);

  /* ---------- handle roll action ---------- */
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;

    // تحضير الواجهة
    setIsRolling(true);
    setOverlayVisible(true);
    setOverlayPhase('rolling');
    handledNonceRef.current = null;

    // سجّل وقت البدء لضمان مدة دنيا للدوران
    rollStartRef.current = Date.now();

    // دوران محلي سريع مع تغيير الرقم (حتى وصول السيرفر)
    setOverlayNumber(Math.floor(Math.random() * 6) + 1);
    if (rollingIntervalRef.current) clearInterval(rollingIntervalRef.current);
    rollingIntervalRef.current = window.setInterval(() => {
      setOverlayNumber(Math.floor(Math.random() * 6) + 1);
    }, ROLLING_INTERVAL_MS) as unknown as number;

    // مهلة رد السيرفر
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }
    serverResponseTimerRef.current = window.setTimeout(() => {
      serverResponseTimerRef.current = null;
      if (rollingIntervalRef.current) {
        clearInterval(rollingIntervalRef.current);
        rollingIntervalRef.current = null;
      }
      setOverlayPhase('error');
      setOverlayVisible(false);
      setOverlayNumber(null);
      setIsRolling(false);
      toast({ title: 'لم يرد الخادم', description: 'لم يتم استلام نتيجة النرد. حاول مرة أخرى.', variant: 'destructive' });
    }, SERVER_FALLBACK_MS) as unknown as number;

    // استدعاء رمية النرد على السيرفر
    try {
      await rollDice(game.id, self.id);
      // لا نغلق الدوران هنا — سننتظر بايانات السيرفر (displayingRollResult)
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null; // الطلب نجح؛ سيأتي حدث النتيجة من السيرفر
      }
    } catch (err: any) {
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null;
      }
      if (rollingIntervalRef.current) {
        clearInterval(rollingIntervalRef.current);
        rollingIntervalRef.current = null;
      }
      setOverlayPhase('error');
      setOverlayVisible(false);
      setOverlayNumber(null);
      setIsRolling(false);
      toast({ title: 'فشل رمي النرد', description: err?.message || 'حدث خطأ أثناء الاتصال بالخادم', variant: 'destructive' });
    }
  }, [game.id, isMyTurn, isRolling, self.id, toast]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isMyTurn && !isRolling) {
      e.preventDefault();
      void handleRoll();
    }
  }, [handleRoll, isMyTurn, isRolling]);

  /* ---------- overlay dice motion variants ---------- */
  const overlayMotion =
    overlayPhase === 'rolling'
      ? {
          rotateX: [0, 180, 360],
          rotateY: [0, 270, 540],
          rotateZ: [0, 12, -10, 6, 0],
          scale: [1, 1.05, 0.98, 1.02, 1],
          transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' as const },
        }
      : overlayPhase === 'final'
      ? {
          rotateX: 0,
          rotateY: 0,
          rotateZ: [0, -6, 3, 0],
          scale: [1.05, 0.96, 1.02, 1],
          transition: { duration: 0.7, ease: 'easeOut' as const },
        }
      : { rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 };

  /* ---------- UI rendering ---------- */
  return (
    <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
      <Card
        className="w-64 text-center bg-slate-800 border-primary text-white shadow-lg relative"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-live="polite"
        role="region"
        aria-label="لوحة رمي النرد"
      >
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <div className="text-left">
            <CardTitle className="text-primary text-sm">
              {isMyTurn ? 'دورك لرمي النرد' : `دور: ${game.players.find(p => p.id === currentTurnPlayerId)?.name || '...'}`}
            </CardTitle>
            <CardDescription className="text-slate-400 text-right text-xs">
              {isMyTurn ? 'اضغط الزر أو Enter' : 'انتظر دورك'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col items-center justify-center min-h-[140px]">
          <AnimatePresence mode="wait">
            {/* أثناء ظهور الـ overlay نُبقي المنطقة الرئيسية هادئة */}
            {!overlayVisible && (
              isRolling ? (
                <motion.div
                  key="rollingNum"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1.02 }}
                  exit={{ opacity: 0 }}
                  className="select-none flex flex-col items-center"
                >
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  <div className="text-xs text-slate-300 mt-2">... جاري الرمي</div>
                </motion.div>
              ) : displaying?.number != null ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center"
                >
                  <DiceFace value={displaying.number} className="w-24 h-24" />
                  <div className="text-sm text-slate-300 mt-2">نتيجة النرد: <span className="font-bold">{displaying.number}</span></div>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Dices className="w-20 h-20 mx-auto text-primary" aria-hidden />
                </motion.div>
              )
            )}
          </AnimatePresence>
        </CardContent>

        <CardContent>
          <Button
            onClick={handleRoll}
            disabled={!isMyTurn || isRolling}
            className="w-full"
            size="lg"
            aria-disabled={!isMyTurn || isRolling}
            aria-label={isMyTurn ? (isRolling ? 'جارٍ رمي النرد' : 'ارمِ النرد') : 'ليس دورك'}
          >
            {isRolling ? <Loader2 className="animate-spin" /> : (isMyTurn ? 'ارمِ النرد' : 'انتظر...')}
          </Button>
        </CardContent>

        <CardContent className="text-left">
          <div className="w-full mt-2">
            <div className="text-sm text-slate-200 mb-1">آخر الرميات:</div>
            <div className="flex gap-2">
              {localHistory.length === 0 ? (
                <div className="text-slate-500 text-xs">لا يوجد سجل بعد</div>
              ) : (
                localHistory.map((r, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-lg bg-gray-900/60 flex items-center justify-center border border-primary/20"
                    title={`رمي ${i + 1}: ${r}`}
                  >
                    <DiceFace value={r} className="w-7 h-7" pipClassName="w-1.5 h-1.5" />
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>

        {/* ---------- Overlay: small centered rolling screen ---------- */}
        <AnimatePresence>
          {overlayVisible && (
            <motion.div
              key="diceOverlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
              aria-live="assertive"
            >
              <div className="pointer-events-auto bg-black/60 backdrop-blur-sm rounded-xl p-3 w-40 h-40 flex items-center justify-center">
                <motion.div
                  role="status"
                  aria-atomic="true"
                  className="w-24 h-24"
                  animate={overlayMotion}
                  transition={{ type: 'spring' }}
                  style={{ perspective: 800, transformStyle: 'preserve-3d' as any }}
                >
                  <DiceFace
                    value={overlayNumber ?? 1}
                    className="w-full h-full"
                    pipClassName="w-2 h-2"
                    title={overlayPhase === 'final' && overlayNumber ? `النتيجة: ${overlayNumber}` : 'النرد يدور'}
                  />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

    