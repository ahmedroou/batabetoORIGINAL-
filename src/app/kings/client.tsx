

"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import type { GameKing, Game, UserProfile, SocialRank } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { GAME_ICONS } from "@/data/icons";
import { Crown, Star, Trophy, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { getKingsPageData } from "@/lib/actions/user";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";


const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'prison': 'السجن',
    'educated-merchant': 'التاجر المتعلم',
};

export default function KingsClient() {
    const [kings, setKings] = useState<Record<string, GameKing>>({});
    const [kingOfGames, setKingOfGames] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { socialRanks, getSocialRankForUser } = useAuth();

    useEffect(() => {
        const fetchKingsData = async () => {
            setIsLoading(true);
            const { kings: fetchedKings, kingOfGames: fetchedKingOfGames } = await getKingsPageData();
            setKings(fetchedKings);
            setKingOfGames(fetchedKingOfGames);
            setIsLoading(false);
        };
        fetchKingsData();
    }, []);

    const kingOfGamesRank = useMemo(() => {
        if (!kingOfGames || socialRanks.length === 0) return null;
        return getSocialRankForUser(kingOfGames.leaderboardPoints || 0);
    }, [kingOfGames, socialRanks, getSocialRankForUser]);


    const renderLoadingState = () => (
         <div className="w-full">
            <Card className="mb-8 bg-yellow-900/20 border-yellow-500/30">
                 <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">
                     <Skeleton className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-slate-700" />
                     <div className="text-center md:text-right flex-grow space-y-2">
                         <Skeleton className="h-6 w-32 mx-auto md:mx-0 bg-slate-700" />
                         <Skeleton className="h-8 w-48 mx-auto md:mx-0 bg-slate-700" />
                         <Skeleton className="h-6 w-32 mt-2 mx-auto md:mx-0 bg-slate-700" />
                     </div>
                 </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <Card key={i} className="text-center p-4 bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
                        <Skeleton className="w-16 h-16 mx-auto mb-2 rounded-full bg-slate-700" />
                        <Skeleton className="h-6 w-3/4 mx-auto mb-2 bg-slate-700" />
                        <Skeleton className="w-24 h-24 mx-auto rounded-full bg-slate-700" />
                        <Skeleton className="h-5 w-1/2 mx-auto mt-2 bg-slate-700" />
                        <Skeleton className="h-4 w-1/4 mx-auto mt-1 bg-slate-700" />
                    </Card>
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-br from-gray-900 via-purple-900/40 to-black text-white font-sans">
             <div className="fixed inset-0 stars z-0"></div>
             <div className="fixed inset-0 twinkling z-0"></div>
             <div className="relative z-10 container mx-auto px-4 py-8">
                <header className="text-center mb-12">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
                        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
                    >
                        <Crown className="w-24 h-24 mx-auto text-yellow-400 drop-shadow-[0_5px_15px_rgba(250,204,21,0.4)]" />
                    </motion.div>
                    <motion.h1 
                        className="text-4xl md:text-5xl font-bold mt-4 text-purple-300 tracking-wider"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    >
                        قاعة الملوك
                    </motion.h1>
                    <motion.p 
                        className="text-lg text-gray-400 mt-2"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                    >
                        الأبطال الذين يتربعون على عرش كل لعبة. هل يمكنك هزيمتهم؟
                    </motion.p>
                </header>

                {isLoading ? renderLoadingState() : 
                (
                 <div className="w-full">
                    {kingOfGames && (
                         <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                         >
                        <Card className="mb-12 bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 border-2 border-yellow-300/80 shadow-2xl shadow-yellow-500/50 text-black shadow-inner-light">
                            <CardContent className="p-4 md:p-6 flex flex-col md:flex-row items-center gap-6">
                                <PlayerAvatar avatarId={kingOfGames.avatarId} className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-yellow-200 shadow-lg" />
                                <div className="text-center md:text-right flex-grow">
                                    <div className="flex items-center justify-center md:justify-start gap-2 text-yellow-900">
                                         <Crown className="w-8 h-8 drop-shadow-lg"/>
                                        <h2 className="text-2xl font-bold" style={{ textShadow: '1px 1px 2px rgba(255,255,255,0.3)' }}>
                                            ملك بطابيطو
                                        </h2>
                                    </div>
                                    <h3 className="text-4xl md:text-5xl font-extrabold mt-1" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.6)' }}>{kingOfGames.name}</h3>
                                     <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-x-4 gap-y-1 mt-2 text-xl font-semibold text-yellow-100/90">
                                        <div className="flex items-center gap-2"><Trophy className="w-5 h-5"/>{kingOfGames.leaderboardPoints} نقطة صدارة</div>
                                        {kingOfGamesRank && kingOfGamesRank.icon && 
                                            <div className="flex items-center gap-2">
                                                {React.createElement(kingOfGamesRank.icon, { className: "w-5 h-5" })}
                                                <span>{kingOfGamesRank.name}</span>
                                            </div>
                                        }
                                     </div>
                                </div>
                            </CardContent>
                        </Card>
                        </motion.div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(GAME_TYPE_NAMES).map(([gameType, name], index) => {
                        const king = kings[gameType];
                        const Icon = GAME_ICONS[gameType as keyof typeof GAME_ICONS] || Star;
                        const kingRank = king ? getSocialRankForUser(king.leaderboardPoints || 0) : null;
                        const RankIcon = kingRank?.icon || Shield;
                        return (
                            <motion.div
                                key={gameType}
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                            >
                                <Card className="text-center p-4 h-full flex flex-col justify-between bg-black/30 backdrop-blur-sm border-purple-800/50 text-white shadow-lg shadow-purple-900/40 hover:shadow-purple-500/50 hover:-translate-y-1 transition-all duration-300">
                                    <div>
                                        <Icon className="w-16 h-16 text-purple-400 mx-auto mb-2 drop-shadow-[0_0_10px_rgba(192,132,252,0.5)]"/>
                                        <h3 className="font-bold text-2xl text-purple-300">{name}</h3>
                                    </div>
                                    {king ? (
                                        <div className="mt-4 space-y-2">
                                            <PlayerAvatar avatarId={king.avatarId} className="w-24 h-24 mx-auto rounded-full border-4 border-amber-400 shadow-lg" />
                                            <p className="font-semibold text-xl text-amber-300">{king.name}</p>
                                             {kingRank && (
                                                <div className="flex items-center justify-center gap-1.5 text-sm text-gray-300">
                                                    <RankIcon className="w-4 h-4"/>
                                                    <span>{kingRank.name}</span>
                                                </div>
                                             )}
                                            <div className="flex justify-center items-center gap-4 text-sm text-gray-400">
                                                <span className="flex items-center gap-1.5"><Star className="w-4 h-4" /> {king.winCount} انتصارات</span>
                                                <span className="flex items-center gap-1.5"><Trophy className="w-4 h-4" /> {king.leaderboardPoints || 0} نقطة</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-4 flex-grow flex flex-col items-center justify-center">
                                            <p className="text-gray-400">لا يوجد ملك بعد</p>
                                            <p className="text-xs text-gray-500">هل ستكون أنت الأول؟</p>
                                        </div>
                                    )}
                                </Card>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
            )}
            </div>
        </div>
    );
}
