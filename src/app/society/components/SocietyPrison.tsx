
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { UserProfile } from '@/types';
import { getAllUsers, getTopPunisher } from '@/lib/actions/user';
import { Loader2, Gavel, Hammer, Search } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Input } from '@/components/ui/input';

const TopPunisherCard = ({ punisher }: { punisher: UserProfile | null }) => {
    if (!punisher) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
        >
            <Card className="bg-gradient-to-tr from-red-900 via-gray-900 to-black border-2 border-red-500/50">
                <CardHeader className="text-center">
                    <Hammer className="w-16 h-16 text-red-400 mx-auto" />
                    <CardTitle className="text-2xl text-red-300">جلاد المجتمع</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-2">
                    <PlayerAvatar avatarId={punisher.avatarId} className="w-24 h-24 rounded-full border-4 border-red-400" />
                    <h3 className="text-2xl font-bold text-white">{punisher.name}</h3>
                    <p className="font-bold text-lg text-red-400">
                        عاقب {punisher.punishmentsIssued || 0} لاعبًا
                    </p>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default function SocietyPrison() {
    const [allPrisoners, setAllPrisoners] = useState<UserProfile[]>([]);
    const [filteredPrisoners, setFilteredPrisoners] = useState<UserProfile[]>([]);
    const [topPunisher, setTopPunisher] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchPrisonData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch only a limited number of prisoners initially
            const [prisoners, punisher] = await Promise.all([
                getAllUsers('punished', 30),
                getTopPunisher()
            ]);
            setAllPrisoners(prisoners);
            setFilteredPrisoners(prisoners); // Initially, show what was fetched
            setTopPunisher(punisher);
        } catch (error) {
            console.error("Failed to fetch prison data:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPrisonData();
    }, [fetchPrisonData]);

    useEffect(() => {
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            // Filter the already-fetched list of prisoners client-side for performance
            const filtered = allPrisoners.filter(player =>
                player.name.toLowerCase().includes(lowercasedFilter)
            );
            setFilteredPrisoners(filtered);
        } else {
            // When search is cleared, show the initial list again
            setFilteredPrisoners(allPrisoners);
        }
    }, [searchTerm, allPrisoners]);

    return (
        <div className="w-full">
            <TopPunisherCard punisher={topPunisher} />

            <Card className="bg-black border-red-900/80 text-white backdrop-blur-sm shadow-2xl shadow-red-900/40 flex flex-col h-full">
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl text-red-400 flex items-center justify-center gap-3">
                        <Gavel className="w-10 h-10" />
                        سجل العار
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                        اللاعبون الخاضعون حاليًا لعقوبة.
                    </CardDescription>
                     <div className="relative mt-4 max-w-sm mx-auto">
                        <Input
                            placeholder="ابحث عن سجين بالاسم..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-gray-800/70 border-red-500/50 text-white focus:ring-red-500 pl-10"
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    </div>
                </CardHeader>
                <CardContent className="flex-grow">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-full py-10">
                            <Loader2 className="w-12 h-12 animate-spin text-red-400" />
                        </div>
                    ) : filteredPrisoners.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {filteredPrisoners.map((player, index) => {
                                const humiliation = player.humiliation?.until && new Date(player.humiliation.until) > new Date() ? player.humiliation : null;
                                const avatarPunishment = player.originalAvatarToRevert?.until && new Date(player.originalAvatarToRevert.until) > new Date() ? player.originalAvatarToRevert : null;
                                const decreePunishment = player.decrees?.find(d => d.until && new Date(d.until) > new Date());
                                
                                let punishment;
                                if (humiliation) punishment = { type: 'إذلال', by: humiliation.byName, until: humiliation.until };
                                else if (avatarPunishment) punishment = { type: 'تغيير شخصية', by: avatarPunishment.byName, until: avatarPunishment.until };
                                else if (decreePunishment) punishment = { type: `لقب مهين: ${decreePunishment.title}`, by: decreePunishment.issuedByName, until: decreePunishment.until };
                                
                                return (
                                    <motion.div
                                        key={player.uid}
                                        className="p-3 bg-gray-900/70 border-2 border-gray-700/50 rounded-lg text-center flex flex-col items-center shadow-lg"
                                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ delay: index * 0.05, type: "spring", stiffness: 150 }}
                                    >
                                        <div className="relative w-24 h-24 mb-2">
                                            <PlayerAvatar avatarId={player.avatarId} className="w-full h-full rounded-full border-4 border-destructive filter grayscale" />
                                            <div className="absolute inset-0 prison-bars"></div>
                                        </div>
                                        <h4 className="font-bold mt-2 truncate w-full">{player.name}</h4>
                                        {punishment && (
                                             <div className="text-xs text-center mt-1 space-y-1 w-full">
                                                 <p className="text-red-400 font-semibold px-2 py-1 bg-red-900/50 rounded-full truncate">
                                                    بواسطة: {punishment.by}
                                                </p>
                                                <p className="text-yellow-400 font-semibold px-2 py-1 bg-yellow-900/50 rounded-full truncate">
                                                   النوع: {punishment.type}
                                                </p>
                                                 <p className="text-gray-300 font-semibold text-xs mt-1">
                                                    تنتهي {formatDistanceToNow(new Date(punishment.until), { addSuffix: true, locale: ar })}
                                                </p>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-10 text-gray-500 h-full flex flex-col justify-center items-center">
                            <Gavel className="w-20 h-20 text-gray-700" />
                            <p className="text-lg mt-4">{searchTerm ? 'لم يتم العثور على سجناء بهذا الاسم.' : 'غرفة العقاب فارغة حاليًا.'}</p>
                            {!searchTerm && <p>يبدو أن الجميع يتصرفون بلطف!</p>}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

    
