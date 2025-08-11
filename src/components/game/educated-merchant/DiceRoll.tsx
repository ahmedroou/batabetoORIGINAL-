
"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dices, Loader2 } from 'lucide-react';
import { rollDice } from '@/lib/actions/educated-merchant';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface DiceRollProps {
    gameId: string;
    selfId: string;
    onRollComplete: (diceResult: number) => void;
}

const numbers = [1, 2, 3, 4, 5];

export function DiceRoll({ gameId, selfId, onRollComplete }: DiceRollProps) {
    const { toast } = useToast();
    const [isRolling, setIsRolling] = useState(false);
    const [result, setResult] = useState<number | null>(null);
    const [rollingDisplay, setRollingDisplay] = useState(1);

    const handleRoll = async () => {
        setIsRolling(true);
        setResult(null);

        const rollPromise = rollDice(gameId, selfId);

        // Start slot machine animation immediately
        const animationDuration = 2000; // 2 seconds
        const fastInterval = setInterval(() => {
            setRollingDisplay(numbers[Math.floor(Math.random() * numbers.length)]);
        }, 80);

        setTimeout(() => {
            clearInterval(fastInterval);
        }, animationDuration - 500); // Stop fast spinning before the end

        // Wait for both animation time and API response
        try {
            const [rollResult] = await Promise.all([
                rollPromise,
                new Promise(resolve => setTimeout(resolve, animationDuration))
            ]);
            
            if (rollResult.success && rollResult.diceResult) {
                setResult(rollResult.diceResult);
                setTimeout(() => onRollComplete(rollResult.diceResult!), 1000); // Wait 1s after showing result
            } else {
                toast({ title: "خطأ", description: rollResult.error, variant: 'destructive' });
                setIsRolling(false);
            }

        } catch (error: any) {
            toast({ title: "خطأ فادح", description: error.message, variant: 'destructive' });
            setIsRolling(false);
        }
    };
    
    return (
        <motion.div
            key="dice-container"
            className="absolute z-20 flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <AnimatePresence mode="wait">
                {isRolling ? (
                    <motion.div
                        key="rolling"
                        className="w-40 h-40 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex items-center justify-center font-mono text-8xl font-bold text-primary"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                    >
                        <AnimatePresence mode="wait">
                             <motion.span
                                key={rollingDisplay}
                                initial={{ y: -50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 50, opacity: 0 }}
                                transition={{ duration: 0.1 }}
                            >
                                {result !== null ? result : rollingDisplay}
                            </motion.span>
                        </AnimatePresence>
                    </motion.div>
                ) : (
                    <motion.div
                        key="button"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                    >
                         <Button
                            onClick={handleRoll}
                            disabled={isRolling}
                            size="lg"
                            className="h-24 w-56 text-2xl rounded-2xl shadow-lg"
                        >
                            <Dices className="ml-4 w-10 h-10"/> ارمِ النرد
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

