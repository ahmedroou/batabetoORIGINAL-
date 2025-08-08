
"use client";

import { useState, useEffect, useCallback } from 'react';
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
        try {
            // Pass the 'punished' filter to the backend action
            const prisoners = await getAllUsers('punished');
            setPlayersInPrison(prisoners);
        } catch (error) {
            console.error("Failed to fetch prisoners:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPlayers();
        const interval = setInterval(fetchPlayers, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, [fetchPlayers]);

    return (
        <Card className="bg-black border-red-900/80 text-white backdrop-blur-sm shadow-2xl shadow-red-900/40 flex flex-col h-full">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-red-400 flex items-center justify-center gap-3">
                    <Gavel className="w-10 h-10" />
                    غرفة العقاب
                </CardTitle>
                <CardDescription className="text-gray-400">
                    سجل العار. اللاعبون الخاضعون حاليًا لعقوبة.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="w-12 h-12 animate-spin text-red-400" />
                    </div>
                ) : playersInPrison.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {playersInPrison.map((player, index) => {
                            const humiliation = player.humiliation?.until && new Date(player.humiliation.until) > new Date() ? player.humiliation : null;
                            const avatarPunishment = player.originalAvatarToRevert?.until && new Date(player.originalAvatarToRevert.until) > new Date() ? player.originalAvatarToRevert : null;
                             const decreePunishment = player.decrees?.find(d => d.until && new Date(d.until) > new Date());
                            
                            let punishmentText = "معاقب";
                            let punishmentType = "";

                            if (humiliation) {
                                punishmentText = `مذلول بواسطة ${humiliation.byName}`;
                                punishmentType = "إذلال عام";
                            } else if (avatarPunishment) {
                                punishmentText = `تم فرض الشخصية من قبل ${avatarPunishment.byName}`;
                                punishmentType = "تغيير إجباري للشخصية";
                            } else if (decreePunishment) {
                                punishmentText = `لقب مهين مفروض من ${decreePunishment.issuedByName}`;
                                punishmentType = `لقب مؤقت: ${decreePunishment.title}`;
                            }

                            return (
                                <motion.div
                                    key={player.uid}
                                    className="p-3 bg-gray-900/70 border-2 border-gray-700/50 rounded-lg text-center flex flex-col items-center shadow-lg"
                                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ delay: index * 0.1, type: "spring", stiffness: 150 }}
                                >
                                    <div className="relative w-24 h-24 mb-2">
                                        <PlayerAvatar avatarId={player.avatarId} className="w-full h-full rounded-full border-4 border-destructive filter grayscale" />
                                        <div className="absolute inset-0 prison-bars"></div>
                                    </div>
                                    <h4 className="font-bold mt-2 truncate w-full">{player.name}</h4>
                                    <div className="text-xs text-center mt-1 space-y-1">
                                         <p className="text-red-400 font-semibold px-2 py-1 bg-red-900/50 rounded-full">
                                            {punishmentText}
                                        </p>
                                        {punishmentType && (
                                            <p className="text-yellow-400 font-semibold px-2 py-1 bg-yellow-900/50 rounded-full">
                                                {punishmentType}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-500 h-full flex flex-col justify-center items-center">
                        <Gavel className="w-20 h-20 text-gray-700" />
                        <p className="text-lg mt-4">غرفة العقاب فارغة حاليًا.</p>
                        <p>يبدو أن الجميع يتصرفون بلطف!</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
