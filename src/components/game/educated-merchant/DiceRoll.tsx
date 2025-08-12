'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2 } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

interface DiceRollProps { game: Game; self: Player }

// Default dice configuration (server uses 1..5 by default in our backend refactor)
const DEFAULT_DICE_MAX = 5;
const MIN_FACE_RENDER = 6; // always render at least 6 faces so animation looks natural
const FACE_HEIGHT = 80; // px height used by RollingNumber for layout/animation

// Small helpers for timers
const setRafTimeout = (fn: () => void, ms: number) => window.setTimeout(fn, ms);
const clearRafTimeout = (id: number | null) => { if (id) window.clearTimeout(id); };

/** RollingNumber visual: scrolls a column of numeric faces to land on `number`.
 *  - `maxFace` controls how many faces are rendered (>= MIN_FACE_RENDER)
 *  - `isAnimating` affects transition duration
 */
function RollingNumber({ number, maxFace = MIN_FACE_RENDER, isAnimating = false }: { number: number; maxFace?: number; isAnimating?: boolean }) {
  const facesCount = Math.max(MIN_FACE_RENDER, maxFace);
  const faces = Array.from({ length: facesCount }, (_, i) => i + 1);

  return (
    <div className="h-20 overflow-hidden rounded-lg bg-gray-900/50 p-2 border-2 border-primary/30" role="img" aria-label={`نتيجة النرد: ${number}`}>
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: -(number - 1) * FACE_HEIGHT }}
        transition={{ duration: isAnimating ? 0.9 : 0.42, ease: 'circOut' }}
        className="font-mono text-6xl font-bold text-yellow-300"
        style={{ lineHeight: `${FACE_HEIGHT}px` }}
      >
        {faces.map((n) => (
          <div key={n} style={{ height: FACE_HEIGHT }} className="flex items-center justify-center">
            {n}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export function DiceRoll({ game, self }: DiceRollProps) {
  const { toast } = useToast();
  const [isRolling, setIsRolling] = useState(false);

  // optimistic local number updated frequently while waiting for server
  const [optimisticNumber, setOptimisticNumber] = useState<number | null>(null);
  const [localHistory, setLocalHistory] = useState<number[]>([]);

  const animIntervalRef = useRef<number | null>(null);
  const fallbackTimeoutRef = useRef<number | null>(null);

  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnPlayerId = turnOrder[game.educatedMerchantState?.currentTurnIndex || 0];
  const isMyTurn = self.id === currentTurnPlayerId;
  const lastRoll = game.educatedMerchantState?.lastDiceRoll;
  const rollNonce = game.educatedMerchantState?.rollAnimationNonce ?? null;
  const diceMax = game.educatedMerchantState?.diceMax ?? DEFAULT_DICE_MAX;

  // Start a local spinning animation (updates optimisticNumber rapidly)
  const startLocalSpin = useCallback(() => {
    if (animIntervalRef.current) return;
    setIsRolling(true);
    animIntervalRef.current = window.setInterval(() => {
      setOptimisticNumber(Math.floor(Math.random() * Math.max(6, diceMax)) + 1);
    }, 80);

    // fallback stop after 8s to avoid infinite spin
    fallbackTimeoutRef.current = setRafTimeout(() => {
      if (animIntervalRef.current) {
        window.clearInterval(animIntervalRef.current!);
        animIntervalRef.current = null;
      }
      setIsRolling(false);
      setOptimisticNumber(null);
      toast({ title: 'انتهى وقت الاستجابة', description: 'لم نتلق نتيجة من الخادم — حاول مرة أخرى', variant: 'destructive' });
    }, 8000) as unknown as number;
  }, [diceMax, toast]);

  const stopLocalSpin = useCallback(() => {
    if (animIntervalRef.current) { window.clearInterval(animIntervalRef.current); animIntervalRef.current = null; }
    if (fallbackTimeoutRef.current) { clearRafTimeout(fallbackTimeoutRef.current); fallbackTimeoutRef.current = null; }
    setIsRolling(false);
    setOptimisticNumber(null);
  }, []);

  // When the server indicates a roll started (nonce change), ensure we spin locally
  const lastNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (rollNonce === null) return;
    if (lastNonceRef.current === rollNonce) return; // already handled
    lastNonceRef.current = rollNonce;
    startLocalSpin();
  }, [rollNonce, startLocalSpin]);

  // When authoritative lastRoll arrives, stop local animation and show result
  useEffect(() => {
    if (typeof lastRoll === 'number') {
      stopLocalSpin();
      setLocalHistory((h) => [lastRoll, ...h].slice(0, 6));
    }
  }, [lastRoll, stopLocalSpin]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animIntervalRef.current) window.clearInterval(animIntervalRef.current);
      if (fallbackTimeoutRef.current) clearRafTimeout(fallbackTimeoutRef.current);
    };
  }, []);

  // user action: request a roll
  const handleRoll = useCallback(async () => {
    if (!isMyTurn) return;
    if (isRolling) return;

    startLocalSpin();

    try {
      await rollDice(game.id, self.id);
      // server will update lastRoll and nonce — our effects will pick those up
    } catch (err: any) {
      stopLocalSpin();
      toast({ title: 'فشل رمي النرد', description: err?.message || 'حدث خطأ أثناء الاتصال بالخادم', variant: 'destructive' });
    }
  }, [game.id, isMyTurn, isRolling, self.id, startLocalSpin, stopLocalSpin, toast]);

  // keyboard accessibility
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isMyTurn && !isRolling) {
      e.preventDefault();
      void handleRoll();
    }
  }, [handleRoll, isMyTurn, isRolling]);

  // choose which number to display: authoritative lastRoll > optimistic > null
  const displayedNumber = typeof lastRoll === 'number' ? lastRoll : optimisticNumber;

  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
      <Card className="text-center bg-slate-800 border-primary text-white shadow-lg" tabIndex={0} onKeyDown={onKeyDown} aria-live="polite">
        <CardHeader className="pb-2">
          <CardTitle className="text-primary">نتيجة النرد</CardTitle>
          <CardDescription className="text-slate-400">{isMyTurn ? 'دورك — اضغط لرمي النرد' : `دور: ${game.players.find(p => p.id === currentTurnPlayerId)?.name || 'لاعب'}`}</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-center gap-3">
            <RollingNumber number={displayedNumber ?? 1} maxFace={Math.max(MIN_FACE_RENDER, diceMax)} isAnimating={isRolling} />

            <div className="flex w-full gap-2">
              <Button onClick={handleRoll} disabled={!isMyTurn || isRolling} className="flex-1" aria-disabled={!isMyTurn || isRolling} aria-label={isMyTurn ? (isRolling ? 'جارٍ رمي النرد' : 'ارمِ النرد') : 'ليس دورك'}>
                {isRolling ? <Loader2 className="animate-spin" /> : (isMyTurn ? 'ارمِ النرد' : 'انتظر')}
              </Button>
            </div>

            <div className="text-xs text-slate-400">هناك تأخير بسيط أثناء انتظار نتيجة الخادم — يتم تشغيل رسوم متحركة محلية لراحة العرض.</div>

            <div className="w-full mt-2 text-left">
              <div className="text-sm text-slate-200 mb-1">سجل الرميات (محلي):</div>
              <div className="flex gap-2">
                {localHistory.length === 0 ? (
                  <div className="text-slate-500">لا يوجد سجل بعد</div>
                ) : (
                  localHistory.map((r, i) => (
                    <div key={i} className="w-8 h-8 rounded bg-gray-800/60 flex items-center justify-center border border-primary/20">{r}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
