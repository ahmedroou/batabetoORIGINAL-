
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dices } from 'lucide-react';
import './Dice.css';
import { cn } from '@/lib/utils';

interface DiceProps {
  onRoll: (rollValue: number) => void;
}

export function Dice({ onRoll }: DiceProps) {
    const [isRolling, setIsRolling] = useState(false);
    const [value, setValue] = useState(1);

    const handleRoll = () => {
        if (isRolling) return;
        setIsRolling(true);
        const rollValue = Math.floor(Math.random() * 4) + 1;
        
        setTimeout(() => {
            setValue(rollValue);
            setIsRolling(false);
            // Wait for the dice to land before calling the onRoll callback
            setTimeout(() => onRoll(rollValue), 500); 
        }, 1000); // Animation duration
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 flex items-center justify-center">
                <div className={cn("dice-container", isRolling && 'rolling')}>
                    <div className="dice" data-value={value}>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className={`face face-${i + 1}`}>{i < 4 ? i+1 : ''}</div>
                        ))}
                    </div>
                </div>
            </div>
            <Button onClick={handleRoll} disabled={isRolling}>
                <Dices className="mr-2" />
                {isRolling ? 'جاري الرمي...' : 'ارمِ النرد'}
            </Button>
        </div>
    );
}
