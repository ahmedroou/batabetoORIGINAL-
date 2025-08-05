
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { UserProfile } from '@/types';
import { getAllUsers } from '@/lib/actions/user';
import { Loader2, Gavel } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function SocietyPrison() {
    const [playersInPrison, setPlayersInPrison] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchPlayers = useCallback(async () => {
        setIsLoading(true);
        const allPlayers = await getAllUsers();
        const prisoners = allPlayers.filter(p => 
            p.humiliation && new Date(p.humiliation.until) > new Date()
        );
        setPlayersInPrison(prisoners);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchPlayers();
        const interval = setInterval(fetchPlayers, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, [fetchPlayers]);

    return (
        <Card className="bg-gray-800/50 border-red-500/30 text-white backdrop-blur-sm shadow-lg shadow-red-900/20">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-red-300 flex items-center justify-center gap-3">
                    <Gavel />
                    سجن المجتمع
                </CardTitle>
                <CardDescription className="text-gray-400">
                    اللاعبون الذين يخضعون حاليًا لعقوبة الإذلال من قبل الطبقات العليا.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center h-48">
                        <Loader2 className="w-12 h-12 animate-spin text-red-400" />
                    </div>
                ) : playersInPrison.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {playersInPrison.map((player, index) => (
                            <motion.div
                                key={player.uid}
                                className="p-3 bg-gray-900/70 border border-gray-700 rounded-lg text-center"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                <PlayerAvatar avatarId={player.avatarId} className="w-20 h-20 mx-auto rounded-full border-4 border-red-500/50" />
                                <h4 className="font-bold mt-2 truncate">{player.name}</h4>
                                <p className="text-xs text-gray-400">
                                    مُعاقب بواسطة: {player.humiliation?.byName}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-500">
                        <p className="text-lg">السجن فارغ حاليًا.</p>
                        <p>يبدو أن الجميع يتصرفون بلطف!</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
