
'use client';

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { selectCategoryAndGetQuestion } from '@/lib/actions/trap-answer/flow';
import { useToast } from '@/hooks/use-toast';
import { CountdownTimer } from '@/components/game/CountdownTimer';

interface CategorySelectionPhaseProps {
    game: Game;
    self: Player;
}

export default function CategorySelectionPhase({ game, self }: CategorySelectionPhaseProps) {
    const { toast } = useToast();
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const turnOrder = game.trapAnswerState?.turnOrder || [];
    const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
    const isMyTurn = self.id === turnOrder[currentTurnIndex];
    const categories = game.trapAnswerState?.fiveRandomCategories || [];

    const handleSelectCategory = async () => {
        if (!selectedCategory || !isMyTurn) return;
        setIsSubmitting(true);
        try {
            await selectCategoryAndGetQuestion(game.id, selectedCategory);
        } catch (error: any) {
            toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-lg text-center">
            {game.trapAnswerState?.timerEndsAt && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer
                        gameId={game.id}
                        gameType='trap-answer'
                        expiryTimestamp={game.trapAnswerState.timerEndsAt.toMillis()}
                        selfId={self.id}
                        isHost={game.hostId === self.id}
                    />
                </div>
            )}
            <CardHeader>
                <CardTitle>اختيار القسم</CardTitle>
                <CardDescription>
                    {isMyTurn ? 'اختر قسمًا لهذه الجولة' : `في انتظار ${turnOrder[currentTurnIndex]} لاختيار قسم...`}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
                {categories.map((category) => (
                    <Button
                        key={category}
                        variant={selectedCategory === category ? 'default' : 'outline'}
                        onClick={() => isMyTurn && setSelectedCategory(category)}
                        disabled={!isMyTurn || isSubmitting}
                        className="h-16 text-lg"
                    >
                        {category}
                    </Button>
                ))}
            </CardContent>
            {isMyTurn && (
                <CardFooter>
                    <Button onClick={handleSelectCategory} disabled={!selectedCategory || isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد'}
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
