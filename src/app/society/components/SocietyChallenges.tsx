
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import type { Challenge, ChallengePrize, UserProfile, EntryFee, GameKing, SocialRank } from '@/types';
import { getChallenges, joinChallenge, getChallengeDetails, getAllChallengesForAdmin } from '@/lib/actions/challenges';
import { getGameKings, getKingOfGames } from '@/lib/actions/user';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDollarSign, Diamond, Swords, Calendar, Play, Users, DoorOpen, Trophy, Star, Shield, Flag, Loader2, ListOrdered, Crown } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { GAME_TYPE_NAMES } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent as AlertDialogContentAlt, AlertDialogDescription as AlertDialogDescriptionAlt, AlertDialogFooter as AlertDialogFooterAlt, AlertDialogHeader as AlertDialogHeaderAlt, AlertDialogTitle as AlertDialogTitleAlt } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Timestamp } from 'firebase/firestore';

const PRIZE_ICONS: Record<ChallengePrize['type'], React.ElementType> = {
    coins: CircleDollarSign,
    diamonds: Diamond,
    honorPoints: Shield
};

const PRIZE_COLORS: Record<ChallengePrize['type'], string> = {
    coins: 'text-yellow-400',
    diamonds: 'text-blue-400',
    honorPoints: 'text-green-500'
};

const PrizeDisplay = ({ prizes }: { prizes: ChallengePrize[] }) => {
    if (!prizes || prizes.length === 0) return <p className="text-sm text-gray-500">لا توجد جائزة</p>;
    return (
        <div className="flex flex-wrap gap-2">
            {prizes.map((prize, index) => {
                const Icon = PRIZE_ICONS[prize.type];
                return (
                    <div key={index} className="flex items-center gap-1 text-sm bg-black/20 px-2 py-1 rounded-md">
                        <Icon className={cn("w-4 h-4", PRIZE_COLORS[prize.type])} />
                        <span className="font-bold">{prize.value}</span>
                    </div>
                )
            })}
        </div>
    );
};

const ChallengeLeaderboardDialog = ({ challenge, trigger }: { challenge: Challenge, trigger: React.ReactNode }) => {
    const { getSocialRankForUser, socialRanks } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [participants, setParticipants] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [gameKings, setGameKings] = useState<Record<string, GameKing>>({});
    const [kingOfGames, setKingOfGames] = useState<UserProfile | null>(null);

    const fetchDetails = useCallback(async () => {
        if (!isOpen) return;
        setIsLoading(true);
        const [details, kings, kog] = await Promise.all([
            getChallengeDetails(challenge.id),
            getGameKings(),
            getKingOfGames(),
        ]);
        if (details) {
            setParticipants(details.participants || []);
        }
        setGameKings(kings);
        setKingOfGames(kog);
        setIsLoading(false);
    }, [isOpen, challenge.id]);
    
    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="bg-gray-900 border-purple-500 text-white max-w-lg">
                <DialogHeader className="text-center">
                    <DialogTitle className="text-2xl text-purple-300">{challenge.title}</DialogTitle>
                    <DialogDescription className="text-gray-400">
                        أفضل 10 لاعبين في صدارة البطولة
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>
                    ) : (
                        <ScrollArea className="h-96">
                            <div className="space-y-2 pr-4">
                                {participants.length > 0 ? (
                                    participants.map((participant, index) => {
                                        const rank = getSocialRankForUser(participant.leaderboardPoints);
                                        const isKingOfGames = kingOfGames?.uid === participant.uid;
                                        const gameKingTitle = Object.values(gameKings).find(k => k.kingId === participant.uid);
                                        const rankIcon = rank?.icon as React.ElementType | undefined;

                                        return (
                                        <div key={participant.uid} className="flex justify-between items-center bg-gray-800 p-2 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-lg w-6 text-center text-gray-400">{index + 1}</span>
                                                <PlayerAvatar avatarId={participant.avatarId} className="w-10 h-10"/>
                                                <div className="flex flex-col">
                                                    <p className="font-semibold flex items-center gap-1.5">
                                                        {participant.name}
                                                        {isKingOfGames && <Crown className="w-4 h-4 text-yellow-300 fill-yellow-400" />}
                                                        {gameKingTitle && !isKingOfGames && <Crown className="w-4 h-4 text-amber-400" />}
                                                    </p>
                                                     {rank && rankIcon && (
                                                        <Badge variant="secondary" className="w-fit text-xs">
                                                            {React.createElement(rankIcon, {className: "w-3 h-3 ml-1"})}
                                                            {rank.name}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="font-bold text-lg text-yellow-400">{challenge.scores[participant.uid] || 0} نقطة</p>
                                        </div>
                                    )})
                                ) : (
                                    <p className="text-center text-gray-500 h-64 flex items-center justify-center">لا يوجد مشاركون بعد.</p>
                                )}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

const EntryFeeDisplay = ({ entryFee }: { entryFee?: EntryFee }) => {
    if (!entryFee || entryFee.value <= 0) {
        return <Badge className="bg-green-500/20 text-green-300 border-green-500/30">انضمام مجاني!</Badge>;
    }
    
    const Icon = entryFee.type === 'coins' ? CircleDollarSign : Trophy;
    const text = entryFee.type === 'coins' ? 'كوينز' : 'نقاط صدارة';
    
    return (
        <Badge className="bg-yellow-500/20 text-yellow-200 border-yellow-500/30 gap-1.5">
            <Icon className="w-4 h-4" />
            <span>رسوم الانضمام: {entryFee.value} {text}</span>
        </Badge>
    );
};

const ChallengeCard = ({ challenge, index, isEnded }: { challenge: Challenge; index: number; isEnded: boolean; }) => {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();
    const [isJoining, setIsJoining] = useState(false);
    const [isConfirmingJoin, setIsConfirmingJoin] = useState(false);
    const [progress, setProgress] = useState(0);
    const topThree = challenge.topParticipants || [];

    useEffect(() => {
        if (isEnded) {
            setProgress(100);
            return;
        }
        const calculateProgress = () => {
            if (!challenge.createdAt || !challenge.endsAt) return;
            const createdAt = (challenge.createdAt as Timestamp)?.toDate();
            const endsAt = (challenge.endsAt as Date);
            if (!createdAt || !endsAt) return;
            const totalDuration = endsAt.getTime() - createdAt.getTime();
            const elapsed = Date.now() - createdAt.getTime();
            const progressPercentage = Math.min(100, (elapsed / totalDuration) * 100);
            setProgress(progressPercentage);
        };
        calculateProgress();
        const timer = setInterval(calculateProgress, 60000);
        return () => clearInterval(timer);
    }, [challenge.createdAt, challenge.endsAt, isEnded]);


    const handleJoin = async () => {
        if (!user || !userProfile) return;
        setIsJoining(true);
        const result = await joinChallenge(challenge.id, user.uid);
        if (result.success) {
            toast({ title: "لقد انضممت إلى البطولة بنجاح!" });
        } else {
            toast({ title: "خطأ في الانضمام", description: result.error, variant: 'destructive' });
        }
        setIsJoining(false);
        setIsConfirmingJoin(false);
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.4, delay: index * 0.1 }
        }
    };
    
    const isParticipant = userProfile && challenge.participantIds?.includes(userProfile.uid);

    return (
        <motion.div variants={cardVariants} initial="hidden" animate="visible" className="h-full">
            <Card className={cn(
                "h-full flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20 relative overflow-hidden",
                isEnded && "opacity-60 bg-gray-900/70 border-gray-700/50"
                )}>
                 <CardHeader className="border-b border-white/10 pb-4">
                    <div className="flex justify-between items-start mb-2">
                        <CardTitle className="text-xl text-purple-300 flex items-center gap-2">
                             <Swords className="w-5 h-5"/>
                             {challenge.title}
                        </CardTitle>
                        <Badge variant={isEnded ? "destructive" : "secondary"}>{isEnded ? "منتهية" : "نشطة"}</Badge>
                    </div>
                     <CardDescription className="text-gray-400 text-sm">
                        الهدف: {challenge.targetPoints} نقطة صدارة | اللعبة: {challenge.specificGameType === 'all' ? 'كل الألعاب' : GAME_TYPE_NAMES[challenge.specificGameType as Game['gameType']]}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-4 pt-4">
                    <div>
                        <h4 className="font-semibold text-gray-300 mb-2 text-sm">الجوائز:</h4>
                         <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-yellow-400 shrink-0"/>
                                <span className="font-bold text-xs w-16">المركز الأول:</span>
                                <PrizeDisplay prizes={challenge.firstPlacePrize} />
                            </div>
                            <div className="flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-slate-400 shrink-0"/>
                                 <span className="font-bold text-xs w-16">المركز الثاني:</span>
                                <PrizeDisplay prizes={challenge.secondPlacePrize} />
                            </div>
                            <div className="flex items-center gap-2">
                                 <Trophy className="w-5 h-5 text-orange-400 shrink-0"/>
                                 <span className="font-bold text-xs w-16">المركز الثالث:</span>
                                <PrizeDisplay prizes={challenge.thirdPlacePrize} />
                            </div>
                        </div>
                     </div>
                     
                    {topThree.length > 0 && (
                         <div>
                            <h4 className="font-semibold text-gray-300 mb-2 text-sm">أفضل 3 لاعبين حاليًا:</h4>
                             <div className="space-y-1">
                                {topThree.map((player, idx) => (
                                    <div key={player.uid} className="flex justify-between items-center bg-black/20 p-1 rounded-md text-xs">
                                        <div className="flex items-center gap-2">
                                             <span className="font-bold w-4">{idx+1}.</span>
                                            <PlayerAvatar avatarId={player.avatarId} className="w-6 h-6"/>
                                            <span className="font-semibold">{player.name}</span>
                                        </div>
                                        <span className="font-bold text-yellow-300">{challenge.scores[player.uid] || 0} نقطة</span>
                                    </div>
                                ))}
                            </div>
                         </div>
                    )}

                </CardContent>
                <CardFooter className="flex-col gap-2 pt-4 border-t border-white/10">
                     <div className="w-full space-y-1">
                        <div className="flex justify-between text-xs text-gray-400">
                             <span>تقدم الوقت</span>
                             <span>{challenge.participantCount || 0} مشارك</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </div>
                    <div className="flex justify-between items-center w-full mt-2">
                         <EntryFeeDisplay entryFee={challenge.entryFee} />
                          <ChallengeLeaderboardDialog challenge={challenge} trigger={
                             <Button variant="link" size="sm" className="text-purple-300 px-0">
                                <ListOrdered className="ml-1 w-4 h-4"/>
                                عرض التفاصيل
                            </Button>
                        }/>
                    </div>
                     <Button onClick={() => setIsConfirmingJoin(true)} disabled={isJoining || isParticipant || isEnded} className="w-full bg-purple-600 hover:bg-purple-700 mt-2">
                         {isJoining ? <Loader2 className="animate-spin" /> : isParticipant ? 'أنت مشارك' : isEnded ? 'انتهت البطولة' : 'انضم للبطولة'}
                     </Button>
                </CardFooter>
                 <AlertDialog open={isConfirmingJoin} onOpenChange={setIsConfirmingJoin}>
                    <AlertDialogContentAlt>
                        <AlertDialogHeaderAlt>
                            <AlertDialogTitleAlt>تأكيد الانضمام إلى البطولة</AlertDialogTitleAlt>
                            <AlertDialogDescriptionAlt>
                                هل أنت متأكد من رغبتك في الانضمام إلى بطولة "{challenge.title}"؟
                                {challenge.entryFee && challenge.entryFee.value > 0 && (
                                    <span className="block mt-2 font-bold text-yellow-500">
                                        سيتم خصم {challenge.entryFee.value} {challenge.entryFee.type === 'coins' ? 'كوينز' : 'نقاط صدارة'} من رصيدك.
                                    </span>
                                )}
                            </AlertDialogDescriptionAlt>
                        </AlertDialogHeaderAlt>
                        <AlertDialogFooterAlt>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={handleJoin} disabled={isJoining} className="bg-purple-600 hover:bg-purple-700">
                                {isJoining ? <Loader2 className="animate-spin" /> : 'تأكيد الانضمام'}
                            </AlertDialogAction>
                        </AlertDialogFooterAlt>
                    </AlertDialogContentAlt>
                 </AlertDialog>
            </Card>
        </motion.div>
    );
}


export default function SocietyChallenges({ filter = 'active' }: { filter?: 'active' | 'ended' }) {
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchChallenges = async () => {
            setIsLoading(true);
            const fetchedChallenges = await getAllChallengesForAdmin(); // Fetch all and filter client-side
            setChallenges(fetchedChallenges);
            setIsLoading(false);
        };
        fetchChallenges();
    }, []);

    const filteredChallenges = challenges.filter(c => {
        const isEnded = !c.endsAt || new Date(c.endsAt).getTime() < new Date().getTime();
        return filter === 'active' ? !isEnded : isEnded;
    });

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isLoading ? (
                    [...Array(4)].map((_, i) => (
                         <Card key={i} className="h-[420px] flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
                            <CardHeader><Skeleton className="h-8 w-3/4 bg-gray-700" /></CardHeader>
                             <CardContent className="space-y-4 flex-grow">
                                <Skeleton className="h-6 w-full bg-gray-700" />
                                <Skeleton className="h-6 w-1/2 bg-gray-700" />
                                <Skeleton className="h-12 w-full bg-gray-700" />
                            </CardContent>
                             <CardFooter>
                                <Skeleton className="h-10 w-full bg-gray-700" />
                            </CardFooter>
                         </Card>
                    ))
                ) : filteredChallenges.length > 0 ? (
                    filteredChallenges.map((challenge, index) => (
                       <ChallengeCard key={challenge.id} challenge={challenge} index={index} isEnded={filter === 'ended'} />
                    ))
                ) : (
                    <div className="col-span-full text-center py-16">
                        <p className="text-2xl text-gray-400">
                           {filter === 'active' ? 'لا توجد تحديات نشطة حاليًا.' : 'لا توجد تحديات منتهية لعرضها.'}
                        </p>
                        <p className="text-gray-500">
                           {filter === 'active' ? 'عد قريبًا للتحقق من جديد!' : ''}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
