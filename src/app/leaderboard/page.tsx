
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLeaderboardUsers, getAllUsers, updateUserPoints } from "@/lib/actions/user";
import type { UserProfile } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ArrowLeft, Award, TrendingUp, Trash2, Edit, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const LeaderboardList = ({ title, users, icon, colorClass, cardClass, isTopList }: { title: string; users: UserProfile[]; icon: React.ReactNode; colorClass: string; cardClass?: string; isTopList: boolean; }) => (
    <Card className={cn("overflow-hidden", cardClass)}>
        <CardHeader className={cn("bg-opacity-20", isTopList ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-gray-800")}>
            <CardTitle className={`flex items-center gap-2 ${colorClass}`}>
                {icon}
                {title}
            </CardTitle>
            <CardDescription className={cn(isTopList ? "" : "text-gray-400")}>
                {isTopList ? "أعلى 10 لاعبين في الصدارة" : "أقل 3 لاعبين نقاطًا"}
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-2 sm:p-4">
            {users.length > 0 ? (
                users.map((user, index) => (
                    <div key={user.uid} className={cn(
                        "flex items-center justify-between p-2 rounded-md", 
                        isTopList ? `bg-gradient-to-r ${index === 0 ? "from-yellow-100 to-amber-100 dark:from-yellow-800/50 dark:to-amber-800/50" : index === 1 ? "from-slate-100 to-gray-200 dark:from-slate-700/50 dark:to-gray-600/50" : "from-orange-100 to-yellow-50 dark:from-orange-800/50 dark:to-yellow-800/50"}` : "bg-gray-700/50",
                        index < 3 && isTopList && "border-2",
                        index === 0 && isTopList && "border-amber-400",
                        index === 1 && isTopList && "border-slate-400",
                        index === 2 && isTopList && "border-orange-400",
                    )}>
                        <div className="flex items-center gap-3">
                            <span className={`font-bold text-lg w-6 text-center ${index < 3 && isTopList ? colorClass : ''}`}>{index + 1}</span>
                            <PlayerAvatar avatarId={user.avatarId} className="w-10 h-10" />
                            <span className="font-semibold">{user.name}</span>
                        </div>
                        <div className="font-bold text-primary">{user.leaderboardPoints || 0} نقطة</div>
                    </div>
                ))
            ) : (
                <p className="text-center text-muted-foreground py-4">لا يوجد لاعبون لعرضهم.</p>
            )}
        </CardContent>
    </Card>
);

export default function LeaderboardPage() {
    const { userProfile, loading: authLoading } = useAuth();
    const [topUsers, setTopUsers] = useState<UserProfile[]>([]);
    const [bottomUsers, setBottomUsers] = useState<UserProfile[]>([]);
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { toast } = useToast();

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [newPoints, setNewPoints] = useState<string>('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true);
            const { topUsers, bottomUsers } = await getLeaderboardUsers();
            setTopUsers(topUsers);
            setBottomUsers(bottomUsers);
            
            if (userProfile?.isAdmin) {
                const allUserData = await getAllUsers();
                setAllUsers(allUserData);
            }

            setLoading(false);
        };

        if (!authLoading) {
            fetchUsers();
        }
    }, [userProfile?.isAdmin, authLoading]);

    const handleEditClick = (user: UserProfile) => {
        setEditingUserId(user.uid);
        setNewPoints(String(user.leaderboardPoints || 0));
    };

    const handleSavePoints = async (userId: string) => {
        const points = parseInt(newPoints, 10);
        if (isNaN(points)) {
            toast({ title: "خطأ", description: "الرجاء إدخال رقم صحيح.", variant: "destructive" });
            return;
        }

        setIsUpdating(true);
        const result = await updateUserPoints(userId, points);
        if (result.success) {
            toast({ title: "نجاح", description: "تم تحديث نقاط اللاعب." });
            setAllUsers(allUsers.map(u => u.uid === userId ? { ...u, leaderboardPoints: points } : u));
            setTopUsers(topUsers.map(u => u.uid === userId ? { ...u, leaderboardPoints: points } : u).sort((a,b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0)));
            setBottomUsers(bottomUsers.map(u => u.uid === userId ? { ...u, leaderboardPoints: points } : u).sort((a,b) => (a.leaderboardPoints || 0) - (b.leaderboardPoints || 0)));
            setEditingUserId(null);
        } else {
            toast({ title: "فشل التحديث", description: result.error, variant: "destructive" });
        }
        setIsUpdating(false);
    };


    if (loading || authLoading) {
        return (
            <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-muted/40">
                <div className="w-full max-w-4xl space-y-8 py-8">
                    <Skeleton className="h-10 w-1/2 mx-auto" />
                    <Skeleton className="h-8 w-2/3 mx-auto mb-8" />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <Card>
                            <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
                            <CardContent className="space-y-2">
                                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
                            <CardContent className="space-y-2">
                                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                            </CardContent>
                        </Card>
                    </div>
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
                    <Award className="w-16 h-16 mx-auto text-yellow-500" />
                    <h1 className="text-3xl font-bold mt-2">لوحة الصدارة العالمية</h1>
                    <p className="text-muted-foreground">شاهد ترتيبك بين جميع اللاعبين!</p>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <LeaderboardList title="المتفوقون" users={topUsers} icon={<TrendingUp />} colorClass="text-green-600 dark:text-green-400" isTopList={true} />
                    <LeaderboardList title="الفاشلون" users={bottomUsers} icon={<Trash2 />} colorClass="text-red-500" cardClass="bg-gray-800 text-gray-200" isTopList={false} />
                </div>

                {userProfile?.isAdmin && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><ShieldCheck/> لوحة تحكم مشرف الصدارة</CardTitle>
                            <CardDescription>تعديل نقاط اللاعبين يدويًا عند الحاجة.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                            {allUsers.sort((a, b) => (b.leaderboardPoints || 0) - (a.leaderboardPoints || 0)).map(user => (
                                <div key={user.uid} className="flex items-center justify-between p-2 rounded-md bg-muted">
                                    <div className="flex items-center gap-3">
                                        <PlayerAvatar avatarId={user.avatarId} className="w-10 h-10" />
                                        <span className="font-semibold">{user.name}</span>
                                    </div>
                                    {editingUserId === user.uid ? (
                                        <div className="flex items-center gap-2">
                                            <Input 
                                                type="number" 
                                                value={newPoints} 
                                                onChange={(e) => setNewPoints(e.target.value)} 
                                                className="w-24 h-9"
                                                disabled={isUpdating}
                                            />
                                            <Button size="sm" onClick={() => handleSavePoints(user.uid)} disabled={isUpdating}>
                                                <Save className="w-4 h-4"/>
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => setEditingUserId(null)} disabled={isUpdating}>
                                                X
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            <div className="font-bold text-primary">{user.leaderboardPoints || 0} نقطة</div>
                                            <Button variant="ghost" size="icon" onClick={() => handleEditClick(user)}>
                                                <Edit className="w-4 h-4"/>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    );
}
