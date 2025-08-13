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

const DEFAULT_DICE_MAX = 5;
const MIN_FACE_RENDER = 6;
const FACE_HEIGHT = 80; // px, ensure consistency with CSS

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

function AnimatedDice({ isRolling }: { isRolling: boolean }) {
  return (
    <motion.div
      className="w-24 h-24 mx-auto flex items-center justify-center"
      aria-hidden
      animate={isRolling ? { rotateX: [0, 360], rotateY: [0, 360] } : { rotateX: 0, rotateY: 0 }}
      transition={isRolling ? { repeat: Infinity, ease: 'linear', duration: 0.9 } : { duration: 0.4 }}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <Dices className="w-24 h-24 text-primary" />
    </motion.div>
  );
}

// Minimal WebAudio helper (no external assets) — generates a rolling sound and a short result beep.
function createAudioHelpers() {
  const ctx = typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext) ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;
  let rollingOsc: OscillatorNode | null = null;
  let rollingGain: GainNode | null = null;

  function playRollLoop() {
    if (!ctx) return;
    stopRollLoop();
    rollingOsc = ctx.createOscillator();
    rollingGain = ctx.createGain();
    rollingOsc.type = 'sawtooth';
    rollingOsc.frequency.value = 80; // low rumble
    rollingGain.gain.value = 0.0001; // start very low
    rollingOsc.connect(rollingGain);
    rollingGain.connect(ctx.destination);
    rollingOsc.start();
    // ramp up a bit to avoid click
    rollingGain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.2);
  }

  function stopRollLoop() {
    if (!ctx) return;
    try {
      if (rollingGain) {
        rollingGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      }
      if (rollingOsc) {
        rollingOsc.stop(ctx.currentTime + 0.13);
      }
    } catch (e) {
      // ignore
    }
    rollingOsc = null;
    rollingGain = null;
  }

  function playResultBeep() {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    osc.start(now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.stop(now + 0.36);
  }

  return { ctx, playRollLoop, stopRollLoop, playResultBeep };
}

export function DiceRoll({ game, self }: DiceRollProps) {
  const { toast } = useToast();
  const [isRolling, setIsRolling] = useState(false);
  const [localHistory, setLocalHistory] = useState<number[]>([]);

  // preferences
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try { return localStorage.getItem('dice.sound') !== '0'; } catch (e) { return true; }
  });
  const [vibrationOn, setVibrationOn] = useState<boolean>(() => {
    try { return localStorage.getItem('dice.vibrate') !== '0'; } catch (e) { return true; }
  });

  const audio = useRef<ReturnType<typeof createAudioHelpers> | null>(null);
  const lastNonceRef = useRef<number | null>(null);
  const rollingSoundPlayingRef = useRef(false);

  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
  const currentTurnPlayerId = turnOrder[currentTurnIndex];
  const isMyTurn = self.id === currentTurnPlayerId;
  const lastRoll = game.educatedMerchantState?.lastDiceRoll;
  const rollNonce = game.educatedMerchantState?.rollAnimationNonce ?? null;
  const diceMax = game.educatedMerchantState?.settings?.diceMax ?? DEFAULT_DICE_MAX;

  // initialize audio helper lazily (do not auto-play)
  useEffect(() => {
    audio.current = createAudioHelpers();
    return () => {
      try { audio.current?.stopRollLoop(); } catch (e) {}
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('dice.sound', soundOn ? '1' : '0'); } catch (e) {}
  }, [soundOn]);
  useEffect(() => {
    try { localStorage.setItem('dice.vibrate', vibrationOn ? '1' : '0'); } catch (e) {}
  }, [vibrationOn]);

  // When a new roll nonce comes from the server, it means a roll has completed.
  useEffect(() => {
    if (rollNonce && lastNonceRef.current !== rollNonce) {
        lastNonceRef.current = rollNonce;
        // stop rolling animation & sound, play result
        if (soundOn && audio.current) {
          audio.current.stopRollLoop();
          audio.current.playResultBeep();
        }
        if (vibrationOn && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate?.([100, 50, 100]); } catch (e) {}
        }
        // allow the UI animation to finish then set false
        const timer = setTimeout(() => setIsRolling(false), 900);
        return () => clearTimeout(timer);
    }
  }, [rollNonce, soundOn, vibrationOn]);

  // Keep local history in sync with server lastRoll
  useEffect(() => {
    if (typeof lastRoll === 'number' && lastRoll !== localHistory[0]) {
      setLocalHistory((h) => [lastRoll, ...h].slice(0, 5));
    }
  }, [lastRoll]);

  // Stop animation if game state changes unexpectedly
  useEffect(() => {
    if (game.gameState !== 'rolling' && isRolling) {
      setIsRolling(false);
      if (audio.current && rollingSoundPlayingRef.current) {
        audio.current.stopRollLoop();
        rollingSoundPlayingRef.current = false;
      }
    }
  }, [game.gameState, isRolling]);

  const startRollingSoundIfNeeded = useCallback(() => {
    if (!soundOn || !audio.current) return;
    try {
      // resume audio context on user gesture (some browsers block without gesture)
      audio.current.ctx?.resume?.();
      audio.current.playRollLoop();
      rollingSoundPlayingRef.current = true;
    } catch (e) {
      // ignore audio failures
      rollingSoundPlayingRef.current = false;
    }
  }, [soundOn]);

  const stopRollingSoundIfNeeded = useCallback(() => {
    if (!audio.current) return;
    try { audio.current.stopRollLoop(); } catch (e) {}
    rollingSoundPlayingRef.current = false;
  }, []);

  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;

    setIsRolling(true);
    // start local rolling sound/animation immediately
    startRollingSoundIfNeeded();

    try {
      await rollDice(game.id, self.id);
      // we keep isRolling true until server emits nonce and effect stops it
    } catch (err: any) {
      // stop sound/animation on failure
      stopRollingSoundIfNeeded();
      setIsRolling(false);
      toast({ title: 'فشل رمي النرد', description: err?.message || 'حدث خطأ أثناء الاتصال بالخادم', variant: 'destructive' });
    }
  }, [game.id, isMyTurn, isRolling, self.id, startRollingSoundIfNeeded, stopRollingSoundIfNeeded, toast]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isMyTurn && !isRolling) {
      e.preventDefault();
      void handleRoll();
    }
  }, [handleRoll, isMyTurn, isRolling]);

  const toggleSound = () => setSoundOn((s) => !s);
  const toggleVibration = () => setVibrationOn((v) => !v);

  const renderContent = () => {
    if (typeof lastRoll === 'number' && game.gameState !== 'rolling') {
         return (
             <>
                <CardHeader className="pb-2 flex items-center justify-between">
                    <div>
                      <CardTitle className="text-primary">نتيجة النرد</CardTitle>
                      <CardDescription className="text-slate-400">الرقم الأخير من الخادم</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={toggleSound} aria-pressed={soundOn} title={soundOn ? 'كتم الصوت' : 'تشغيل الصوت'}>
                        {soundOn ? <Volume className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={toggleVibration} aria-pressed={vibrationOn} title={vibrationOn ? 'إيقاف الاهتزاز' : 'تمكين الاهتزاز'}>
                        <Smartphone className="w-4 h-4" />
                      </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <RollingNumber number={lastRoll} maxFace={diceMax} isAnimating={isRolling} />
                </CardContent>
             </>
         );
    }

    return (
        <>
             <CardHeader className="pb-2 flex items-center justify-between">
                <div>
                  <CardTitle className="text-primary">
                      {isMyTurn ? 'دورك لرمي النرد' : `دور: ${game.players.find(p => p.id === currentTurnPlayerId)?.name || 'لاعب'}`}
                  </CardTitle>
                  <CardDescription className="text-slate-400">اضغط الزر أو اضغط Enter حينما يكون دورك</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={toggleSound} aria-pressed={soundOn} title={soundOn ? 'كتم الصوت' : 'تشغيل الصوت'}>
                    {soundOn ? <Volume className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={toggleVibration} aria-pressed={vibrationOn} title={vibrationOn ? 'إيقاف الاهتزاز' : 'تمكين الاهتزاز'}>
                    <Smartphone className="w-4 h-4" />
                  </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center gap-3">
                    <AnimatedDice isRolling={isRolling} />
                    <Button onClick={handleRoll} disabled={!isMyTurn || isRolling} className="w-full" aria-disabled={!isMyTurn || isRolling} aria-label={isMyTurn ? (isRolling ? 'جارٍ رمي النرد' : 'ارمِ النرد') : 'ليس دورك'}>
                        {isRolling ? <Loader2 className="animate-spin" /> : (isMyTurn ? 'ارمِ النرد' : 'انتظر')}
                    </Button>
                </div>
            </CardContent>
        </>
    );
  }

  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
      <Card className="text-center bg-slate-800 border-primary text-white shadow-lg" tabIndex={0} onKeyDown={onKeyDown} aria-live="polite">
          {renderContent()}
          <CardContent>
              <div className="w-full mt-2 text-left">
                  <div className="text-sm text-slate-200 mb-1">آخر الرميات:</div>
                  <div className="flex gap-2">
                      {localHistory.length === 0 ? (
                          <div className="text-slate-500 text-xs">لا يوجد سجل بعد</div>
                      ) : (
                          localHistory.map((r, i) => (
                              <div key={i} className="w-8 h-8 rounded bg-gray-800/60 flex items-center justify-center border border-primary/20">{r}</div>
                          ))
                      )}
                  </div>
              </div>
          </CardContent>
      </Card>
    </motion.div>
  );
}
