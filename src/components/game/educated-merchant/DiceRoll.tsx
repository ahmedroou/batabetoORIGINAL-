"use client";

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dices } from 'lucide-react';
import { rollDice } from '@/lib/actions/educated-merchant';
import { useToast } from '@/hooks/use-toast';

interface DiceRollProps {
  gameId: string;
  selfId: string;
  isMyTurnToRoll: boolean;
  diceResult: number | null;
}

const numbers = [1, 2, 3, 4, 5, 6];

export function DiceRoll({ gameId, selfId, isMyTurnToRoll, diceResult }: DiceRollProps) {
  const { toast } = useToast();
  const [isRolling, setIsRolling] = useState(false);
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const rollingInterval = useRef<NodeJS.Timer | null>(null);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // عند وصول نتيجة النرد من السيرفر
    if (diceResult !== null) {
      setIsRolling(true);
      // ابدأ عرض النرد يتغير بسرعة مع أرقام عشوائية
      rollingInterval.current = setInterval(() => {
        setDisplayNumber(numbers[Math.floor(Math.random() * numbers.length)]);
      }, 80);

      // بعد ثانية نوقف التغيير ونثبت الرقم النهائي
      const showFinalResultTimeout = setTimeout(() => {
        if (rollingInterval.current) {
          clearInterval(rollingInterval.current);
          rollingInterval.current = null;
        }
        setDisplayNumber(diceResult);
      }, 1000);

      // بعد عرض الرقم النهائي لـ 2 ثانية نخفي المكون
      hideTimeout.current = setTimeout(() => {
        setIsRolling(false);
        setDisplayNumber(null);
      }, 3000);

      // تنظيف التايمرات عند تغير props أو unmount
      return () => {
        clearTimeout(showFinalResultTimeout);
        if (rollingInterval.current) clearInterval(rollingInterval.current);
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
      };
    }
  }, [diceResult]);

  const handleRoll = async () => {
    if (isRolling) return; // منع التكرار أثناء الرمية

    setIsRolling(true);
    try {
      const result = await rollDice(gameId, selfId);
      if (result.error) {
        toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        setIsRolling(false);
      }
    } catch (error: any) {
      toast({ title: "خطأ غير متوقع", description: error?.message || "حدث خطأ أثناء رمي النرد.", variant: 'destructive' });
      setIsRolling(false);
    }
  };

  return (
    <motion.div
      key="dice-container"
      className="absolute z-20 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
    >
      <AnimatePresence mode="wait">
        {isRolling ? (
          <motion.div
            key="rolling"
            className="w-44 h-44 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl flex items-center justify-center font-mono text-9xl font-extrabold text-primary select-none"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } }}
            exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.3 } }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={displayNumber ?? 'placeholder'}
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 60, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {displayNumber ?? '-'}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        ) : isMyTurnToRoll ? (
          <motion.div
            key="roll-button"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
          >
            <Button
              onClick={handleRoll}
              size="lg"
              className="h-24 w-56 text-2xl rounded-3xl shadow-lg flex items-center justify-center gap-3"
              aria-label="ارمِ النرد"
              disabled={isRolling}
              type="button"
            >
              <Dices className="w-10 h-10" />
              ارمِ النرد
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="wait-message"
            className="text-center text-gray-600 dark:text-gray-400 select-none font-medium text-lg px-4 py-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            انتظر دورك لرمي النرد...
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
