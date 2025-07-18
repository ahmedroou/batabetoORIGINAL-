
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLeaderboardUsers } from "@/lib/actions/user";
import type { UserProfile } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ArrowLeft, Award, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const LeaderboardList = ({ title, users, icon, colorClass }: { title: string; users: UserProfile[]; icon: React.ReactNode; colorClass: string; }) => (
    <Card>
        <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${colorClass}`}>
                {icon}
                {title}
            </CardTitle>
            <CardDescription>
                {title === "المتفوقون" ? "أعلى 10 لاعبين في الصدارة" : "أقل 10 لاعبين نقاطًا"}
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
            {users.length > 0 ? (
                users.map((user, index) => (
                    <div key={user.uid} className="flex items-center justify-between p-2 rounded-md bg-muted">
                        <div className="flex items-center gap-3">
                            <span className={`font-bold text-lg w-6 text-center ${index < 3 ? colorClass : ''}`}>{index + 1}</span>
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
    const [topUsers, setTopUsers] = useState<UserProfile[]>([]);
    const [bottomUsers, setBottomUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true);
            const { topUsers, bottomUsers } = await getLeaderboardUsers();
            setTopUsers(topUsers);
            setBottomUsers(bottomUsers);
            setLoading(false);
        };

        fetchUsers();
    }, []);

    if (loading) {
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
                                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
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
                    <LeaderboardList title="المتفوقون" users={topUsers} icon={<TrendingUp />} colorClass="text-green-500" />
                    <LeaderboardList title="الفاشلون" users={bottomUsers} icon={<TrendingDown />} colorClass="text-red-500" />
                </div>
            </div>
        </main>
    );
}
