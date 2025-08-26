'use client';

import React, { useEffect, useMemo } from 'react';
import type { Game, Player } from '@/types';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/* --------------------------------- Skeleton -------------------------------- */
const PhaseSkeleton: React.FC<{ message?: string }> = ({ message = 'يجري التحميل…' }) => (
  <div
    className="w-full h-full flex items-center justify-center"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{message}</span>
    </div>
  </div>
);

/* ------------------------------- Phase Imports ------------------------------ */
/** مهم: ssr=false لتثبيت الهوية كعميل ومنع تبديل الحدود مع كل re-render */
const LobbyPhase        = dynamic(() => import('./phases/LobbyPhase').then(m => m.LobbyPhase),              { ssr: false, loading: () => <PhaseSkeleton message="جاري تحميل اللوبي…" /> });
const PlayingPhase      = dynamic(() => import('./phases/PlayingPhase').then(m => m.default),          { ssr: false, loading: () => <PhaseSkeleton message="جاري تحميل مرحلة اللعب…" /> });
const VotingPhase     = dynamic(() => import('./phases/VotingPhase').then(m => m.default),        { ssr: false, loading: () => <PhaseSkeleton message="جاري تحميل مرحلة التصويت…" /> });
const ResultsPhase      = dynamic(() => import('./phases/ResultsPhase').then(m => m.default),          { ssr: false, loading: () => <PhaseSkeleton message="جاري تحميل النتائج…" /> });
const FinalResultsPhase = dynamic(() => import('./phases/FinalResultsPhase').then(m => m.default),{ ssr: false, loading: () => <PhaseSkeleton message="جاري تحميل نتائج النهاية…" /> });

/* ---------------------------------- Types ---------------------------------- */
type PhaseKey = 'lobby' | 'playing' | 'voting' | 'results' | 'final_results';

/* ------------------------------- Phase Mapping ------------------------------ */
const PHASE_COMPONENTS: Record<PhaseKey, React.ComponentType<{ game: Game; self: Player }>> = {
  lobby: LobbyPhase,
  playing: PlayingPhase,
  voting: VotingPhase,
  results: ResultsPhase,
  final_results: FinalResultsPhase,
};

const KNOWN_PHASES = Object.keys(PHASE_COMPONENTS) as PhaseKey[];
const isKnownPhase = (p: any): p is PhaseKey => KNOWN_PHASES.includes(p);

/* --------------------------------- Boundary -------------------------------- */
function UnknownPhase({ phase }: { phase: string }) {
  return (
    <div className="text-center text-sm text-red-500" role="alert">
      مرحلة غير معروفة: <span className="font-mono">{phase}</span>
    </div>
  );
}

/* --------------------------------- Main View -------------------------------- */
interface KingdomOfNamesGameProps {
  game: Game;
  self: Player;
}

export default function KingdomOfNamesGame({ game, self }: KingdomOfNamesGameProps) {
  const prefersReducedMotion = useReducedMotion();

  // Resolve phase safely and memoize
  const phase: PhaseKey = useMemo(() => {
    if (!game) return 'lobby';
    if (game.gameState === 'lobby') return 'lobby';
    const p = game.kingdomOfNamesState?.phase;
    return isKnownPhase(p) ? p : 'lobby';
  }, [game?.gameState, game?.kingdomOfNamesState?.phase]);

  const Content = PHASE_COMPONENTS[phase] ?? (() => <UnknownPhase phase={String(phase)} />);

  // Scroll to top & focus for screen readers when the phase changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    } catch {}

    // small a11y improvement: focus the main container so screen readers announce content change
    const el = document.getElementById('kon-main-content');
    if (el) el.focus();
  }, [phase, prefersReducedMotion]);

  const motionProps = prefersReducedMotion
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -15 } };

  return (
    <main
      id="kon-main-content"
      tabIndex={-1}
      role="main"
      aria-live="polite"
      className="w-full flex items-center justify-center p-2"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          {...motionProps}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full h-full flex items-center justify-center"
          aria-labelledby={`kon-phase-${phase}`}
          role="region"
        >
          <h2 id={`kon-phase-${phase}`} className="sr-only">
            مرحلة: {phase}
          </h2>
          <Content game={game} self={self} />
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
