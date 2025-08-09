
"use client";

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DrawingCanvas } from '../DrawingCanvas';
import { submitRating, nextDrawAndGuessRound } from '@/app/actions';
import { Star, Loader2, Send } from 'lucide-react';
import { PlayerAvatar } from '../../PlayerAvatar';
import { cn } from '@/lib/utils';


interface RoundResultsPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
}

export function RoundResultsPhase({ game, self, isHost }: RoundResultsPhaseProps) {
    const { toast } = useToast();
    const dgs = game.drawAndGuessState;
    const [rating, setRating] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const drawer = game.players.find(p => p.id === dgs?.currentDrawerId);
    const myRatingSubmitted = dgs?.ratings?.[self.id] !== undefined;

    const handleRatingSubmit = async () => {
        if (myRatingSubmitted || rating === 0) return;
        setIsSubmitting(true);
        try {
            await submitRating(game.id, self.id, rating);
            toast({ title: "شكراً لتقييمك!" });
        } catch (e: any) {
            toast({ title: "خطأ في إرسال التقييم", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await nextDrawAndGuessRound(game.id, self.id);
        } catch (e: any) {
            toast({ title: "خطأ في بدء الجولة التالية", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalRatings = Object.values(dgs?.ratings || {});
    const averageRating = totalRatings.length > 0
        ? (totalRatings.reduce((sum, val) => sum + val, 0) / totalRatings.length).toFixed(1)
        : "N/A";

    return (
        <Card className="w-full max-w-4xl">
            <CardHeader className="text-center">
                <CardTitle>نتائج الجولة</CardTitle>
                <CardDescription>
                    الكلمة الصحيحة كانت: <span className="font-bold text-primary">{dgs?.prompt?.text}</span>
                </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="w-full h-full min-h-[300px] md:min-h-[400px]">
                    <DrawingCanvas initialDrawing={dgs?.drawing || undefined} onDraw={() => {}} isDrawingDisabled={true} isViewingOnly={true} />
                </div>
                <div className="space-y-4">
                    <div className="text-center p-4 border rounded-lg">
                        <h3 className="font-bold text-lg">تقييم الرسمة</h3>
                        <p className="text-sm text-muted-foreground">كيف كان أداء {drawer?.name}؟</p>
                        <div className="flex justify-center items-center gap-1 my-2">
                            {[...Array(5)].map((_, i) => (
                                <Star
                                    key={i}
                                    className={cn(
                                        "w-10 h-10 transition-colors",
                                     myRatingSubmitted ? "cursor-not-allowed" : "cursor-pointer",
                                    (rating || dgs?.ratings?.[self.id] || 0) > i ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                                    )}
                                    onClick={() => !myRatingSubmitted && setRating(i + 1)}
                                />
                            ))}
                        </div>
                        <Button onClick={handleRatingSubmit} disabled={myRatingSubmitted || isSubmitting || rating === 0}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : myRatingSubmitted ? 'تم التقييم' : <><Send className="mr-2"/>إرسال التقييم</>}
                        </Button>
                        <div className="text-center text-xl font-bold mt-2">
                            متوسط التقييم: {averageRating} / 5
                        </div>
                    </div>
                     <div className="space-y-2 pt-4">
                        <h3 className="font-bold text-lg text-center">النقاط</h3>
                         {game.players.filter(p => p.status !== 'left').map(p => (
                             <div key={p.id} className="flex justify-between items-center p-2 bg-muted rounded-md">
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" />
                                     <span className="font-semibold">{p.name}</span>
                                </div>
                                 <span className="font-bold">{game.playerScores?.[p.id] || 0} نقطة</span>
                             </div>
                         ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                {isHost ? (
                    <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'الجولة التالية'}
                    </Button>
                ) : (
                    <p className="text-center w-full text-muted-foreground animate-pulse">
                        في انتظار المضيف لبدء الجولة التالية...
                    </p>
                )}
            </CardFooter>
        </Card>
    );
}
