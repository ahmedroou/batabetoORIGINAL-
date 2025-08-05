"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import type { UserProfile, SocialRank } from '@/types';
import { getAllUsers } from '@/lib/actions/user';
import { getSocialRankForUser } from '@/lib/actions/user';
import { Loader2, ArrowLeft } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';


export default function SocietyClient() {
    const { user, userProfile, loading, socialRanks } = useAuth();
    const router = useRouter();
    const [players, setPlayers] = useState<UserProfile[]>([]);
    const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);
    
    useEffect(() => {
        const fetchPlayers = async () => {
            setIsLoadingPlayers(true);
            const allPlayers = await getAllUsers();
            setPlayers(allPlayers);
            setIsLoadingPlayers(false);
        };
        fetchPlayers();
    }, []);

    const groupedPlayersByRank = useMemo(() => {
        const groups: Record<string, UserProfile[]> = {};
        for (const rank of socialRanks) {
            groups[rank.name] = [];
        }

        players.forEach(player => {
            const rank = getSocialRankForUser(player.leaderboardPoints || 0, socialRanks);
            if (rank) {
                if (!groups[rank.name]) {
                    groups[rank.name] = [];
                }
                groups[rank.name].push(player);
            }
        });
        return groups;
    }, [players, socialRanks]);

    if (loading || isLoadingPlayers) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
            </div>
        );
    }
    
    return (
        <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans">
            <div className="fixed inset-0 stars z-0"></div>
            <div className="fixed inset-0 twinkling z-0"></div>
             <main className="relative z-10 container mx-auto px-4 py-8">
                 <header className="flex justify-between items-center mb-8">
                    <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
                        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                    </motion.div>
                    <motion.div className="text-center" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                        <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider">
                           مجتمع اللعبة
                        </h1>
                        <p className="text-gray-400 mt-1">حيث تتجلى القوة والنفوذ</p>
                    </motion.div>
                    <div className="w-10"></div>
                </header>
                
                <div className="space-y-8">
                    {socialRanks.map((rank, index) => {
                        const playersInRank = groupedPlayersByRank[rank.name] || [];
                        const Icon = rank.icon;
                        return (
                            <motion.div 
                                key={rank.name}
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 + (socialRanks.length - 1 - index) * 0.1 }}
                            >
                                <Card className="bg-black/30 backdrop-blur-sm border-purple-500/20 text-white shadow-2xl shadow-purple-900/20">
                                    <CardHeader className="border-b-2 border-purple-500/30">
                                        <CardTitle className="flex items-center gap-4 text-2xl text-purple-300">
                                            <Icon className="w-8 h-8 text-amber-400" />
                                            <span>طبقة: {rank.name}</span>
                                            <span className="text-sm text-gray-400">({playersInRank.length} أعضاء)</span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        {playersInRank.length > 0 ? (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                 {playersInRank.map((p, pIndex) => (
                                                     <motion.div 
                                                        key={p.uid} 
                                                        className="group perspective-1000"
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ duration: 0.3, delay: pIndex * 0.05 }}
                                                     >
                                                        <div className="relative transform-style-3d group-hover:rotate-y-180 transition-transform duration-500 w-full aspect-[3/4] rounded-lg">
                                                            {/* Front */}
                                                            <div className="absolute w-full h-full backface-hidden bg-gray-800/50 border border-purple-400/30 rounded-lg flex flex-col items-center justify-center p-2 text-center shadow-lg">
                                                                <PlayerAvatar avatarId={p.avatarId} className="w-20 h-20 rounded-full border-2 border-purple-400/50"/>
                                                                <h4 className="font-bold mt-2 truncate w-full">{p.name}</h4>
                                                            </div>
                                                            {/* Back */}
                                                            <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-gray-900 border border-purple-400/30 rounded-lg flex flex-col items-center justify-center p-2 text-center shadow-lg">
                                                                <p className="text-lg font-bold text-amber-400">{p.leaderboardPoints}</p>
                                                                <p className="text-sm text-gray-400">نقطة</p>
                                                                 <p className="text-sm text-gray-400 mt-2">{p.gamesPlayed} مباريات</p>
                                                            </div>
                                                        </div>
                                                     </motion.div>
                                                 ))}
                                            </div>
                                        ) : (
                                            <p className="text-center text-gray-500 py-4">لا يوجد لاعبون في هذه الطبقة بعد.</p>
                                        )}
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
                </div>
            </main>
        </div>
    );
}
