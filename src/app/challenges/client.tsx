
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import type { Challenge } from '@/types';
import { getChallenges } from '@/lib/actions/challenges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ArrowLeft } from 'lucide-react';
import ChallengeCard from './ChallengeCard';
import AdminControls from './AdminControls';

export default function ChallengesClient() {
    const { user, userProfile, loading } = useAuth();
    const router = useRouter();
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

    return (
        <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-br from-gray-900 via-purple-900/40 to-black text-white font-code">
            <div className="fixed inset-0 stars z-0"></div>
            <div className="fixed inset-0 twinkling z-0"></div>
            
            <main className="relative z-10 container mx-auto px-4 py-8">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider">
                        ساحة التحديات
                    </h1>
                     <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                </header>

                {userProfile?.isAdmin && (
                    <div className="mb-12">
                        <AdminControls />
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {isLoadingChallenges ? (
                        [...Array(4)].map((_, i) => (
                            <div key={i} className="space-y-2">
                                <Skeleton className="h-48 w-full bg-gray-700" />
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
            </main>
        </div>
    );
}
