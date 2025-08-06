

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getLeagueData, updateUserStats, deleteLeague, kickPlayerFromLeague, leaveLeague, resetAllLeagueStats } from "@/lib/actions/user";
import { getSocialRankForUser } from "@/lib/actions/user";
import type { UserProfile, League, SocialRank } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ArrowLeft, Award, TrendingUp, Trash2, Edit, Save, ShieldCheck, Search, LogOut, UserX, Shield, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


const LeaderboardList = ({ users, ranks }: { users: UserProfile[], ranks: Record<string, SocialRank | null> }) => {
    const totalUsers = users.length;
    return (
        <Card className="overflow-hidden">
            <CardHeader className="bg-gray-800">
                <CardTitle className="flex items-center gap-2 text-white">
                    <TrendingUp />
                    لوحة الصدارة
                </CardTitle>
                <CardDescription className="text-gray-400">
                    ترتيب جميع الأعضاء في هذا الدوري
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-2 sm:p-4">
                {users.length > 0 ? (
                    users.sort((a,b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0)).map((user, index) => {
                        const rank = index + 1;
                        const isBottomThree = totalUsers > 3 && rank > totalUsers - 3;
                        // Use the social rank based on general leaderboard points for display
                        const socialRank = getSocialRankForUser(user.leaderboardPoints || 0, ranks as any);
                        const RankIcon = socialRank?.icon;
                        return (
                            <div key={user.uid} className={cn(
                                "flex items-center justify-between p-2 rounded-md", 
                                isBottomThree ? "bg-gray-800/80 text-gray-200" : `bg-gradient-to-r ${rank === 1 ? "from-yellow-100 to-amber-100 dark:from-yellow-800/50 dark:to-amber-800/50" : rank === 2 ? "from-slate-100 to-gray-200 dark:from-slate-700/50 dark:to-gray-600/50" : rank === 3 ? "from-orange-100 to-yellow-50 dark:from-orange-800/50 dark:to-yellow-800/50" : "bg-card"}`,
                                rank <= 3 && "border-2",
                                rank === 1 && "border-amber-400",
                                rank === 2 && "border-slate-400",
                                rank === 3 && "border-orange-400",
                            )}>
                                <div className="flex items-center gap-3">
                                    <span className={`font-bold text-lg w-6 text-center ${rank <= 3 ? 'text-amber-600' : ''}`}>{rank}</span>
                                    <PlayerAvatar avatarId={user.avatarId} className="w-10 h-10" />
                                    <div>
                                       <span className="font-semibold">{user.name}</span>
                                       {socialRank && RankIcon && (
                                            <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                                                <RankIcon className="w-3 h-3 text-amber-500" />
                                                {socialRank.name}
                                            </p>
                                       )}
                                       {isBottomThree && <span className="text-xs text-red-400 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3"/> من الفاشلين</span>}
                                    </div>
                                </div>
                                <div className="text-right">
                                   <div className="font-bold text-primary">{user.leaderboardPoints || 0} نقطة</div>
                                   <div className="text-xs text-muted-foreground">{user.gamesPlayed || 0} مباريات</div>
                                </div>
                            </div>
                        )
                    })
                ) : (
                    <p className="text-center text-muted-foreground py-4">لا يوجد لاعبون في هذا الدوري بعد.</p>
                )}
            </CardContent>
        </Card>
    );
};


export default function LeaguePage() {
    const params = useParams();
    const leagueId = params.leagueId as string;

    const { user, userProfile, loading: authLoading, socialRanks, getSocialRankForUser } = useAuth();
    const [league, setLeague] = useState<League | null>(null);
    const [members, setMembers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { toast } = useToast();

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [newPoints, setNewPoints] = useState<string>('');
    const [newGamesPlayed, setNewGamesPlayed] = useState<string>('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    const [isActionInProgress, setIsActionInProgress] = useState(false);
    
    const [alertContent, setAlertContent] = useState<{ title: string; description: string; onConfirm: () => void, confirmText: string } | null>(null);


    const fetchLeague = async () => {
        setLoading(true);
        const { league, members } = await getLeagueData(leagueId);
        
        if (!league) {
            toast({ title: "الدوري غير موجود", variant: "destructive" });
            router.push('/');
            return;
        }

        setLeague(league);
        setMembers(members);
        setLoading(false);
    };

    useEffect(() => {
        if (!leagueId) {
            router.push('/');
            return;
        }
        if (!authLoading && socialRanks.length > 0) {
            fetchLeague();
        }
    }, [leagueId, authLoading, router, toast, socialRanks]);

    const filteredUsers = members.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isLeagueAdmin = userProfile?.uid === league?.adminId;
    const isAppAdmin = userProfile?.isAdmin;
    const canManageLeague = isLeagueAdmin || isAppAdmin;

    const handleEditClick = (user: UserProfile) => {
        setEditingUserId(user.uid);
        setNewPoints(String(user.leaderboardPoints || 0));
        setNewGamesPlayed(String(user.gamesPlayed || 0));
    };

    const handleSaveStats = async (userId: string) => {
        const points = parseInt(newPoints, 10);
        const gamesPlayed = parseInt(newGamesPlayed, 10);
        if (isNaN(points) || isNaN(gamesPlayed)) {
            toast({ title: "خطأ", description: "الرجاء إدخال أرقام صحيحة للنقاط والمباريات.", variant: "destructive" });
            return;
        }

        setIsUpdating(true);
        const result = await updateUserStats(leagueId, userId, { points, gamesPlayed });
        if (result.success) {
            toast({ title: "نجاح", description: "تم تحديث بيانات اللاعب." });
            setMembers(members.map(u => u.uid === userId ? { ...u, leaderboardPoints: points, gamesPlayed } : u));
            setEditingUserId(null);

        } else {
            toast({ title: "فشل التحديث", description: result.error, variant: "destructive" });
        }
        setIsUpdating(false);
    };

    const handleDeleteLeague = async () => {
        if (!userProfile) return;
        setIsActionInProgress(true);
        const result = await deleteLeague(leagueId, userProfile.uid);
        if (result.success) {
            toast({ title: "نجاح", description: "تم حذف الدوري بنجاح." });
            router.push('/');
        } else {
            toast({ title: "فشل الحذف", description: result.error, variant: "destructive" });
            setIsActionInProgress(false);
            setAlertContent(null);
        }
    };

    const handleResetAllLeagues = async () => {
        if (!userProfile?.isAdmin) return;
        setIsActionInProgress(true);
        const result = await resetAllLeagueStats(userProfile.uid);
        if (result.success) {
            toast({ title: "نجاح", description: `تمت إعادة تعيين ${result.count} دوري بنجاح.` });
            fetchLeague(); // Refresh current league view
            setAlertContent(null);
        } else {
            toast({ title: "فشل إعادة التعيين", description: result.error, variant: "destructive" });
        }
        setIsActionInProgress(false);
    };


    const handleKickPlayer = async (memberToKickId: string) => {
        if (!userProfile) return;
        setIsActionInProgress(true);
        const result = await kickPlayerFromLeague(leagueId, userProfile.uid, memberToKickId);
        if (result.success) {
            toast({ title: "نجاح", description: "تم طرد اللاعب." });
            setMembers(members.filter(m => m.uid !== memberToKickId));
            setAlertContent(null);
        } else {
            toast({ title: "فشل الطرد", description: result.error, variant: "destructive" });
        }
        setIsActionInProgress(false);
    };

    const handleLeaveLeague = async () => {
        if (!user) return;
        setIsActionInProgress(true);
        const result = await leaveLeague(leagueId, user.uid);
        if (result.success) {
            toast({ title: "لقد غادرت الدوري." });
            router.push('/');
        } else {
             toast({ title: "فشل المغادرة", description: result.error, variant: "destructive" });
             setIsActionInProgress(false);
             setAlertContent(null);
        }
    };


    const openConfirmationAlert = (type: 'deleteLeague' | 'kickPlayer' | 'leaveLeague' | 'resetAllLeagues', member?: UserProfile) => {
        switch (type) {
            case 'deleteLeague':
                setAlertContent({
                    title: "هل أنت متأكد تمامًا؟",
                    description: `هذا الإجراء سيقوم بحذف الدوري "${league?.name}" بشكل نهائي. سيتم حذف جميع بياناته ولوحة الصدارة الخاصة به. سيتم أيضًا إزالة هذا الدوري من قائمة جميع الأعضاء. لا يمكن التراجع عن هذا الإجراء.`,
                    onConfirm: handleDeleteLeague,
                    confirmText: "نعم، قم بالحذف"
                });
                break;
            case 'kickPlayer':
                 if (!member) return;
                 setAlertContent({
                    title: `هل أنت متأكد من طرد اللاعب ${member.name}؟`,
                    description: "سيتم إزالة هذا اللاعب من الدوري ولوحة الصدارة الخاصة به. يمكنه الانضمام مرة أخرى لاحقًا إذا كان يعرف كلمة المرور (إن وجدت).",
                    onConfirm: () => handleKickPlayer(member.uid),
                    confirmText: "نعم، قم بالطرد"
                });
                break;
            case 'leaveLeague':
                 setAlertContent({
                    title: "هل أنت متأكد من مغادرة الدوري؟",
                    description: `ستتم إزالتك من دوري "${league?.name}" ولوحة الصدارة الخاصة به. ستحتاج إلى الانضمام مرة أخرى للمشاركة.`,
                    onConfirm: handleLeaveLeague,
                    confirmText: "نعم، أريد المغادرة"
                });
                break;
            case 'resetAllLeagues':
                setAlertContent({
                    title: "إعادة تعيين جميع الدوريات!",
                    description: "تحذير: هذا الإجراء سيقوم بإعادة تعيين نقاط وعدد مباريات جميع اللاعبين في جميع الدوريات إلى الصفر. لا يمكن التراجع عن هذا الإجراء.",
                    onConfirm: handleResetAllLeagues,
                    confirmText: "نعم، أعد تعيين الكل"
                });
                break;
        }
    };
    
    if (loading || authLoading) {
        return (
            <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-muted/40">
                <div className="w-full max-w-4xl space-y-8 py-8">
                    <Skeleton className="h-10 w-1/2 mx-auto" />
                    <Skeleton className="h-8 w-2/3 mx-auto mb-8" />
                    <Card>
                        <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
                        <CardContent className="space-y-2">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                        </CardContent>
                    </Card>
                </div>
            </main>
        );
    }
    
    return (
        <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-muted/40">
            <div className="w-full max-w-4xl space-y-8 py-8 relative">
                <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="absolute top-8 right-8">
                    <ArrowLeft />
                </Button>
                <div className="text-center">
                    <ShieldCheck className="w-16 h-16 mx-auto text-primary" />
                    <h1 className="text-3xl font-bold mt-2">دوري: {league?.name}</h1>
                    <p className="text-muted-foreground">لوحة الصدارة والأعضاء.</p>
                </div>
                
                <LeaderboardList users={members} ranks={socialRanks as any} />

                {canManageLeague && (
                    <Card>
                        <CardHeader>
                           <div className="flex justify-between items-center flex-wrap gap-2">
                             <CardTitle className="flex items-center gap-2"><ShieldCheck/> لوحة تحكم مشرف الدوري</CardTitle>
                             <div className="flex gap-2">
                                <Button variant="destructive" size="sm" onClick={() => openConfirmationAlert('deleteLeague')}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    حذف الدوري
                                </Button>
                                {isAppAdmin && (
                                     <Button variant="destructive" size="sm" onClick={() => openConfirmationAlert('resetAllLeagues')}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        إعادة تعيين كل الدوريات
                                    </Button>
                                )}
                             </div>
                           </div>
                            <CardDescription>تعديل نقاط اللاعبين أو طردهم من الدوري.</CardDescription>
                             <div className="relative mt-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="ابحث بالاسم..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                            {filteredUsers.sort((a, b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0)).map(async user => {
                                const rank = await getSocialRankForUser(user.leaderboardPoints || 0, socialRanks);
                                const RankIcon = rank?.icon;
                                return (
                                <div key={user.uid} className="flex items-center justify-between p-2 rounded-md bg-muted">
                                    <div className="flex items-center gap-3 flex-grow">
                                        <PlayerAvatar avatarId={user.avatarId} className="w-10 h-10" />
                                        <div>
                                            <span className="font-semibold">{user.name}</span>
                                            {rank && RankIcon && (
                                                <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                                                    <RankIcon className="w-3 h-3 text-amber-500" />
                                                    {rank.name}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {editingUserId === user.uid ? (
                                        <div className="flex items-center gap-2">
                                            <Input 
                                                type="number" 
                                                value={newPoints} 
                                                onChange={(e) => setNewPoints(e.target.value)} 
                                                className="w-20 h-9"
                                                disabled={isUpdating}
                                                placeholder="النقاط"
                                            />
                                            <Input 
                                                type="number" 
                                                value={newGamesPlayed} 
                                                onChange={(e) => setNewGamesPlayed(e.target.value)} 
                                                className="w-20 h-9"
                                                disabled={isUpdating}
                                                placeholder="مباريات"
                                            />
                                            <Button size="icon" className="h-9 w-9" onClick={() => handleSaveStats(user.uid)} disabled={isUpdating}>
                                                <Save className="w-4 h-4"/>
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingUserId(null)} disabled={isUpdating}>
                                                X
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className="font-bold text-primary">{user.leaderboardPoints || 0} نقطة</div>
                                                <div className="text-xs text-muted-foreground">{user.gamesPlayed || 0} مباريات</div>
                                            </div>
                                            {user.uid !== league?.adminId && (
                                                <>
                                                    <Button variant="ghost" size="icon" onClick={() => handleEditClick(user)}>
                                                        <Edit className="w-4 h-4"/>
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => openConfirmationAlert('kickPlayer', user)}>
                                                        <UserX className="w-4 h-4"/>
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )})}
                        </CardContent>
                    </Card>
                )}
                
                {!canManageLeague && (
                     <Card>
                        <CardContent className="pt-6">
                           <Button variant="destructive" onClick={() => openConfirmationAlert('leaveLeague')} className="w-full">
                                <LogOut className="mr-2 h-4 w-4"/>
                                مغادرة الدوري
                           </Button>
                        </CardContent>
                     </Card>
                )}
            </div>

            <AlertDialog open={!!alertContent} onOpenChange={(open) => !open && setAlertContent(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>{alertContent?.title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {alertContent?.description}
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setAlertContent(null)}>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={alertContent?.onConfirm} className="bg-destructive hover:bg-destructive/90" disabled={isActionInProgress}>
                         {isActionInProgress ? "جاري العمل..." : alertContent?.confirmText}
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
