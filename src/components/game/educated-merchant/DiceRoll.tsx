
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2, Volume, VolumeX } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

/* ---------------- component ---------------- */
interface DiceRollProps { game: Game; self: Player }

export function DiceRoll({ game, self }: DiceRollProps) {
  const { toast } = useToast();

  // UI state
  const [isRolling, setIsRolling] = useState(false);
  const [localHistory, setLocalHistory] = useState<number[]>([]);
  
  const handledNonceRef = useRef<number | string | null>(null);
  const serverResponseTimerRef = useRef<number | null>(null);
  const rollingIntervalRef = useRef<number | null>(null);

  // server-driven fields
  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
  const currentTurnPlayerId = turnOrder[currentTurnIndex];
  const isMyTurn = self.id === currentTurnPlayerId;
  const lastRoll = game.educatedMerchantState?.lastDiceRoll;

  // server's "displaying" payload (set by your server-side actions)
  const displaying = (game.educatedMerchantState as any)?.displayingRollResult as { number: number; nonce: number } | undefined;
  
  const showResultNumber = displaying?.number ?? null;

  /* ---------- setup / cleanup ---------- */
  useEffect(() => {
    return () => {
      // cleanup any timers/intervals
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- handle server "displayingRollResult" ---------- */
  useEffect(() => {
    if (!displaying) {
        setIsRolling(false); // Stop rolling if displaying is cleared
        return;
    };

    const { number, nonce } = displaying;
    if (nonce === undefined || nonce === null) return;

    // avoid double-processing same nonce
    if (handledNonceRef.current === nonce) {
      return;
    }
    handledNonceRef.current = nonce;

    // stop rolling animation
    setIsRolling(false);

    // update history
    setLocalHistory((prev) => [number, ...prev].slice(0, 5));

    // cancel server fallback timer
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }
  }, [displaying]);


  /* ---------- handle roll action ---------- */
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;

    // prepare UI
    setIsRolling(true);
    handledNonceRef.current = null;
    
    // ensure only one fallback timer
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }
    // fallback: if server doesn't respond in X ms, stop rolling and notify
    serverResponseTimerRef.current = window.setTimeout(() => {
      serverResponseTimerRef.current = null;
      // stop UI rolling animation
      setIsRolling(false);
      // clear rolling interval
      toast({ title: 'لم يرد الخادم', description: 'لم يتم استلام نتيجة النرد. حاول مرة أخرى.', variant: 'destructive' });
    }, 10000); // 10s fallback

    try {
      await rollDice(game.id, self.id);

      // if request returned (no exception) cancel fallback — the server will later push displayingRollResult
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null;
      }
      // do not forcibly set isRolling = false here; we wait for the server's displaying payload
    } catch (err: any) {
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null;
      }
      // stop UI
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


  /* ---------- UI rendering ---------- */
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
        </CardHeader>

        <CardContent className="flex flex-col items-center justify-center min-h-[120px] relative">
          <AnimatePresence mode="wait">
            {isRolling ? (
              // show rapidly changing digital number while rolling
              <motion.div key="rollingNum" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1.02 }} exit={{ opacity: 0 }} className="select-none">
                <Loader2 className="w-24 h-24 text-white animate-spin" />
                <div className="text-xs text-slate-300 mt-2">... جاري الرمي</div>
              </motion.div>
            ) : showResultNumber !== null ? (
              // final result big and held
              <motion.div key="result" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                <div className="text-8xl md:text-9xl font-mono font-extrabold text-white" style={{ textShadow: '0 0 24px rgba(59,130,246,0.3)' }}>
                  {showResultNumber}
                </div>
                <div className="text-sm text-slate-300 mt-2">نتيجة النرد</div>
              </motion.div>
            ) : (
              // idle
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Dices className="w-24 h-24 mx-auto text-primary" aria-hidden />
              </motion.div>
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
