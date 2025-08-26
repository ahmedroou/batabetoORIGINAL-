
'use client';

import React from 'react';
import type { Game, Player } from '@/types';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion, Variants } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/* ---------------------------------- أنواع البيانات ---------------------------------- */
type PhaseKey = 'lobby' | 'playing' | 'voting' | 'results' | 'final_results';

/* --------------------------------- إعدادات وثوابت --------------------------------- */
const PhaseSkeleton = () => (
  <div
    className="flex h-full w-full items-center justify-center"
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

// استيراد ديناميكي لمكونات المراحل مع عرض هيكل التحميل
const LobbyPhase = dynamic(() => import('./phases/LobbyPhase').then(m => m.default), { ssr: false, loading: PhaseSkeleton });
const PlayingPhase = dynamic(() => import('./phases/PlayingPhase'), { ssr: false, loading: PhaseSkeleton });
const VotingPhase = dynamic(() => import('./phases/VotingPhase'), { ssr: false, loading: PhaseSkeleton });
const ResultsPhase = dynamic(() => import('./phases/ResultsPhase'), { ssr: false, loading: PhaseSkeleton });
const FinalResultsPhase = dynamic(() => import('./phases/FinalResultsPhase'), { ssr: false, loading: PhaseSkeleton });

// ربط كل مفتاح مرحلة بالمكون الخاص به
const PHASE_COMPONENTS: Record<PhaseKey, React.ComponentType<{ game: Game; self: Player }>> = {
  lobby: LobbyPhase,
  playing: PlayingPhase,
  voting: VotingPhase,
  results: ResultsPhase,
  final_results: FinalResultsPhase,
};

const KNOWN_PHASES = Object.keys(PHASE_COMPONENTS) as PhaseKey[];
const isKnownPhase = (p: any): p is PhaseKey => KNOWN_PHASES.includes(p);

// تعريف متغيرات الحركة لـ Framer Motion
const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3, ease: 'easeInOut' },
};

/* --------------------------------- مكونات مساعدة --------------------------------- */
function UnknownPhase({ phase }: { phase: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center text-sm text-red-500">
      <p>
        مرحلة غير معروفة: <span className="font-mono">{phase}</span>
      </p>
      <p className="text-xs text-muted-foreground">قد يكون هناك عدم توافق بين الخادم والعميل. حاول تحديث الصفحة.</p>
    </div>
  );
}

/* ---------------------------------- خطاف مخصص ---------------------------------- */
/**
 * خطاف مخصص لتحديد مرحلة اللعبة الحالية والمكون المرتبط بها.
 * يعالج أيضًا التأثيرات الجانبية مثل التمرير إلى الأعلى عند تغيير المرحلة.
 * @param game - كائن اللعبة الكامل.
 * @returns مصفوفة تحتوي على [مفتاح المرحلة الحالي، المكون المرتبط بالمرحلة].
 */
const useGamePhase = (game: Game): [string, React.ComponentType<any>] => {
  const prefersReducedMotion = useReducedMotion();

  // استخدام useMemo لتجنب إعادة الحساب في كل مرة يتم فيها العرض
  const [phaseKey, PhaseComponent] = React.useMemo(() => {
    if (game.gameState === 'lobby') {
      return ['lobby', PHASE_COMPONENTS.lobby];
    }

    const currentPhase = game.kingdomOfNamesState?.phase;
    if (isKnownPhase(currentPhase)) {
      return [currentPhase, PHASE_COMPONENTS[currentPhase]];
    }

    // عرض مكون الخطأ إذا كانت المرحلة غير معروفة بدلاً من العودة إلى اللوبي
    // هذا يساعد في اكتشاف الأخطاء
    return [currentPhase ?? 'unknown', UnknownPhase];
  }, [game]);

  // التمرير إلى أعلى عند تغيير المرحلة
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      } catch (error) {
        console.error('Failed to scroll to top:', error);
      }
    }
  }, [phaseKey, prefersReducedMotion]);

  return [phaseKey, PhaseComponent];
};


/* --------------------------------- المكون الرئيسي --------------------------------- */
interface KingdomOfNamesGameProps {
  game: Game;
  self: Player;
}

export function KingdomOfNamesGame({ game, self }: KingdomOfNamesGameProps) {
  const [phaseKey, PhaseComponent] = useGamePhase(game);

  // التحقق إذا كان المكون الحالي هو مكون المرحلة غير المعروفة لتمرير props مختلفة
  const isErrorPhase = PhaseComponent === UnknownPhase;

  return (
    <main role="main" className="flex w-full items-center justify-center p-2">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phaseKey}
          variants={pageTransitionVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={pageTransitionVariants.transition}
          className="flex h-full w-full items-center justify-center"
          aria-live="polite"
        >
          {isErrorPhase
            ? <PhaseComponent phase={phaseKey} />
            : <PhaseComponent game={game} self={self} />
          }
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
