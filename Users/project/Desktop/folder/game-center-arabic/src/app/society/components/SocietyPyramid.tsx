
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { UserProfile, SocialRank, Decree, AvatarPrice, AllegianceRequest } from '@/types';
import { humiliatePlayer, issueDecree, begForMercy, forceAvatarChange, issueDuelChallenge, requestAllegiance, getUsersByRank, searchUsers } from '@/lib/actions/user';
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
    onIssueDecree: (targetId: string, title: string, durationInDays: number) => Promise<void>;
    onForceAvatar: (targetId: string, avatarId: string, durationInDays: number, taxToLift: number) => Promise<void>;
}) => {
    
    // States for Punishments
    const [decreeTitle, setDecreeTitle] = useState("");
    const [decreeDuration, setDecreeDuration] = useState(1);
    
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


    const renderPunishmentCard = (
        title: string,
        permissionId: any,
        costFn: (duration: number) => number,
        currentDuration: number,
        durationSetter: (duration: number) => void,
        isPunishedFlag: boolean,
        children: React.ReactNode,
        isCustomLogicDisabled?: boolean
    ) => {
        const hasPermission = actor.permissions?.includes(permissionId);
        if (!hasPermission || !canPunish) return null;
        
        const cost = costFn(currentDuration);

        return (
             <div className="p-3 border border-dashed border-red-500/50 rounded-lg space-y-2">
                <h4 className="font-bold text-center text-red-400">{title} (التكلفة: {cost} شرف)</h4>
                <div className="flex gap-2 items-center">
                    <Label className="text-xs shrink-0">المدة:</Label>
                    <Select value={String(currentDuration)} onValueChange={(v) => durationSetter(Number(v))}>
                        <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-900 text-white border-purple-500">
                            <SelectItem value="1">يوم واحد ({costFn(1)} شرف)</SelectItem>
                            <SelectItem value="2">يومان ({costFn(2)} شرف)</SelectItem>
                            <SelectItem value="3">3 أيام ({costFn(3)} شرف)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
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
                        {renderPunishmentCard('إذلال عام', 'can_send_global_taunt', getHonorCost, humiliationDuration, setHumiliationDuration, isAlreadyHumiliated, (
                            <>
                                <Input type="number" value={humiliationTax} onChange={e => setHumiliationTax(e.target.value)} placeholder="ضريبة الخلاص (كوينز)..." className="bg-slate-800 border-slate-600"/>
                                <Button className="w-full" variant="destructive" onClick={() => onHumiliate(target.uid, humiliationDuration, parseInt(humiliationTax, 10) || 0)} disabled={isAlreadyHumiliated}>
                                     {isAlreadyHumiliated ? "تم إذلاله بالفعل" : "إذلال"}
                                </Button>
                            </>
                        ))}
                        {renderPunishmentCard('تغيير اللقب', 'can_force_name_change', getHonorCost, decreeDuration, setDecreeDuration, false, (
                             <>
                                <Input value={decreeTitle} onChange={e => setDecreeTitle(e.target.value)} placeholder="اللقب المهين المؤقت..." className="bg-slate-800 border-slate-600"/>
                                <Button className="w-full" variant="destructive" onClick={() => onIssueDecree(target.uid, decreeTitle, decreeDuration)} disabled={!decreeTitle.trim()}>
                                    تأكيد تغيير اللقب
                                </Button>
                            </>
                        ))}
                         {renderPunishmentCard('فرض شخصية', 'can_force_name_change', getAvatarHonorCost, avatarPunishmentDuration, setAvatarPunishmentDuration, isAlreadyPunishedWithAvatar, (
                            <>
                                <Select value={selectedPunishmentAvatar} onValueChange={setSelectedPunishmentAvatar}>
                                    <SelectTrigger className="bg-slate-800 border-slate-600" placeholder="اختر شخصية عقاب..."><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 text-white border-purple-500">
                                        {availablePunishmentAvatars.map(avatarId => (
                                            <SelectItem key={avatarId} value={avatarId}>{avatarId.replace('.png', '')}</SelectItem>
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
            <PlayerAvatar avatarId={player.avatarId} className="w-20 h-20 rounded-full border-2 border-purple-400/50"/>
            <h4 className="font-bold mt-2 truncate w-full flex items-center justify-center gap-1">
                {player.name}
            </h4>
            {titleToShow && <Badge variant={currentDecree ? 'destructive' : 'secondary'} className="mt-1">{titleToShow}</Badge>}
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

export default function SocietyPyramid() {
    const { userProfile, socialRanks, refreshUserProfile, getSocialRankForUser } = useAuth();
    const { toast } = useToast();
    const [playersByRank, setPlayersByRank] = useState<Record<string, UserProfile[]>>({});
    const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
    const [selectedPlayer, setSelectedPlayer] = useState<UserProfile | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchedPlayers, setSearchedPlayers] = useState<UserProfile[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const sortedRanksForIteration = useMemo(() => [...socialRanks].sort((a, b) => a.threshold - b.threshold), [socialRanks]);
    
    const fetchPlayersForRank = useCallback(async (minPoints: number, maxPoints: number | null, rankName: string) => {
        setIsLoading(prev => ({ ...prev, [rankName]: true }));
        try {
            const players = await getUsersByRank(minPoints, maxPoints, 8);
            setPlayersByRank(prev => ({ ...prev, [rankName]: players }));
        } catch (error) {
            console.error(`Failed to fetch players for rank ${rankName}:`, error);
        } finally {
            setIsLoading(prev => ({ ...prev, [rankName]: false }));
        }
    }, []);

    useEffect(() => {
        if (socialRanks.length > 0) {
            sortedRanksForIteration.forEach((rank, index) => {
                const minPoints = rank.threshold;
                const maxPoints = index < sortedRanksForIteration.length - 1 ? sortedRanksForIteration[index + 1].threshold : null;
                fetchPlayersForRank(minPoints, maxPoints, rank.name);
            });
        }
    }, [socialRanks, sortedRanksForIteration, fetchPlayersForRank]);
    
    const handlePlayerClick = (player: UserProfile) => {
        if (player.uid !== userProfile?.uid) {
            setSelectedPlayer(player);
        }
    };

    const handleCloseModal = () => setSelectedPlayer(null);

    const refreshAllData = useCallback(async () => {
        if (socialRanks.length > 0) {
             for (const [index, rank] of sortedRanksForIteration.entries()) {
                const minPoints = rank.threshold;
                const maxPoints = index < sortedRanksForIteration.length - 1 ? sortedRanksForIteration[index + 1].threshold : null;
                await fetchPlayersForRank(minPoints, maxPoints, rank.name);
            }
        }
        if (refreshUserProfile) refreshUserProfile();
        handleCloseModal();
    }, [socialRanks, sortedRanksForIteration, fetchPlayersForRank, refreshUserProfile]);


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
    
    const handleIssueDecree = async (targetId: string, title: string, durationInDays: number) => {
        if (!userProfile) return;
        const result = await issueDecree(userProfile.uid, targetId, title, durationInDays);
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
        const users = await searchUsers(searchTerm.trim());
        setSearchedPlayers(users);
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
    
    // Display ranks from highest to lowest
    const sortedRanksForDisplay = useMemo(() => [...socialRanks].sort((a, b) => b.threshold - a.threshold), [socialRanks]);


    return (
        <>
            <div className="w-full md:w-auto md:min-w-[250px] relative mb-6">
                 <Input 
                    placeholder="ابحث عن لاعب..."
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-gray-800 border-purple-500/50 text-white focus:ring-purple-500"
                 />
                 <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>

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
                        const isTopRank = index === 0;

                        return (
                            <motion.div 
                                key={rank.name}
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
                            >
                                <Card className={cn(isTopRank ? 'bg-top-rank-card' : 'bg-common-card')}>
                                    <CardHeader className={cn("border-b-2", isTopRank ? "border-yellow-400/50" : "border-purple-500/30")}>
                                        <CardTitle className={cn(
                                            "flex items-center gap-4 text-2xl",
                                            isTopRank ? "text-yellow-900" : "text-purple-300"
                                        )}>
                                            <Icon className={cn("w-8 h-8", isTopRank ? "text-yellow-800" : "text-amber-400")} />
                                            <span>طبقة: {rank.name}</span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        {isLoading[rank.name] ? (
                                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                                {[...Array(8)].map((_, i) => <div key={i} className="w-full aspect-[3/4.5] bg-slate-700/50 animate-pulse rounded-lg" />)}
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
