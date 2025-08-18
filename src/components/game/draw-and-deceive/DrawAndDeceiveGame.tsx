'use client';

import type { Game, Player } from '@/types';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import React from 'react';

// تحميل كسول لكل مرحلة مع هيكل الاستيراد نفسه (مكوّنات مُصدّرة باسم)
const LobbyPhase = dynamic(() => import('./phases/LobbyPhase').then(m => m.LobbyPhase), {
  ssr: false,
  loading: () => <PhaseSkeleton />,
});
const DrawingPhase = dynamic(() => import('./phases/DrawingPhase').then(m => m.DrawingPhase), {
  ssr: false,
  loading: () => <PhaseSkeleton />,
});
const TrappingPhase = dynamic(() => import('./phases/TrappingPhase').then(m => m.TrappingPhase), {
  ssr: false,
  loading: () => <PhaseSkeleton />,
});
const GuessingPhase = dynamic(() => import('./phases/GuessingPhase').then(m => m.GuessingPhase), {
  ssr: false,
  loading: () => <PhaseSkeleton />,
});
const ResultsPhase = dynamic(() => import('./phases/ResultsPhase').then(m => m.ResultsPhase), {
  ssr: false,
  loading: () => <PhaseSkeleton />,
});
const FinalResultsPhase = dynamic(
  () => import('./phases/FinalResultsPhase').then(m => m.FinalResultsPhase),
  {
    ssr: false,
    loading: () => <PhaseSkeleton />,
  }
);

interface DrawAndDeceiveGameProps {
  game: Game;
  self: Player;
}

export function DrawAndDeceiveGame({ game, self }: DrawAndDeceiveGameProps) {
  const prefersReducedMotion = useReducedMotion();
  const phase = game.drawAndDeceiveState?.phase ?? 'lobby';

  // تمرير إلى أعلى الشاشة عند تغيّر المرحلة
  React.useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    } catch {
      // لا شيء
    }
  }, [phase, prefersReducedMotion]);

  const renderContent = () => {
    switch (phase) {
      case 'lobby':
        return <LobbyPhase game={game} self={self} />;
      case 'drawing':
        return <DrawingPhase game={game} self={self} />;
      case 'trapping':
        return <TrappingPhase game={game} self={self} />;
      case 'guessing':
        return <GuessingPhase game={game} self={self} />;
      case 'results':
        return <ResultsPhase game={game} self={self} />;
      case 'final_results':
        return <FinalResultsPhase game={game} self={self} />;
      default:
        return <UnknownPhase phase={String(phase)} />;
    }
  };

  return (
    <div
      role="main"
      className="w-full min-h-dvh flex items-center justify-center relative bg-gray-100 dark:bg-gray-900 p-3 sm:p-6 overflow-auto"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.975 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.975 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: 'easeOut' }}
          className="w-full h-full flex items-center justify-center"
        >
          <PhaseBoundary>{renderContent()}</PhaseBoundary>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* --------------------------- مكوّنات مساعدة --------------------------- */

function PhaseSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">يجري التحميل…</span>
      </div>
    </div>
  );
}

function UnknownPhase({ phase }: { phase: string }) {
  return (
    <div className="text-center text-sm text-red-600 dark:text-red-400">
      مرحلة غير معروفة: <span className="font-mono">{phase}</span>
    </div>
  );
}

/** حارس أخطاء بسيط يمنع سقوط الواجهة لو تعطل أحد المراحل */
class PhaseBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    // يمكن لاحقاً إرسال الخطأ لخدمة مراقبة
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
