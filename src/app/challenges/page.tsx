
"use client";

import SocietyChallenges from "../society/components/SocietyChallenges";
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Swords, CheckCircle, Trophy } from "lucide-react";
import type { Timestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';


export default function ChallengesPage() {
    const { markChallengeAsSeen, activeChallenges } = useAuth();

    useEffect(() => {
        const latestChallenge = activeChallenges.find(c => c.createdAt);
        if (markChallengeAsSeen && latestChallenge) {
            const latestChallengeTimestamp = latestChallenge.createdAt;
            // The object from useAuth might be a Date object or a Firestore Timestamp
            const dateToMark = (latestChallengeTimestamp instanceof Timestamp) 
                ? latestChallengeTimestamp.toDate() 
                : new Date(latestChallengeTimestamp);
            markChallengeAsSeen(dateToMark);
        }
    }, [markChallengeAsSeen, activeChallenges]);


    return (
        <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans">
            <div className="fixed inset-0 stars z-0"></div>
            <div className="fixed inset-0 twinkling z-0"></div>
             <main className="relative z-10 container mx-auto px-4 py-8">
                 <header className="text-center mb-8">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1, rotate: [0, -10, 10, -5, 5, 0] }}
                        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
                    >
                        <Trophy className="w-24 h-24 mx-auto text-yellow-400 drop-shadow-[0_5px_15px_rgba(250,204,21,0.4)]" />
                    </motion.div>
                    <motion.h1 
                        className="text-4xl md:text-5xl font-bold mt-4 text-purple-300 tracking-wider"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    >
                       ساحة البطولات
                    </motion.h1>
                     <motion.p 
                        className="text-lg text-gray-400 mt-2"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                    >
                        أثبت جدارتك، تنافس على المجد، واحصل على جوائز قيمة!
                    </motion.p>
                </header>

                <Tabs defaultValue="active" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-black/30 backdrop-blur-sm border border-purple-500/30 text-purple-300 mb-6">
                        <TabsTrigger value="active" className="gap-2"><Swords /> البطولات النشطة</TabsTrigger>
                        <TabsTrigger value="ended" className="gap-2"><CheckCircle /> البطولات المنتهية</TabsTrigger>
                    </TabsList>
                    <TabsContent value="active">
                        <SocietyChallenges filter="active" />
                    </TabsContent>
                     <TabsContent value="ended">
                        <SocietyChallenges filter="ended" />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    )
}
