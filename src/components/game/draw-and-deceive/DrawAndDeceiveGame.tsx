
'use client';

import React, { useEffect, useMemo } from 'react';
import type { Game, Player } from '@/types';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/* --------------------------------- Skeleton -------------------------------- */
const PhaseSkeleton = () => (
  <div
    className="w-full h-full flex items-center justify-center"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">يجري التحميل…</span>
    </div>
  </div>
);

/* ------------------------------- Phase Imports ------------------------------ */
/** مهم: ssr=false لتثبيت الهوية كعميل ومنع تبديل الحدود مع كل re-render */
const LobbyPhase        = dynamic(() => import('./phases/LobbyPhase').then(m => m.LobbyPhase),              { ssr: false, loading: () => <PhaseSkeleton /> });
const DrawingPhase      = dynamic(() => import('./phases/DrawingPhase').then(m => m.DrawingPhase),          { ssr: false, loading: () => <PhaseSkeleton /> });
const TrappingPhase     = dynamic(() => import('./phases/TrappingPhase').then(m => m.TrappingPhase),        { ssr: false, loading: () => <PhaseSkeleton /> });
const GuessingPhase     = dynamic(() => import('./phases/GuessingPhase').then(m => m.GuessingPhase),        { ssr: false, loading: () => <PhaseSkeleton /> });
const ResultsPhase      = dynamic(() => import('./phases/ResultsPhase').then(m => m.ResultsPhase),          { ssr: false, loading: () => <PhaseSkeleton /> });
const FinalResultsPhase = dynamic(() => import('./phases/FinalResultsPhase').then(m => m.FinalResultsPhase),{ ssr: false, loading: () => <PhaseSkeleton /> });
const WaitingPhase      = dynamic(() => import('./phases/WaitingPhase').then(m => m.WaitingPhase),          { ssr: false, loading: () => <PhaseSkeleton /> });


/* ---------------------------------- Types ---------------------------------- */
type PhaseKey =
  | 'lobby'
  | 'drawing'
  | 'trapping'
  | 'guessing'
  | 'results'
  | 'final_results';

/* ------------------------------- Phase Mapping ------------------------------ */
const PHASE_COMPONENTS: Record<PhaseKey, React.ComponentType<{ game: Game; self: Player }>> = {
  lobby:         LobbyPhase,
  drawing:       DrawingPhase,
  trapping:      TrappingPhase,
  guessing:      GuessingPhase,
  results:       ResultsPhase,
  final_results: FinalResultsPhase,
};

/* --------------------------------- Helpers --------------------------------- */
const isPhaseKey = (v: unknown): v is PhaseKey =>
  typeof v === 'string' &&
  ['lobby','drawing','trapping','guessing','results','final_results'].includes(v);

/** نشتق المرحلة الفعلية للعرض. */
function resolveEffectivePhase(game: Game): PhaseKey | string {
  return game.drawAndDeceiveState?.phase ?? game.gameState ?? 'lobby';
}

/* --------------------------------- Boundary -------------------------------- */
function UnknownPhase({ phase }: { phase: string }) {
  return (
    <div className="text-center text-sm text-red-600 dark:text-red-400">
      مرحلة غير معروفة: <span className="font-mono">{phase}</span>
    </div>
  );
}

class PhaseBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[DrawAndDeceive] Phase error:', error);
  }
  handleRetry = () => this.setState({ hasError: false });
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md w-full p-4 rounded-xl border bg-white dark:bg-gray-800 text-center shadow">
          <p className="mb-3 text-sm">حدث خطأ غير متوقع أثناء عرض المرحلة.</p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

/* --------------------------------- Main View -------------------------------- */
interface DrawAndDeceiveGameProps {
  game: Game;
  self: Player;
}

export function DrawAndDeceiveGame({ game, self }: DrawAndDeceiveGameProps) {
  const prefersReducedMotion = useReducedMotion();

  const effectivePhase = resolveEffectivePhase(game);
  
  const isArtist = game.drawAndDeceiveState?.artistId === self.id;
  
  const Content = useMemo(() => {
    const isArtistDrawingOrTrapping = isArtist && (effectivePhase === 'drawing' || effectivePhase === 'trapping');
    const isPlayerWaiting = !isArtist && (effectivePhase === 'drawing' || effectivePhase === 'trapping');
    
    if (isArtistDrawingOrTrapping) {
        return DrawingPhase;
    }
    if (isPlayerWaiting) {
        return WaitingPhase;
    }
    
    return (PHASE_COMPONENTS as Record<string, React.ComponentType<{ game: Game; self: Player }>>)[effectivePhase] ?? null;
  }, [effectivePhase, isArtist]);

  // تمرير المستخدم لأعلى الصفحة عند تغير المرحلة
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    } catch {}
  }, [effectivePhase, prefersReducedMotion]);

  return (
    <main
      role="main"
      className="w-full min-h-dvh flex items-center justify-center relative bg-gray-100 dark:bg-gray-900 p-3 sm:p-6 overflow-auto"
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={isPhaseKey(effectivePhase) ? `phase-${effectivePhase}` : 'phase-unknown'}
          initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.975 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.975 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: 'easeOut' }}
          className="w-full h-full flex items-center justify-center"
          aria-live="polite"
        >
          <PhaseBoundary>
            {Content ? (
              <Content game={game} self={self} />
            ) : (
              <UnknownPhase phase={String(effectivePhase)} />
            )}
          </PhaseBoundary>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
