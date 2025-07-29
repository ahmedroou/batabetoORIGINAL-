
"use client";

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Skull, ShieldCheck, Ghost } from 'lucide-react';
import type { Game } from '@/types';

interface GameEndPhaseProps {
    gameResult?: Game['gameResult'];
}

export function GameEndPhase({ gameResult }: GameEndPhaseProps) {
    const router = useRouter();
    const { winner, message } = gameResult || { winner: 'town', message: 'انتهت اللعبة!'};

    const isMafiaWinner = winner === 'mafia';
    const isKillerFled = winner === 'killer_fled';

    let icon;
    let titleColor;
    if (isKillerFled) {
        icon = <Ghost className="w-24 h-24 mx-auto text-gray-400" />;
        titleColor = 'text-gray-600';
    } else if (isMafiaWinner) {
        icon = <Skull className="w-24 h-24 mx-auto text-destructive" />;
        titleColor = 'text-destructive';
    } else {
        icon = <ShieldCheck className="w-24 h-24 mx-auto text-green-500" />;
        titleColor = 'text-green-600';
    }
        
    return (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className={`w-full max-w-lg animate-pop-in text-center ${isMafiaWinner ? 'border-destructive' : isKillerFled ? 'border-gray-400' : 'border-green-500'}`}>
                <CardHeader>
                    {icon}
                    <CardTitle className="text-4xl mt-4">انتهت اللعبة!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <h2 className={`text-2xl font-bold ${titleColor}`}>
                        {message}
                    </h2>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => router.push('/')} className="w-full" size="lg">
                        <Trophy /> العب مرة أخرى
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}

