
"use client";

import SocietyChallenges from "../society/components/SocietyChallenges";
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';


export default function ChallengesPage() {
    const { markChallengeAsSeen, activeChallenges } = useAuth();

    useEffect(() => {
        if (markChallengeAsSeen && activeChallenges.length > 0) {
            markChallengeAsSeen(activeChallenges[0].createdAt);
        }
    }, [markChallengeAsSeen, activeChallenges]);


    return (
        <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans">
            <div className="fixed inset-0 stars z-0"></div>
            <div className="fixed inset-0 twinkling z-0"></div>
             <main className="relative z-10 container mx-auto px-4 py-8">
                 <header className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider">
                       التحديات والبطولات
                    </h1>
                     <p className="text-lg text-gray-400 mt-2">انضم إلى التحديات النشطة وتنافس على الجوائز!</p>
                </header>
                <SocietyChallenges />
            </main>
        </div>
    )
}
