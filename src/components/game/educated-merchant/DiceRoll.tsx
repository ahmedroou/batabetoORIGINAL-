'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2, Volume, VolumeX } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

/**
 * DiceRoll component — improved:
 * - يعتمد على educatedMerchantState.displayingRollResult { number, nonce } من السيرفر
 * - يمنع إعادة معالجة نفس النتيجة عن طريق compare مع nonce
 * - يتعامل مع أصوات الرمي والنتيجة، مع تذكر تفضيل المستخدم في localStorage
 * - يعرض رقم النتيجة مؤقتًا كـ badge (بدون أي انيميشن خارجي)
 * - يضع timeout fallback إذا لم يصل رد السيرفر خلال فترة معقولة
 */

/* ---------------- audio helpers ---------------- */
function createAudioHelpers() {
  const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)
    ? (window.AudioContext || (window as any).webkitAudioContext)
    : null;
  const ctx = AudioCtx ? new AudioCtx() : null;

  const playSound = (type: 'roll' | 'result') => {
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === 'roll') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.15);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      // silently fail audio issues (iOS/autoplay restrictions etc.)
    }
  };

  return { playSound, ctx };
}

/* ---------------- component ---------------- */
interface DiceRollProps { game: Game; self: Player }

export function DiceRoll({ game, self }: DiceRollProps) {
  const { toast } = useToast();

  // UI state
  const [isRolling, setIsRolling] = useState(false);
  const [localHistory, setLocalHistory] = useState<number[]>([]);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try { return localStorage.getItem('dice.sound') !== '0'; } catch { return true; }
  });
  const [showResultNumber, setShowResultNumber] = useState<number | null>(null);

  const audio = useRef<ReturnType<typeof createAudioHelpers> | null>(null);
  const handledNonceRef = useRef<number | string | null>(null);
  const serverResponseTimerRef = useRef<number | null>(null); // fallback timer id

  // server-driven fields
  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
  const currentTurnPlayerId = turnOrder[currentTurnIndex];
  const isMyTurn = self.id === currentTurnPlayerId;

  // Use the server field `displayingRollResult` (object { number, nonce }) as the primary signal.
  const displaying = (game.educatedMerchantState as any)?.displayingRollResult as { number: number; nonce: number } | undefined;
  // fallback to lastDiceRoll only for history if displaying not present
  const lastDiceRoll = (game.educatedMerchantState as any)?.lastDiceRoll as number | undefined;

  useEffect(() => {
    audio.current = createAudioHelpers();
    return () => {
      // cleanup any pending fallback timer
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('dice.sound', soundOn ? '1' : '0'); } catch { /* ignore */ }
  }, [soundOn]);

  // When a new server `displayingRollResult` arrives — process it only once per nonce
  useEffect(() => {
    if (!displaying) return;

    const { number, nonce } = displaying;
    if (nonce === undefined || nonce === null) return;

    if (handledNonceRef.current === nonce) {
      // already processed this result
      return;
    }

    handledNonceRef.current = nonce;

    // stop rolling animation state
    setIsRolling(false);

    // play result sound
    if (soundOn) {
      audio.current?.playSound('result');
    }

    // update local history safely
    setLocalHistory((prev) => {
      if (prev[0] === number) return prev;
      return [number, ...prev].slice(0, 5);
    });

    // show result number badge briefly
    setShowResultNumber(number);
    const hideTimer = window.setTimeout(() => setShowResultNumber(null), 2000);

    // clear any fallback timer since server responded
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }

    return () => clearTimeout(hideTimer);
  }, [displaying, soundOn]);

  // If there's no displaying object but lastDiceRoll changed and is new — update history as a fallback
  useEffect(() => {
    if (displaying) return; // prefer canonical displaying object
    if (typeof lastDiceRoll !== 'number') return;
    setLocalHistory((prev) => {
      if (prev[0] === lastDiceRoll) return prev;
      return [lastDiceRoll, ...prev].slice(0, 5);
    });
  }, [lastDiceRoll, displaying]);

  // handle roll action
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;

    setIsRolling(true);

    // play rolling audio sequence
    if (soundOn) {
      try {
        audio.current?.ctx?.resume?.();
        // a short repeated "roll" click effect
        [0, 1, 2].forEach((i) => setTimeout(() => audio.current?.playSound('roll'), i * 100));
      } catch {}
    }

    // start a fallback timer: if server doesn't respond within 8s, reset isRolling and notify
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }
    serverResponseTimerRef.current = window.setTimeout(() => {
      serverResponseTimerRef.current = null;
      // Only clear if still waiting
      setIsRolling(false);
      toast({ title: 'لم يرد الخادم', description: 'لم يتم استلام نتيجة النرد. حاول مرة أخرى.', variant: 'destructive' });
    }, 8000);

    try {
      await rollDice(game.id, self.id);
      // do NOT setIsRolling(false) here — wait for server's displayingRollResult nonce to arrive
    } catch (err: any) {
      // request failed — clear states and fallback
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null;
      }
      setIsRolling(false);
      toast({ title: 'فشل رمي النرد', description: err?.message || 'حدث خطأ أثناء الاتصال بالخادم', variant: 'destructive' });
    }
  }, [game.id, isMyTurn, isRolling, self.id, soundOn, toast]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isMyTurn && !isRolling) {
      e.preventDefault();
      void handleRoll();
    }
  }, [handleRoll, isMyTurn, isRolling]);

  const toggleSound = () => setSoundOn((s) => !s);

  return (
    <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
      <Card className="w-64 text-center bg-slate-800 border-primary text-white shadow-lg" tabIndex={0} onKeyDown={onKeyDown} aria-live="polite" role="region" aria-label="لوحة رمي النرد">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <div className="text-left">
            <CardTitle className="text-primary text-sm">
              {isMyTurn ? 'دورك لرمي النرد' : `دور: ${game.players.find(p => p.id === currentTurnPlayerId)?.name || '...'}`}
            </CardTitle>
            <CardDescription className="text-slate-400 text-right text-xs">
              {isMyTurn ? 'اضغط الزر أو Enter' : 'انتظر دورك'}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={toggleSound} aria-pressed={soundOn} title={soundOn ? 'كتم الصوت' : 'تشغيل الصوت'}>
            {soundOn ? <Volume className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col items-center justify-center min-h-[120px] relative">
          <AnimatePresence>
            {isRolling ? (
              <motion.div key="rolling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Dices className="w-24 h-24 mx-auto text-primary animate-pulse" aria-hidden />
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Dices className="w-24 h-24 mx-auto text-primary" aria-hidden />
              </motion.div>
            )}
          </AnimatePresence>

          {/* simple numeric result badge (no external animation) */}
          {showResultNumber !== null && (
            <div
              aria-live="polite"
              className="absolute -top-3 right-3 bg-white/10 text-yellow-300 text-lg font-bold px-3 py-1 rounded-md border border-yellow-400"
              role="status"
            >
              {showResultNumber}
            </div>
          )}
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
                  <div key={i} className="w-8 h-8 rounded bg-gray-900/60 flex items-center justify-center border border-primary/20 text-sm font-mono">
                    {r}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
