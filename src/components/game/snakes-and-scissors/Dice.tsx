"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import './Dice.css'; // We'll create this CSS file

interface DiceProps {
  initialValue?: number;
  onRollEnd?: (value: number) => void;
  isRolling?: boolean;
}

export interface DiceHandle {
  roll: (value: number) => void;
}

const Dice = forwardRef<DiceHandle, DiceProps>(({ initialValue = 1, onRollEnd, isRolling: externalIsRolling }, ref) => {
  const [value, setValue] = useState(initialValue);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (externalIsRolling) {
      setIsRolling(true);
      const timeout = setTimeout(() => {
        setIsRolling(false);
      }, 2500); // Match animation duration
      return () => clearTimeout(timeout);
    }
  }, [externalIsRolling]);
  
  useImperativeHandle(ref, () => ({
    roll: (newValue: number) => {
      setIsRolling(true);
      setTimeout(() => {
        setValue(newValue);
        setIsRolling(false);
        onRollEnd?.(newValue);
      }, 2500); // Duration of the rolling animation
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
        <div className={cn("dice", isRolling ? "rolling" : faceClasses[value])}>
            <Face face="front">{dots(1)}</Face>
            <Face face="back">{dots(6)}</Face>
            <Face face="right">{dots(2)}</Face>
            <Face face="left">{dots(5)}</Face>
            <Face face="top">{dots(3)}</Face>
            <Face face="bottom">{dots(4)}</Face>
        </div>
    </div>
  );
});

Dice.displayName = "Dice";

export default Dice;
