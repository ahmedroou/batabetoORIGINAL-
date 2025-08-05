
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import type { UserProfile, SocialRank, Decree, TaxDemand, Alliance, DuelChallenge } from '@/types';
import { getAllUsers, humiliatePlayer, pledgeAllegiance, issueDecree, begForMercy, respondToTaxDemand, requestAlliance, respondToAlliance, issueDuelChallenge, respondToDuelChallenge, forceAvatarChange, getSocialRankForUser } from '@/lib/actions/user';
import { Loader2, ArrowLeft, Crown, Shield, User, ThumbsDown, Handshake, ChevronDown, ChevronUp, Search, Gavel, Coins, HeartHandshake, Swords, VenetianMask, KeyRound, ShieldCheck, Gem, Star, Award, MessageCircleWarning, Users as UsersIcon, Link as LinkIcon, Edit, UserMinus } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { AVATAR_IDS } from '@/data/avatars';
import { getAvatarPrices } from '@/app/actions';


const InteractionModal = ({
    isOpen,
    onClose,
    actor,
    target,
    actorRank,
    targetRank,
    onHumiliate,
    onPledge,
    onIssueDecree,
    onBegForMercy,
    onForceAvatar,
    onIssueDuel,
}: {
    isOpen: boolean;
    onClose: () => void;
    actor: UserProfile;
    target: UserProfile;
    actorRank: SocialRank | null;
    targetRank: SocialRank | null;
    onHumiliate: (targetId: string) => Promise<void>;
    onPledge: (targetId: string) => Promise<void>;
    onIssueDecree: (targetId: string, decree: Decree) => Promise<void>;
    onBegForMercy: (targetId: string, cost: number) => Promise<void>;
    onForceAvatar: (targetId: string, avatarId: string) => Promise<void>;
    onIssueDuel: (targetId: string, betAmount: number) => Promise<void>;
}) => {
    const [decreeTitle, setDecreeTitle] = useState("");
    const [punishmentAvatar, setPunishmentAvatar] = useState("");
    const [punishmentAvatars, setPunishmentAvatars] = useState<any[]>([]);
    const [duelBet, setDuelBet] = useState("");

    useEffect(() => {
        getAvatarPrices().then(result => {
            if(result.success && result.prices) {
                setPunishmentAvatars(result.prices.filter(p => p.isPunishment));
            }
        });
    }, []);
    
    if (!actorRank || !targetRank) return null;

    const canHumiliate = actor.permissions?.includes('can_send_global_taunt') && actorRank.threshold > targetRank.threshold;
    const canIssueDecree = actor.permissions?.includes('can_force_name_change') && actorRank.threshold > targetRank.threshold && (actor.honorPoints || 0) >= 10;
    const canDuel = actorRank.threshold >= 300 && targetRank.threshold >= 300;
    
    const canPledge = actorRank.threshold < targetRank.threshold && actor.coins >= 10;
    const canBeg = actorRank.threshold < targetRank.threshold && actor.loyaltyPoints >= 5;

    const isAlreadyHumiliated = target.humiliation?.until && new Date(target.humiliation.until) > new Date();
    const hasAllegianceToTarget = actor.allegiance?.to === target.uid;

    const handleDecreeSubmit = () => {
        if (!decreeTitle.trim() || !canIssueDecree) return;
        const newDecree: Decree = {
            title: decreeTitle,
            issuedBy: actor.uid,
            issuedByName: actor.name,
            at: new Date(),
            until: new Date(Date.now() + 24 * 60 * 60 * 1000)
        };
        onIssueDecree(target.uid, newDecree);
    };
    
    const handleAvatarPunishment = () => {
        if (!punishmentAvatar) return;
        onForceAvatar(target.uid, punishmentAvatar);
    };

    const handleDuelSubmit = () => {
        const betAmount = parseInt(duelBet, 10);
        if (isNaN(betAmount) || betAmount <= 0) return;
        onIssueDuel(target.uid, betAmount);
    };

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
                    <Swords className="w-8 h-8 text-yellow-400" />
                    <PlayerAvatar avatarId={target.avatarId} className="w-20 h-20 border-4 border-red-500 rounded-full" />
                </div>
                <div className="space-y-2">
                    {canHumiliate && (
                        <Button variant="destructive" className="w-full" onClick={() => onHumiliate(target.uid)} disabled={isAlreadyHumiliated}>
                            <ThumbsDown className="ml-2" />
                            {isAlreadyHumiliated ? "تم إذلاله بالفعل" : "إذلال (-5 نقاط للهدف)"}
                        </Button>
                    )}
                    {canPledge && (
                        <Button className="w-full bg-yellow-500 hover:bg-yellow-600 text-black" onClick={() => onPledge(target.uid)} disabled={hasAllegianceToTarget}>
                            <Handshake className="ml-2" />
                            {hasAllegianceToTarget ? "ولاؤك له بالفعل" : "إعلان الولاء (10 كوينز)"}
                        </Button>
                    )}
                     {canBeg && (
                        <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white" onClick={() => onBegForMercy(target.uid, 5)}>
                            <HeartHandshake className="ml-2" />
                            توسل للحماية (5 نقاط ولاء)
                        </Button>
                    )}
                     {canIssueDecree && (
                        <div className="p-3 border border-dashed border-red-500/50 rounded-lg space-y-2">
                            <h4 className="font-bold text-center text-red-400">👑 أصدر أمرًا (10 نقاط شرف)</h4>
                            <div className="flex gap-2">
                                <Input value={decreeTitle} onChange={e => setDecreeTitle(e.target.value)} placeholder="لقب مهين مؤقت..." className="bg-slate-800 border-slate-600"/>
                                <Button variant="destructive" onClick={handleDecreeSubmit} disabled={!decreeTitle.trim()}><Gavel /></Button>
                            </div>
                        </div>
                    )}
                     <div className="p-3 border border-dashed border-red-500/50 rounded-lg space-y-2">
                        <h4 className="font-bold text-center text-red-400">فرض تغيير الشخصية</h4>
                         <div className="flex gap-2">
                            <select onChange={(e) => setPunishmentAvatar(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-md p-2">
                                <option value="">اختر شخصية عقاب...</option>
                                {punishmentAvatars.map(avatar => <option key={avatar.avatarId} value={avatar.avatarId}>{avatar.avatarId} ({avatar.price} كوينز)</option>)}
                            </select>
                            <Button variant="destructive" onClick={handleAvatarPunishment} disabled={!punishmentAvatar}><UserMinus /></Button>
                        </div>
                    </div>
                     {canDuel && (
                        <div className="p-3 border border-dashed border-yellow-500/50 rounded-lg space-y-2">
                            <h4 className="font-bold text-center text-yellow-400">⚔️ تحدي مبارزة</h4>
                            <div className="flex gap-2">
                                <Input type="number" value={duelBet} onChange={e => setDuelBet(e.target.value)} placeholder="مبلغ الرهان (كوينز)..." className="bg-slate-800 border-slate-600"/>
                                <Button className="bg-yellow-500 hover:bg-yellow-600 text-black" onClick={handleDuelSubmit} disabled={!duelBet.trim()}><Swords /></Button>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline" className="w-full">إغلاق</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// PlayerCard Component
const PlayerCard = ({ player, rank, onPlayerClick }: { player: UserProfile, rank: SocialRank | null, onPlayerClick: (player: UserProfile) => void }) => {
    const isHumiliated = player.humiliation?.until && new Date(player.humiliation.until) > new Date();
    const currentDecree = (player.decrees || []).find(d => d.until && new Date(d.until.seconds * 1000) > new Date());
    const titleToShow = currentDecree ? currentDecree.title : rank?.name;
    const isUnderProtection = player.allegiance?.to;

    return (
        <motion.div
            layoutId={`player-card-${player.uid}`}
            whileHover={{ scale: 1.05, zIndex: 10 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onPlayerClick(player)}
            className="group relative cursor-pointer aspect-[3/4.5] bg-slate-800/50 border border-purple-400/30 rounded-lg flex flex-col items-center justify-center p-2 text-center shadow-lg text-white"
        >
            <PlayerAvatar avatarId={player.avatarId} className="w-20 h-20 rounded-full border-2 border-purple-400/50"/>
            <h4 className="font-bold mt-2 truncate w-full">{player.name}</h4>
            {titleToShow && <Badge variant={currentDecree ? 'destructive' : 'secondary'} className="mt-1">{titleToShow}</Badge>}
            <div className="flex items-center gap-2 mt-1">
                {isHumiliated && <ThumbsDown className="w-4 h-4 text-red-500" title="مُذل" />}
                {isUnderProtection && <Shield className="w-4 h-4 text-yellow-400" title={`تحت حماية ${player.allegiance.toName}`} />}
            </div>
             <div className="absolute bottom-2 text-xs space-y-1 w-full px-1">
                <div className="flex justify-between items-center bg-black/20 p-1 rounded">
                    <span>👑 الشرف</span>
                    <span className="font-bold text-amber-300">{player.honorPoints || 0}</span>
                </div>
                 <div className="flex justify-between items-center bg-black/20 p-1 rounded">
                    <span>🤝 الولاء</span>
                    <span className="font-bold text-blue-300">{player.loyaltyPoints || 0}</span>
                </div>
                <div className="flex justify-between items-center bg-black/20 p-1 rounded">
                    <span>🔥 التمرد</span>
                    <span className="font-bold text-red-400">{player.rebellionPoints || 0}</span>
                </div>
            </div>
        </motion.div>
    );
}

export default function SocietyClient() {
    const { user, userProfile, loading, socialRanks, refreshUserProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [allPlayers, setAllPlayers] = useState<UserProfile[]>([]);
    const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
    const [selectedPlayer, setSelectedPlayer] = useState<UserProfile | null>(null);
    const [expandedRanks, setExpandedRanks] = useState<Record<string, boolean>>({});
    const [searchTerm, setSearchTerm] = useState("");
    
    const fetchPlayers = useCallback(async () => {
        setIsLoadingPlayers(true);
        const fetchedPlayers = await getAllUsers();
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
    };

    const filteredPlayers = useMemo(() => {
        const lowerCaseTerm = searchTerm.toLowerCase();
        if (!lowerCaseTerm) return allPlayers;
        return allPlayers.filter(p => p.name.toLowerCase().includes(lowerCaseTerm));
    }, [allPlayers, searchTerm]);
    
    const handlePlayerClick = (player: UserProfile) => {
        if (player.uid !== userProfile?.uid) {
            setSelectedPlayer(player);
        }
    };

    const handleCloseModal = () => {
        setSelectedPlayer(null);
    };

    const refreshData = () => {
        fetchPlayers();
        if (refreshUserProfile) refreshUserProfile();
        handleCloseModal();
    }

    const handleHumiliate = async (targetId: string) => {
        if (!userProfile) return;
        const result = await humiliatePlayer(userProfile.uid, targetId);
        if (result.success) {
            toast({ title: "تم بنجاح!", description: `لقد قمت بإذلال اللاعب بنجاح.` });
            refreshData();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };
    
    const handlePledge = async (targetId: string) => {
        if (!userProfile) return;
        const result = await pledgeAllegiance(userProfile.uid, targetId);
        if (result.success) {
            toast({ title: "تم بنجاح!", description: `لقد أعلنت ولاءك.` });
            refreshData();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };
    
    const handleIssueDecree = async (targetId: string, decree: Decree) => {
        if (!userProfile) return;
        const result = await issueDecree(userProfile.uid, targetId, decree);
        if (result.success) {
            toast({ title: "تم إصدار المرسوم!", description: `تم تغيير لقب اللاعب مؤقتًا.` });
            refreshData();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };

    const handleForceAvatar = async (targetId: string, avatarId: string) => {
        if (!userProfile) return;
        const result = await forceAvatarChange(userProfile.uid, targetId, avatarId);
        if(result.success) {
            toast({ title: "تم بنجاح!", description: "تم تغيير شخصية اللاعب كعقوبة."});
            refreshData();
        } else {
             toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    }
    
    const handleBegForMercy = async (targetId: string, cost: number) => {
        if (!userProfile) return;
        const result = await begForMercy(userProfile.uid, targetId, cost);
         if (result.success) {
            toast({ title: "تم التوسل بنجاح!", description: `لقد طلبت الحماية.` });
            refreshData();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };
    
    const handleIssueDuel = async (targetId: string, betAmount: number) => {
        if (!userProfile) return;
        const result = await issueDuelChallenge(userProfile.uid, targetId, betAmount);
        if (result.success) {
            toast({ title: "تم إرسال تحدي المبارزة!" });
            refreshData();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };

    const toggleRankExpansion = (rankName: string) => {
        setExpandedRanks(prev => ({ ...prev, [rankName]: !prev[rankName] }));
    };
    
    const groupedPlayersByRank = useMemo(() => {
        const groups: { [key: string]: UserProfile[] } = {};
        filteredPlayers.forEach(player => {
            const rank = getSocialRankForUser(player.leaderboardPoints || 0, socialRanks);
            if (rank) {
                 if (!groups[rank.name]) {
                    groups[rank.name] = [];
                }
                groups[rank.name].push(player);
            }
        });
        
        socialRanks.forEach(rank => {
            if (!groups[rank.name]) {
                groups[rank.name] = [];
            }
             groups[rank.name].sort((a,b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0));
        });
        return groups;
    }, [filteredPlayers, socialRanks]);
    
    const rankIcons: Record<string, React.ElementType> = {
      'زعيم المدينة': Crown,
      'عضو مجلس': Gem,
      'شخصية مرموقة': Award,
      'مواطن صالح': ShieldCheck,
      'عامل وضيع': Shield,
    };
    

    if (loading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
            </div>
        );
    }
    
    const getRankCardClass = (rankName: string) => {
        if (rankName === 'زعيم المدينة') return 'bg-leader-card';
        if (rankName === 'عضو مجلس') return 'bg-council-card';
        return 'bg-common-card';
    };

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
                            const isExpanded = expandedRanks[rank.name] || searchTerm.length > 0;
                            const displayPlayers = isExpanded ? playersInRank.slice(0, 20) : playersInRank.slice(0, 5);
                            const Icon = rankIcons[rank.name] || Star;
                            return (
                                <motion.div 
                                    key={rank.name}
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                                >
                                    <Card className={cn("text-white", getRankCardClass(rank.name))}>
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
                                        {playersInRank.length > 5 && searchTerm.length === 0 && (
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
                    actorRank={getSocialRankForUser(userProfile.leaderboardPoints, socialRanks)}
                    targetRank={getSocialRankForUser(selectedPlayer.leaderboardPoints, socialRanks)}
                    onHumiliate={handleHumiliate}
                    onPledge={handlePledge}
                    onIssueDecree={handleIssueDecree}
                    onBegForMercy={handleBegForMercy}
                    onForceAvatar={handleForceAvatar}
                    onIssueDuel={handleIssueDuel}
                />
            )}
        </>
    );
}
```