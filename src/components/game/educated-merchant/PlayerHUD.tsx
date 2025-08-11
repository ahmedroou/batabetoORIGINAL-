
"use client";

import type { Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skull, Crown } from 'lucide-react';

interface PlayerHUDProps {
    players: Player[];
    balances: Record<string, number>;
    currentTurnPlayerId?: string;
    activityLog?: string[];
}

export function PlayerHUD({ players, balances, currentTurnPlayerId, activityLog = [] }: PlayerHUDProps) {

    return (
        <Card className="w-full h-full flex flex-col bg-gray-200 dark:bg-gray-800">
            <CardHeader>
                <CardTitle className="text-center text-2xl">اللاعبون</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow p-2 flex flex-col min-h-0">
                <ScrollArea className="flex-grow">
                    <div className="space-y-2 p-2">
                        {players.map((player, index) => {
                            const isCurrentTurn = player.id === currentTurnPlayerId;
                            const isBankrupt = player.status === 'bankrupt';
                            return (
                                <motion.div
                                    key={player.id}
                                    className={cn(
                                        "p-3 rounded-lg border-2 transition-all duration-300",
                                        isBankrupt ? 'bg-red-900/50 border-red-700/50 opacity-50' : 'bg-white dark:bg-gray-900/50',
                                        isCurrentTurn ? 'border-primary shadow-lg' : 'border-transparent'
                                    )}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <PlayerAvatar avatarId={player.avatarId} className="w-12 h-12" />
                                            <div>
                                                <h4 className="font-bold text-lg">{player.name}</h4>
                                                <p className="text-sm font-mono font-bold text-green-600 dark:text-green-400">
                                                    {balances[player.id]?.toLocaleString() || 0} د.ع
                                                </p>
                                            </div>
                                        </div>
                                        {isBankrupt && <Skull className="w-8 h-8 text-red-500" />}
                                        {isCurrentTurn && !isBankrupt && <Crown className="w-8 h-8 text-yellow-500 animate-pulse" />}
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>
                </ScrollArea>
                 <div className="mt-2 shrink-0">
                    <h3 className="text-center font-bold text-sm mb-1">آخر الأحداث</h3>
                    <ScrollArea className="h-24 p-2 bg-gray-300 dark:bg-gray-900/50 rounded-lg">
                        <div className="space-y-1.5 text-xs text-right">
                            {activityLog.length > 0 ? (
                                activityLog.slice().reverse().map((log, index) => (
                                    <p key={index} className="[&:not(:first-child)]:text-muted-foreground">{log}</p>
                                ))
                            ) : (
                                <p className="text-center text-muted-foreground">لم تبدأ الأحداث بعد.</p>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </CardContent>
        </Card>
    );
}
