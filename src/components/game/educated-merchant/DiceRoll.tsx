
"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dices, Loader2 } from 'lucide-react';
import { rollDice } from '@/lib/actions/educated-merchant';
import { useToast } from '@/hooks/use-toast';

interface DiceRollProps {
    gameId: string;
    selfId: string;
}

const numbers = [1, 2, 3, 4, 5];

export function DiceRoll({ gameId, selfId }: DiceRollProps) {
    const { toast } = useToast();
    const [isRolling, setIsRolling] = useState(false);
    const [result, setResult] = useState<number | null>(null);

    const handleRoll = async () => {
        setIsRolling(true);
        setResult(null);

        const rollResult = await rollDice(gameId, selfId);

        if (rollResult.success && rollResult.diceResult) {
            // Simulate rolling animation time
            const animationDuration = 1500;
            const startTime = Date.now();
            
            const interval = setInterval(() => {
                const randomNum = numbers[Math.floor(Math.random() * numbers.length)];
                setResult(randomNum);
            }, 100);

            setTimeout(() => {
                clearInterval(interval);
                setResult(rollResult.diceResult!);
                setIsRolling(false);
            }, animationDuration);

        } else {
            toast({ title: "خطأ", description: rollResult.error, variant: 'destructive' });
            setIsRolling(false);
        }
    };

    if (result !== null) {
        return (
            <motion.div
                key="result"
                className="absolute z-20 flex flex-col items-center gap-4"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
            >
                <div className="w-32 h-32 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex items-center justify-center font-mono text-7xl font-bold text-primary">
                    {result}
                </div>
                 <p className="text-lg font-semibold bg-black/50 text-white px-4 py-1 rounded-full">التحرك {result} خطوات</p>
            </motion.div>
        );
    }
    
    return (
        <motion.div
            key="button"
            className="absolute z-20"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
        >
            <Button
                onClick={handleRoll}
                disabled={isRolling}
                size="lg"
                className="h-20 w-48 text-2xl rounded-2xl shadow-lg"
            >
                {isRolling ? <Loader2 className="w-10 h-10 animate-spin" /> : <><Dices className="ml-4 w-10 h-10"/> ارمِ النرد</>}
            </Button>
        </motion.div>
    );
}
