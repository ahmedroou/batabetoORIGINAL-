
'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2, Volume, VolumeX, Smartphone } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

interface DiceRollProps { game: Game; self: Player }

function createAudioHelpers() {
  const ctx = typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext) ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;
  
  const playSound = (type: 'roll' | 'result') => {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    
    if (type === 'roll') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else { // result
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  };
  
  return { playSound, ctx };
}


export function DiceRoll({ game, self }: DiceRollProps) {
  const { toast } = useToast();
  const [isRolling, setIsRolling] = useState(false);
  const [localHistory, setLocalHistory] = useState<number[]>([]);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try { return localStorage.getItem('dice.sound') !== '0'; } catch (e) { return true; }
  });
  
  const audio = useRef<ReturnType<typeof createAudioHelpers> | null>(null);
  const lastNonceRef = useRef<number | null>(null);

  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
  const currentTurnPlayerId = turnOrder[currentTurnIndex];
  const isMyTurn = self.id === currentTurnPlayerId;
  const lastRoll = game.educatedMerchantState?.lastDiceRoll;
  const rollNonce = game.educatedMerchantState?.rollAnimationNonce ?? null;

  useEffect(() => {
    audio.current = createAudioHelpers();
  }, []);

  useEffect(() => {
    try { localStorage.setItem('dice.sound', soundOn ? '1' : '0'); } catch (e) {}
  }, [soundOn]);

  useEffect(() => {
    if (rollNonce && lastNonceRef.current !== rollNonce) {
        lastNonceRef.current = rollNonce;
        if(soundOn) audio.current?.playSound('result');
        const timer = setTimeout(() => setIsRolling(false), 900);
        return () => clearTimeout(timer);
    }
  }, [rollNonce, soundOn]);

  useEffect(() => {
    if (typeof lastRoll === 'number' && localHistory[0] !== lastRoll) {
      setLocalHistory((h) => [lastRoll, ...h].slice(0, 5));
    }
  }, [lastRoll, localHistory]);

  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;

    setIsRolling(true);
    if(soundOn) {
       audio.current?.ctx?.resume?.();
       Array(4).fill(0).forEach((_, i) => {
           setTimeout(() => audio.current?.playSound('roll'), i * 110);
       });
    }

    try {
      await rollDice(game.id, self.id);
    } catch (err: any) {
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
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
      <Card className="w-64 text-center bg-slate-800 border-primary text-white shadow-lg" tabIndex={0} onKeyDown={onKeyDown} aria-live="polite">
          <CardHeader className="pb-2 flex-row items-center justify-between">
              <div>
                <CardTitle className="text-primary">
                    {isMyTurn ? 'دورك لرمي النرد' : `دور: ${game.players.find(p => p.id === currentTurnPlayerId)?.name || '...'}`}
                </CardTitle>
                <CardDescription className="text-slate-400 text-right">
                    {isMyTurn && 'اضغط الزر أو Enter'}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={toggleSound} aria-pressed={soundOn} title={soundOn ? 'كتم الصوت' : 'تشغيل الصوت'}>
                {soundOn ? <Volume className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </Button>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center min-h-[140px]">
              <AnimatePresence>
                  {isRolling ? (
                      <motion.div key="rolling" initial={{opacity:0, scale:0.7}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.7}}>
                           <Dices className="w-24 h-24 mx-auto text-primary animate-pulse" />
                      </motion.div>
                  ) : (
                      <motion.div key="idle" initial={{opacity:0, scale:0.7}} animate={{opacity:1, scale:1}}>
                           <Dices className="w-24 h-24 mx-auto text-primary" />
                      </motion.div>
                  )}
              </AnimatePresence>
          </CardContent>
          <CardContent>
              <Button onClick={handleRoll} disabled={!isMyTurn || isRolling} className="w-full" size="lg" aria-disabled={!isMyTurn || isRolling} aria-label={isMyTurn ? (isRolling ? 'جارٍ رمي النرد' : 'ارمِ النرد') : 'ليس دورك'}>
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
                              <div key={i} className="w-8 h-8 rounded bg-gray-900/60 flex items-center justify-center border border-primary/20">{r}</div>
                          ))
                      )}
                  </div>
              </div>
          </CardContent>
      </Card>
    </motion.div>
  );
}

