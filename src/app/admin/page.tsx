
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Store, ArrowLeft, Loader2, ShieldCheck, Users, Puzzle, Gavel, Megaphone, TestTube2 } from 'lucide-react';
import dynamic from 'next/dynamic';

// Admin Page Components
import UserManagementTab from './components/UserManagementTab';
import QuestionManagementTab from './components/QuestionManagementTab';
import JudgePowersTab from './components/JudgePowersTab';
import AnnouncementTab from './components/AnnouncementTab';
import TestingTab from './components/TestingTab';
import { KillerGame } from '@/components/game/killer/KillerGame';
import { GENIUS_CHALLENGES, type GeniusChallenge } from '@/data/genius-challenges';

// Server Actions
import { generateTestChallenge, generateTestKillerGame } from '@/app/actions';
import { resetAllUserAvatars } from '@/lib/actions/admin';
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


export type DeletionParams = { 
    game: 'trap-answer' | 'prison'; 
    category?: string; 
    searchTerm?: string; 
    answerSearchTerm?: string; 
    all?: boolean; 
    duplicates?: { threshold: number };
};

export type AlertType = 'deleteQuestions' | 'deleteCategory' | 'resetAvatars' | 'kickPlayer';

export default function AdminPage() {
    const router = useRouter();
    const { userProfile, loading } = useAuth();
    const { toast } = useToast();

    // State for Test Modal
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);
    const [testGame, setTestGame] = useState<Game | null>(null);
    const [testingChallenge, setTestingChallenge] = useState<GeniusChallenge | null>(null);
    const [killerTestPlayerView, setKillerTestPlayerView] = useState<Player | null>(null);

    // Confirmation Dialog State
    const [dialogContent, setDialogContent] = useState<{ title: string; description: string; onConfirm: () => void; confirmText: string; } | null>(null);
    const [isDialogActionLoading, setIsDialogActionLoading] = useState(false);


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
            const mockPlayer = { id: 'admin_test', name: 'Admin', avatarId: 'Avatar01.png', status: 'alive' as const, team: 'A' as const, leaderboardPoints: 0 };
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

    const handleTestKillerGame = async () => {
        setIsGeneratingTest(true);
        try {
            const { game } = await generateTestKillerGame();
            if (game) {
                setTestGame(game);
                setKillerTestPlayerView(game.players[0]); // Start view with the first player
                setIsTestModalOpen(true);
            } else {
                throw new Error("Failed to create a test game.");
            }
        } catch (error: any) {
             toast({ title: "Error Generating Test", description: error.message || "Could not generate the killer test game.", variant: "destructive" });
        } finally {
            setIsGeneratingTest(false);
        }
    };


    const handleResetAvatars = async () => {
        setIsDialogActionLoading(true);
        const result = await resetAllUserAvatars();
        if (result.success) {
            toast({ title: "نجاح!", description: `تم إعادة ضبط شخصيات ${result.count} لاعب.` });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsDialogActionLoading(false);
        setDialogContent(null);
    };

     const openResetAvatarsDialog = () => {
        setDialogContent({
            title: "هل أنت متأكد تمامًا؟",
            description: "هذا الإجراء سيعيد تعيين شخصية كل لاعب إلى الشخصية الافتراضية، وسيقوم بإزالة جميع الشخصيات التي قاموا بفتحها. لا يمكن التراجع عن هذا الإجراء.",
            onConfirm: handleResetAvatars,
            confirmText: "نعم، أعد التعيين",
        });
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
                
                 <Tabs defaultValue="users" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="users"><Users className='mr-2' /> المستخدمون</TabsTrigger>
                        <TabsTrigger value="questions"><Puzzle className='mr-2'/> الأسئلة</TabsTrigger>
                        <TabsTrigger value="judge"><Gavel className='mr-2'/> صلاحيات القاضي</TabsTrigger>
                        <TabsTrigger value="announcements"><Megaphone className='mr-2'/> الإعلانات</TabsTrigger>
                        <TabsTrigger value="testing"><TestTube2 className='mr-2'/> الاختبار</TabsTrigger>
                    </TabsList>

                    <TabsContent value="users">
                        <UserManagementTab openResetAvatarsDialog={openResetAvatarsDialog} />
                    </TabsContent>
                    <TabsContent value="questions">
                        <QuestionManagementTab />
                    </TabsContent>
                    <TabsContent value="judge">
                        <JudgePowersTab />
                    </TabsContent>
                    <TabsContent value="announcements">
                        <AnnouncementTab />
                    </TabsContent>
                    <TabsContent value="testing">
                        <TestingTab 
                            onTestChallenge={handleTestChallenge}
                            onTestKillerGame={handleTestKillerGame}
                            isGeneratingTest={isGeneratingTest}
                            testingChallenge={testingChallenge}
                        />
                    </TabsContent>
                 </Tabs>
            </div>
            
             <Dialog open={isTestModalOpen} onOpenChange={(isOpen) => { setIsTestModalOpen(isOpen); if (!isOpen) setTestGame(null); setTestingChallenge(null); }}>
                <DialogContent className="max-w-4xl bg-slate-50">
                    <DialogHeader>
                        <DialogTitle>اختبار: {testGame?.gameType === 'killer' ? "المحقق والقاتل" : testingChallenge?.name}</DialogTitle>
                         {testGame?.gameType === 'killer' && (
                            <div className='flex flex-wrap gap-2 pt-2'>
                                {testGame.players.map(p => (
                                    <Button key={p.id} size="sm" variant={killerTestPlayerView?.id === p.id ? "default" : "outline"} onClick={() => setKillerTestPlayerView(p)}>
                                        {p.name} ({p.role})
                                    </Button>
                                ))}
                            </div>
                         )}
                    </DialogHeader>
                    <div className="flex items-center justify-center p-4 min-h-[60vh] bg-slate-100 rounded-md">
                       {testGame?.gameType === 'king-of-genius' && testingChallenge && (
                            <ChallengeHost game={testGame} player={testGame.players[0]} self={testGame.players[0]} challenge={testingChallenge} />
                        )}
                        {testGame?.gameType === 'killer' && killerTestPlayerView && (
                            <KillerGame game={testGame} player={killerTestPlayerView} self={killerTestPlayerView} setGame={setTestGame} />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!dialogContent} onOpenChange={(open) => !open && setDialogContent(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{dialogContent?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{dialogContent?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDialogContent(null)}>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={dialogContent?.onConfirm}
                            className={buttonVariants({ variant: 'destructive' })}
                            disabled={isDialogActionLoading}
                        >
                            {isDialogActionLoading ? <Loader2 className="animate-spin" /> : dialogContent?.confirmText}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
