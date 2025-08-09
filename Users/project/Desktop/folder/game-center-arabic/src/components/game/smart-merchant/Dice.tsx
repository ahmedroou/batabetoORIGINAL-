
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dices } from 'lucide-react';
import './Dice.css';

interface DiceProps {
  onRoll: () => void;
}

export function Dice({ onRoll }: DiceProps) {
    const [isRolling, setIsRolling] = useState(false);
    const [value, setValue] = useState(1);

    const handleRoll = () => {
        if (isRolling) return;
        setIsRolling(true);
        const rollValue = Math.floor(Math.random() * 6) + 1;
        
        setTimeout(() => {
            setValue(rollValue);
            setIsRolling(false);
            onRoll();
        }, 1000); // Animation duration
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div className={`dice ${isRolling ? 'rolling' : ''}`} data-value={value}>
                {[...Array(6)].map((_, i) => (
                    <div key={i} className={`face face-${i + 1}`}></div>
                ))}
            </div>
            <Button onClick={handleRoll} disabled={isRolling}>
                <Dices className="mr-2" />
                {isRolling ? 'جاري الرمي...' : 'ارمِ النرد'}
            </Button>
        </div>
    );
}
