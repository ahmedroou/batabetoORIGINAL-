"use client";

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DrawingCanvas } from '../DrawingCanvas';
import * as drawAndGuessActions from '@/app/actions';
import { Star, Loader2 } from 'lucide-react';

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
    const myRating = dgs?.ratings?.[self.id];

    const handleRating = async (rateValue: number) => {
        if (myRating) return; // Already rated
        setRating(rateValue);
        try {
            await drawAndGuessActions.submitRating(game.id, self.id, rateValue);
        } catch (e: any) {
            toast({ title: "Error submitting rating", description: e.message, variant: "destructive" });
        }
    };

    const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await drawAndGuessActions.nextDrawAndGuessRound(game.id, self.id);
        } catch (e: any) {
            toast({ title: "Error starting next round", description: e.message, variant: "destructive" });
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
                    <DrawingCanvas initialLines={dgs?.drawing?.lines} onDraw={() => {}} isDrawingDisabled />
                </div>
                <div className="space-y-4">
                    <h3 className="font-bold text-lg text-center">تقييم الرسمة</h3>
                    <div className="flex justify-center items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                            <Star
                                key={i}
                                className={`w-10 h-10 cursor-pointer transition-colors ${
                                    (rating || myRating || 0) > i ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                                }`}
                                onClick={() => handleRating(i + 1)}
                            />
                        ))}
                    </div>
                     {myRating && <p className="text-center text-green-600">شكراً لتقييمك!</p>}
                    <div className="text-center text-xl font-bold">
                        متوسط التقييم: {averageRating} / 5
                    </div>
                     <div className="space-y-2 pt-4">
                        <h3 className="font-bold text-lg text-center">النقاط</h3>
                         {game.players.filter(p => p.status !== 'left').map(p => (
                             <div key={p.id} className="flex justify-between p-2 bg-muted rounded-md">
                                 <span className="font-semibold">{p.name}</span>
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
