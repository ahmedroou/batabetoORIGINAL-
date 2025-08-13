
'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dices, Loader2 } from 'lucide-react';
import type { Game, Player } from '@/types';
import { rollDice, endTurn, purchaseProperty } from '@/lib/actions/educated-merchant';
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

export function DiceRoll({ game, self }: DiceRollProps) {
  const { toast } = useToast();
  const [isRolling, setIsRolling] = useState(false);
  const [localHistory, setLocalHistory] = useState<number[]>([]);

  const lastNonceRef = useRef<number | null>(null);

  const turnOrder = game.educatedMerchantState?.turnOrder || [];
  const currentTurnPlayerId = turnOrder[game.educatedMerchantState?.currentTurnIndex || 0];
  const isMyTurn = self.id === currentTurnPlayerId;
  const lastRoll = game.educatedMerchantState?.lastDiceRoll;
  const rollNonce = game.educatedMerchantState?.rollAnimationNonce ?? null;
  const diceMax = game.educatedMerchantState?.settings?.diceMax ?? DEFAULT_DICE_MAX;

  useEffect(() => {
    if (rollNonce && lastNonceRef.current !== rollNonce) {
        lastNonceRef.current = rollNonce;
        setIsRolling(true);
        const timer = setTimeout(() => setIsRolling(false), 1200); // Visual flair
        return () => clearTimeout(timer);
    }
  }, [rollNonce]);

  useEffect(() => {
    if (typeof lastRoll === 'number' && lastRoll !== localHistory[0]) {
      setLocalHistory((h) => [lastRoll, ...h].slice(0, 5));
    }
  }, [lastRoll, localHistory]);

  const handleRoll = useCallback(async () => {
    if (!isMyTurn || isRolling) return;
    setIsRolling(true);
    try {
      await rollDice(game.id, self.id);
      // We no longer set state here; we wait for the server to update the game state
    } catch (err: any) {
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


  const renderContent = () => {
    if (typeof lastRoll === 'number' && game.gameState !== 'rolling') {
         return (
             <>
                <CardHeader className="pb-2">
                    <CardTitle className="text-primary">نتيجة النرد</CardTitle>
                </CardHeader>
                <CardContent>
                    <RollingNumber number={lastRoll} maxFace={diceMax} />
                </CardContent>
             </>
         );
    }
    
    return (
        <>
             <CardHeader className="pb-2">
                <CardTitle className="text-primary">
                    {isMyTurn ? 'دورك لرمي النرد' : `دور: ${game.players.find(p => p.id === currentTurnPlayerId)?.name || 'لاعب'}`}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center gap-3">
                    <Dices className="w-24 h-24 mx-auto text-primary" aria-hidden />
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
