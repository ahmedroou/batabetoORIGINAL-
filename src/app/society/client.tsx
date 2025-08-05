
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import type { UserProfile, SocialRank } from '@/types';
import { getAllUsers, humiliatePlayer, pledgeAllegiance } from '@/lib/actions/user';
import { Loader2, ArrowLeft, Crown, Shield, User, ThumbsDown, Handshake } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

// PlayerCard Component
const PlayerCard = ({ player, rank, onPlayerClick }: { player: UserProfile, rank: SocialRank, onPlayerClick: (player: UserProfile) => void }) => {
    const isHumiliated = player.humiliation?.until && new Date(player.humiliation.until) > new Date();

    return (
        <motion.div
            layoutId={`player-card-${player.uid}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            onClick={() => onPlayerClick(player)}
            className="group perspective-1000 cursor-pointer"
        >
            <div className="relative transform-style-3d group-hover:rotate-y-180 transition-transform duration-500 w-full aspect-[3/4] rounded-lg">
                {/* Front */}
                <div className="absolute w-full h-full backface-hidden bg-gray-800/50 border border-purple-400/30 rounded-lg flex flex-col items-center justify-center p-2 text-center shadow-lg">
                    <PlayerAvatar avatarId={player.avatarId} className="w-20 h-20 rounded-full border-2 border-purple-400/50"/>
                    <h4 className="font-bold mt-2 truncate w-full">{player.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                        {isHumiliated && <ThumbsDown className="w-4 h-4 text-red-500" title="مُذل" />}
                        {player.allegiance?.to && <Shield className="w-4 h-4 text-yellow-400" title={`ولاء لـ ${player.allegiance.toName}`} />}
                    </div>
                </div>
                {/* Back */}
                <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-gray-900 border border-purple-400/30 rounded-lg flex flex-col items-center justify-center p-2 text-center shadow-lg">
                    <p className="text-lg font-bold text-amber-400">{player.leaderboardPoints}</p>
                    <p className="text-sm text-gray-400">نقطة</p>
                    <p className="text-sm text-gray-400 mt-2">{player.gamesPlayed} مباريات</p>
                </div>
            </div>
        </motion.div>
    );
}

// InteractionModal Component
const InteractionModal = ({
    isOpen,
    onClose,
    actor,
    target,
    actorRank,
    targetRank,
    onHumiliate,
    onPledge,
}: {
    isOpen: boolean;
    onClose: () => void;
    actor: UserProfile;
    target: UserProfile;
    actorRank: SocialRank | null;
    targetRank: SocialRank | null;
    onHumiliate: (targetId: string) => Promise<void>;
    onPledge: (targetId: string) => Promise<void>;
}) => {
    if (!actorRank || !targetRank) return null;

    const canHumiliate = (actorRank.threshold >= 300) && (actorRank.threshold > targetRank.threshold);
    const canPledge = actorRank.threshold < targetRank.threshold;

    const isAlreadyHumiliated = target.humiliation?.until && new Date(target.humiliation.until) > new Date();
    const hasAllegianceToTarget = actor.allegiance?.to === target.uid;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 text-white border-purple-600">
                <DialogHeader>
                    <DialogTitle className="text-center text-2xl">التفاعل مع {target.name}</DialogTitle>
                    <DialogDescription className="text-center text-slate-400">
                        {targetRank.name} - {target.leaderboardPoints} نقطة
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center items-center gap-4 py-4">
                    <PlayerAvatar avatarId={actor.avatarId} className="w-20 h-20 border-4 border-blue-500 rounded-full" />
                    <Crown className="w-8 h-8 text-yellow-400" />
                    <PlayerAvatar avatarId={target.avatarId} className="w-20 h-20 border-4 border-red-500 rounded-full" />
                </div>
                <DialogFooter className="flex-col space-y-2">
                    {canHumiliate && (
                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => onHumiliate(target.uid)}
                            disabled={isAlreadyHumiliated}
                        >
                            <ThumbsDown className="ml-2" />
                            {isAlreadyHumiliated ? "تم إذلاله بالفعل" : "إذلال (-5 نقاط للهدف)"}
                        </Button>
                    )}
                    {canPledge && (
                        <Button
                            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
                            onClick={() => onPledge(target.uid)}
                            disabled={hasAllegianceToTarget}
                        >
                            <Handshake className="ml-2" />
                            {hasAllegianceToTarget ? "ولاؤك له بالفعل" : "إعلان الولاء (مقابل 10 كوينز)"}
                        </Button>
                    )}
                    <DialogClose asChild>
                        <Button variant="outline" className="w-full">إغلاق</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function SocietyClient() {
    const { user, userProfile, loading, socialRanks, refreshUserProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [players, setPlayers] = useState<UserProfile[]>([]);
    const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
    const [selectedPlayer, setSelectedPlayer] = useState<UserProfile | null>(null);

    const fetchPlayers = useCallback(async () => {
        setIsLoadingPlayers(true);
        const allPlayers = await getAllUsers();
        setPlayers(allPlayers);
        setIsLoadingPlayers(false);
    }, []);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        } else if (user) {
            fetchPlayers();
        }
    }, [user, loading, router, fetchPlayers]);
    
    const handlePlayerClick = (player: UserProfile) => {
        if (player.uid !== userProfile?.uid) {
            setSelectedPlayer(player);
        }
    };

    const handleCloseModal = () => {
        setSelectedPlayer(null);
    };

    const handleHumiliate = async (targetId: string) => {
        if (!userProfile) return;
        const result = await humiliatePlayer(userProfile.uid, targetId);
        if (result.success) {
            toast({ title: "تم بنجاح!", description: `لقد قمت بإذلال اللاعب بنجاح.` });
            fetchPlayers(); // Refresh player data
            handleCloseModal();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };
    
    const handlePledge = async (targetId: string) => {
        if (!userProfile) return;
        const result = await pledgeAllegiance(userProfile.uid, targetId);
        if (result.success) {
            toast({ title: "تم بنجاح!", description: `لقد أعلنت ولاءك.` });
            fetchPlayers(); // Refresh player data
            if(refreshUserProfile) refreshUserProfile(); // Refresh self profile for coin changes
            handleCloseModal();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };
    

    const groupedPlayersByRank = useMemo(() => {
        const groups: { [key: string]: UserProfile[] } = {};
        players.forEach(player => {
            const rank = getSocialRankForUser(player.leaderboardPoints || 0, socialRanks);
            if (rank) {
                if (!groups[rank.name]) {
                    groups[rank.name] = [];
                }
                groups[rank.name].push(player);
            }
        });
        // Ensure all rank tiers exist in the object, even if empty
        socialRanks.forEach(rank => {
            if (!groups[rank.name]) {
                groups[rank.name] = [];
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
        <>
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
                        {socialRanks.slice().reverse().map((rank, index) => {
                            const playersInRank = groupedPlayersByRank[rank.name] || [];
                            const Icon = rank.icon;
                            return (
                                <motion.div 
                                    key={rank.name}
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
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
                                                    {playersInRank.map((p) => (
                                                        <PlayerCard key={p.uid} player={p} rank={rank} onPlayerClick={handlePlayerClick} />
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
            {selectedPlayer && userProfile && (
                <InteractionModal
                    isOpen={!!selectedPlayer}
                    onClose={handleCloseModal}
                    actor={userProfile}
                    target={selectedPlayer}
                    actorRank={getSocialRankForUser(userProfile.leaderboardPoints, socialRanks)}
                    targetRank={getSocialRankForUser(selectedPlayer.leaderboardPoints, socialRanks)}
                    onHumiliate={handleHumiliate}
                    onPledge={handlePledge}
                />
            )}
        </>
    );
}
