
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import type { UserProfile, SocialRank } from '@/types';
import { getAllUsers, humiliatePlayer, pledgeAllegiance } from '@/lib/actions/user';
import { Loader2, ArrowLeft, Crown, Shield, User, ThumbsDown, Handshake, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';

// PlayerCard Component
const PlayerCard = ({ player, rank, onPlayerClick }: { player: UserProfile, rank: SocialRank | null, onPlayerClick: (player: UserProfile) => void }) => {
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
    const [allPlayers, setAllPlayers] = useState<UserProfile[]>([]);
    const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
    const [selectedPlayer, setSelectedPlayer] = useState<UserProfile | null>(null);
    const [expandedRanks, setExpandedRanks] = useState<Record<string, boolean>>({});
    const [searchTerm, setSearchTerm] = useState("");
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const fetchPlayers = useCallback(async (term: string = "") => {
        setIsLoadingPlayers(true);
        const fetchedPlayers = await getAllUsers(term);
        setAllPlayers(fetchedPlayers);
        setIsLoadingPlayers(false);
    }, []);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        } else if (user) {
            fetchPlayers();
        }
    }, [user, loading, router, fetchPlayers]);
    
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        setSearchTerm(term);

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(() => {
            fetchPlayers(term);
        }, 300); // 300ms debounce
    };
    
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
            fetchPlayers(searchTerm); 
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
            fetchPlayers(searchTerm);
            if(refreshUserProfile) refreshUserProfile();
            handleCloseModal();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };
    
    const toggleRankExpansion = (rankName: string) => {
        setExpandedRanks(prev => ({ ...prev, [rankName]: !prev[rankName] }));
    };

    const groupedPlayersByRank = useMemo(() => {
        const groups: { [key: string]: UserProfile[] } = {};
        allPlayers.forEach(player => {
            const rank = socialRanks.find(r => player.leaderboardPoints >= r.threshold && (!socialRanks.find(r2 => r2.threshold > r.threshold && player.leaderboardPoints >= r2.threshold)));
            const finalRank = rank || socialRanks[0];
            if (finalRank) {
                 if (!groups[finalRank.name]) {
                    groups[finalRank.name] = [];
                }
                groups[finalRank.name].push(player);
            }
        });
        
        socialRanks.forEach(rank => {
            if (!groups[rank.name]) {
                groups[rank.name] = [];
            }
             groups[rank.name].sort((a,b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0));
        });
        return groups;
    }, [allPlayers, socialRanks]);

    if (loading) {
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
                     <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
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
                        <div className="w-full md:w-auto md:min-w-[250px] relative">
                             <Input 
                                placeholder="ابحث عن لاعب..."
                                value={searchTerm}
                                onChange={handleSearchChange}
                                className="bg-gray-800 border-purple-500/50 text-white focus:ring-purple-500"
                             />
                             <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        </div>
                    </header>
                    
                    <div className="space-y-8">
                        {socialRanks.slice().reverse().map((rank, index) => {
                            const playersInRank = groupedPlayersByRank[rank.name] || [];
                            const isExpanded = expandedRanks[rank.name];
                            const displayPlayers = isExpanded ? playersInRank.slice(0, 20) : playersInRank.slice(0, 5);
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
                                            {isLoadingPlayers ? (
                                                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                    {[...Array(5)].map((_, i) => <div key={i} className="w-full aspect-[3/4] bg-slate-700/50 animate-pulse rounded-lg" />)}
                                                </div>
                                            ) : playersInRank.length > 0 ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                    {displayPlayers.map((p) => (
                                                        <PlayerCard key={p.uid} player={p} rank={rank} onPlayerClick={handlePlayerClick} />
                                                     ))}
                                                </div>
                                            ) : (
                                                <p className="text-center text-gray-500 py-4">لا يوجد لاعبون في هذه الطبقة بعد.</p>
                                            )}
                                        </CardContent>
                                        {playersInRank.length > 5 && (
                                            <CardFooter>
                                                <Button variant="ghost" className="w-full text-purple-300" onClick={() => toggleRankExpansion(rank.name)}>
                                                    {isExpanded ? <ChevronUp className="ml-2" /> : <ChevronDown className="ml-2" />}
                                                    {isExpanded ? 'عرض أقل' : `عرض المزيد (${playersInRank.length - 5} لاعبين)`}
                                                </Button>
                                            </CardFooter>
                                        )}
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
                    actorRank={socialRanks.find(r => userProfile.leaderboardPoints >= r.threshold && (!socialRanks.find(r2 => r2.threshold > r.threshold && userProfile.leaderboardPoints >= r2.threshold))) || socialRanks[0]}
                    targetRank={socialRanks.find(r => selectedPlayer.leaderboardPoints >= r.threshold && (!socialRanks.find(r2 => r2.threshold > r.threshold && selectedPlayer.leaderboardPoints >= r2.threshold))) || socialRanks[0]}
                    onHumiliate={handleHumiliate}
                    onPledge={handlePledge}
                />
            )}
        </>
    );
}
