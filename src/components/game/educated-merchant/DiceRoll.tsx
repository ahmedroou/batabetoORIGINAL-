
'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2 } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

interface DiceRollProps { game: Game; self: Player }

const DEFAULT_DICE_MAX = 5;
const MIN_FACE_RENDER = 6;
const FACE_HEIGHT = 80; // px, ensure consistency with CSS

// Custom hook for a safer setTimeout that cleans up on unmount
const useRafTimeout = () => {
  const timeoutId = useRef<number | null>(null);

  const set = useCallback((fn: () => void, ms: number) => {
    timeoutId.current = window.setTimeout(fn, ms);
  }, []);

  const clear = useCallback(() => {
    if (timeoutId.current) {
      window.clearTimeout(timeoutId.current);
    }
  }, []);

  useEffect(() => {
    return () => clear(); // Cleanup on unmount
  }, [clear]);

  return { set, clear };
};


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
  const [optimisticNumber, setOptimisticNumber] = useState<number | null>(null);
  const [localHistory, setLocalHistory] = useState<number[]>([]);

  const animIntervalRef = useRef<number | null>(null);
  const { set: setFallbackTimeout, clear: clearFallbackTimeout } = useRafTimeout();
  const lastNonceRef = useRef<number | null>(null);

  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnPlayerId = turnOrder[game.educatedMerchantState?.currentTurnIndex || 0];
  const isMyTurn = self.id === currentTurnPlayerId;
  const lastRoll = game.educatedMerchantState?.lastDiceRoll;
  const rollNonce = game.educatedMerchantState?.rollAnimationNonce ?? null;
  const diceMax = game.educatedMerchantState?.settings?.diceMax ?? DEFAULT_DICE_MAX;

  const startLocalSpin = useCallback(() => {
    if (animIntervalRef.current) return;
    setIsRolling(true);
    animIntervalRef.current = window.setInterval(() => {
      setOptimisticNumber(Math.floor(Math.random() * Math.max(6, diceMax)) + 1);
    }, 80);

    setFallbackTimeout(() => {
      if (animIntervalRef.current) {
        window.clearInterval(animIntervalRef.current!);
        animIntervalRef.current = null;
      }
      setIsRolling(false);
      setOptimisticNumber(null);
      toast({ title: 'انتهى وقت الاستجابة', description: 'لم نتلق نتيجة من الخادم — حاول مرة أخرى', variant: 'destructive' });
    }, 8000);
  }, [diceMax, setFallbackTimeout, toast]);

  const stopLocalSpin = useCallback(() => {
    if (animIntervalRef.current) { window.clearInterval(animIntervalRef.current); animIntervalRef.current = null; }
    clearFallbackTimeout();
    setIsRolling(false);
    setOptimisticNumber(null);
  }, [clearFallbackTimeout]);
  
  // Effect to handle server-driven roll animation
  useEffect(() => {
    if (rollNonce === null) return;
    if (lastNonceRef.current !== rollNonce) {
        lastNonceRef.current = rollNonce;
        startLocalSpin();
    }
  }, [rollNonce, startLocalSpin]);
  
  // Effect to stop animation and show final result when `lastRoll` is updated
  useEffect(() => {
    if (typeof lastRoll === 'number') {
      stopLocalSpin();
      setLocalHistory((h) => [lastRoll, ...h].slice(0, 6));
    }
  }, [lastRoll, stopLocalSpin]);

  // General cleanup on unmount
  useEffect(() => {
    return () => {
        if(animIntervalRef.current) window.clearInterval(animIntervalRef.current);
        clearFallbackTimeout();
    };
  }, [clearFallbackTimeout]);

  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;
    try {
      await rollDice(game.id, self.id);
      // No need to call startLocalSpin here as it will be triggered by the nonce change
    } catch (err: any) {
      stopLocalSpin();
      toast({ title: 'فشل رمي النرد', description: err?.message || 'حدث خطأ أثناء الاتصال بالخادم', variant: 'destructive' });
    }
  }, [game.id, isMyTurn, isRolling, self.id, stopLocalSpin, toast]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isMyTurn && !isRolling) {
      e.preventDefault();
      void handleRoll();
    }
  }, [handleRoll, isMyTurn, isRolling]);

  const displayedNumber = typeof lastRoll === 'number' ? lastRoll : optimisticNumber;

  if (typeof displayedNumber === 'number' && !isRolling) {
      return (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
                <Card className="text-center bg-slate-800 border-primary text-white shadow-lg" tabIndex={0} onKeyDown={onKeyDown} aria-live="polite">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">نتيجة النرد</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <RollingNumber number={displayedNumber} maxFace={diceMax} isAnimating={isRolling} />
                        <div className="mt-3 text-slate-300">نتيجة مؤكدة من الخادم</div>
                    </CardContent>
                </Card>
            </motion.div>
      )
  }

  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
      <Card className="text-center bg-slate-800 border-primary text-white shadow-lg" tabIndex={0} onKeyDown={onKeyDown} aria-live="polite">
        <CardHeader className="pb-2">
          <CardTitle className="text-primary">
            {isRolling ? 'جارٍ الرمي...' : (isMyTurn ? 'دورك لرمي النرد' : `دور: ${game.players.find(p => p.id === currentTurnPlayerId)?.name || 'لاعب'}`)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3">
            {isRolling ? (
                 <RollingNumber number={displayedNumber ?? 1} maxFace={Math.max(MIN_FACE_RENDER, diceMax)} isAnimating={isRolling} />
            ) : (
                <Dices className="w-24 h-24 mx-auto text-primary" aria-hidden />
            )}
            <div className="flex w-full gap-2">
              <Button onClick={handleRoll} disabled={!isMyTurn || isRolling} className="flex-1" aria-disabled={!isMyTurn || isRolling} aria-label={isMyTurn ? (isRolling ? 'جارٍ رمي النرد' : 'ارمِ النرد') : 'ليس دورك'}>
                {isRolling ? <Loader2 className="animate-spin" /> : (isMyTurn ? 'ارمِ النرد' : 'انتظر')}
              </Button>
            </div>
            
            <div className="w-full mt-2 text-left">
              <div className="text-sm text-slate-200 mb-1">آخر الرميات:</div>
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
