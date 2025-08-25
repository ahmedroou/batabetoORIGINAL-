
'use client';

import React, { useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { nextRound } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight } from 'lucide-react';
import { PlayerAvatar } from '../../PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ResultsPhaseProps {
  game: Game;
  self: Player;
}

export default function ResultsPhase({ game, self }: ResultsPhaseProps) {
    const { toast } = useToast();
    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const results = game.kingdomOfNamesState?.results || {};
    const roundScores = results.scores || {};
    const answersBreakdown = results.answers || [];

    const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await nextRound(game.id, self.id);
        } catch (error: any) {
            toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getPlayer = (id: string) => game.players.find(p => p.id === id);

    return (
        <Card className="w-full max-w-4xl">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl">نتائج الجولة {game.kingdomOfNamesState?.currentRound}</CardTitle>
                <CardDescription>مجموع النقاط لكل لاعب في هذه الجولة.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Player Scores */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-center">نقاط اللاعبين</h3>
                        <ScrollArea className="h-96">
                            <div className="space-y-2 pr-4">
                                {Object.entries(roundScores).map(([playerId, scoreData]) => {
                                    const player = getPlayer(playerId);
                                    if (!player) return null;
                                    return (
                                        <div key={playerId} className="p-3 bg-muted rounded-lg">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8" />
                                                    <span className="font-semibold">{player.name}</span>
                                                </div>
                                                <span className="font-bold text-primary text-lg">+{scoreData.points}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Answers Breakdown */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-center">تفاصيل الإجابات</h3>
                         <ScrollArea className="h-96">
                            <div className="space-y-2 pr-4">
                                {answersBreakdown.map((item, index) => (
                                    <div key={index} className="p-3 bg-muted rounded-lg text-sm">
                                        <p><strong>{item.category}:</strong> <span className="font-mono">{item.answer}</span></p>
                                        <p><strong>النتيجة:</strong> <span className={item.points > 0 ? 'text-green-500' : 'text-red-500'}>{item.points} نقاط</span></p>
                                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                {isHost && (
                    <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <ArrowRight className="mr-2" />}
                        الجولة التالية
                    </Button>
                )}
                {!isHost && <p className="w-full text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء الجولة التالية...</p>}
            </CardFooter>
        </Card>
    );
}
