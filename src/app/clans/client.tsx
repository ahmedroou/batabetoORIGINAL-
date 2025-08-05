
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import type { Clan, UserProfile } from '@/types';
import { getClans } from '@/lib/actions/clans';
import { Loader2, Users, Crown, Shield, User, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ClanManagementDialogs } from './ClanManagementDialogs';

export default function ClansClient() {
    const { user, userProfile, loading } = useAuth();
    const router = useRouter();
    const [clans, setClans] = useState<Clan[]>([]);
    const [isLoadingClans, setIsLoadingClans] = useState(true);

    const memoizedGetClans = useMemo(() => {
        return async () => {
            setIsLoadingClans(true);
            const fetchedClans = await getClans();
            setClans(fetchedClans);
            setIsLoadingClans(false);
        };
    }, []);


    useEffect(() => {
        memoizedGetClans();
    }, [memoizedGetClans]);

    if (loading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-gray-100">
                <Loader2 className="h-10 w-10 animate-spin text-red-500" />
            </div>
        );
    }
     if (!user) {
        router.push('/login');
        return null;
    }
    
    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: {
                delay: i * 0.1,
                duration: 0.5,
                ease: "easeOut"
            }
        })
    };

    return (
        <div className="min-h-screen w-full bg-gray-100 text-gray-800">
            <main className="container mx-auto px-4 py-8">
                <header className="flex justify-between items-center mb-8 border-b-2 pb-4 border-gray-200">
                     <div className="flex items-center gap-4">
                        <ClanManagementDialogs userProfile={userProfile} />
                         <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                    </div>
                    <div className="text-right">
                        <h1 className="text-4xl md:text-5xl font-bold text-red-600 flex items-center justify-end gap-3">
                           صدارة الفرق <Users className="w-12 h-12" />
                        </h1>
                        <p className="text-gray-500 mt-1">تنافس مع فريقك للوصول إلى القمة!</p>
                    </div>
                </header>
                
                <div className="space-y-4">
                     {isLoadingClans ? (
                        [...Array(3)].map((_, i) => (
                           <Card key={i} className="w-full h-24 bg-gray-200 animate-pulse" />
                        ))
                    ) : clans.length > 0 ? (
                        clans.map((clan, index) => (
                            <motion.div
                                key={clan.id}
                                custom={index}
                                variants={cardVariants}
                                initial="hidden"
                                animate="visible"
                            >
                                <Card className={cn(
                                    "border-2 bg-white text-gray-800 shadow-lg hover:shadow-xl transition-shadow duration-300",
                                    index === 0 ? "border-red-500 shadow-red-500/20" : 
                                    index === 1 ? "border-pink-400 shadow-pink-400/20" :
                                    index === 2 ? "border-gray-500 shadow-gray-500/20" :
                                    "border-gray-200"
                                )}>
                                    <CardContent className="p-4 flex items-center gap-4">
                                        <div className="text-3xl font-bold w-12 text-center text-gray-400">{index + 1}</div>
                                        <div className="relative w-16 h-16 flex-shrink-0">
                                             <PlayerAvatar avatarId={clan.emblem || 'Avatar00.png'} className="w-16 h-16 p-1 rounded-full"/>
                                        </div>
                                        <div className="flex-grow">
                                            <h3 className="text-xl font-bold" style={{ color: clan.color || '#dc2626' }}>{clan.name}</h3>
                                            <p className="text-sm text-gray-500">مجموع النقاط: <span className="font-bold text-gray-700">{clan.totalPoints}</span></p>
                                        </div>
                                        <div className="flex -space-x-4">
                                            {clan.members.slice(0, 5).map(member => {
                                                const Icon = member.role === 'leader' ? Crown : member.role === 'vice-leader' ? Shield : User;
                                                const iconColor = member.role === 'leader' ? "text-yellow-500" : member.role === 'vice-leader' ? "text-gray-500" : "text-gray-400";
                                                return (
                                                    <div key={member.id} className="relative group">
                                                         <PlayerAvatar avatarId={member.avatarId} className="w-10 h-10 border-2 border-white rounded-full"/>
                                                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow">
                                                            <Icon className={cn("w-4 h-4", iconColor)} />
                                                        </div>
                                                        <span className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                            {member.name}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))
                    ) : (
                        <div className="col-span-full text-center py-16">
                            <p className="text-2xl text-gray-500">لا توجد فرق متاحة حاليًا.</p>
                            <p className="text-gray-400">كن أول من ينشئ فريقًا جديدًا!</p>
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
}

