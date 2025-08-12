
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '../PlayerAvatar';
import { HandCoins, Home, Building } from 'lucide-react';
import type { Player } from '@/types';
import { cn } from '@/lib/utils';


interface PlayerHUDProps {
    players: Player[];
    turnOrder: string[];
    currentTurnIndex: number;
}

export function PlayerHUD({ players, turnOrder, currentTurnIndex }: PlayerHUDProps) {
    const currentPlayerId = turnOrder[currentTurnIndex];

    return (
        <Card className="h-full bg-gray-900/50 border-gray-700 text-white">
            <CardHeader>
                <CardTitle>اللاعبون</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[30vh]">
                    <div className="space-y-3 pr-4">
                        {players.map((player) => (
                            <motion.div
                                key={player.id}
                                layout
                                className={cn(
                                    "flex items-center justify-between p-2 rounded-lg transition-all border-l-4",
                                    player.id === currentPlayerId ? 'bg-primary/20 border-primary shadow-lg' : 'bg-slate-800 border-transparent',
                                    player.status === 'bankrupt' && 'opacity-50 bg-destructive/20 border-destructive'
                                )}
                                animate={{ scale: player.id === currentPlayerId ? 1.05 : 1 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <div className="flex items-center gap-3">
                                    <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10"/>
                                    <div>
                                        <p className="font-bold">{player.name}</p>
                                        <p className="text-xs text-muted-foreground">{player.status === 'bankrupt' ? 'مفلس' : 'يلعب'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <HandCoins className="w-4 h-4 text-yellow-500" />
                                        <span className="font-bold">{player.money}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
