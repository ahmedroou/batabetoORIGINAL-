
'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { Game, SocialRank, UserProfile, Challenge } from '@/types';
import { motion } from "framer-motion";
import { Megaphone } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Import newly created components
import HomeHeader from "./components/home/HomeHeader";
import UserProfileCard from "./components/home/UserProfileCard";
import GameGrid from "./components/home/GameGrid";
import LobbySection from "./components/home/LobbySection";
import HomeDialogs from "./components/home/Dialogs";
import WelcomeGuest from "./components/home/WelcomeGuest";
import MainLoadingSkeleton from "./components/home/MainLoadingSkeleton";

export default function Home() {
    const { user, userProfile, loading, socialRanks, getSocialRankForUser, activeChallenges, newChallengeAvailable, markChallengeAsSeen } = useAuth();
    const [announcement, setAnnouncement] = useState<string | null>(null);

    useEffect(() => {
        const unsubAnnouncement = onSnapshot(doc(db, "game_settings", "announcement"), (doc) => {
            if (doc.exists()) {
                setAnnouncement(doc.data().text || null);
            }
        });
        return () => unsubAnnouncement();
    }, []);

    const currentRank = useMemo(() => {
        if (!userProfile) return null;
        return getSocialRankForUser(userProfile.leaderboardPoints);
    }, [userProfile, getSocialRankForUser]);

    if (loading) {
        return <MainLoadingSkeleton />;
    }

    if (!user || !userProfile) {
        return <WelcomeGuest />;
    }

    return (
        <div className="relative min-h-screen">
            <HomeHeader userProfile={userProfile} />
            
            <main className="flex flex-col items-center justify-center p-4 md:p-8 pt-0 w-full">
                <motion.div 
                    className="w-full max-w-7xl animate-bounce-in space-y-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {announcement && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full max-w-5xl mx-auto mb-4 p-4 bg-primary/10 border border-primary/20 text-primary rounded-lg flex items-center justify-center gap-4 text-center"
                        >
                            <Megaphone className="h-6 w-6" />
                            <p className="font-semibold">{announcement}</p>
                        </motion.div>
                    )}

                    <UserProfileCard 
                        userProfile={userProfile} 
                        currentRank={currentRank} 
                        socialRanks={socialRanks}
                    />
                    
                    {activeChallenges.length > 0 && (
                        <div className="text-center">
                            <h2 className="text-3xl font-bold">تحديات نشطة</h2>
                            <p className="text-muted-foreground">انضم إلى التحديات الحالية واربح جوائز قيمة!</p>
                        </div>
                    )}
                    
                    <GameGrid />
                    
                    <LobbySection />

                </motion.div>
            </main>
            
            <HomeDialogs 
                user={user}
                userProfile={userProfile}
                activeChallenges={activeChallenges}
                newChallengeAvailable={newChallengeAvailable}
                markChallengeAsSeen={markChallengeAsSeen}
            />
        </div>
    );
}
