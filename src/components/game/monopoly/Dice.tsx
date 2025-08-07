
"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { cn } from '@/lib/utils';
import './Dice.css';

interface DiceProps {
  initialValue1?: number;
  initialValue2?: number;
}

export interface DiceHandle {
  roll: (value1: number, value2: number) => void;
}

const SingleDie = ({ value, isRolling }: { value: number, isRolling: boolean }) => {
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
    <div className="dice-container" style={{ width: '80px', height: '80px' }}>
      <div className={cn("dice", isRolling ? "rolling" : faceClasses[value])} style={{ width: '80px', height: '80px' }}>
        <Face face="front">{dots(1)}</Face>
        <Face face="back">{dots(6)}</Face>
        <Face face="right">{dots(5)}</Face>
        <Face face="left">{dots(2)}</Face>
        <Face face="top">{dots(3)}</Face>
        <Face face="bottom">{dots(4)}</Face>
      </div>
    </div>
  );
};


const Dice = forwardRef<DiceHandle, DiceProps>(({ initialValue1 = 1, initialValue2 = 4 }, ref) => {
  const [values, setValues] = useState([initialValue1, initialValue2]);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    // This effect ensures the dice show the correct final values after a roll.
    // It is triggered by the parent component re-rendering with new dice values from the game state.
    if (!isRolling) {
      setValues([initialValue1, initialValue2]);
    }
  }, [initialValue1, initialValue2, isRolling]);
  
  useImperativeHandle(ref, () => ({
    roll: (newValue1: number, newValue2: number) => {
      setIsRolling(true);
      setTimeout(() => {
        setValues([newValue1, newValue2]);
        setIsRolling(false);
      }, 2500); // Duration of the rolling animation
    }
  }));


  return (
    <div className="flex gap-4">
      <SingleDie value={values[0]} isRolling={isRolling} />
      <SingleDie value={values[1]} isRolling={isRolling} />
    </div>
  );
});

Dice.displayName = "Dice";

export default Dice;
