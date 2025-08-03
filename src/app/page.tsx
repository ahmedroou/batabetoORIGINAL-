

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createGameRoom, joinGameRoom } from "@/lib/actions/room";
import { useToast } from "@/hooks/use-toast";
import { DoorOpen, PlusCircle, Users, ShieldCheck, LogOut, Wand, User, BrainCircuit, Bomb, ChevronLeft, ChevronRight, CheckCircle, Edit, Crown, Megaphone, Shield, KeyRound, UserPlus, Trophy, RefreshCw, LogIn, CircleDollarSign, Gavel, TrendingUp, Mail as MailIcon, VenetianMask, Star, Swords, Building } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AnimatePresence, motion } from "framer-motion";
import { AVATAR_IDS } from "@/data/avatars";
import { createLeague, joinLeague, getSocialRankForUser, getMail, claimMailCoins, markMailAsRead, getLeagueData } from "@/lib/actions/user";
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, Timestamp } from "firebase/firestore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Game, SocialRank, UserProfile, League, Mail } from "@/types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";


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

type LoadingState = "create-king-of-genius" | "create-trap-answer" | "create-prison" | "create-behind-the-mask" | "create-word_war" | "join" | "league" | null;

interface LastChampion {
    name: string;
    avatarId: string;
}

const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'prison': 'السجن',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
};


const MiniLeagueLeaderboard = ({ leagueId }: { leagueId: string }) => {
    const [league, setLeague] = useState<League | null>(null);
    const [members, setMembers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const { socialRanks } = useAuth();
    const router = useRouter();

    useEffect(() => {
        const fetchLeague = async () => {
            setLoading(true);
            const { league, members } = await getLeagueData(leagueId);
            setLeague(league);
            setMembers(members);
            setLoading(false);
        };
        fetchLeague();
    }, [leagueId]);

    if (loading) {
        return (
            <Card>
                <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
                <CardContent className="space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </CardContent>
            </Card>
        );
    }
    
    if (!league) return null;

    return (
        <Card className="h-full">
            <CardHeader className="bg-gray-800 text-white">
                <CardTitle className="truncate flex items-center gap-2">
                    <TrendingUp/>
                    دوري: {league.name}
                </CardTitle>
                <CardDescription className="text-gray-400">أفضل اللاعبين في هذا الدوري.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96">
                    <div className="space-y-2 py-4">
                        {members.length > 0 ? (
                            members.sort((a,b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0)).slice(0, 10).map((user, index) => {
                                const socialRank = getSocialRankForUser(user.leaderboardPoints || 0, socialRanks);
                                const RankIcon = socialRank?.icon;
                                const rank = index + 1;
                                return (
                                    <div key={user.uid} className={cn(
                                        "flex items-center justify-between p-2 rounded-md", 
                                        `bg-gradient-to-r ${rank === 1 ? "from-yellow-100 to-amber-100 dark:from-yellow-800/50 dark:to-amber-800/50" : rank === 2 ? "from-slate-100 to-gray-200 dark:from-slate-700/50 dark:to-gray-600/50" : rank === 3 ? "from-orange-100 to-yellow-50 dark:from-orange-800/50 dark:to-yellow-800/50" : "bg-muted/50"}`,
                                        rank <= 3 && "border-2",
                                        rank === 1 && "border-amber-400",
                                        rank === 2 && "border-slate-400",
                                        rank === 3 && "border-orange-400",
                                    )}>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold text-lg w-6 text-center ${rank <= 3 ? 'text-amber-600' : ''}`}>{rank}</span>
                                            <PlayerAvatar avatarId={user.avatarId} className="w-8 h-8" />
                                            <div>
                                                <span className="font-semibold text-sm">{user.name}</span>
                                                {socialRank && RankIcon && (
                                                    <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                                                        <RankIcon className="w-3 h-3 text-amber-500" />
                                                        {socialRank.name}
                                                    </p>
                                               )}
                                            </div>
                                        </div>
                                        <div className="font-bold text-sm text-primary">{user.leaderboardPoints || 0} نقطة</div>
                                    </div>
                                )
                            })
                        ) : (
                             <p className="text-center text-muted-foreground py-4">لا يوجد لاعبون في هذا الدوري بعد.</p>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
            <CardFooter>
                 <Button variant="outline" className="w-full" onClick={() => router.push(`/leagues/${leagueId}`)}>
                    عرض كل الترتيب
                </Button>
            </CardFooter>
        </Card>
    )
}

const gameCards = [
    { type: 'king-of-genius', icon: BrainCircuit, title: 'ساحة العباقرة', description: 'تحديات ذكاء وسرعة بديهة بين فريقين.' },
    { type: 'word_war', icon: Swords, title: 'حرب الكلمات', description: 'لمّح لفريقك لكشف كلماتكم قبل الخصم.' },
    { type: 'trap-answer', icon: Bomb, title: 'الجواب المفخخ', description: 'اكتب جوابًا خاطئًا ومقنعًا لخداع الآخرين.' },
    { type: 'prison', icon: Gavel, title: 'السجن', description: 'زايد، أجب، وابقَ خارج السجن لتفوز.' },
    { type: 'behind-the-mask', icon: VenetianMask, title: 'خلف القناع', description: 'اكشف هوية القاتل قبل أن يقضي عليكم جميعًا.' }
];

export default function Home() {
    const [gameId, setGameId] = useState("");
    const [isLoading, setIsLoading] = useState<LoadingState>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { user, userProfile, loading, socialRanks, refreshUserProfile } = useAuth();
    const [currentRank, setCurrentRank] = useState<SocialRank | null>(null);
    
    const [announcement, setAnnouncement] = useState<string | null>(null);

    const [isCreateLeagueOpen, setIsCreateLeagueOpen] = useState(false);
    const [isJoinLeagueOpen, setIsJoinLeagueOpen] = useState(false);
    const [leagueName, setLeagueName] = useState("");
    const [leaguePassword, setLeaguePassword] = useState("");
    const [joinLeagueId, setJoinLeagueId] = useState("");
    const [joinLeaguePassword, setJoinLeaguePassword] = useState("");
    const [isMyLeaguesOpen, setIsMyLeaguesOpen] = useState(false);
    
    const [activeLobbies, setActiveLobbies] = useState<Game[]>([]);
    const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);

    const [isMailboxOpen, setIsMailboxOpen] = useState(false);
    const [userMail, setUserMail] = useState<Mail[]>([]);
    const [isFetchingMail, setIsFetchingMail] = useState(false);
    const [isClaimingCoins, setIsClaimingCoins] = useState<string | null>(null); 


    useEffect(() => {
        if (!loading && userProfile) {
            const rank = getSocialRankForUser(userProfile.leaderboardPoints, socialRanks);
            setCurrentRank(rank);
        }
    }, [userProfile, loading, socialRanks]);


    useEffect(() => {
        const unsubAnnouncement = onSnapshot(doc(db, "game_settings", "announcement"), (doc) => {
            if (doc.exists()) {
                setAnnouncement(doc.data().text || null);
            }
        });
        return () => unsubAnnouncement();
    }, []);
    
     useEffect(() => {
        const q = query(
            collection(db, 'games'), 
            where('gameState', '==', 'lobby'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const now = Timestamp.now();
            const lobbies = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Game))
                .filter(lobby => lobby.expiresAt && lobby.expiresAt.toMillis() > now.toMillis());
            
            setActiveLobbies(lobbies);
            setIsLoadingLobbies(false);
        }, (error: any) => {
            console.error("Error fetching active lobbies:", error);
            setIsLoadingLobbies(false);
        });

        return () => unsubscribe();
    }, [toast]);

    const handleCreate = async (gameType: 'king-of-genius' | 'trap-answer' | 'prison' | 'behind-the-mask' | 'word_war') => {
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
    
    const handleJoin = async (id: string = gameId) => {
        if (!user || !userProfile?.avatarId) {
             toast({ title: "الرجاء اختيار شخصية من ملفك الشخصي أولاً", variant: "destructive", duration: 3000 });
            return;
        }
        if (!id.trim()) {
            toast({ title: "الرجاء إدخال رمز الغرفة", variant: "destructive"});
            return;
        }
        setIsLoading("join");
        const result = await joinGameRoom(id, user.uid, userProfile.avatarId);
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

    const handleCreateLeague = async () => {
        if (!user || !leagueName.trim() || leaguePassword.length !== 5) {
            toast({ title: "الرجاء ملء اسم الدوري وإدخال كلمة سر من 5 أرقام", variant: "destructive" });
            return;
        }
        setIsLoading('league');
        const result = await createLeague(user.uid, leagueName, leaguePassword);
        if (result.success) {
            toast({ title: "تم إنشاء الدوري بنجاح!", description: `معرف الدوري: ${result.leagueId}` });
            setIsCreateLeagueOpen(false);
            setLeagueName('');
            setLeaguePassword('');
        } else {
            toast({ title: "خطأ في الإنشاء", description: result.error, variant: "destructive" });
        }
        setIsLoading(null);
    };

    const handleJoinLeague = async () => {
        if (!user || !joinLeagueId.trim() || !joinLeaguePassword.trim()) {
            toast({ title: "الرجاء ملء جميع الحقول", variant: "destructive" });
            return;
        }
        setIsLoading('league');
        const result = await joinLeague(user.uid, joinLeagueId.toUpperCase(), joinLeaguePassword);
        if (result.success) {
            toast({ title: "تم الانضمام للدوري بنجاح!" });
            setIsJoinLeagueOpen(false);
            setJoinLeagueId('');
            setJoinLeaguePassword('');
        } else {
            toast({ title: "خطأ في الانضمام", description: result.error, variant: "destructive" });
        }
        setIsLoading(null);
    };

    const handleOpenMailbox = async () => {
        if (!user) return;
        setIsMailboxOpen(true);
        setIsFetchingMail(true);
        const mail = await getMail(user.uid);
        setUserMail(mail);
        setIsFetchingMail(false);
    };

    const handleMarkAsRead = async (mailId: string) => {
        const mailIndex = userMail.findIndex(m => m.id === mailId);
        if (mailIndex !== -1 && !userMail[mailIndex].isRead) {
            setUserMail(prev => {
                const newMail = [...prev];
                newMail[mailIndex].isRead = true;
                return newMail;
            });
            await markMailAsRead(user!.uid, mailId);
        }
    };
    
    const handleClaimCoins = async (mailId: string) => {
        if (!user) return;
        setIsClaimingCoins(mailId);
        const result = await claimMailCoins(user.uid, mailId);
        if(result.success) {
            toast({ title: "نجاح!", description: "تمت إضافة الكوينز إلى رصيدك."});
            setUserMail(prev => prev.map(m => m.id === mailId ? {...m, coinsClaimed: true} : m));
            if(refreshUserProfile) refreshUserProfile();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive"});
        }
        setIsClaimingCoins(null);
    };
    
    const unreadMailCount = useMemo(() => userMail.filter(m => !m.isRead).length, [userMail]);

    const sortedRanks = useMemo(() => [...socialRanks].sort((a,b) => a.threshold - b.threshold), [socialRanks]);
    
    const { nextRank, pointsForCurrentRank, pointsForNextRank } = useMemo(() => {
        const currentRankIndex = currentRank ? sortedRanks.findIndex(r => r.threshold === currentRank.threshold) : -1;
        const nextRank = (currentRankIndex !== -1 && currentRankIndex < sortedRanks.length - 1) 
            ? sortedRanks[currentRankIndex + 1] 
            : null;
        const pointsForCurrentRank = currentRank?.threshold || 0;
        const pointsForNextRank = nextRank?.threshold || userProfile?.leaderboardPoints || 0;
        return { nextRank, pointsForCurrentRank, pointsForNextRank };
    }, [currentRank, sortedRanks, userProfile?.leaderboardPoints]);
    
    const progress = useMemo(() => {
        if (!nextRank) return 100; // Max rank
        if (userProfile?.leaderboardPoints === undefined) return 0;
        const totalPointsForLevel = pointsForNextRank - pointsForCurrentRank;
        const pointsInCurrentLevel = userProfile.leaderboardPoints - pointsForCurrentRank;
        return totalPointsForLevel > 0 ? (pointsInCurrentLevel / totalPointsForLevel) * 100 : 100;
    }, [userProfile?.leaderboardPoints, pointsForCurrentRank, pointsForNextRank, nextRank]);
    
    useEffect(() => {
        if (user && !isFetchingMail) {
            getMail(user.uid).then(setUserMail);
        }
    }, [user, isFetchingMail]);
    
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
    
    const ActiveLobbiesList = () => (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users /> الغرف النشطة</CardTitle>
                <CardDescription>انضم إلى أي غرفة متاحة أو أنشئ غرفتك الخاصة.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                        {isLoadingLobbies ? (
                            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                        ) : activeLobbies.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground">
                                <p>لا توجد غرف نشطة حاليًا.</p>
                                <p>كن أول من ينشئ غرفة جديدة!</p>
                            </div>
                        ) : (
                            activeLobbies.map(lobby => (
                                <div key={lobby.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <PlayerAvatar avatarId={lobby.players[0]?.avatarId || 'Avatar01.png'} className="w-10 h-10" />
                                        <div>
                                            <p className="font-bold">{GAME_TYPE_NAMES[lobby.gameType] || 'لعبة غير معروفة'}</p>
                                            <p className="text-sm text-muted-foreground">المضيف: {lobby.players[0]?.name}</p>
                                        </div>
                                    </div>
                                     <div className="flex items-center gap-4">
                                        <div className="text-center">
                                            <Users className="mx-auto" />
                                            <span className="text-sm font-bold">{lobby.players.length}/8</span>
                                        </div>
                                        <Button onClick={() => handleJoin(lobby.id)} disabled={!!isLoading} size="sm">
                                            {isLoading === 'join' ? '...' : 'انضمام'}
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );


    const renderUserLobby = () => {
        const RankIcon = currentRank?.icon;
        
        return (
            <motion.div 
              className="w-full max-w-7xl animate-bounce-in space-y-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
                <Card>
                  <CardContent className="flex flex-col md:flex-row items-center gap-6 p-4">
                        <div className="relative">
                            {userProfile && (
                                <PlayerAvatar avatarId={userProfile.avatarId} className="w-24 h-24 rounded-full border-4 border-primary shadow-xl" />
                            )}
                            <Button variant="outline" size="icon" className="absolute -bottom-2 -right-2 rounded-full h-8 w-8 bg-background" asChild>
                                <Link href="/profile"><Edit className="w-4 h-4" /></Link>
                            </Button>
                        </div>
                        <div className="flex-grow text-center md:text-right">
                           <CardTitle className="text-2xl">مرحبًا بك يا {userProfile?.name || user?.displayName}!</CardTitle>
                           <div className="flex flex-col items-center md:items-start mt-1 text-sm text-muted-foreground">
                               {currentRank && RankIcon && (
                                   <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-500">
                                       <RankIcon className="w-4 h-4"/>
                                       <span>{currentRank.name}</span>
                                   </div>
                               )}
                                <div className="flex items-center gap-1 font-semibold mt-1">
                                   <CircleDollarSign className="w-4 h-4 text-yellow-500"/>
                                   <span>{userProfile?.coins || 0} كوينز</span>
                                   <span className="mx-1">|</span>
                                   <Trophy className="w-4 h-4 text-amber-500"/>
                                   <span>{userProfile?.leaderboardPoints || 0} نقاط صدارة</span>
                               </div>
                                {nextRank ? (
                                    <div className="w-full max-w-xs mt-2">
                                        <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1">
                                            <span>اللقب التالي: <span className="text-primary">{nextRank.name}</span></span>
                                            <span>{userProfile?.leaderboardPoints}/{pointsForNextRank}</span>
                                        </div>
                                        <Progress value={progress} className="h-2" />
                                    </div>
                                ) : (
                                    <div className="mt-2 text-xs font-bold text-green-500 flex items-center gap-1">
                                        <Star/> لقد وصلت إلى أعلى رتبة!
                                    </div>
                                )}
                           </div>
                        </div>
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                            <Button onClick={() => router.push('/city')} className="w-full" variant="secondary">
                                <Building /> اذهب إلى مدينتك
                            </Button>
                            <Button onClick={() => setIsCreateLeagueOpen(true)} className="w-full">
                                <PlusCircle /> إنشاء دوري
                            </Button>
                             {userProfile && userProfile.leagues && userProfile.leagues.length > 0 && (
                                <Button onClick={() => setIsMyLeaguesOpen(true)} variant="secondary" className="w-full">
                                    <Trophy /> دورياتي
                                </Button>
                            )}
                            <Button onClick={() => setIsJoinLeagueOpen(true)} variant="outline" className="w-full">
                                <DoorOpen /> انضم لدوري
                            </Button>
                        </div>
                  </CardContent>
                </Card>
                
                <div className="space-y-6">
                    <div className="text-center">
                        <h2 className="text-3xl font-bold">اختر لعبتك</h2>
                        <p className="text-muted-foreground">اختر لعبة لإنشاء غرفتك الخاصة ودعوة أصدقائك.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                       {gameCards.map(game => {
                           const Icon = game.icon;
                           const type = game.type as 'king-of-genius' | 'trap-answer' | 'prison' | 'behind-the-mask' | 'word_war';
                           return (
                            <Card key={game.type} className="hover:shadow-lg hover:border-primary transition-all duration-300 flex flex-col">
                                <CardHeader className="text-center">
                                    <Icon className="w-12 h-12 text-primary mx-auto mb-2" />
                                    <CardTitle>{game.title}</CardTitle>
                                    <CardDescription>{game.description}</CardDescription>
                                </CardHeader>
                                <CardFooter className="mt-auto">
                                    <Button className="w-full" onClick={() => handleCreate(type)} disabled={!!isLoading}>
                                       {isLoading === `create-${type}` ? 'جاري الإنشاء...' : 'أنشئ غرفة'}
                                    </Button>
                                </CardFooter>
                            </Card>
                       )})}
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><LogIn /> الانضمام السريع</CardTitle>
                                <CardDescription>لديك رمز غرفة؟ أدخله هنا للانضمام مباشرة.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex w-full max-w-sm mx-auto items-center space-x-2 space-x-reverse">
                                    <Input 
                                        type="text" 
                                        placeholder="ABC123" 
                                        value={gameId} 
                                        onChange={(e) => setGameId(e.target.value.toUpperCase())}
                                        className="text-center tracking-widest"
                                    />
                                    <Button onClick={() => handleJoin()} disabled={isLoading === 'join'}>
                                        {isLoading === 'join' ? 'جاري الانضمام...' : 'انضم'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                        <ActiveLobbiesList />
                    </div>
                </div>
            </motion.div>
        );
    }

    if (loading) {
        return renderLoading();
    }

    return (
        <div className="relative min-h-screen">
             {/* This is the top bar with user actions */}
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
                                    <Button variant="ghost" size="icon" onClick={handleOpenMailbox} className="relative">
                                        <MailIcon className="h-6 w-6 text-primary" />
                                         {unreadMailCount > 0 && (
                                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                                {unreadMailCount}
                                            </span>
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>صندوق البريد</p>
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
                {announcement && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-5xl mb-6 p-4 bg-primary/10 border border-primary/20 text-primary rounded-lg flex items-center justify-center gap-4 text-center"
                    >
                        <Megaphone className="h-6 w-6" />
                        <p className="font-semibold">{announcement}</p>
                    </motion.div>
                )}
                <div className="text-center mb-8">
                    <FunkyFace className="w-32 h-32 text-primary mx-auto animate-pulse-glow" />
                    <h1 className="text-5xl font-bold text-primary font-changa">بطابيطو</h1>
                </div>

                {user ? renderUserLobby() : renderGuestView()}
                 <Dialog open={isCreateLeagueOpen} onOpenChange={setIsCreateLeagueOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>إنشاء دوري جديد</DialogTitle>
                            <DialogDescription>
                                قم بإنشاء دوري خاص بك وبأصدقائك. سيتم إنشاء معرف فريد يمكنك مشاركته.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="league-name">اسم الدوري</Label>
                                <Input id="league-name" value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="مثال: دوري الأبطال" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="league-password">كلمة المرور (5 أرقام)</Label>
                                <Input 
                                    id="league-password" 
                                    type="text" 
                                    inputMode="numeric"
                                    value={leaguePassword} 
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (/^\d*$/.test(val) && val.length <= 5) {
                                            setLeaguePassword(val);
                                        }
                                    }} 
                                    placeholder="_ _ _ _ _" 
                                    maxLength={5}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="secondary" onClick={() => setIsCreateLeagueOpen(false)}>إلغاء</Button>
                            <Button onClick={handleCreateLeague} disabled={isLoading === 'league'}>
                                {isLoading === 'league' ? 'جاري الإنشاء...' : 'إنشاء'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={isJoinLeagueOpen} onOpenChange={setIsJoinLeagueOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>الانضمام إلى دوري</DialogTitle>
                            <DialogDescription>
                                أدخل معرف الدوري وكلمة المرور للانضمام.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="join-league-id">معرف الدوري</Label>
                                <Input id="join-league-id" value={joinLeagueId} onChange={e => setJoinLeagueId(e.target.value)} placeholder="ABC123" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="join-league-password">كلمة المرور</Label>
                                <Input id="join-league-password" type="password" value={joinLeaguePassword} onChange={e => setJoinLeaguePassword(e.target.value)} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="secondary" onClick={() => setIsJoinLeagueOpen(false)}>إلغاء</Button>
                            <Button onClick={() => handleJoinLeague()} disabled={isLoading === 'league'}>
                                {isLoading === 'league' ? 'جاري الانضمام...' : 'انضمام'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                 <Dialog open={isMyLeaguesOpen} onOpenChange={setIsMyLeaguesOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>دورياتي</DialogTitle>
                            <DialogDescription>
                                هذه هي الدوريات التي تشارك فيها حاليًا.
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-72 w-full rounded-md border p-2 bg-background mt-4">
                           {userProfile?.leagues && userProfile.leagues.length > 0 ? (
                                userProfile.leagues.map(league => (
                                    <div key={league.id} className="p-2 mb-2 rounded-md bg-muted flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">{league.name}</p>
                                            <p className="text-xs text-muted-foreground">ID: {league.id}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" asChild>
                                        <Link href={`/leagues/${league.id}`} onClick={() => setIsMyLeaguesOpen(false)}>عرض</Link>
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-muted-foreground p-4">لم تنضم إلى أي دوري بعد.</p>
                            )}
                        </ScrollArea>
                    </DialogContent>
                </Dialog>

                {/* THIS IS THE MAILBOX DIALOG */}
                <Dialog open={isMailboxOpen} onOpenChange={setIsMailboxOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>صندوق البريد</DialogTitle>
                            <DialogDescription>الرسائل من الإدارة. تختفي الرسائل بعد 3 أيام.</DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-96 w-full rounded-md border p-2 bg-background mt-4">
                            {isFetchingMail ? (
                                <p>جاري تحميل البريد...</p>
                            ) : userMail.length > 0 ? (
                                userMail.map(mail => (
                                    <div key={mail.id} className="p-3 mb-2 rounded-md bg-muted" onClick={() => handleMarkAsRead(mail.id)}>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-muted-foreground">{formatDistanceToNow(mail.createdAt, { addSuffix: true, locale: ar })}</p>
                                            <div className="flex items-center gap-2">
                                                <p className={cn("font-semibold text-right", !mail.isRead && "text-primary")}>{mail.subject}</p>
                                                {!mail.isRead && <div className="w-2 h-2 rounded-full bg-primary" />}
                                            </div>
                                        </div>
                                        <p className="mt-2 text-sm text-muted-foreground text-right">{mail.body}</p>
                                        {mail.coins && !mail.coinsClaimed && (
                                            <div className="mt-2 text-left">
                                                <Button size="sm" onClick={() => handleClaimCoins(mail.id)} disabled={isClaimingCoins === mail.id}>
                                                    {isClaimingCoins === mail.id ? "جاري..." : `المطالبة بـ ${mail.coins} كوينز`}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-muted-foreground p-8">صندوق بريدك فارغ.</p>
                            )}
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
            </main>
        </div>
    );
}
