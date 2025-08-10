
"use client";

import { useState, useCallback } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { selectCategoryAndGetQuestion, handleTimeout as handleDrawAndGuessTimeout } from '@/lib/actions/draw-and-guess';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { CountdownTimer } from '@/components/game/CountdownTimer';

interface CategorySelectionPhaseProps {
    game: Game;
    self: Player;
}

export function CategorySelectionPhase({ game, self }: CategorySelectionPhaseProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const dgs = game.drawAndGuessState;
    const isMyTurn = dgs?.currentDrawerId === self.id;
    const isHost = game.hostId === self.id;
    const drawer = game.players.find(p => p.id === dgs?.currentDrawerId);
    const categories = dgs?.fiveRandomCategories || [];

    const handleSelect = async (category: string) => {
        if (!isMyTurn || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await selectCategoryAndGetQuestion(game.id, self.id, category);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const onExpire = useCallback(() => {
        if (isHost) {
            handleDrawAndGuessTimeout(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);
    
    return (
        <Card className="w-full max-w-lg relative">
             {dgs?.timerEndsAt && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer expiryTimestamp={dgs.timerEndsAt.toMillis()} onExpire={onExpire} />
                </div>
            )}
            <CardHeader className="text-center pt-20">
                <CardTitle>حان دور {isMyTurn ? "أنت" : drawer?.name}</CardTitle>
                <CardDescription>{isMyTurn ? "اختر فئة للرسم منها." : `في انتظار ${drawer?.name} لاختيار فئة...`}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {categories.map(cat => (
                        <Button
                            key={cat}
                            variant="outline"
                            className="h-20 text-lg"
                            disabled={!isMyTurn || isSubmitting}
                            onClick={() => handleSelect(cat)}
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" /> : cat}
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
