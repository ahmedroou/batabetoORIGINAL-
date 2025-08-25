'use client';

import React from 'react';
import type { Game, Player } from '@/types';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { LobbyPhase } from './phases/LobbyPhase';

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
const PlayingPhase = dynamic(() => import('./phases/PlayingPhase'), { ssr: false, loading: () => <PhaseSkeleton /> });
const VotingPhase = dynamic(() => import('./phases/VotingPhase'), { ssr: false, loading: () => <PhaseSkeleton /> });
const ResultsPhase = dynamic(() => import('./phases/ResultsPhase'), { ssr: false, loading: () => <PhaseSkeleton /> });
const FinalResultsPhase = dynamic(() => import('./phases/FinalResultsPhase'), { ssr: false, loading: () => <PhaseSkeleton /> });

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
    <div className="text-center text-sm text-red-500">
      مرحلة غير معروفة: <span className="font-mono">{phase}</span>
    </div>
  );
}

/* --------------------------------- Main View -------------------------------- */
interface KingdomOfNamesGameProps {
  game: Game;
  self: Player;
}

export function KingdomOfNamesGame({ game, self }: KingdomOfNamesGameProps) {
  const prefersReducedMotion = useReducedMotion();

  // Safely resolve the current phase, defaulting to 'lobby' if unknown.
  const phase: PhaseKey = 
    game.gameState === 'lobby' ? 'lobby' :
    isKnownPhase(game.kingdomOfNamesState?.phase)
    ? game.kingdomOfNamesState!.phase
    : 'lobby';

  const Content = PHASE_COMPONENTS[phase] ?? UnknownPhase;

  // Scroll to top on phase change
  React.useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    } catch {}
  }, [phase, prefersReducedMotion]);

  return (
    <main role="main" className="w-full flex items-center justify-center p-2">
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full h-full flex items-center justify-center"
          aria-live="polite"
        >
          <Content game={game} self={self} />
        </motion.div>
      </AnimatePresence>
    </main>
  );
}