'use client';

import React from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { selectCategoryAndGetQuestion } from '@/lib/actions/trap-answer';
import { CountdownTimer } from '@/components/game/CountdownTimer';

export function CategorySelectionPhase({ game, self, isHost }: { game: Game; self: Player; isHost: boolean }) {
    const { toast } = useToast();
    const [loading, setLoading] = React.useState(false);

    const isMyTurn = (game.trapAnswerState?.turnOrder?.[game.trapAnswerState?.currentTurnIndex || 0]) === self.id;
    const currentPlayerName = game.players.find(p => p.id === (game.trapAnswerState?.turnOrder?.[game.trapAnswerState?.currentTurnIndex || 0]))?.name;

    const handleCategorySelect = async (category: string) => {
        if (loading) return;
        setLoading(true);
        try {
            await selectCategoryAndGetQuestion(game.id, self.id, category);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'تعذّر اختيار القسم';
            toast({ title: 'خطأ', description: message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-lg relative">
            {game.trapAnswerState?.roundEndTime && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer
                        gameId={game.id}
                        gameType="trap-answer"
                        expiryTimestamp={game.trapAnswerState.roundEndTime.toMillis()}
                        selfId={self.id}
                        isHost={isHost}
                    />
                </div>
            )}
            <CardHeader className="text-center pt-20">
                <CardTitle>الجولة {game.round ?? 1}</CardTitle>
                <CardDescription>
                    حان دور <strong>{isMyTurn ? 'أنت' : currentPlayerName ?? '—'}</strong> لاختيار قسم.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center gap-4">
                    <p className="text-muted-foreground text-center">
                        {isMyTurn ? 'اختر أحد الأقسام التالية لطرح سؤال منه.' : `الأقسام المتاحة لـ ${currentPlayerName ?? '—'}:`}
                    </p>
                    {(game.trapAnswerState?.fiveRandomCategories?.length ?? 0) > 0 ? (
                        <div className="grid grid-cols-2 gap-3 w-full">
                            {game.trapAnswerState?.fiveRandomCategories!.map((cat) => (
                                <Button
                                    key={cat}
                                    onClick={() => handleCategorySelect(cat)}
                                    disabled={loading || !isMyTurn}
                                    size="lg"
                                    variant="outline"
                                    className="text-base justify-center h-14"
                                >
                                    {loading && isMyTurn ? <Loader2 className="animate-spin" /> : cat}
                                </Button>
                            ))}
                        </div>
                    ) : (
                        <div className="w-full p-4 text-center rounded-md bg-muted" aria-live="polite">
                            لا توجد أقسام متاحة حاليًا. يرجى انتظار إعادة التوليد.
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

    