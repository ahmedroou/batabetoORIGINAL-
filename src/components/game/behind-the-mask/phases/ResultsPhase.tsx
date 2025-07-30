
"use client";

import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy, Shield, VenetianMask } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ResultsPhaseProps {
    game: Game;
    self: Player;
}

export function ResultsPhase({ game, self }: ResultsPhaseProps) {
    const router = useRouter();
    const gameResult = game.gameResult;

    if (!gameResult) {
        return <div>جاري تحميل النتائج...</div>;
    }
    
    const winnerDisplay = gameResult.winner === 'good' ? 'فريق الخير' : gameResult.winner === 'mafia' ? 'فريق الشر' : 'تعادل';
    const winnerColor = gameResult.winner === 'good' ? 'text-blue-500' : 'text-red-500';
    const WinnerIcon = gameResult.winner === 'good' ? Shield : VenetianMask;


    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="w-full max-w-lg"
        >
            <Card className="text-center bg-white/90 backdrop-blur-sm border-gray-200 shadow-2xl">
                <CardHeader>
                    <Trophy className="w-24 h-24 text-yellow-400 mx-auto animate-pulse" />
                    <CardTitle className="text-5xl font-extrabold">انتهت اللعبة!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className='flex items-center justify-center gap-3'>
                        <WinnerIcon className={cn("w-12 h-12", winnerColor)} />
                        <h2 className={cn("text-4xl font-bold", winnerColor)}>
                            {winnerDisplay}
                        </h2>
                     </div>
                    <p className="text-lg text-muted-foreground">{gameResult.message}</p>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => router.push('/')} className="w-full" size="lg">
                        العب مرة أخرى
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}
