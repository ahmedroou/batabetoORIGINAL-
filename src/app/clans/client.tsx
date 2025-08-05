
"use client";

import { useState, useEffect } from 'react';
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

    useEffect(() => {
        const fetchClans = async () => {
            setIsLoadingClans(true);
            const fetchedClans = await getClans();
            setClans(fetchedClans);
            setIsLoadingClans(false);
        };
        fetchClans();
    }, []);

    if (loading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
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
        <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-br from-gray-900 via-purple-900/40 to-black text-white">
            <div className="fixed inset-0 stars z-0"></div>
            <div className="fixed inset-0 twinkling z-0"></div>
            
             <main className="relative z-10 container mx-auto px-4 py-8">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider flex items-center gap-3">
                       <Users className="w-12 h-12" />
                        صدارة الفرق
                    </h1>
                     <div className="flex items-center gap-4">
                        <ClanManagementDialogs userProfile={userProfile} />
                         <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                    </div>
                </header>
                
                <div className="space-y-4">
                     {isLoadingClans ? (
                        [...Array(3)].map((_, i) => (
                           <Card key={i} className="w-full h-24 bg-gray-800/50 animate-pulse" />
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
                                    "border-2 bg-gray-800/50 text-white backdrop-blur-sm shadow-lg hover:shadow-primary/30 transition-shadow duration-300",
                                    index === 0 ? "border-yellow-400 shadow-yellow-500/20" : 
                                    index === 1 ? "border-slate-400 shadow-slate-400/20" :
                                    index === 2 ? "border-orange-400 shadow-orange-400/20" :
                                    "border-purple-500/30"
                                )}>
                                    <CardContent className="p-4 flex items-center gap-4">
                                        <div className="text-3xl font-bold w-12 text-center text-slate-400">{index + 1}</div>
                                        <div className="relative w-16 h-16 flex-shrink-0">
                                            <div className="absolute inset-0 bg-gray-900 rounded-full" style={{ borderColor: clan.color, borderWidth: '3px' }}></div>
                                             <PlayerAvatar avatarId={clan.emblem || 'Avatar00.png'} className="w-16 h-16 p-1"/>
                                        </div>
                                        <div className="flex-grow">
                                            <h3 className="text-xl font-bold" style={{ color: clan.color }}>{clan.name}</h3>
                                            <p className="text-sm text-slate-300">مجموع النقاط: <span className="font-bold text-white">{clan.totalPoints}</span></p>
                                        </div>
                                        <div className="flex -space-x-4">
                                            {clan.members.map(member => {
                                                const Icon = member.role === 'leader' ? Crown : member.role === 'vice-leader' ? Shield : User;
                                                const iconColor = member.role === 'leader' ? "text-yellow-400" : member.role === 'vice-leader' ? "text-slate-300" : "text-slate-500";
                                                return (
                                                    <div key={member.id} className="relative group">
                                                         <PlayerAvatar avatarId={member.avatarId} className="w-10 h-10 border-2 border-gray-700 rounded-full"/>
                                                        <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5">
                                                            <Icon className={cn("w-4 h-4", iconColor)} />
                                                        </div>
                                                        <span className="absolute bottom-full mb-2 w-max px-2 py-1 bg-black text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
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
                            <p className="text-2xl text-gray-400">لا توجد فرق متاحة حاليًا.</p>
                            <p className="text-gray-500">كن أول من ينشئ فريقًا جديدًا!</p>
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
}

