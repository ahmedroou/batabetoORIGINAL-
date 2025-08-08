

"use client";

import { useState, forwardRef, useImperativeHandle } from 'react';
import { cn } from '@/lib/utils';
import './Dice.css';

interface DiceProps {
  onRollEnd?: (value: number) => void;
  isRolling: boolean;
  value: number;
}

export interface DiceHandle {
  roll: (value: number) => void;
}

const Dice = forwardRef<DiceHandle, DiceProps>(({ onRollEnd, isRolling: initialIsRolling, value }, ref) => {
  const [internalValue, setInternalValue] = useState(value);
  const [isRolling, setIsRolling] = useState(initialIsRolling);

  useImperativeHandle(ref, () => ({
    roll: (newValue: number) => {
      setIsRolling(true);
      setTimeout(() => {
        setInternalValue(newValue);
        setIsRolling(false);
        onRollEnd?.(newValue);
      }, 2500); // Duration matches rolling animation
    }
  }));

  const faceClasses: { [key: number]: string } = {
    1: 'show-1',
    2: 'show-2',
    3: 'show-3',
    4: 'show-4',
  };

  const Face = ({ children, face, className }: { children: React.ReactNode, face: string, className?: string }) => (
    <div className={cn('dice-face', `face-${face}`, className)}>{children}</div>
  );

  return (
    <div className="dice-container">
        <div className={cn("dice", isRolling ? "rolling" : faceClasses[internalValue])}>
            <Face face="one" className="face-1">1</Face>
            <Face face="two" className="face-2">2</Face>
            <Face face="three" className="face-3">3</Face>
            <Face face="four" className="face-4">4</Face>
        </div>
    </div>
  );
});

Dice.displayName = "Dice";
export default Dice;
