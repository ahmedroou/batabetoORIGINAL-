
"use client";

import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Crown } from 'lucide-react';
import { PlayerAvatar } from '../../PlayerAvatar';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FinalResultsPhaseProps {
    game: Game;
    self: Player;
}

export function FinalResultsPhase({ game }: FinalResultsPhaseProps) {
    const router = useRouter();

    const sortedPlayers = game.players
        .filter(p => p.status !== 'left')
        .sort((a, b) => (b.balance || 0) - (a.balance || 0));

    const winner = sortedPlayers[0];

    return (
        <div className="w-full max-w-2xl animate-pop-in relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-gray-900 via-gray-800 to-slate-900 rounded-xl -z-10"></div>
            <Card className="text-center bg-transparent border-none text-white shadow-2xl shadow-primary/30">
                <CardHeader>
                    <Crown className="w-24 h-24 mx-auto text-yellow-400 drop-shadow-[0_5px_15px_rgba(250,204,21,0.4)]" />
                    <CardTitle className="text-5xl font-extrabold mt-2 tracking-wider">انتهت اللعبة</CardTitle>
                    {winner && (
                        <CardDescription className="text-2xl font-bold text-yellow-300 mt-2">
                            الفائز هو {winner.name}!
                        </CardDescription>
                    )}
                    <p className="text-slate-400 mt-1">{game.gameResult?.message}</p>
                </CardHeader>
                <CardContent className="space-y-4 px-4">
                    <h3 className="font-bold text-center text-lg text-slate-300">الترتيب النهائي</h3>
                    <div className="space-y-2">
                        {sortedPlayers.map((p, index) => {
                            const rank = index + 1;
                            const rankColor =
                                rank === 1 ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200' :
                                rank === 2 ? 'bg-slate-500/20 border-slate-400 text-slate-200' :
                                rank === 3 ? 'bg-orange-500/20 border-orange-400 text-orange-200' :
                                'bg-slate-700/50 border-slate-600';

                            return (
                                <motion.div
                                    key={p.id}
                                    className={cn("flex justify-between items-center p-3 rounded-lg text-lg border-l-4", rankColor)}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.5 + index * 0.1 }}
                                >
                                    <div className="flex items-center gap-3 font-bold">
                                        <span className="w-6 text-center">{rank}.</span>
                                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                        <span>{p.name}</span>
                                    </div>
                                    <span className="font-bold text-white">{p.status === 'bankrupt' ? 'مفلس' : `${p.balance || 0} دينار`}</span>
                                </motion.div>
                            );
                        })}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => router.push('/')} variant="secondary" className="w-full text-lg h-12">
                        العب مرة أخرى
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}

  