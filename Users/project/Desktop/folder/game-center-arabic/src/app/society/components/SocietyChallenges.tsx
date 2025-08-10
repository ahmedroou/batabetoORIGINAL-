
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Challenge, Game, ChallengePrize } from '@/types';
import { getChallenges, joinChallenge } from '@/lib/actions/challenges';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDollarSign, Diamond, Swords, Calendar, Play, Users, DoorOpen, Trophy, Star, Shield, Flag, Loader2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { GAME_TYPE_NAMES } from '@/types';
import { useAuth } from '@/hooks/useAuth';


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

const ChallengeCard = ({ challenge, index }: { challenge: Challenge; index: number; }) => {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();
    const [isJoining, setIsJoining] = useState(false);
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        const calculateTimeLeft = () => {
            if (!challenge.endsAt) return "غير محدد";
            // Ensure challenge.endsAt is a Date object before calling getTime()
            const endsAtDate = challenge.endsAt instanceof Date ? challenge.endsAt : new Date(challenge.endsAt);
            if (isNaN(endsAtDate.getTime())) return "تاريخ غير صالح";

            const difference = endsAtDate.getTime() - new Date().getTime();
            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                if (days > 0) return `${days} يوم و ${hours} ساعة`;
                if (hours > 0) return `${hours} ساعة`;
                return `أقل من ساعة`;
            }
            return "انتهت";
        };

        setTimeLeft(calculateTimeLeft());
        const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 60000); // Update every minute
        return () => clearInterval(timer);
    }, [challenge.endsAt]);


    const handleJoin = async () => {
        if (!user || !userProfile) return;
        setIsJoining(true);
        const result = await joinChallenge(challenge.id, user.uid);
        if (result.success) {
            toast({ title: "لقد انضممت إلى البطولة بنجاح!" });
            // You might want to refresh the challenges list or user profile here
        } else {
            toast({ title: "خطأ في الانضمام", description: result.error, variant: 'destructive' });
        }
        setIsJoining(false);
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
    const isEnded = !challenge.endsAt || new Date(challenge.endsAt).getTime() < new Date().getTime();


    return (
        <motion.div variants={cardVariants} initial="hidden" animate="visible">
            <Card className={cn(
                "h-full flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20",
                isEnded && "opacity-60 bg-gray-900/70 border-gray-700/50"
                )}>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-2xl text-purple-300">{challenge.title}</CardTitle>
                         <div className={cn(
                             "text-sm font-bold  px-3 py-1 rounded-full",
                             isEnded ? "bg-red-900/50 text-red-300" : "bg-black/30 text-yellow-300"
                             )}>
                           {timeLeft}
                        </div>
                    </div>
                    <CardDescription className="text-gray-400 pt-2">
                        الهدف: {challenge.targetPoints} نقطة صدارة | اللعبة: {challenge.specificGameType === 'all' ? 'كل الألعاب' : GAME_TYPE_NAMES[challenge.specificGameType as Game['gameType']]}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                    <div className="space-y-2">
                        <div>
                            <p className="font-bold text-amber-300 flex items-center gap-2"><Trophy className="w-4 h-4"/>المركز الأول</p>
                            <PrizeDisplay prizes={challenge.firstPlacePrize} />
                        </div>
                         <div>
                            <p className="font-bold text-slate-300 flex items-center gap-2"><Trophy className="w-4 h-4"/>المركز الثاني</p>
                            <PrizeDisplay prizes={challenge.secondPlacePrize} />
                        </div>
                         <div>
                            <p className="font-bold text-orange-400 flex items-center gap-2"><Trophy className="w-4 h-4"/>المركز الثالث</p>
                            <PrizeDisplay prizes={challenge.thirdPlacePrize} />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    <div className="flex justify-between items-center w-full">
                        <span className="flex items-center gap-1 text-xs"><Users/>{challenge.participantCount || 0} مشارك</span>
                         <Button onClick={handleJoin} disabled={isJoining || isParticipant || isEnded} className="bg-purple-600 hover:bg-purple-700">
                             {isJoining ? <Loader2 className="animate-spin" /> : isParticipant ? 'أنت مشارك' : isEnded ? 'انتهت البطولة' : 'انضم للبطولة'}
                         </Button>
                    </div>
                </CardFooter>
            </Card>
        </motion.div>
    );
}


export default function SocietyChallenges() {
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchChallenges = async () => {
            setIsLoading(true);
            const fetchedChallenges = await getChallenges();
            setChallenges(fetchedChallenges);
            setIsLoading(false);
        };
        fetchChallenges();
    }, []);

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isLoading ? (
                    [...Array(4)].map((_, i) => (
                         <Card key={i} className="h-full flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
                            <CardHeader><Skeleton className="h-8 w-3/4 bg-gray-700" /></CardHeader>
                             <CardContent className="space-y-4">
                                <Skeleton className="h-6 w-full bg-gray-700" />
                                <Skeleton className="h-6 w-1/2 bg-gray-700" />
                            </CardContent>
                             <CardFooter>
                                <Skeleton className="h-10 w-full bg-gray-700" />
                            </CardFooter>
                         </Card>
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

    