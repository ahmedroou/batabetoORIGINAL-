
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2 } from 'lucide-react';
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
  const serverResponseTimerRef = useRef<number | null>(null);

  // server-driven fields
  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
  const currentTurnPlayerId = turnOrder[currentTurnIndex];
  const isMyTurn = self.id === currentTurnPlayerId;
  const displayingRollResult = game.educatedMerchantState?.displayingRollResult;


  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (serverResponseTimerRef.current) clearTimeout(serverResponseTimerRef.current);
    };
  }, []);

  /* ---------- handle roll action ---------- */
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;

    setIsRolling(true);

    if (serverResponseTimerRef.current) clearTimeout(serverResponseTimerRef.current);
    
    // Fallback timer in case the server doesn't respond
    serverResponseTimerRef.current = window.setTimeout(() => {
        setIsRolling(false);
        toast({ title: 'لم يرد الخادم', description: 'لم يتم استلام نتيجة النرد. حاول مرة أخرى.', variant: 'destructive' });
    }, 10000);


    // استدعاء رمية النرد على السيرفر
    try {
      await rollDice(game.id, self.id);
      // Don't set isRolling to false here. Wait for the server to send back the `displayingRollResult`.
      if (serverResponseTimerRef.current) clearTimeout(serverResponseTimerRef.current);
      // The state will be updated via the useEffect that watches `displayingRollResult`.
    } catch (err: any) {
      if (serverResponseTimerRef.current) clearTimeout(serverResponseTimerRef.current);
      setIsRolling(false);
      toast({ title: 'فشل رمي النرد', description: err?.message || 'حدث خطأ أثناء الاتصال بالخادم', variant: 'destructive' });
    }
  }, [game.id, isMyTurn, isRolling, self.id, toast]);
  
  // This effect resets the rolling state once the result is displayed
  useEffect(() => {
      if(displayingRollResult) {
          setIsRolling(false);
          if (serverResponseTimerRef.current) clearTimeout(serverResponseTimerRef.current);
      }
  }, [displayingRollResult]);


  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isMyTurn && !isRolling) {
      e.preventDefault();
      void handleRoll();
    }
  }, [handleRoll, isMyTurn, isRolling]);


  /* ---------- UI rendering ---------- */
  return (
    <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
      <Card
        className="w-64 text-center bg-slate-800 border-primary text-white shadow-lg"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-live="polite"
        role="region"
        aria-label="لوحة رمي النرد"
      >
        <CardHeader className="pb-2">
            <CardTitle className="text-primary text-sm">
              {isMyTurn ? 'دورك لرمي النرد' : `دور: ${game.players.find(p => p.id === currentTurnPlayerId)?.name || '...'}`}
            </CardTitle>
            <CardDescription className="text-slate-400 text-right text-xs">
              {isMyTurn ? 'اضغط الزر أو Enter' : 'انتظر دورك'}
            </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col items-center justify-center min-h-[140px]">
          <AnimatePresence mode="wait">
            {isRolling ? (
                <motion.div
                  key="rollingNum"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1.02 }}
                  exit={{ opacity: 0 }}
                  className="select-none flex flex-col items-center"
                >
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                  <div className="text-sm text-slate-300 mt-2">... جاري الرمي</div>
                </motion.div>
            ) : displayingRollResult?.number != null ? (
                 <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center"
                >
                   <div className="text-8xl font-mono font-bold text-yellow-300">{displayingRollResult.number}</div>
                   <div className="text-sm text-slate-300 mt-2">نتيجة النرد</div>
                 </motion.div>
            ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Dices className="w-20 h-20 mx-auto text-primary" aria-hidden />
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
      </Card>
    </motion.div>
  );
}
