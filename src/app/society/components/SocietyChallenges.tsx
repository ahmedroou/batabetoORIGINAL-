"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Challenge, Game } from '@/types';
import { getChallenges } from '@/lib/actions/challenges';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDollarSign, Diamond, Swords, Calendar, Play, Users, DoorOpen, Trophy, Star, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { joinGameRoom } from '@/lib/actions/room';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';


const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'draw-and-guess': 'لعبة رسمة',
    'prison': 'السجن',
    'snakes_and_scissors': 'السلم والمقص',
};

const PRIZE_ICONS = {
    coins: CircleDollarSign,
    diamonds: Diamond,
    leaderboardPoints: Star,
    honorPoints: Shield
};

const PRIZE_COLORS = {
    coins: 'text-yellow-400',
    diamonds: 'text-blue-400',
    leaderboardPoints: 'text-amber-500',
    honorPoints: 'text-green-500'
};

const ChallengeCard = ({ challenge, index }: { challenge: Challenge; index: number; }) => {
    const { user, userProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [isJoining, setIsJoining] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const calculateTimeLeft = () => {
            const difference = new Date(challenge.endsAt).getTime() - new Date().getTime();
            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                return `${days}ي ${hours}س ${minutes}د`;
            }
            return "انتهى";
        };

        setTimeLeft(calculateTimeLeft());
        const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 60000); // Update every minute
        return () => clearInterval(timer);
    }, [challenge.endsAt]);


    const handleJoin = async (roomId: string) => {
        if (!user || !userProfile) {
            toast({ title: 'يجب تسجيل الدخول أولاً', variant: 'destructive' });
            return;
        }
        
        // Handle entry fee
        const { type, value } = challenge.entryFee;
        if (value > 0) {
            if (type === 'coins' && userProfile.coins < value) {
                toast({ title: "ليس لديك ما يكفي من الكوينز", variant: "destructive" });
                return;
            }
            if (type === 'leaderboardPoints' && userProfile.leaderboardPoints < value) {
                toast({ title: "ليس لديك ما يكفي من نقاط الصدارة", variant: "destructive" });
                return;
            }
        }
        
        setIsJoining(roomId);
        const result = await joinGameRoom(roomId, user.uid, userProfile.avatarId, challenge.id);
        if (result.success && result.gameId && result.player) {
            sessionStorage.setItem(`player-${result.gameId}`, JSON.stringify(result.player));
            router.push(`/game/${result.gameId}`);
        } else {
            toast({ title: "خطأ في الانضمام", description: result.error, variant: "destructive" });
             setIsJoining(null);
        }
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.4, delay: index * 0.1 }
        }
    };
    
    const PrizeIcon = PRIZE_ICONS[challenge.prize.type] || Trophy;
    const EntryFeeIcon = PRIZE_ICONS[challenge.entryFee.type as keyof typeof PRIZE_ICONS] || CircleDollarSign;

    return (
        <motion.div variants={cardVariants} initial="hidden" animate="visible">
            <Card className="h-full flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-2xl text-purple-300">{challenge.title}</CardTitle>
                         <div className="text-sm font-bold bg-black/30 text-yellow-300 px-3 py-1 rounded-full">
                           ينتهي بعد: {timeLeft}
                        </div>
                    </div>
                    <CardDescription className="text-gray-400 pt-2">
                        بطولة في لعبة: <strong>{GAME_TYPE_NAMES[challenge.gameType]}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                     <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2 p-2 rounded-md bg-black/20">
                            <PrizeIcon className={cn("w-5 h-5", PRIZE_COLORS[challenge.prize.type])} />
                            <span>الجائزة: <span className="font-bold">{challenge.prize.value}</span></span>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded-md bg-black/20">
                            {challenge.entryFee.value === 0 ? (
                                <>
                                    <DoorOpen className="w-5 h-5 text-green-400"/>
                                    <span className="font-bold">دخول مجاني</span>
                                </>
                            ) : (
                                 <>
                                    <EntryFeeIcon className={cn("w-5 h-5", PRIZE_COLORS[challenge.entryFee.type as keyof typeof PRIZE_COLORS])} />
                                    <span>الدخول: <span className="font-bold">{challenge.entryFee.value}</span></span>
                                </>
                            )}
                        </div>
                         <div className="flex items-center gap-2 p-2 rounded-md bg-black/20">
                            <Users className="w-5 h-5 text-gray-400" />
                            <span>الحد الأدنى للبدء: <span className="font-bold">{challenge.minPlayersToStart}</span></span>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                    <p className="text-sm text-center text-gray-400 w-full border-t border-purple-500/20 pt-2">الغرفة المتاحة</p>
                    {challenge.gameRoomIds?.length > 0 ? (
                        challenge.gameRoomIds.map(room => (
                            <Button key={room.id} className="w-full bg-purple-600 hover:bg-purple-700" onClick={() => handleJoin(room.id)} disabled={!!isJoining}>
                                {isJoining === room.id ? "جاري الانضمام..." : (
                                    <>
                                        <div className="flex justify-between items-center w-full">
                                            <span className="flex items-center gap-2"><Play/>انضم للغرفة</span>
                                            <span className="flex items-center gap-1 text-xs bg-black/20 px-2 py-1 rounded"><Users/>{room.playerCount}/{challenge.minPlayersToStart * 2}</span>
                                        </div>
                                    </>
                                )}
                            </Button>
                        ))
                    ) : (
                         <p className="text-center text-gray-500 p-4">لا توجد غرف متاحة حاليًا. سيتم إنشاء واحدة قريبًا.</p>
                    )}
                </CardFooter>
            </Card>
        </motion.div>
    );
}


export default function SocietyChallenges() {
    const { userProfile } = useAuth();
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [isLoadingChallenges, setIsLoadingChallenges] = useState(true);

    useEffect(() => {
        const fetchChallenges = async () => {
            setIsLoadingChallenges(true);
            const fetchedChallenges = await getChallenges();
            setChallenges(fetchedChallenges);
            setIsLoadingChallenges(false);
        };
        fetchChallenges();
    }, []);

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isLoadingChallenges ? (
                    [...Array(4)].map((_, i) => (
                        <div key={i} className="space-y-2">
                            <Skeleton className="h-64 w-full bg-gray-700" />
                            <Skeleton className="h-6 w-3/4 bg-gray-700" />
                            <Skeleton className="h-6 w-1/2 bg-gray-700" />
                        </div>
                    ))
                ) : challenges.length > 0 ? (
                    challenges.map((challenge, index) => (
                       <ChallengeCard key={challenge.id} challenge={challenge} index={index} />
                    ))
                ) : (
                    <div className="col-span-full text-center py-16">
                        <p className="text-2xl text-gray-400">لا توجد تحديات متاحة حاليًا.</p>
                        <p className="text-gray-500">عد قريبًا للتحقق من جديد!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
