'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2 } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

/* =========================================================================================
 * Dice utilities
 * ========================================================================================= */
const PIP_MAP: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

type OverlayPhase = 'idle' | 'rolling' | 'final' | 'error';

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
      style={{ transformStyle: 'preserve-3d' as React.CSSProperties['transformStyle'] }}
    >
      {cells.map((idx) => (
        <div key={idx} className="flex items-center justify-center">
          <span
            className={`block rounded-full w-2.5 h-2.5 ${active.includes(idx) ? 'bg-white' : 'bg-white/10'} ${pipClassName}`}
            style={{ boxShadow: active.includes(idx) ? '0 0 6px rgba(255,255,255,0.45)' : undefined }}
          />
        </div>
      ))}
    </div>
  );
}

/* =========================================================================================
 * Component
 * ========================================================================================= */
interface DiceRollProps {
  game: Game;
  self: Player;
}

/* Animation & timing constants (tuned) */
const ROLLING_INTERVAL_MS = 90;     // سرعة تبديل الأرقام أثناء الدوران المحلي
const MIN_ROLL_DURATION_MS = 1800;  // مدة الدوران الدنيا قبل تثبيت النتيجة
const FINAL_HOLD_MS = 1400;         // مدة إظهار النتيجة في النافذة الصغيرة
const SERVER_FALLBACK_MS = 10000;   // مهلة رد السيرفر القصوى

export function DiceRoll({ game, self }: DiceRollProps) {
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  // UI state
  const [isRolling, setIsRolling] = useState(false);
  const [localHistory, setLocalHistory] = useState<number[]>([]);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayNumber, setOverlayNumber] = useState<number | null>(null);
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>('idle');

  // refs (always-available mutable handles)
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

  const currentTurnPlayerName = useMemo(
    () => game.players.find((p) => p.id === currentTurnPlayerId)?.name || '...',
    [game.players, currentTurnPlayerId]
  );

  // يتم حقنه من السيرفر بعد نجاح الرمية
  const displaying = (game.educatedMerchantState as any)
    ?.displayingRollResult as { number: number; nonce: number } | undefined;

  /* ---------------- cleanup on unmount ---------------- */
  useEffect(() => {
    return () => {
      if (serverResponseTimerRef.current) clearTimeout(serverResponseTimerRef.current);
      if (rollingIntervalRef.current) clearInterval(rollingIntervalRef.current);
      if (overlayCloseTimerRef.current) clearTimeout(overlayCloseTimerRef.current);
      if (pendingFinalizeTimerRef.current) clearTimeout(pendingFinalizeTimerRef.current);
      serverResponseTimerRef.current = rollingIntervalRef.current = overlayCloseTimerRef.current = pendingFinalizeTimerRef.current = null;
    };
  }, []);

  /* ---------------- handle server "displayingRollResult" ---------------- */
  useEffect(() => {
    if (!displaying) return;
    const { number, nonce } = displaying;
    if (nonce === undefined || nonce === null) return;

    // تجنّب تكرار المعالجة لنفس الـ nonce
    if (handledNonceRef.current === nonce) return;
    handledNonceRef.current = nonce;

    // تحديث السجل المحلي (أحدث 5)
    setLocalHistory((prev) => [number, ...prev].slice(0, 5));

    // أوقف مؤقّت مهلة السيرفر (تم الاستلام بنجاح)
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }

    // نهاء الدوران بعد ضمان مدة دنيا
    const start = rollStartRef.current ?? Date.now();
    const elapsed = Date.now() - start;

    const finalize = () => {
      if (rollingIntervalRef.current) {
        clearInterval(rollingIntervalRef.current);
        rollingIntervalRef.current = null;
      }
      setOverlayNumber(number);
      setOverlayPhase('final');
      setIsRolling(false);

      // هزة لمسية بسيطة عند النتيجة (إن كانت مدعومة)
      try {
        // @ts-ignore
        if (navigator?.vibrate) navigator.vibrate(12);
      } catch {}

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

    if (elapsed >= MIN_ROLL_DURATION_MS || prefersReducedMotion) {
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
  }, [displaying, prefersReducedMotion]);

  /* ---------------- handle roll action ---------------- */
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;

    // تحضير الواجهة
    setIsRolling(true);
    setOverlayVisible(true);
    setOverlayPhase('rolling');
    handledNonceRef.current = null;

    // وقت البدء لضمان حد أدنى لمدة الأنيميشن
    rollStartRef.current = Date.now();

    // دوران محلي سريع حتى تصل نتيجة السيرفر
    const initial = Math.floor(Math.random() * 6) + 1;
    setOverlayNumber(initial);

    if (rollingIntervalRef.current) clearInterval(rollingIntervalRef.current);
    if (!prefersReducedMotion) {
      rollingIntervalRef.current = window.setInterval(() => {
        setOverlayNumber(Math.floor(Math.random() * 6) + 1);
      }, ROLLING_INTERVAL_MS) as unknown as number;
    }

    // مهلة رد السيرفر — لا نلغيها بعد مجرد نجاح طلب HTTP (ننتظر displayingRollResult)
    if (serverResponseTimerRef.current) clearTimeout(serverResponseTimerRef.current);
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
      toast({
        title: 'لم يرد الخادم',
        description: 'لم يتم استلام نتيجة النرد. حاول مرة أخرى.',
        variant: 'destructive',
      });
    }, SERVER_FALLBACK_MS) as unknown as number;

    // استدعاء رمية النرد على السيرفر
    try {
      await rollDice(game.id, self.id);
      // لا تغييرات هنا — سنُغلق عند استقبال displayingRollResult
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
      toast({
        title: 'فشل رمي النرد',
        description: err?.message || 'حدث خطأ أثناء الاتصال بالخادم',
        variant: 'destructive',
      });
    }
  }, [game.id, isMyTurn, isRolling, prefersReducedMotion, self.id, toast]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && isMyTurn && !isRolling) {
        e.preventDefault();
        void handleRoll();
      }
    },
    [handleRoll, isMyTurn, isRolling]
  );

  /* ---------------- overlay dice motion variants ---------------- */
  const overlayMotion = useMemo(() => {
    if (prefersReducedMotion) return { rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 };
    if (overlayPhase === 'rolling') {
      return {
        rotateX: [0, 180, 360],
        rotateY: [0, 270, 540],
        rotateZ: [0, 12, -10, 6, 0],
        scale: [1, 1.05, 0.98, 1.02, 1],
        transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' as const },
      };
    }
    if (overlayPhase === 'final') {
      return {
        rotateX: 0,
        rotateY: 0,
        rotateZ: [0, -6, 3, 0],
        scale: [1.05, 0.96, 1.02, 1],
        transition: { duration: 0.65, ease: 'easeOut' as const },
      };
    }
    return { rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 };
  }, [overlayPhase, prefersReducedMotion]);

  /* ---------------- UI ---------------- */
  return (
    <motion.div
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      data-testid="dice-roll"
    >
      <Card
        className="relative w-72 sm:w-80 text-center bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/80 text-white shadow-xl rounded-2xl overflow-hidden"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-live="polite"
        role="region"
        aria-label="لوحة رمي النرد"
        aria-busy={isRolling}
      >
        {/* Decorative top bar */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

        <CardHeader className="pb-1 pt-3">
          <div className="text-left">
            <CardTitle className="text-primary text-sm">
              {isMyTurn ? 'دورك لرمي النرد' : `دور: ${currentTurnPlayerName}`}
            </CardTitle>
            <CardDescription className="text-slate-400 text-right text-xs">
              {isMyTurn ? 'اضغط الزر أو Enter' : 'انتظر دورك'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col items-center justify-center min-h-[148px]">
          <AnimatePresence mode="wait">
            {/* إبقاء المحتوى الأساسي ساكن أثناء ظهور نافذة النتيجة */}
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
                  <div className="text-sm text-slate-300 mt-2">
                    نتيجة النرد: <span className="font-bold">{displaying.number}</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Dices className="w-20 h-20 mx-auto text-primary" aria-hidden />
                </motion.div>
              )
            )}
          </AnimatePresence>
        </CardContent>

        <CardContent className="pt-0">
          <Button
            onClick={handleRoll}
            disabled={!isMyTurn || isRolling}
            className="w-full rounded-xl"
            size="lg"
            aria-disabled={!isMyTurn || isRolling}
            aria-label={isMyTurn ? (isRolling ? 'جارٍ رمي النرد' : 'ارمِ النرد') : 'ليس دورك'}
          >
            {isRolling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                جارٍ الرمي...
              </>
            ) : (
              <>ارمِ النرد</>
            )}
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
                    key={`${r}-${i}`}
                    className="w-9 h-9 rounded-lg bg-gray-900/60 flex items-center justify-center border border-primary/20 shadow-inner"
                    title={`رمي ${i + 1}: ${r}`}
                  >
                    <DiceFace value={r} className="w-8 h-8" pipClassName="w-1.5 h-1.5" />
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>

        {/* ---------------- Overlay: result / rolling ---------------- */}
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
              <div className="pointer-events-auto bg-black/60 backdrop-blur-sm rounded-2xl p-4 w-44 h-44 flex items-center justify-center border border-white/10 shadow-2xl">
                <motion.div
                  role="status"
                  aria-atomic="true"
                  className="w-24 h-24"
                  animate={overlayMotion}
                  transition={{ type: 'spring' }}
                  style={{ perspective: 900, transformStyle: 'preserve-3d' as any }}
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
