
"use client";

import { useState, useEffect } from 'react';
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

const numbers = [1, 2, 3, 4, 5];

export function DiceRoll({ gameId, selfId, isMyTurnToRoll, diceResult }: DiceRollProps) {
    const { toast } = useToast();
    const [isRolling, setIsRolling] = useState(false);
    const [rollingDisplay, setRollingDisplay] = useState(1);

    useEffect(() => {
        // If the diceResult prop is populated (meaning a roll happened),
        // we show the result animation.
        if (diceResult !== null) {
            setIsRolling(true);
            const fastInterval = setInterval(() => {
                setRollingDisplay(numbers[Math.floor(Math.random() * numbers.length)]);
            }, 80);

            // Show the final result after a short delay
            setTimeout(() => {
                clearInterval(fastInterval);
                setRollingDisplay(diceResult);
            }, 1000); // 1s of spinning

            // Hide the dice component after showing the result for 2 seconds
            setTimeout(() => {
                setIsRolling(false);
            }, 3000); // 1s spin + 2s display
        }
    }, [diceResult]);

    const handleRoll = async () => {
        setIsRolling(true);
        // We only call the action, the visual update is driven by the diceResult prop
        try {
            const result = await rollDice(gameId, selfId);
            if (result.error) {
                toast({ title: "خطأ", description: result.error, variant: 'destructive' });
                setIsRolling(false); // Reset on error
            }
        } catch (error: any) {
            toast({ title: "خطأ فادح", description: error.message, variant: 'destructive' });
            setIsRolling(false); // Reset on error
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
                        animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 200, damping: 15 } }}
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
                                {rollingDisplay}
                            </motion.span>
                        </AnimatePresence>
                    </motion.div>
                ) : isMyTurnToRoll ? (
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
                ) : null}
            </AnimatePresence>
        </motion.div>
    );
}
