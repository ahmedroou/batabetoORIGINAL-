
"use client";

import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { Crown } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion } from 'framer-motion';

interface FinalResultsProps {
    game: Game;
}

export function FinalResults({ game }: FinalResultsProps) {
    const router = useRouter();

    const sortedPlayers = [...(game.players || [])].sort((a, b) => {
        const aBankrupt = a.status === 'bankrupt';
        const bBankrupt = b.status === 'bankrupt';

        if (aBankrupt && !bBankrupt) return 1; // a is lower
        if (!aBankrupt && bBankrupt) return -1; // a is higher

        if (aBankrupt && bBankrupt) {
            const aTime = a.bankruptAt?.toMillis() || Infinity;
            const bTime = b.bankruptAt?.toMillis() || Infinity;
            return aTime - bTime; // Earlier bankruptcy is lower rank
        }
        
        // If both are not bankrupt, sort by score
        const aScore = game.playerScores?.[a.id] || 0;
        const bScore = game.playerScores?.[b.id] || 0;
        return bScore - aScore;
    });

    const winner = sortedPlayers[0];

    return (
        <motion.div 
            className="w-full max-w-lg"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
        >
            <Card className="text-center shadow-2xl">
                <CardHeader>
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1, rotate: 360 }}
                        transition={{ delay: 0.2, duration: 0.8, type: 'spring' }}
                    >
                        <Crown className="w-24 h-24 text-yellow-500 mx-auto" />
                    </motion.div>
                    <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                     {winner && <CardDescription className="text-2xl font-bold">الفائز هو {winner.name}!</CardDescription>}
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <h3 className="font-bold text-center">الترتيب النهائي</h3>
                        {sortedPlayers.map((player, index) => (
                             <motion.div 
                                key={player.id} 
                                className="flex justify-between items-center p-2 bg-muted rounded-md"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5 + index * 0.1 }}
                             >
                                <div className="flex items-center gap-2">
                                     <span className="font-bold">{index + 1}.</span>
                                     <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
                                    <span className="font-semibold">{player.name}</span>
                                </div>
                                <span className="font-bold text-lg text-primary">
                                    {player.status === 'bankrupt' ? 'مفلس' : `${game.playerScores?.[player.id] || 0} د.ع`}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </CardContent>
                 <CardFooter>
                    <Button onClick={() => router.push('/')} className="w-full">
                        العب مرة أخرى
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}
