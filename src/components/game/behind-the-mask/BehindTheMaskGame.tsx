"use client";

import type { Game, Player } from '@/types';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LobbyPhase } from './phases/LobbyPhase';
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhaseAlt } from './phases/DayPhaseAlt';
import { ResultsPhase } from './phases/ResultsPhase';
import { ExecutionAnimationOverlay } from './ExecutionAnimationOverlay';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { transitionToNight } from '@/lib/actions/behind-the-mask';
import { Card, CardContent } from '@/components/ui/card';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

interface BehindTheMaskGameProps {
  game: Game;
  self: Player;
}

export function BehindTheMaskGame({ game, self }: BehindTheMaskGameProps) {
  const [showExecution, setShowExecution] = useState(false);
  const [executedPlayerData, setExecutedPlayerData] = useState<{ name: string; avatarId: string; temporaryTitle?: string } | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const phase = game.mafiaState?.phase;
  const isHost = game.hostId === self.id;

  const prefersReducedMotion = useReducedMotion();
  const transitionOnce = useRef(false);

  // مراجع للقيم الأحدث لتجنّب إغلاق قديم داخل الـ handlers
  const phaseRef = useLatest(phase);
  const isHostRef = useLatest(isHost);

  // Stable key for smooth cross-fade between phases
  const phaseKey = useMemo(
    () => `${game.id}-${phase || game.gameState}`,
    [game.id, phase, game.gameState]
  );

  useEffect(() => {
    // تنظيف خطأ سابق عند تغيّر المرحلة
    if (transitionError) setTransitionError(null);

    if (phase === 'execution') {
      setExecutedPlayerData(game.mafiaState?.lastExecutedPlayer ?? null);
      setShowExecution(true);
      // اسمح بمحاولة انتقال جديدة عند دخول التنفيذ مجددًا
      transitionOnce.current = false;
    } else {
      setShowExecution(false);
    }
  }, [phase, game.mafiaState?.lastExecutedPlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnimationEnd = useCallback(async () => {
    setShowExecution(false);

    // حواجز أمان ضد السباق/التكرار
    if (phaseRef.current !== 'execution') return;
    if (!isHostRef.current) return;
    if (transitionOnce.current) return;

    transitionOnce.current = true;
    try {
      await transitionToNight(game.id, self.id);
      // نجح الانتقال — لا شيء إضافي، ستتزامن الواجهة مع الحالة من السيرفر
    } catch {
      // لا نطبع على الكونسول في الإنتاج؛ نعرض إشعارًا صغيرًا
      setTransitionError('تعذّر الانتقال إلى الليل. ستتم مزامنة الحالة من الخادم تلقائيًا.');
      // أبقِ transitionOnce=true لتفادي حلقات، والسيرفر سيصحّح الرؤية.
    }
  }, [game.id, self.id, phaseRef, isHostRef]);

  const renderContent = useCallback(() => {
    if (!game?.mafiaState) {
      return (
        <Card className="text-center p-8">
          <CardContent>
            <h2 className="text-2xl font-bold animate-pulse" aria-live="polite">...جاري التحميل</h2>
          </CardContent>
        </Card>
      );
    }

    if (showExecution) {
      return (
        <ExecutionAnimationOverlay
          player={executedPlayerData}
          onAnimationEnd={handleAnimationEnd}
        />
      );
    }

    if (game.gameState === 'lobby') {
      return <LobbyPhase game={game} self={self} />;
    }

    switch (phase) {
      case 'role_reveal':
        return <RoleRevealPhase game={game} self={self} />;
      case 'night':
        return <NightPhase game={game} self={self} />;
      case 'day':
        return <DayPhaseAlt game={game} self={self} />;
      case 'final_results':
        return <ResultsPhase game={game} self={self} />;
      case 'execution':
        return (
          <Card className="text-center p-8 bg-gray-900/80 text-white border-slate-700">
            <CardContent>
              <h2 className="text-2xl font-bold animate-pulse">يتم تنفيذ الحكم...</h2>
              {!isHost && <p className="opacity-70 mt-2">في انتظار المضيف للانتقال إلى الليل.</p>}
              {transitionError && <p className="mt-3 text-amber-300 text-sm">{transitionError}</p>}
            </CardContent>
          </Card>
        );
      default:
        return (
          <Card className="text-center p-8">
            <CardContent>
              <h2 className="text-2xl font-bold">حالة غير معروفة</h2>
              <p className="text-muted-foreground mt-2">{String(phase || game.gameState)}</p>
            </CardContent>
          </Card>
        );
    }
  }, [game, self, phase, showExecution, executedPlayerData, isHost, transitionError, handleAnimationEnd]);

  const duration = prefersReducedMotion ? 0 : 0.35;

  return (
    <div
      className="w-full h-screen flex items-center justify-center relative"
      data-phase={phase || game.gameState}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={phaseKey}
          initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96 }}
          transition={{ duration }}
          className="w-full h-full flex items-center justify-center"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
