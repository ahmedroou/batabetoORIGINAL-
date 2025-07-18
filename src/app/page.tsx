
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createGameRoom, joinGameRoom } from "@/lib/actions/room";
import { useToast } from "@/hooks/use-toast";
import { DoorOpen, PlusCircle, Users, ShieldCheck, LogOut, Sprout, Wand, User, BrainCircuit, Hand, Bomb, ChevronLeft, ChevronRight, CheckCircle, Edit, Trophy } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AnimatePresence, motion } from "framer-motion";
import { AVATAR_IDS } from "@/data/avatars";
import { updateUserAvatar } from "@/lib/actions/user";

const FunkyFace = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        fill="currentColor"
    >
        <path d="M100,20A80,80,0,1,1,20,100,80,80,0,0,1,100,20Zm0,140a60,60,0,1,0-60-60A60,60,0,0,0,100,160Z" opacity="0.1"></path>
        <path d="M100,30A70,70,0,1,1,30,100,70.08,70.08,0,0,1,100,30Zm-2.5,120.4a58.42,58.42,0,0,0,5,0c18.6-3,33.4-15.5,39.9-32.9a8,8,0,0,0-15-5.8,45.42,45.42,0,0,1-50.1,0,8,8,0,0,0-15,5.8C64.1,134.9,78.9,147.4,97.5,150.4Z" opacity="0.2"></path>
        <path d="M100,40A60,60,0,1,1,40,100,60.07,60.07,0,0,1,100,40ZM72,84a12,12,0,1,0,12,12A12,12,0,0,0,72,84Zm56,0a12,12,0,1,0,12,12A12,12,0,0,0,128,84Z"></path>
        <path d="M100,40a60.07,60.07,0,0,0-60,60,60,60,0,0,0,120,0A60.07,60.07,0,0,0,100,40Zm28,44a12,12,0,1,1,12-12A12,12,0,0,1,128,84Zm-56,0a12,12,0,1,1,12-12A12,12,0,0,1,72,84Z" opacity="0.4"></path>
        <path d="M136.6,111.5c-4.9,13.2-16.1,23.3-30.8,26.4a8,8,0,0,1-7.6-15.5c8.3-1.8,15.1-7,18.8-13.8a8,8,0,1,1,15,5.9Z"></path>
    </svg>
);

type LoadingState = "create-who-am-i" | "create-killer" | "create-king-of-genius" | "create-the-slap-game" | "create-trap-answer" | "join" | null;

export default function Home() {
    const [gameId, setGameId] = useState("");
    const [isLoading, setIsLoading] = useState<LoadingState>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { user, userProfile, loading } = useAuth();
    
    const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
    const [isEditingAvatar, setIsEditingAvatar] = useState(false);
    const [isSubmittingAvatar, setIsSubmittingAvatar] = useState(false);

    useEffect(() => {
        if (!loading && userProfile?.avatarId) {
            setSelectedAvatarId(userProfile.avatarId);
            setIsEditingAvatar(false);
        } else if (!loading && userProfile && !userProfile.avatarId) {
            const randomAvatar = AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
            setSelectedAvatarId(randomAvatar);
            setIsEditingAvatar(true);
        }
    }, [userProfile, loading]);


    const handleAvatarCycle = useCallback((direction: 'next' | 'prev') => {
        if (!selectedAvatarId) return;
        const currentIndex = AVATAR_IDS.indexOf(selectedAvatarId);
        const nextIndex = direction === 'next' 
          ? (currentIndex + 1) % AVATAR_IDS.length
          : (currentIndex - 1 + AVATAR_IDS.length) % AVATAR_IDS.length;
        setSelectedAvatarId(AVATAR_IDS[nextIndex]);
    }, [selectedAvatarId]);

    const handleAvatarSave = async () => {
        if (!user || !selectedAvatarId) return;
        setIsSubmittingAvatar(true);
        try {
            await updateUserAvatar(user.uid, selectedAvatarId);
            toast({ title: "تم تحديث شخصيتك بنجاح!" });
            setIsEditingAvatar(false);
        } catch (error) {
            toast({ title: "خطأ", description: "فشل تحديث الشخصية.", variant: "destructive" });
        } finally {
            setIsSubmittingAvatar(false);
        }
      };


    const handleCreate = async (gameType: 'who-am-i' | 'killer' | 'king-of-genius' | 'the-slap-game' | 'trap-answer') => {
        if (!user || !userProfile?.avatarId) {
            toast({ title: "الرجاء اختيار شخصية من ملفك الشخصي أولاً", variant: "destructive", duration: 3000 });
            return;
        }
        
        setIsLoading(`create-${gameType}`);

        const result = await createGameRoom(user.uid, gameType, userProfile.avatarId);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
            setIsLoading(null);
        } else if(result.gameId && result.player) {
            sessionStorage.setItem(`player-${result.gameId}`, JSON.stringify(result.player));
            router.push(`/game/${result.gameId}`);
        }
    };
    
    const handleJoin = async () => {
        if (!user || !userProfile?.avatarId) {
             toast({ title: "الرجاء اختيار شخصية من ملفك الشخصي أولاً", variant: "destructive", duration: 3000 });
            return;
        }
        setIsLoading("join");
        const result = await joinGameRoom(gameId, user.uid, userProfile.avatarId);
         if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
            setIsLoading(null);
        } else if(result.gameId && result.player) {
            sessionStorage.setItem(`player-${result.gameId}`, JSON.stringify(result.player));
            router.push(`/game/${result.gameId}`);
        }
    };

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/');
    };
    
    const renderLoading = () => (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8">
            <div className="w-full max-w-md space-y-8">
                <Skeleton className="w-32 h-32 rounded-full mx-auto" />
                <Skeleton className="h-10 w-3/4 mx-auto" />
                <Skeleton className="h-8 w-1/2 mx-auto" />
                <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            </div>
        </main>
    );

    const renderGuestView = () => (
        <Card className="w-full max-w-md animate-bounce-in">
            <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 text-2xl"><Users /> مرحبًا بك!</CardTitle>
                <CardDescription>ابدأ بتسجيل الدخول أو إنشاء حساب جديد للعب.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Link href="/login" passHref>
                    <Button className="w-full" size="lg">تسجيل الدخول</Button>
                </Link>
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">أو</span>
                    </div>
                </div>
                <Link href="/signup" passHref>
                    <Button variant="secondary" className="w-full" size="lg">إنشاء حساب جديد</Button>
                </Link>
            </CardContent>
        </Card>
    );

    const renderUserLobby = () => (
         <div className="w-full max-w-5xl animate-bounce-in space-y-6">
            <Card>
                 <CardHeader className="flex flex-col items-center text-center">
                    
                    <div className="flex flex-col items-center space-y-4">
                        {selectedAvatarId && (
                            <div className="flex items-center gap-4">
                            {isEditingAvatar && (
                                <Button variant="ghost" size="icon" onClick={() => handleAvatarCycle('prev')}><ChevronRight /></Button>
                            )}
                            <PlayerAvatar avatarId={selectedAvatarId} className="w-32 h-32 rounded-full border-4 border-primary shadow-xl" />
                            {isEditingAvatar && (
                                <Button variant="ghost" size="icon" onClick={() => handleAvatarCycle('next')}><ChevronLeft /></Button>
                            )}
                            </div>
                        )}
                        {isEditingAvatar ? (
                                <div className="flex gap-2">
                                    <Button onClick={handleAvatarSave} disabled={isSubmittingAvatar}>
                                        <CheckCircle className="ml-2" /> {isSubmittingAvatar ? 'جاري الحفظ...' : 'اختر هذه الشخصية'}
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" onClick={() => setIsEditingAvatar(true)} size="sm">
                                    <Edit className="ml-2" /> تغيير الشخصية
                                </Button>
                            )}
                    </div>

                    <CardTitle className="flex items-center justify-center gap-2 text-2xl pt-4">مرحبًا بك يا {userProfile?.name || user?.displayName}!</CardTitle>
                    <CardDescription className="mt-1">اختر لعبة لتبدأ مغامرة جديدة أو انضم إلى أصدقائك.</CardDescription>
                </CardHeader>
             </Card>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Sprout /> اكتشف من أنا؟</CardTitle>
                        <CardDescription className="flex-grow">لعبة كشف الأسرار والصداقة. هل تعرف أصدقاءك حقاً؟</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                        <Button
                            onClick={() => handleCreate('who-am-i')}
                            disabled={!!isLoading}
                            className="w-full"
                        >
                            <PlusCircle /> {isLoading === 'create-who-am-i' ? 'جاري الإنشاء...' : 'إنشاء لعبة'}
                        </Button>
                    </CardContent>
                </Card>
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Wand/> المحقق والقاتل</CardTitle>
                        <CardDescription className="flex-grow">لعبة غموض وخداع. قاتل متسلسل بينكم، ومحقق سري يحاول كشفه.</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                         <Button
                            onClick={() => handleCreate('killer')}
                            disabled={!!isLoading}
                            className="w-full"
                        >
                            <PlusCircle /> {isLoading === 'create-killer' ? 'جاري الإنشاء...' : 'إنشاء لعبة'}
                        </Button>
                    </CardContent>
                </Card>
                <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BrainCircuit /> ساحة العباقرة</CardTitle>
                        <CardDescription className="flex-grow">تحديات سرعة وذكاء بين فريقين. أثبت أن فريقك هو الأذكى!</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                         <Button
                            onClick={() => handleCreate('king-of-genius')}
                            disabled={!!isLoading}
                            className="w-full"
                        >
                            <PlusCircle /> {isLoading === 'create-king-of-genius' ? 'جاري الإنشاء...' : 'إنشاء لعبة'}
                        </Button>
                    </CardContent>
                </Card>
                 <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Hand /> لعبة الصفعة</CardTitle>
                        <CardDescription className="flex-grow">اكتشف من وصف من، وتجنب التعرض للصفع!</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                         <Button
                            onClick={() => handleCreate('the-slap-game')}
                            disabled={!!isLoading}
                            className="w-full"
                        >
                            <PlusCircle /> {isLoading === 'create-the-slap-game' ? 'جاري الإنشاء...' : 'إنشاء لعبة'}
                        </Button>
                    </CardContent>
                </Card>
                 <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Bomb /> الجواب المفخخ</CardTitle>
                        <CardDescription className="flex-grow">أجب بخداع، وصوّت بذكاء. هل يمكنك تضليل أصدقائك وكشف الحقيقة؟</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                         <Button
                            onClick={() => handleCreate('trap-answer')}
                            disabled={!!isLoading}
                            className="w-full"
                        >
                            <PlusCircle /> {isLoading === 'create-trap-answer' ? 'جاري الإنشاء...' : 'إنشاء لعبة'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
            
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">أو انضم للعبة</span>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex gap-2">
                        <Input
                            placeholder="أدخل معرف الغرفة"
                            value={gameId}
                            onChange={(e) => setGameId(e.target.value.toUpperCase())}
                            className="text-center tracking-widest font-mono h-12 text-lg"
                            maxLength={6}
                            disabled={!!isLoading}
                        />
                        <Button
                            onClick={handleJoin}
                            disabled={!gameId.trim() || !!isLoading}
                            className="px-6"
                            size="lg"
                            variant="secondary"
                        >
                            <DoorOpen /> {isLoading === 'join' ? '...' : 'انضمام'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );

    if (loading) {
        return renderLoading();
    }

    return (
        <div className="relative min-h-screen">
             <div className="absolute top-4 left-4 z-10 flex gap-2">
                {userProfile?.isAdmin && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link href="/admin">
                                    <Button variant="ghost" size="icon">
                                        <ShieldCheck className="h-6 w-6 text-primary" />
                                    </Button>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>لوحة تحكم الأدمن</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
                {user && (
                    <>
                         <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Link href="/leaderboard">
                                        <Button variant="ghost" size="icon">
                                            <Trophy className="h-6 w-6 text-yellow-500" />
                                        </Button>
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>لوحة الصدارة</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Link href="/profile">
                                        <Button variant="ghost" size="icon">
                                            <User className="h-6 w-6 text-primary" />
                                        </Button>
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>ملفك الشخصي</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={handleSignOut}>
                                        <LogOut className="h-6 w-6 text-destructive" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>تسجيل الخروج</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </>
                )}
            </div>
            <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 bg-background animate-fade-in">
                <div className="text-center mb-8">
                    <FunkyFace className="w-32 h-32 text-primary mx-auto animate-pulse-glow" />
                    <h1 className="text-5xl font-bold text-primary mt-4">بطابيطو</h1>
                </div>

                {user ? renderUserLobby() : renderGuestView()}
            </main>
        </div>
    );
}
