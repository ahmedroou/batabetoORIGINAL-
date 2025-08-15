
'use client';

import type { QuizSwapCard, Difficulty } from '@/types';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Brain, Star, HelpCircle, Shield, GitCommit, Drama, Shuffle, FileQuestion } from 'lucide-react';

interface CardDisplayProps {
    card: QuizSwapCard | undefined;
    faceUp: boolean;
    className?: string;
}

const difficultyColors: Record<Difficulty, string> = {
    easy: 'bg-green-600 border-green-400',
    medium: 'bg-yellow-600 border-yellow-400',
    hard: 'bg-red-600 border-red-400',
};

const specialCardColors: Record<string, string> = {
    PeekSelf: 'bg-blue-600 border-blue-400',
    PeekOpponent: 'bg-purple-600 border-purple-400',
    FreeQuestion: 'bg-teal-600 border-teal-400',
    SwapWithOpponent: 'bg-orange-600 border-orange-400',
    Burden: 'bg-gray-700 border-gray-500',
    BonusPoint: 'bg-yellow-500 border-yellow-300',
    Expose: 'bg-pink-600 border-pink-400',
    Shield: 'bg-indigo-600 border-indigo-400',
};

const specialCardIcons: Record<string, React.ElementType> = {
    PeekSelf: Brain,
    PeekOpponent: Brain,
    FreeQuestion: FileQuestion,
    SwapWithOpponent: Shuffle,
    Burden: Drama,
    BonusPoint: Star,
    Expose: GitCommit,
    Shield: Shield,
}

export function QuizSwapCardDisplay({ card, faceUp, className }: CardDisplayProps) {
    const getCardStyles = () => {
        if (!card || !faceUp) {
            return 'bg-gray-800 border-gray-600';
        }
        if (card.kind === 'question') {
            return difficultyColors[card.difficulty];
        }
        return specialCardColors[card.effect] || 'bg-gray-500 border-gray-300';
    };
    
    const Icon = card?.kind === 'special' ? specialCardIcons[card.effect] : HelpCircle;

    return (
        <motion.div
            className={cn("w-24 h-36 rounded-lg p-2 flex flex-col justify-between text-white text-center text-xs font-bold shadow-lg", getCardStyles(), className)}
            whileHover={{ scale: 1.05, y: -5 }}
        >
            {faceUp && card ? (
                 <>
                    <div className="flex-grow flex flex-col items-center justify-center">
                        {Icon && <Icon className="w-8 h-8 mb-1" />}
                        <p>{card.name}</p>
                    </div>
                    {card.kind === 'question' && <p className="text-[10px] opacity-80">{card.difficulty}</p>}
                </>
            ) : (
                <div className="flex items-center justify-center h-full">
                    <p className="text-lg font-black">?</p>
                </div>
            )}
        </motion.div>
    );
}

