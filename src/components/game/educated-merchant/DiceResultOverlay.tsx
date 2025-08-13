
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface DiceResultOverlayProps {
  rollResult: { number: number; nonce: number } | null;
}

export function DiceResultOverlay({ rollResult }: DiceResultOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    if (rollResult) {
      setResult(rollResult.number);
      setIsVisible(true);

      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 2500); // Overlay visible duration

      return () => clearTimeout(timer);
    }
  }, [rollResult]);

  return (
    <AnimatePresence>
      {isVisible && result !== null && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ type: 'spring', damping: 15, stiffness: 200 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 pointer-events-none"
        >
          <div className="text-9xl font-mono font-extrabold text-white" style={{ textShadow: '0 0 20px hsl(var(--primary))' }}>
            {result}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
