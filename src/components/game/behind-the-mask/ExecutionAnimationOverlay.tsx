"use client";

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useMemo } from 'react';
import { Skull, Shield, Sparkles } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';

interface ExecutionAnimationOverlayProps {
  player: { name: string; avatarId: string; temporaryTitle?: string } | null;
  onAnimationEnd: () => void;
}

/**
 * Elegant, thematic execution overlay with soft particles, depth, and progress.
 * - Click anywhere to skip (guarded to avoid double-calls)
 * - Honors reduced-motion preferences
 * - Auto-dismisses after DURATION_MS
 */
export const ExecutionAnimationOverlay = ({ player, onAnimationEnd }: ExecutionAnimationOverlayProps) => {
  const DURATION_MS = 4000;
  const shouldReduceMotion = useReducedMotion();
  const hasEndedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const theme = useMemo(() => {
    return player
      ? {
          // Execution theme
          tint: 'from-red-600/30 via-red-800/40 to-black/80',
          glow: 'bg-red-500/25',
          ring: 'border-red-400/70',
          iconColor: 'text-red-200',
          textAccent: 'text-red-300',
        }
      : {
          // No-execution theme
          tint: 'from-sky-600/25 via-blue-900/40 to-black/80',
          glow: 'bg-sky-400/25',
          ring: 'border-sky-300/70',
          iconColor: 'text-sky-200',
          textAccent: 'text-sky-300',
        };
  }, [player]);

  const endOnce = () => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    onAnimationEnd();
  };

  useEffect(() => {
    timerRef.current = setTimeout(endOnce, DURATION_MS + 150); // small buffer
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Floating soft particles (purely decorative)
  const particles = useMemo(
    () =>
      Array.from({ length: shouldReduceMotion ? 6 : 16 }).map((_, i) => ({
        key: i,
        size: 90 + (i % 5) * 14,
        x: (i * 57) % 100, // pseudo-random positions
        delay: (i % 7) * 0.35,
        duration: 8 + (i % 5),
      })),
    [shouldReduceMotion]
  );

  return (
    <AnimatePresence>
      <motion.div
        key="execution-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[200] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={player ? `تم إعدام ${player.name}` : 'لم يتم إعدام أحد'}
        onClick={endOnce}
      >
        {/* Backdrop gradient + vignette */}
        <div
          className={`absolute inset-0 bg-gradient-to-b ${theme.tint}`}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0)_40%,rgba(0,0,0,0.55)_70%,rgba(0,0,0,0.85)_100%)]" />

        {/* Ambient particles */}
        {particles.map((p) => (
          <motion.span
            key={p.key}
            className={`pointer-events-none absolute rounded-full ${theme.glow} blur-3xl`}
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${(p.key * 29) % 100}%`,
            }}
            initial={{ opacity: 0.0, y: 20 }}
            animate={{
              opacity: 0.6,
              y: [10, -10, 10],
            }}
            transition={{
              duration: shouldReduceMotion ? 4 : p.duration,
              delay: shouldReduceMotion ? 0 : p.delay,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut',
            }}
          />
        ))}

        {/* Content */}
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-4 text-white text-center select-none">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative"
          >
            {/* Avatar with pulse ring */}
            <div className="relative mb-6">
              <div className={`absolute -inset-3 rounded-full ${theme.glow} blur-xl`} />
              <div className="absolute inset-0 rounded-full">
                <span
                  className={`absolute inset-0 rounded-full ${theme.ring} border animate-ping`}
                />
              </div>
              {player ? (
                <PlayerAvatar
                  avatarId={player.avatarId}
                  temporaryTitle={player.temporaryTitle}
                  className="w-40 h-40 rounded-full border-4 border-white/20 shadow-2xl"
                />
              ) : (
                <div className="w-40 h-40 rounded-full border-4 border-white/20 bg-white/10 flex items-center justify-center shadow-2xl">
                  <Sparkles className="w-12 h-12 text-white/70" />
                </div>
              )}

              {/* Icon layer */}
              <motion.div
                key={player ? 'skull' : 'shield'}
                initial={{ scale: 0, rotate: player ? -45 : 45, y: 30 }}
                animate={{
                  scale: 1,
                  rotate: 0,
                  y: -18,
                  transition: { type: 'spring', stiffness: 180, damping: 14, delay: 0.35 },
                }}
                className="absolute -top-10 left-1/2 -translate-x-1/2"
              >
                {player ? (
                  <Skull className={`w-24 h-24 ${theme.iconColor} drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]`} />
                ) : (
                  <Shield className={`w-24 h-24 ${theme.iconColor} drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]`} />
                )}
              </motion.div>

              {/* Shockwave */}
              {!shouldReduceMotion && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0.7 }}
                  animate={{ scale: 1.25, opacity: 0 }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
                  className="absolute -inset-6 rounded-full border border-white/30"
                />
              )}
            </div>

            {/* Headline & subtext */}
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.45 }}
              className={`text-4xl md:text-5xl font-extrabold tracking-tight ${theme.textAccent}`}
            >
              {player ? `تم إعدام ${player.name}!` : 'لم يتم إعدام أحد!'}
            </motion.h1>

            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.45 }}
              className="mt-3 text-lg md:text-xl text-white/80"
            >
              {player ? '...لقد انتهى وقته في المدينة.' : 'لقد قرر أهل المدينة تخطي التصويت هذه المرة.'}
            </motion.p>
          </motion.div>

          {/* Progress bar (auto close) */}
          <div className="mt-10 w-[min(680px,90vw)]">
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: shouldReduceMotion ? 0.01 : DURATION_MS / 1000, ease: 'linear' }}
                className="h-full bg-white/60"
              />
            </div>
            <p className="mt-2 text-xs text-white/60">انقر للتخطي</p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
