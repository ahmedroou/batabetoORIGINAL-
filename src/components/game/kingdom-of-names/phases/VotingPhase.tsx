
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submitVotes } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../../PlayerAvatar';
import { ThumbsUp, ThumbsDown, Send, Loader2, Timer } from 'lucide-react';
import { CountdownTimer } from '../../CountdownTimer';
import { handleTimeout } from '@/lib/actions/kingdom-of-names';

interface VotingPhaseProps {
  game: Game;
  self: Player;
}

export default function VotingPhase({ game, self }: VotingPhaseProps) {
    const { toast } = useToast();
    const state = game.kingdomOfNamesState;
    const allSubmissions = state?.playerAnswers || {};
    const [votes, setVotes] = useState<Record<string, 'correct' | 'incorrect'>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const myVotes = state?.votes?.[self.id] || {};
    const hasVoted = Object.keys(myVotes).length > 0;
    const isHost = game.hostId === self.id;

    const handleVote = (playerId: string, category: string, vote: 'correct' | 'incorrect') => {
        setVotes(prev => ({
            ...prev,
            [`${playerId}-${category}`]: vote,
        }));
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await submitVotes(game.id, self.id, votes);
            toast({ title: "تم تسجيل تصويتك!" });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const getPlayer = (id: string) => game.players.find(p => p.id === id);

    if (hasVoted) {
        return (
            <Card className="w-full max-w-lg text-center">
                 <CardHeader>
                    <CardTitle>شكراً لتصويتك!</CardTitle>
                    <CardDescription>في انتظار بقية اللاعبين...</CardDescription>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-4xl relative">
             {state?.timerEndsAt && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer 
                        gameId={game.id}
                        gameType="kingdom-of-names"
                        expiryTimestamp={state.timerEndsAt.toMillis()}
                        selfId={self.id}
                        isHost={isHost}
                    />
                </div>
            )}
            <CardHeader className="text-center pt-20">
                <CardTitle className="text-3xl">مرحلة التصويت</CardTitle>
                <CardDescription>
                    صوّت على صحة إجابات اللاعبين الآخرين. الإجابات التي تبدأ بحرف خاطئ تم استبعادها تلقائيًا.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[60vh]">
                    <div className="space-y-6 pr-4">
                        {Object.entries(allSubmissions).map(([playerId, playerAnswers]) => {
                            if (playerId === self.id) return null;
                            const player = getPlayer(playerId);
                            if (!player) return null;
                            
                            const playerAnswersEntries = Object.entries(playerAnswers || {});

                            return (
                                <div key={playerId} className="p-4 rounded-lg bg-muted">
                                    <h3 className="font-bold text-xl mb-3 flex items-center gap-2">
                                        <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8"/>
                                        إجابات {player.name}
                                    </h3>
                                    {playerAnswersEntries.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {playerAnswersEntries.map(([category, answer]) => (
                                            <div key={category} className="p-3 bg-background rounded-md space-y-2">
                                                <p><span className="font-semibold">{category}:</span> <span className="font-mono">{answer || "(فارغ)"}</span></p>
                                                <div className="flex gap-2">
                                                    <Button 
                                                        size="sm"
                                                        variant={votes[`${playerId}-${category}`] === 'correct' ? 'default' : 'outline'}
                                                        className="bg-green-500 hover:bg-green-600 text-white"
                                                        onClick={() => handleVote(playerId, category, 'correct')}
                                                    >
                                                        <ThumbsUp className="w-4 h-4 ml-1" /> صحيحة
                                                    </Button>
                                                    <Button 
                                                        size="sm"
                                                        variant={votes[`${playerId}-${category}`] === 'incorrect' ? 'destructive' : 'outline'}
                                                        onClick={() => handleVote(playerId, category, 'incorrect')}
                                                    >
                                                         <ThumbsDown className="w-4 h-4 ml-1" /> خاطئة
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                        </div>
                                    ) : (
                                        <p className="text-center text-muted-foreground p-4 bg-background rounded-md">
                                            لم يقدم هذا اللاعب أي إجابات.
                                        </p>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
            </CardContent>
            <CardFooter>
                 <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting}>
                    <Send className="mr-2" />
                    {isSubmitting ? 'جاري الإرسال...' : 'إرسال تصويتي'}
                </Button>
            </CardFooter>
        </Card>
    );
}
