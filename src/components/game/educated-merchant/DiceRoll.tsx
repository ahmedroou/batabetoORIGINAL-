'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2, Volume, VolumeX } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

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
      // fail silently for audio problems (iOS autoplay, etc.)
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

  // IMPORTANT: server writes an object like { number, nonce } into educatedMerchantState.displayingRollResult
  const displaying = (game.educatedMerchantState as any)?.displayingRollResult as { number: number; nonce: number } | undefined;

  useEffect(() => {
    audio.current = createAudioHelpers();
    return () => {
      // cleanup any pending fallback timer when unmounting
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('dice.sound', soundOn ? '1' : '0'); } catch { /* ignore */ }
  }, [soundOn]);

  // If game state changed to QUESTION (or anything else), we should reset showResultNumber and handled nonce
  useEffect(() => {
    // Whenever the overall gameState becomes 'question', ensure we don't render the roll result UI
    if (game.gameState === 'question') {
      setShowResultNumber(null);
      // keep handledNonceRef as-is to avoid re-displaying old nonce — but it's safe to clear it if you prefer:
      // handledNonceRef.current = null;
      setIsRolling(false);
      if (serverResponseTimerRef.current) {
        clearTimeout(serverResponseTimerRef.current);
        serverResponseTimerRef.current = null;
      }
    }
  }, [game.gameState]);

  // React to server's displayingRollResult — but guard against question state to avoid the "double show" problem.
  useEffect(() => {
    if (!displaying) return;

    // If the game is in question state, do not display the dice result (defensive)
    if (game.gameState === 'question') {
      // Optionally update history but do not show number
      const { number, nonce } = displaying;
      // still push to history once (so "last rolls" remains accurate)
      setLocalHistory((prev) => [number, ...prev].slice(0, 5));
      // mark nonce handled so we won't show it later accidentally
      handledNonceRef.current = nonce;
      return;
    }

    const { number, nonce } = displaying;
    if (nonce === undefined || nonce === null) return;

    // avoid processing the same nonce multiple times
    if (handledNonceRef.current === nonce) return;
    handledNonceRef.current = nonce;

    // show to user
    setIsRolling(false);
    if (soundOn) audio.current?.playSound('result');
    setLocalHistory((prev) => [number, ...prev].slice(0, 5));
    setShowResultNumber(number);

    // Hide after a short delay
    const hideTimer = window.setTimeout(() => setShowResultNumber(null), 2500);

    // Clear any fallback timer since server responded
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }

    return () => clearTimeout(hideTimer);
  }, [displaying, game.gameState, soundOn]);

  // handle roll action
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;

    setIsRolling(true);

    if (soundOn) {
      try {
        audio.current?.ctx?.resume?.();
        [0, 1, 2].forEach((i) => setTimeout(() => audio.current?.playSound('roll'), i * 100));
      } catch {}
    }

    // fallback: if server doesn't respond within X ms — stop spinner and notify user
    if (serverResponseTimerRef.current) {
      clearTimeout(serverResponseTimerRef.current);
      serverResponseTimerRef.current = null;
    }
    serverResponseTimerRef.current = window.setTimeout(() => {
      serverResponseTimerRef.current = null;
      setIsRolling(false);
      toast({ title: 'لم يرد الخادم', description: 'لم يتم استلام نتيجة النرد. حاول مرة أخرى.', variant: 'destructive' });
    }, 8000);

    try {
      await rollDice(game.id, self.id);
      // do not set isRolling=false here — wait for server's displayingRollResult to arrive (handled in effect)
    } catch (err: any) {
      // network/server error — clear fallback timer and stop spinner
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
          <AnimatePresence mode="wait">
            {isRolling ? (
              <motion.div key="rolling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="w-24 h-24 mx-auto text-primary animate-spin" aria-label="جارٍ رمي النرد" />
              </motion.div>
            ) : showResultNumber !== null ? (
               <motion.div key="result" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                 <div className="text-8xl font-mono font-extrabold text-white" style={{ textShadow: '0 0 20px rgba(59,130,246,0.6)' }}>
                   {showResultNumber}
                 </div>
               </motion.div>
            ) : (
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
