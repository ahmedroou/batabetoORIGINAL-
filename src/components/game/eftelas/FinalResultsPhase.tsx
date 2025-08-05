"use client";

import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Crown } from 'lucide-react';
import { motion } from 'framer-motion';

interface FinalResultsPhaseProps {
    game: Game;
    self: Player;
}

export function FinalResultsPhase({ game, self }: FinalResultsPhaseProps) {
    const router = useRouter();
    const gameResult = game.gameResult;

    if (!gameResult) {
        return <div>جاري تحميل النتائج...</div>;
    }
    
    const winner = game.players.find(p => p.id === gameResult.winner);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="w-full max-w-lg"
        >
            <Card className="text-center bg-white/90 backdrop-blur-sm border-gray-200 shadow-2xl">
                <CardHeader>
                    <Crown className="w-24 h-24 mx-auto text-yellow-400 animate-pulse" />
                    <CardTitle className="text-5xl font-extrabold">انتهت اللعبة!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-lg text-muted-foreground">{gameResult.message}</p>
                    {winner && <p className="text-2xl font-bold">الفائز هو: {winner.name}</p>}
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
