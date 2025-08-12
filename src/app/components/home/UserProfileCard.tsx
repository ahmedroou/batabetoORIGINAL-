
"use client";

import { useMemo, useState } from "react";
import Link from 'next/link';
import type { UserProfile, SocialRank } from "@/types";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { CircleDollarSign, Diamond, Edit, PlusCircle, Star, Trophy, DoorOpen } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";

interface UserProfileCardProps {
    userProfile: UserProfile;
    currentRank: SocialRank | null;
    socialRanks: SocialRank[];
}

export default function UserProfileCard({ userProfile, currentRank, socialRanks }: UserProfileCardProps) {
    const { getSocialRankForUser } = useAuth(); // It's already in context

    const sortedRanks = useMemo(() => [...socialRanks].sort((a, b) => a.threshold - b.threshold), [socialRanks]);
    
    const { nextRank, pointsForCurrentRank, pointsForNextRank } = useMemo(() => {
        if (!userProfile) return { nextRank: null, pointsForCurrentRank: 0, pointsForNextRank: 0 };
        const currentRankIndex = currentRank ? sortedRanks.findIndex(r => r.threshold === currentRank.threshold) : -1;
        const nextRank = (currentRankIndex !== -1 && currentRankIndex < sortedRanks.length - 1) 
            ? sortedRanks[currentRankIndex + 1] 
            : null;
        const pointsForCurrentRank = currentRank?.threshold || 0;
        const pointsForNextRank = nextRank?.threshold || userProfile.leaderboardPoints || 0;
        return { nextRank, pointsForCurrentRank, pointsForNextRank };
    }, [currentRank, sortedRanks, userProfile?.leaderboardPoints]);
    
    const progress = useMemo(() => {
        if (!nextRank) return 100;
        if (userProfile?.leaderboardPoints === undefined) return 0;
        const totalPointsForLevel = pointsForNextRank - pointsForCurrentRank;
        const pointsInCurrentLevel = userProfile.leaderboardPoints - pointsForCurrentRank;
        return totalPointsForLevel > 0 ? (pointsInCurrentLevel / totalPointsForLevel) * 100 : 100;
    }, [userProfile?.leaderboardPoints, pointsForCurrentRank, pointsForNextRank, nextRank]);

    const RankIcon = currentRank?.icon;

    return (
        <Card>
            <CardContent className="flex flex-col md:flex-row items-center gap-6 p-4">
                <div className="relative">
                    <PlayerAvatar avatarId={userProfile.avatarId} className="w-24 h-24 rounded-full border-4 border-primary shadow-xl" temporaryTitle={userProfile.temporaryTitle} priority={true} />
                    <Button variant="outline" size="icon" className="absolute -bottom-2 -right-2 rounded-full h-8 w-8 bg-background" asChild>
                        <Link href="/profile"><Edit className="w-4 h-4" /></Link>
                    </Button>
                </div>
                <div className="flex-grow text-center md:text-right">
                    <div className="flex items-center justify-center md:justify-start gap-4">
                        <CardTitle className="text-2xl">مرحبًا بك يا {userProfile.name}!</CardTitle>
                    </div>
                    <div className="flex flex-col items-center md:items-start mt-1 text-sm text-muted-foreground">
                        {currentRank && RankIcon && (
                            <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-500">
                                <RankIcon className="w-4 h-4"/>
                                <span>{currentRank.name}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 md:gap-4 font-semibold mt-1">
                            <span className='flex items-center gap-1.5'><CircleDollarSign className="w-4 h-4 text-yellow-500"/> {userProfile.coins || 0} كوينز</span>
                            <span className='flex items-center gap-1.5'><Diamond className="w-4 h-4 text-blue-500"/> {userProfile.diamonds || 0} ألماس</span>
                            <span className='flex items-center gap-1.5'><Trophy className="w-4 h-4 text-amber-500"/> {userProfile.leaderboardPoints || 0} نقاط</span>
                        </div>
                        {nextRank ? (
                            <div className="w-full max-w-xs mt-2">
                                <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1">
                                    <span>اللقب التالي: <span className="text-primary">{nextRank.name}</span></span>
                                    <span>{userProfile.leaderboardPoints}/{pointsForNextRank}</span>
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
                 <div className="flex md:flex-col gap-2">
                     <Button asChild>
                         <Link href="/society">المجتمع</Link>
                     </Button>
                      <Button variant="outline" asChild>
                         <Link href="/clan-wars">حروب الفرق</Link>
                     </Button>
                </div>
            </CardContent>
        </Card>
    );
}
