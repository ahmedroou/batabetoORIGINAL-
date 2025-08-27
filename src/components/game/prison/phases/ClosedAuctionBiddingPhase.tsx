

"use client";

import { useState, useCallback, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerAvatar } from '../../PlayerAvatar';
import { CountdownTimer } from '../CountdownTimer';
import { submitBid } from '@/lib/actions/prison';
import { Gavel, RefreshCw, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface ClosedAuctionBiddingPhaseProps {
    game: Game;
    self: Player;
}

export function ClosedAuctionBiddingPhase({ game, self }: ClosedAuctionBiddingPhaseProps) {
    const { toast } = useToast();
    const [bidAmount, setBidAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const isHost = game.hostId === self.id;

    const myBid = game.prisonState?.bids?.[self.id];
    const hasUsedQuestionChange = (game.prisonState?.questionChangersUsedBy || []).includes(self.id);
    const playersInPrison = game.players.filter(p => p.status === 'in_prison');
    const highestBid = game.prisonState?.highestBid || 0;
    const questionChangerName = game.prisonState?.questionChanger;
    
    const isTimeUp = useMemo(() => 
        !game.prisonState?.timerEndsAt || Date.now() > game.prisonState.timerEndsAt.toMillis(),
        [game.prisonState?.timerEndsAt]
    );


    const handleBidSubmit = async (changeQuestion: boolean = false) => {
        setIsSubmitting(true);
        const amount = parseInt(bidAmount, 10);

        if (!changeQuestion) {
            const currentHighestBid = game.prisonState?.highestBid || 0;
            if (isNaN(amount) || amount <= currentHighestBid) {
                toast({ title: "مزايدة غير صالحة", description: `يجب أن تكون مزايدتك أعلى من ${currentHighestBid}.`, variant: "destructive" });
                setIsSubmitting(false);
                return;
            }
        }

        try {
            const result = await submitBid(game.id, self.id, amount, changeQuestion);

            if(result.error) {
                toast({ title: "خطأ", description: result.error, variant: "destructive" });
            } else if (changeQuestion) {
                toast({ title: "تم تغيير السؤال!", description: `لقد قام ${self.name} باستخدام قدرته لتغيير السؤال.` });
            } else {
                setBidAmount('');
            }
        } catch (error: any) {
            toast({ title: "خطأ في المزايدة", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <Card className="w-full max-w-lg relative animate-pop-in">
             {game.prisonState?.timerEndsAt && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer 
                        gameId={game.id}
                        expiryTimestamp={game.prisonState.timerEndsAt.toMillis()}
                        selfId={self.id}
                        isHost={isHost}
                    />
                </div>
            )}
            <CardHeader className="text-center pt-20">
                <CardTitle>مزاد مغلق</CardTitle>
                <CardDescription className="text-xl font-bold pt-2">{game.prisonState?.closedAuctionQuestion?.text}</CardDescription>
                 <div className="pt-2">
                    <p className="text-sm text-muted-foreground">اللاعبون في السجن:</p>
                    <div className="flex justify-center gap-4 mt-1">
                        {playersInPrison.length > 0 ? playersInPrison.map(p => (
                            <div key={p.id} className="flex flex-col items-center text-xs">
                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                <span className="font-semibold">{p.name}</span>
                            </div>
                        )) : <p className="text-sm text-muted-foreground">لا أحد</p>}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                 {questionChangerName && (
                    <Alert variant="default" className="bg-blue-100/80 border-blue-300 text-blue-900">
                        <RefreshCw className="h-4 w-4 !text-blue-700" />
                        <AlertTitle className="font-bold">تم تغيير السؤال!</AlertTitle>
                        <AlertDescription>
                            قام اللاعب {questionChangerName} باستخدام صلاحيته لتغيير السؤال. تم إعادة تعيين المزاد.
                        </AlertDescription>
                    </Alert>
                 )}
                 <div className="text-center p-3 rounded-lg bg-primary/10">
                    <p className="text-sm text-primary">أعلى مزايدة حاليًا</p>
                    <p className="text-3xl font-bold text-primary">{highestBid}</p>
                 </div>
                 {(myBid !== undefined) && (
                     <div className="text-center p-4 rounded-lg bg-green-100 text-green-800">
                         <p className="font-semibold">
                             {`تم تسجيل مزايدتك بـ ${myBid}. يمكنك تغييرها.`}
                        </p>
                     </div>
                 )}
                 {isTimeUp ? (
                     <div className="text-center p-4 rounded-lg bg-yellow-100 text-yellow-800">
                        <p className="font-semibold animate-pulse">انتهى الوقت! جاري الانتقال لمرحلة الإجابة...</p>
                    </div>
                 ) : (
                    <>
                        <Input
                            type="number"
                            placeholder={`زايد بأعلى من ${highestBid}...`}
                            value={bidAmount}
                            onChange={(e) => setBidAmount(e.target.value)}
                            disabled={isSubmitting || isTimeUp}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Button onClick={() => handleBidSubmit(false)} disabled={isSubmitting || !bidAmount.trim() || isTimeUp} className="w-full">
                                <Gavel className="mr-2 h-4 w-4" /> {isSubmitting ? '...' : myBid ? 'تحديث المزايدة' : 'تأكيد المزايدة'}
                            </Button>
                            <Button onClick={() => handleBidSubmit(true)} variant="outline" disabled={isSubmitting || hasUsedQuestionChange || isTimeUp}>
                                <RefreshCw className="mr-2 h-4 w-4" /> {hasUsedQuestionChange ? 'تم الاستخدام' : 'تغيير السؤال'}
                            </Button>
                        </div>
                    </>
                 )}
            </CardContent>
        </Card>
    );
}

    