
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Challenge, Game } from '@/types';
import { getChallenges } from '@/lib/actions/challenges';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDollarSign, Diamond, Swords, Calendar, Play, Users, DoorOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { joinGameRoom } from '@/lib/actions/room';
import { useToast } from '@/hooks/use-toast';

const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'draw-and-guess': 'لعبة رسمة',
    'prison': 'السجن',
    'snakes_and_scissors': 'السلم والمقص',
};

const ChallengeCard = ({ challenge, index }: { challenge: Challenge; index: number; }) => {
    const { user, userProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [isJoining, setIsJoining] = useState<string | null>(null);

    const handleJoin = async (roomId: string) => {
        if (!user || !userProfile) {
            toast({ title: 'يجب تسجيل الدخول أولاً', variant: 'destructive' });
            return;
        }
        setIsJoining(roomId);
        const result = await joinGameRoom(roomId, user.uid, userProfile.avatarId, challenge.id);
        if (result.success && result.gameId && result.player) {
            sessionStorage.setItem(`player-${result.gameId}`, JSON.stringify(result.player));
            router.push(`/game/${result.gameId}`);
        } else {
            toast({ title: "خطأ في الانضمام", description: result.error, variant: "destructive" });
        }
        setIsJoining(null);
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.4, delay: index * 0.1 }
        }
    };
    
    return (
        <motion.div variants={cardVariants} initial="hidden" animate="visible">
            <Card className="h-full flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
                <CardHeader>
                    <CardTitle className="text-2xl text-purple-300">{challenge.title}</CardTitle>
                    <CardDescription className="text-gray-400">
                        بطولة في لعبة: <strong>{GAME_TYPE_NAMES[challenge.gameType]}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                    {challenge.prize?.value > 0 && (
                        <div className="flex items-center gap-2">
                             {challenge.prize.type === 'coins' ? <CircleDollarSign className="w-5 h-5 text-yellow-400" /> : <Diamond className="w-5 h-5 text-blue-400" />}
                            <span>الجائزة: <span className="font-bold">{challenge.prize.value} {challenge.prize.type === 'coins' ? 'كوينز' : 'ألماس'}</span></span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-gray-400" />
                        <span>الحد الأدنى للبدء: <span className="font-bold">{challenge.minPlayersToStart}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        <span>ينتهي: <span className="font-bold">{formatDistanceToNow(challenge.endsAt, { addSuffix: true, locale: ar })}</span></span>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                    <p className="text-sm text-center text-gray-400 w-full border-t border-purple-500/20 pt-2">غرف البطولة المتاحة</p>
                    {challenge.gameRoomIds?.map(room => (
                         <Button key={room.id} className="w-full bg-purple-600 hover:bg-purple-700" onClick={() => handleJoin(room.id)} disabled={!!isJoining}>
                            {isJoining === room.id ? "جاري الانضمام..." : (
                                <>
                                    <div className="flex justify-between items-center w-full">
                                        <span className="flex items-center gap-2"><DoorOpen/>انضم للغرفة</span>
                                        <span className="flex items-center gap-1 text-xs bg-black/20 px-2 py-1 rounded"><Users/>{room.playerCount}/{challenge.minPlayersToStart * 2}</span>
                                    </div>
                                </>
                            )}
                        </Button>
                    ))}
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
