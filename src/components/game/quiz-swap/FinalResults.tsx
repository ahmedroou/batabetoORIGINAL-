
'use client';

import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';

interface FinalResultsProps {
    game: Game;
    self: Player;
}

export function FinalResults({ game, self }: FinalResultsProps) {
    const router = useRouter();
    const players = game.quizSwapState?.players || [];
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];

    return (
        <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <Trophy className="w-24 h-24 text-yellow-400 mx-auto" />
                <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                <CardDescription className="text-2xl">
                    الفائز هو {winner?.name || 'غير محدد'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {sortedPlayers.map((player, index) => (
                        <div key={player.id} className="flex justify-between items-center p-2 bg-muted rounded-md">
                            <div className="flex items-center gap-2">
                                <span className="font-bold">{index + 1}.</span>
                                <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8" />
                                <span>{player.name}</span>
                            </div>
                            <span className="font-bold">{player.score} نقطة</span>
                        </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter>
                 <Button onClick={() => router.push('/')} className="w-full">العب مرة أخرى</Button>
            </CardFooter>
        </Card>
    );
}
