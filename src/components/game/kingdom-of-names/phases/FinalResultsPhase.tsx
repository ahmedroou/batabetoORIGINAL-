
'use client';

import React from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { motion } from 'framer-motion';

interface FinalResultsPhaseProps {
  game: Game;
  self: Player;
}

export default function FinalResultsPhase({ game, self }: FinalResultsPhaseProps) {
    const router = useRouter();

    const sortedPlayers = [...(game.players || [])]
        .map(p => ({ ...p, score: game.playerScores?.[p.id] || 0 }))
        .sort((a, b) => b.score - a.score);
    
    const winner = sortedPlayers[0];

    return (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
            <Card>
                <CardHeader className="text-center">
                    <Trophy className="w-24 h-24 text-yellow-400 mx-auto" />
                    <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                    {winner && <CardDescription className="text-xl">الفائز هو {winner.name}!</CardDescription>}
                </CardHeader>
                <CardContent>
                    {/* You can add a summary or full leaderboard here if desired */}
                </CardContent>
                <CardFooter>
                    <Button className="w-full" onClick={() => router.push('/')}>العب مرة أخرى</Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}
