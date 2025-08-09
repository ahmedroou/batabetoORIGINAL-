
"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
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

const Dice = forwardRef<DiceHandle, DiceProps>(({ onRollEnd, isRolling, value }, ref) => {
  const [internalValue, setInternalValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);


  useEffect(() => {
    if (!isRolling) {
      setInternalValue(value);
    }
  }, [value, isRolling]);
  
  useImperativeHandle(ref, () => ({
    roll: (newValue: number) => {
        setIsAnimating(true);
        // The CSS animation is 2.2s long
        setTimeout(() => {
            setIsAnimating(false);
            setInternalValue(newValue);
            onRollEnd?.(newValue);
        }, 2200); 
    }
  }));

  const faceClasses: { [key: number]: string } = {
    1: 'show-1',
    2: 'show-2',
    3: 'show-3',
    4: 'show-4',
    5: 'show-5',
    6: 'show-6',
  };

  const Face = ({ children, face }: { children: React.ReactNode, face: string }) => (
    <div className={`dice-face face-${face}`}>{children}</div>
  );

  const dots = (count: number) => (
    Array.from({ length: count }).map((_, i) => <span key={i} className="dot"></span>)
  );

  return (
    <div className="dice-container">
        <div className={cn("dice", isAnimating ? "rolling" : faceClasses[internalValue])}>
            <Face face="front">{dots(1)}</Face>
            <Face face="back">{dots(6)}</Face>
            <Face face="right">{dots(5)}</Face>
            <Face face="left">{dots(2)}</Face>
            <Face face="top">{dots(3)}</Face>
            <Face face="bottom">{dots(4)}</Face>
        </div>
    </div>
  );
});

Dice.displayName = "Dice";
export default Dice;
