"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { UserProfile, SocialRank, Decree, AvatarPrice, AllegianceRequest } from '@/types';
import { humiliatePlayer, issueDecree, begForMercy, forceAvatarChange, issueDuelChallenge, requestAllegiance, getAllUsers } from '@/lib/actions/user';
import { Loader2, Crown, Shield, User, ThumbsDown, Handshake, ChevronDown, ChevronUp, Search, Gavel, Coins, HeartHandshake, Swords, VenetianMask, KeyRound, ShieldCheck, Gem, Star, Award, MessageCircleWarning, Users as UsersIcon, Link as LinkIcon, Edit, UserMinus, ScrollText, Drama, TowerControl, ShieldQuestion } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getPunishmentAvatarPrices } from '@/lib/actions/admin';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const InteractionModal = ({
    isOpen,
    onClose,
    actor,
    target,
    actorRank,
    targetRank,
    onHumiliate,
    onIssueDecree,
    onForceAvatar,
}: {
    isOpen: boolean;
    onClose: () => void;
    actor: UserProfile;
    target: UserProfile;
    actorRank: SocialRank | null;
    targetRank: SocialRank | null;
    onHumiliate: (targetId: string, durationInDays: number, taxToLift: number) => Promise<void>;
    onIssueDecree: (targetId: string, title: string, durationInDays: number, taxToLift: number) => Promise<void>;
    onForceAvatar: (targetId: string, avatarId: string, durationInDays: number, taxToLift: number) => Promise<void>;
}) => {
    
    // States for Punishments
    const [decreeTitle, setDecreeTitle] = useState("");
    const [decreeDuration, setDecreeDuration] = useState(1);
    const [decreeTax, setDecreeTax] = useState("10");

    const [humiliationDuration, setHumiliationDuration] = useState(1);
    const [humiliationTax, setHumiliationTax] = useState("10");

    const [avatarPunishmentDuration, setAvatarPunishmentDuration] = useState(1);
    const [avatarPunishmentTax, setAvatarPunishmentTax] = useState("10");
    const [selectedPunishmentAvatar, setSelectedPunishmentAvatar] = useState("");
    const [availablePunishmentAvatars, setAvailablePunishmentAvatars] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            setAvailablePunishmentAvatars(actor.unlockedPunishmentAvatars || []);
        }
    }, [isOpen, actor]);
    
    if (!actorRank || !targetRank) return null;

    const canPunish = actorRank.threshold > targetRank.threshold;
    const isAlreadyHumiliated = target.humiliation?.until && new Date(target.humiliation.until) > new Date();
    const isAlreadyPunishedWithAvatar = target.originalAvatarToRevert?.until && new Date(target.originalAvatarToRevert.until) > new Date();

    const getHonorCost = (duration: number) => duration * 3;
    const getAvatarHonorCost = (duration: number) => duration * 2;
    const getDecreeHonorCost = (duration: number) => duration * 3;


    const renderPunishmentCard = (
        title: string,
        permissionId: any,
        costText: string,
        children: React.ReactNode,
        isPunishedFlag?: boolean,
        isCustomLogicDisabled?: boolean
    ) => {
        const hasPermission = actor.permissions?.includes(permissionId);
        if (!hasPermission || !canPunish) return null;
        
        return (
             <div className="p-3 border border-dashed border-red-500/50 rounded-lg space-y-2">
                <h4 className="font-bold text-center text-red-400">{title} ({costText})</h4>
                {children}
            </div>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 text-white border-purple-600 max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-center text-2xl">التفاعل مع {target.name}</DialogTitle>
                    <DialogDescription className="text-center text-slate-400">
                        {targetRank.name} - {target.leaderboardPoints} نقطة
                    </DialogDescription>
                </DialogHeader>
                 <ScrollArea className="h-[50vh] p-1">
                    <div className="space-y-3 pr-2">
                        {renderPunishmentCard('إذلال عام', 'can_send_global_taunt', `التكلفة: ${getHonorCost(humiliationDuration)} شرف`, (
                            <>
                                <div className="flex gap-2 items-center">
                                    <Label className="text-xs shrink-0">المدة:</Label>
                                    <Select value={String(humiliationDuration)} onValueChange={(v) => setHumiliationDuration(Number(v))}>
                                        <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-slate-900 text-white border-purple-500">
                                            <SelectItem value="1">يوم واحد ({getHonorCost(1)} شرف)</SelectItem>
                                            <SelectItem value="2">يومان ({getHonorCost(2)} شرف)</SelectItem>
                                            <SelectItem value="3">3 أيام ({getHonorCost(3)} شرف)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Input type="number" value={humiliationTax} onChange={e => setHumiliationTax(e.target.value)} placeholder="ضريبة الخلاص (كوينز)..." className="bg-slate-800 border-slate-600"/>
                                <Button className="w-full" variant="destructive" onClick={() => onHumiliate(target.uid, humiliationDuration, parseInt(humiliationTax, 10) || 0)} disabled={isAlreadyHumiliated}>
                                     {isAlreadyHumiliated ? "تم إذلاله بالفعل" : "إذلال"}
                                </Button>
                            </>
                        ))}
                        {renderPunishmentCard('فرض لقب مهين', 'can_force_name_change', `التكلفة: ${getDecreeHonorCost(decreeDuration)} شرف`, (
                             <>
                                <div className="flex gap-2 items-center">
                                    <Label className="text-xs shrink-0">المدة:</Label>
                                    <Select value={String(decreeDuration)} onValueChange={(v) => setDecreeDuration(Number(v))}>
                                        <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-slate-900 text-white border-purple-500">
                                            <SelectItem value="1">يوم واحد ({getDecreeHonorCost(1)} شرف)</SelectItem>
                                            <SelectItem value="2">يومان ({getDecreeHonorCost(2)} شرف)</SelectItem>
                                            <SelectItem value="3">3 أيام ({getDecreeHonorCost(3)} شرف)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Input value={decreeTitle} onChange={e => setDecreeTitle(e.target.value)} placeholder="اللقب المهين المؤقت..." className="bg-slate-800 border-slate-600"/>
                                <Input type="number" value={decreeTax} onChange={e => setDecreeTax(e.target.value)} placeholder="ضريبة الخلاص (كوينز)..." className="bg-slate-800 border-slate-600"/>
                                <Button className="w-full" variant="destructive" onClick={() => onIssueDecree(target.uid, decreeTitle, decreeDuration, parseInt(decreeTax, 10) || 0)} disabled={!decreeTitle.trim()}>
                                    تأكيد تغيير اللقب
                                </Button>
                            </>
                        ))}
                         {renderPunishmentCard('فرض شخصية', 'can_force_avatar_change', `التكلفة: ${getAvatarHonorCost(avatarPunishmentDuration)} شرف`, (
                            <>
                                <div className="flex gap-2 items-center">
                                    <Label className="text-xs shrink-0">المدة:</Label>
                                    <Select value={String(avatarPunishmentDuration)} onValueChange={(v) => setAvatarPunishmentDuration(Number(v))}>
                                        <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-slate-900 text-white border-purple-500">
                                            <SelectItem value="1">يوم واحد ({getAvatarHonorCost(1)} شرف)</SelectItem>
                                            <SelectItem value="2">يومان ({getAvatarHonorCost(2)} شرف)</SelectItem>
                                            <SelectItem value="3">3 أيام ({getAvatarHonorCost(3)} شرف)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Select value={selectedPunishmentAvatar} onValueChange={setSelectedPunishmentAvatar}>
                                     <SelectTrigger className="bg-slate-800 border-slate-600">
                                        <SelectValue placeholder="اختر شخصية عقاب..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 text-white border-purple-500">
                                        {availablePunishmentAvatars.map(avatarId => (
                                            <SelectItem key={avatarId} value={avatarId}>
                                                <div className="flex items-center gap-2">
                                                    <PlayerAvatar avatarId={avatarId} className="w-6 h-6 rounded-full" />
                                                    <span>{avatarId.replace('.png', '')}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input type="number" value={avatarPunishmentTax} onChange={e => setAvatarPunishmentTax(e.target.value)} placeholder="ضريبة الخلاص (كوينز)..." className="bg-slate-800 border-slate-600"/>
                                <Button className="w-full" variant="destructive" onClick={() => onForceAvatar(target.uid, selectedPunishmentAvatar, avatarPunishmentDuration, parseInt(avatarPunishmentTax, 10) || 0)} disabled={isAlreadyPunishedWithAvatar || !selectedPunishmentAvatar}>
                                     {isAlreadyPunishedWithAvatar ? "عليه عقوبة شخصية بالفعل" : "فرض الشخصية"}
                                </Button>
                            </>
                         ))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline" className="w-full">إغلاق</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const PlayerCard = ({ player, rank, onPlayerClick }: { player: UserProfile, rank: SocialRank | null, onPlayerClick: (player: UserProfile) => void }) => {
    const isHumiliated = player.humiliation?.until && new Date(player.humiliation.until) > new Date();
    const hasPunishmentAvatar = player.originalAvatarToRevert?.until && new Date(player.originalAvatarToRevert.until) > new Date();
    const currentDecree = (player.decrees || []).find(d => d.until && new Date(d.until) > new Date());
    const titleToShow = currentDecree ? currentDecree.title : rank?.name;
    const isUnderProtection = player.allegiance?.to;
    const isPunished = isHumiliated || hasPunishmentAvatar;

    return (
        <motion.div
            layoutId={`player-card-${player.uid}`}
            whileHover={{ scale: 1.05, zIndex: 10 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onPlayerClick(player)}
            className="group relative cursor-pointer aspect-[3/4.5] bg-slate-800/50 border border-purple-400/30 rounded-lg flex flex-col items-center justify-center p-2 text-center shadow-lg text-white"
        >
            {isPunished && <Gavel className="w-5 h-5 text-destructive absolute top-1 left-1" />}
            <PlayerAvatar avatarId={player.avatarId} className="w-20 h-20 rounded-full border-2 border-purple-400/50" temporaryTitle={currentDecree?.title}/>
            <h4 className="font-bold mt-2 truncate w-full flex items-center justify-center gap-1">
                {player.name}
            </h4>
            {titleToShow && !currentDecree && <Badge variant={'secondary'} className="mt-1">{titleToShow}</Badge>}
            <div className="flex items-center gap-2 mt-1">
                {isHumiliated && <ThumbsDown className="w-4 h-4 text-red-500" title="مُذل" />}
                {isUnderProtection && <Shield className="w-4 h-4 text-yellow-400" title={`تحت حماية ${player.allegiance?.toName}`} />}
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

export default function SocietyPyramid({ searchTerm }: { searchTerm: string }) {
    const { userProfile, socialRanks, refreshUserProfile, getSocialRankForUser } = useAuth();
    const { toast } = useToast();
    const [allPlayers, setAllPlayers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPlayer, setSelectedPlayer] = useState<UserProfile | null>(null);
    const [searchedPlayers, setSearchedPlayers] = useState<UserProfile[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const sortedRanksForDisplay = useMemo(() => [...socialRanks].sort((a, b) => b.threshold - a.threshold), [socialRanks]);
    
    const fetchAllPlayers = useCallback(async () => {
        setIsLoading(true);
        try {
            const players = await getAllUsers();
            setAllPlayers(players);
        } catch (error) {
            console.error("Failed to fetch all players:", error);
            toast({ title: "خطأ في جلب اللاعبين", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchAllPlayers();
    }, [fetchAllPlayers]);
    
    const playersByRank = useMemo(() => {
        if (isLoading || allPlayers.length === 0) return {};
        
        const grouped: Record<string, UserProfile[]> = {};
        for(const rank of sortedRanksForDisplay) {
            grouped[rank.name] = [];
        }
        
        allPlayers.forEach(player => {
            const rank = getSocialRankForUser(player.leaderboardPoints || 0);
            if(rank && grouped[rank.name]) {
                grouped[rank.name].push(player);
            }
        });

        // Sort players within each rank
        for(const rankName in grouped) {
            grouped[rankName].sort((a,b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0));
        }

        return grouped;
    }, [allPlayers, isLoading, sortedRanksForDisplay, getSocialRankForUser]);


    const handlePlayerClick = (player: UserProfile) => {
        if (player.uid !== userProfile?.uid) {
            setSelectedPlayer(player);
        }
    };

    const handleCloseModal = () => setSelectedPlayer(null);

    const refreshAllData = useCallback(async () => {
        await fetchAllPlayers();
        if (refreshUserProfile) refreshUserProfile();
        handleCloseModal();
    }, [fetchAllPlayers, refreshUserProfile]);


    const handleHumiliate = async (targetId: string, durationInDays: number, taxToLift: number) => {
        if (!userProfile) return;
        const result = await humiliatePlayer(userProfile.uid, targetId, durationInDays, taxToLift);
        if (result.success) {
            toast({ title: "تم بنجاح!", description: `لقد قمت بإذلال اللاعب بنجاح.` });
            await refreshAllData();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };
    
    const handleIssueDecree = async (targetId: string, title: string, durationInDays: number, taxToLift: number) => {
        if (!userProfile) return;
        const result = await issueDecree(userProfile.uid, targetId, title, durationInDays, taxToLift);
        if (result.success) {
            toast({ title: "تم إصدار المرسوم!", description: `تم تغيير لقب اللاعب مؤقتًا.` });
            await refreshAllData();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    };

    const handleForceAvatar = async (targetId: string, avatarId: string, durationInDays: number, taxToLift: number) => {
        if (!userProfile) return;
        const result = await forceAvatarChange(userProfile.uid, targetId, avatarId, durationInDays, taxToLift);
        if(result.success) {
            toast({ title: "تم بنجاح!", description: "تم تغيير شخصية اللاعب كعقوبة."});
            await refreshAllData();
        } else {
             toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    }
    
    const handleSearch = useCallback(async () => {
        if (searchTerm.trim().length < 2) {
            setSearchedPlayers([]);
            return;
        }
        setIsSearching(true);
        const users = await getAllUsers();
        const filteredUsers = users.filter(user => user.name.toLowerCase().includes(searchTerm.toLowerCase()));
        setSearchedPlayers(filteredUsers);
        setIsSearching(false);
    }, [searchTerm]);
    
    useEffect(() => {
        const debounce = setTimeout(() => {
            handleSearch();
        }, 300);
        return () => clearTimeout(debounce);
    }, [searchTerm, handleSearch]);

    
    const actorCurrentRank = userProfile ? getSocialRankForUser(userProfile.leaderboardPoints) : null;
    const targetCurrentRank = selectedPlayer ? getSocialRankForUser(selectedPlayer.leaderboardPoints) : null;
    

    return (
        <>
            <div className="space-y-8">
                {searchTerm.trim().length > 1 ? (
                    <Card className="bg-common-card">
                         <CardHeader>
                            <CardTitle className="text-purple-300">نتائج البحث</CardTitle>
                        </CardHeader>
                         <CardContent className="p-4">
                            {isSearching ? <Loader2 className="mx-auto animate-spin" /> : (
                                searchedPlayers.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                        {searchedPlayers.map(p => (
                                            <PlayerCard key={p.uid} player={p} rank={getSocialRankForUser(p.leaderboardPoints)} onPlayerClick={handlePlayerClick} />
                                        ))}
                                    </div>
                                ) : <p className="text-center text-gray-500">لم يتم العثور على لاعبين.</p>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    sortedRanksForDisplay.map((rank, index) => {
                        const playersInRank = playersByRank[rank.name] || [];
                        const Icon = rank.icon || Star;
                        
                        const rankClasses: { [key: number]: string } = {
                            0: 'bg-[linear-gradient(145deg,_#FFD700_0%,_#4a2c00_100%)] border-amber-400',
                            1: 'bg-[linear-gradient(145deg,_#e2e8f0_0%,_#94a3b8_50%,_#e2e8f0_100%)] border-slate-400',
                            2: 'bg-[linear-gradient(145deg,_#d9a777_0%,_#8c5620_50%,_#d9a777_100%)] border-amber-700',
                        };
                        
                        let cardClass = rankClasses[index] || 'bg-common-card';
                        if (index === sortedRanksForDisplay.length - 1) {
                            cardClass = 'bg-[linear-gradient(145deg,_#7f1d1d_0%,_#2c0b0b_100%)] border-red-800';
                        }
                        
                        return (
                            <motion.div 
                                key={rank.name}
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
                            >
                                <Card className={cardClass}>
                                    <CardHeader className="border-b-2 border-white/20">
                                        <CardTitle className="flex items-center gap-4 text-2xl">
                                            <Icon className="w-8 h-8" />
                                            <span>طبقة: {rank.name}</span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        {isLoading && !playersByRank[rank.name] ? (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                                {[...Array(8)].map((_, i) => <Skeleton key={i} className="w-full aspect-[3/4.5] bg-slate-700/50 animate-pulse rounded-lg" />)}
                                            </div>
                                        ) : playersInRank.length > 0 ? (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
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
                    })
                )}
            </div>
            {selectedPlayer && userProfile && (
                <InteractionModal
                    isOpen={!!selectedPlayer}
                    onClose={handleCloseModal}
                    actor={userProfile}
                    target={selectedPlayer}
                    actorRank={actorCurrentRank}
                    targetRank={targetCurrentRank}
                    onHumiliate={handleHumiliate}
                    onIssueDecree={handleIssueDecree}
                    onForceAvatar={handleForceAvatar}
                />
            )}
        </>
    );
}
