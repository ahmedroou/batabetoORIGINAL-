"use client";

import { useState, useEffect } from "react";
import { getGameKings } from "@/lib/actions/user";
import type { GameKing, Game } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { GAME_ICONS } from "@/data/icons";
import { Crown, Star } from "lucide-react";
import { motion } from "framer-motion";

const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'prison': 'السجن',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
};

export default function KingsClient() {
    const [kings, setKings] = useState<Record<string, GameKing>>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchKings = async () => {
            setIsLoading(true);
            const fetchedKings = await getGameKings();
            setKings(fetchedKings);
            setIsLoading(false);
        };
        fetchKings();
    }, []);

    const renderLoadingState = () => (
        [...Array(5)].map((_, i) => (
             <Card key={i} className="text-center p-4">
                <Skeleton className="w-16 h-16 mx-auto mb-2 rounded-full" />
                <Skeleton className="h-6 w-3/4 mx-auto mb-2" />
                <Skeleton className="w-24 h-24 mx-auto rounded-full border-2 border-amber-400" />
                <Skeleton className="h-5 w-1/2 mx-auto mt-2" />
                <Skeleton className="h-4 w-1/4 mx-auto mt-1" />
            </Card>
        ))
    );

    return (
        <div className="container mx-auto px-4 py-8">
            <header className="text-center mb-12">
                <Crown className="w-24 h-24 mx-auto text-yellow-400" />
                <h1 className="text-4xl md:text-5xl font-bold mt-4">قاعة الملوك</h1>
                <p className="text-lg text-muted-foreground mt-2">
                    الأبطال الذين يتربعون على عرش كل لعبة. هل يمكنك هزيمتهم؟
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                {isLoading ? renderLoadingState() : 
                Object.entries(GAME_TYPE_NAMES).map(([gameType, name], index) => {
                    const king = kings[gameType];
                    const Icon = GAME_ICONS[gameType as keyof typeof GAME_ICONS] || Star;
                    return (
                        <motion.div
                            key={gameType}
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                        >
                            <Card className="text-center p-4 h-full flex flex-col justify-between hover:shadow-xl hover:border-primary transition-all">
                                <div>
                                    <Icon className="w-16 h-16 text-primary mx-auto mb-2"/>
                                    <h3 className="font-bold text-2xl">{name}</h3>
                                </div>
                                {king ? (
                                    <div className="mt-4 space-y-2">
                                        <PlayerAvatar avatarId={king.avatarId} className="w-24 h-24 mx-auto rounded-full border-4 border-amber-400 shadow-lg" />
                                        <p className="font-semibold text-xl text-amber-600">{king.name}</p>
                                        <p className="text-sm text-muted-foreground">{king.winCount} انتصارات</p>
                                    </div>
                                ) : (
                                    <div className="mt-4 flex-grow flex flex-col items-center justify-center">
                                        <p className="text-muted-foreground">لا يوجد ملك بعد</p>
                                        <p className="text-xs text-muted-foreground">هل ستكون أنت الأول؟</p>
                                    </div>
                                )}
                            </Card>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    );
}
