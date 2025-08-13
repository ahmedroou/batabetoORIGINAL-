
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { HandCoins } from 'lucide-react';
import type { Game } from '@/types';

interface RentPaidOverlayProps {
  rentInfo: Game['educatedMerchantState']['lastRentPayment'] | null;
}

export function RentPaidOverlay({ rentInfo }: RentPaidOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (rentInfo) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [rentInfo]);

  return (
    <AnimatePresence>
      {isVisible && rentInfo && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50, transition: { duration: 0.4 } }}
          transition={{ type: 'spring', damping: 12, stiffness: 150 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/50 pointer-events-none"
        >
          <div className="p-6 bg-slate-800 text-white rounded-xl shadow-2xl border-2 border-primary text-center">
            <HandCoins className="w-20 h-20 mx-auto text-yellow-400 mb-4" />
            <p className="text-2xl font-bold">
              <span className="text-red-400">{rentInfo.payer}</span> دفع <span className="text-yellow-300">{rentInfo.amount} دينار</span>
            </p>
            <p className="text-xl">
              إيجار إلى <span className="text-green-400">{rentInfo.owner}</span>
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
