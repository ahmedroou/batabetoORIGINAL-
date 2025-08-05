
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import type { Game, UserProfile, Player } from '@/types';
import { Timestamp } from 'firebase/firestore';

// UI Components
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Store, ArrowLeft, Loader2, Users, Puzzle, Gavel, Newspaper, TestTube2, MessageSquareWarning } from 'lucide-react';
import dynamic from 'next/dynamic';

// Admin Page Components
import QuestionManagementTab from './components/QuestionManagementTab';
import TestingTab from './components/TestingTab';
import NewsTab from './components/NewsTab';
import SocietyTab from './components/SocietyTab';
import ChallengesTab from './components/ChallengesTab';
import { GENIUS_CHALLENGES, type GeniusChallenge } from '@/data/genius-challenges';

// Server Actions
import { generateTestChallenge } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';


// Dynamically import the ChallengeHost to avoid SSR issues
const ChallengeHost = dynamic(() => import('@/components/game/king-of-genius/ChallengeHost').then(mod => mod.ChallengeHost), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center min-h-[40vh] gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">جاري تحميل التحدي...</p>
        </div>
    )
});


export default function AdminPage() {
    const router = useRouter();
    const { userProfile, loading } = useAuth();
    const { toast } = useToast();

    // State for Test Modal
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);
    const [testGame, setTestGame] = useState<Game | null>(null);
    const [testingChallenge, setTestingChallenge] = useState<GeniusChallenge | null>(null);


    useEffect(() => {
        if (!loading && !userProfile?.isAdmin) {
            router.push('/');
        }
    }, [userProfile, loading, router]);


    const handleTestChallenge = async (challenge: GeniusChallenge) => {
        setIsGeneratingTest(true);
        setTestingChallenge(challenge);
        try {
            const { puzzle } = await generateTestChallenge({ challengeId: challenge.id });
            const mockPlayer = { id: 'admin_test', name: 'Admin', avatarId: 'Avatar01.png', status: 'alive' as const, team: 'A' as const, leaderboardPoints: 0, score: 0 };
            let durationInSeconds = 90; // Default
            if (challenge.id === 'quick_math') durationInSeconds = 60;
            if (challenge.id === 'code_breaker') durationInSeconds = 45;
            if (challenge.id === 'hidden_maze') durationInSeconds = 40;
            if (challenge.id === 'smart_grid_puzzle') durationInSeconds = 120;

            const mockGame: Game = {
                id: 'TEST_MODE', hostId: 'admin_test', gameType: 'king-of-genius',
                players: [mockPlayer], playerUids: ['admin_test'], gameState: 'challenge_active',
                createdAt: Timestamp.now(),
                challengeState: {
                    puzzle: puzzle, results: [], playerProgress: {},
                    challengeEndsAt: Timestamp.fromMillis(Date.now() + durationInSeconds * 1000),
                },
            };
            setTestGame(mockGame);
            setIsTestModalOpen(true);
        } catch (error: any) {
            toast({ title: "Error Generating Test", description: error.message || "Could not generate the test puzzle.", variant: "destructive" });
        } finally {
            setIsGeneratingTest(false);
        }
    };


    if (loading || !userProfile?.isAdmin) {
         return (
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin" />
            </div>
        );
    }
    
    return (
        <main className="flex min-h-screen flex-col items-center p-4 bg-muted/40">
            <div className="w-full max-w-4xl space-y-8 py-8">
                 <div className="text-center relative">
                    <h1 className="text-3xl font-bold">لوحة تحكم الأدمن</h1>
                    <p className="text-muted-foreground">إدارة محتوى اللعبة وإعداداتها.</p>
                    <div className="absolute top-0 right-0 flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/admin/store"><Store className="mr-2" /> إدارة المتجر والألقاب</Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                            <ArrowLeft />
                        </Button>
                    </div>
                </div>
                
                 <Tabs defaultValue="society" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="society"><Gavel className='mr-2'/> المجتمع</TabsTrigger>
                        <TabsTrigger value="questions"><Puzzle className='mr-2'/> المحتوى</TabsTrigger>
                        <TabsTrigger value="news"><Newspaper className='mr-2' /> الأخبار</TabsTrigger>
                        <TabsTrigger value="challenges"><Users className='mr-2'/> التحديات</TabsTrigger>
                        <TabsTrigger value="testing"><TestTube2 className='mr-2'/> الاختبار</TabsTrigger>
                    </TabsList>

                     <TabsContent value="society">
                        <SocietyTab />
                    </TabsContent>
                    <TabsContent value="questions">
                        <QuestionManagementTab />
                    </TabsContent>
                     <TabsContent value="news">
                        <NewsTab />
                    </TabsContent>
                     <TabsContent value="challenges">
                        <ChallengesTab />
                    </TabsContent>
                    <TabsContent value="testing">
                        <TestingTab 
                            onTestChallenge={handleTestChallenge}
                            isGeneratingTest={isGeneratingTest}
                            testingChallenge={testingChallenge}
                        />
                    </TabsContent>
                 </Tabs>
            </div>
            
             <Dialog open={isTestModalOpen} onOpenChange={(isOpen) => { setIsTestModalOpen(isOpen); setTestGame(null); setTestingChallenge(null); }}>
                <DialogContent className="max-w-4xl bg-slate-50">
                    <DialogHeader>
                        <DialogTitle>اختبار: {testingChallenge?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center justify-center p-4 min-h-[60vh] bg-slate-100 rounded-md">
                       {testGame?.gameType === 'king-of-genius' && testingChallenge && (
                            <ChallengeHost game={testGame} player={testGame.players[0]} self={testGame.players[0]} challenge={testingChallenge} />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </main>
    );
}

