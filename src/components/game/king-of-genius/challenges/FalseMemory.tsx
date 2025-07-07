
'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Check, X, Loader2 } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';

const itemPool = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍋', '🍍', '🍑', '🍒', '🥝', '🥑', '🍆', '🥕', '🌽', '🌶️'];
const generateSequence = (length: number) => {
    const shuffled = [...itemPool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, length);
};
const getTestItem = (sequence: string[]) => {
    const shouldBeInSequence = Math.random() > 0.5;
    if (shouldBeInSequence) {
        return { item: sequence[Math.floor(Math.random() * sequence.length)], wasInSequence: true };
    } else {
        const notInSequence = itemPool.filter(item => !sequence.includes(item));
        return { item: notInSequence[Math.floor(Math.random() * notInSequence.length)], wasInSequence: false };
    }
};

export function FalseMemory({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [gameState, setGameState] = useState<'intro' | 'display' | 'test' | 'submitted'>('intro');
    const [sequence] = useState<string[]>(() => game.challengeState?.puzzle?.sequence || generateSequence(6));
    const [testItem] = useState(() => game.challengeState?.puzzle?.testItem || getTestItem(sequence));
    const [currentItemIndex, setCurrentItemIndex] = useState(0);
    const [startTime, setStartTime] = useState(0);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setGameState('submitted');
            setHasSubmitted(true);
            return;
        }

        const introTimer = setTimeout(() => {
            setGameState('display');
        }, 3000);

        return () => clearTimeout(introTimer);
    }, [game.challengeState, self.id]);

    useEffect(() => {
        if (gameState !== 'display') return;

        if (currentItemIndex >= sequence.length) {
            const testTimer = setTimeout(() => {
                setGameState('test');
                setStartTime(Date.now());
            }, 1000);
            return () => clearTimeout(testTimer);
        }

        const displayTimer = setTimeout(() => {
            setCurrentItemIndex(i => i + 1);
        }, 700); // Display each item for 700ms

        return () => clearTimeout(displayTimer);
    }, [gameState, currentItemIndex, sequence]);

    const handleAnswer = async (answer: boolean) => {
        if (!testItem || hasSubmitted || gameState !== 'test') return;
        setGameState('submitted');
        setHasSubmitted(true);
        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;
        const isCorrect = answer === testItem.wasInSequence;

        toast({
            title: isCorrect ? "صحيح!" : "خطأ!",
            variant: isCorrect ? "default" : "destructive",
        });

        try {
            await submitChallengeResult(game.id, self.id, { isCorrect, time: timeTaken });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    };
    
    const renderContent = () => {
        switch (gameState) {
            case 'intro':
                return (
                    <div className="text-center">
                        <Loader2 className="w-16 h-16 mx-auto animate-spin text-primary" />
                        <p className="text-xl mt-4">استعد لحفظ التسلسل...</p>
                    </div>
                );
            case 'display':
                return (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentItemIndex}
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ duration: 0.2 }}
                            className="text-8xl"
                        >
                            {sequence[currentItemIndex]}
                        </motion.div>
                    </AnimatePresence>
                );
            case 'test':
                return (
                    <div className="flex flex-col items-center gap-8">
                        <p className="text-muted-foreground text-lg">هل كان هذا الرمز في التسلسل؟</p>
                        <div className="text-8xl">{testItem?.item}</div>
                        <div className="flex gap-4">
                            <Button onClick={() => handleAnswer(true)} variant="secondary" size="lg" className="w-32 h-16 text-2xl bg-green-500 hover:bg-green-600 text-white">نعم</Button>
                            <Button onClick={() => handleAnswer(false)} variant="destructive" size="lg" className="w-32 h-16 text-2xl">لا</Button>
                        </div>
                    </div>
                );
            case 'submitted':
                 return (
                    <div className="text-center">
                        <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
                        <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
                    </div>
                );
        }
    };

    return (
        <Card className="w-full max-w-md bg-white/80 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="h-64 flex items-center justify-center">
                {renderContent()}
            </CardContent>
        </Card>
    );
}
