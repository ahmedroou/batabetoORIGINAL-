
"use client";

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Player } from '@/types';

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Gavel, Search, Loader2, UserX } from 'lucide-react';

// Server Actions
import { getLiveGameStats, kickPlayerFromAnyGame } from '@/lib/actions/admin';

export default function JudgePowersTab() {
    const { user } = useAuth();
    const { toast } = useToast();

    // State for Judge Powers
    const [judgeGameId, setJudgeGameId] = useState("");
    const [liveGameStats, setLiveGameStats] = useState<{ players: any[], gameState: string, round: number } | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<{ id: string; name: string } | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const handleGetLiveStats = async () => {
        if (!judgeGameId.trim()) {
            toast({ title: "الرجاء إدخال معرف الغرفة", variant: "destructive" });
            return;
        }
        setIsLoadingStats(true);
        const result = await getLiveGameStats(judgeGameId.toUpperCase());
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
            setLiveGameStats(null);
        } else {
            setLiveGameStats(result.gameData);
        }
        setIsLoadingStats(false);
    };

    const handleKickPlayerFromGame = async () => {
        if (!playerToKick || !user) return;
        setIsActionLoading(true);
        const result = await kickPlayerFromAnyGame(judgeGameId.toUpperCase(), user.uid, playerToKick.id);
        if (result.success) {
            toast({ title: `تم طرد اللاعب ${playerToKick.name}` });
            handleGetLiveStats(); // Refresh stats after kicking
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsActionLoading(false);
        setPlayerToKick(null);
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Gavel/> صلاحيات القاضي</CardTitle>
                    <CardDescription>أدخل معرف غرفة لعبة "السجن" لعرض إحصائيات حية وطرد اللاعبين.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input 
                            placeholder="أدخل معرف الغرفة..."
                            value={judgeGameId}
                            onChange={(e) => setJudgeGameId(e.target.value)}
                            className="text-center"
                        />
                        <Button onClick={handleGetLiveStats} disabled={isLoadingStats}>
                            {isLoadingStats ? <Loader2 className="animate-spin" /> : <Search />}
                        </Button>
                    </div>
                    {liveGameStats && (
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>الحالة: <strong className="text-primary">{liveGameStats.gameState}</strong></span>
                                <span>الجولة: <strong className="text-primary">{liveGameStats.round}</strong></span>
                            </div>
                            <div className="space-y-2">
                                {liveGameStats.players.map(p => (
                                    <div key={p.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                        <div className="flex items-center gap-2">
                                            <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                            <div>
                                                <p className="font-bold">{p.name}</p>
                                                <p className="text-xs text-muted-foreground">{p.activity}</p>
                                            </div>
                                        </div>
                                        <div className="text-sm text-right">
                                            <p>أعلى مزايدة: <span className="font-bold text-yellow-600">{p.currentBid}</span></p>
                                            <p>في السجن لـ <span className="font-bold text-red-600">{p.roundsInPrison}</span> جولات</p>
                                        </div>
                                        <Button variant="destructive" size="icon" onClick={() => setPlayerToKick(p)} disabled={isActionLoading}>
                                            <UserX className="h-4 w-4"/>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={!!playerToKick} onOpenChange={(open) => !open && setPlayerToKick(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                        <AlertDialogDescription>
                           هل أنت متأكد من طرد اللاعب "{playerToKick?.name}" من اللعبة الحالية؟ لا يمكن التراجع عن هذا الإجراء.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction onClick={handleKickPlayerFromGame} className={buttonVariants({variant: 'destructive'})} disabled={isActionLoading}>
                            {isActionLoading ? 'جاري الطرد...' : 'نعم, قم بالطرد'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
