
"use client";

import type { Game, Player } from '@/types';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Shield, VenetianMask } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { MAFIA_ROLES } from '@/data/mafia-roles';

interface FinalResultsPhaseProps {
  game: Game;
  self: Player;
}

export function FinalResultsPhase({ game }: FinalResultsPhaseProps) {
    const router = useRouter();
    const result = game.gameResult;

    if (!result) return null;

    const winnerText = result.winner === 'good' ? 'فريق الخير' : 'المافيا';
    const WinnerIcon = result.winner === 'good' ? Shield : VenetianMask;

    return (
        <Card className="w-full max-w-2xl text-center animate-pop-in">
            <CardHeader>
                <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                <CardTitle className="text-4xl font-bold">انتهت اللعبة!</CardTitle>
                <CardDescription className="text-xl">
                    <div className="flex items-center justify-center gap-2 mt-2">
                        <WinnerIcon className="w-8 h-8"/>
                        <span>الفائز هو: {winnerText}</span>
                    </div>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-lg text-muted-foreground mb-6">{result.message}</p>
                <div className="space-y-3">
                    <h3 className="font-bold">الأدوار في هذه اللعبة كانت:</h3>
                    {game.players.map(p => {
                        const role = MAFIA_ROLES.find(r => r.id === p.role);
                        return (
                            <div key={p.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                <div className="flex items-center gap-3">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                    <p className="font-semibold">{p.name}</p>
                                </div>
                                <p className="font-bold text-primary">{role?.name || 'غير معروف'}</p>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={() => router.push('/')} className="w-full" size="lg">
                    العودة إلى اللوبي
                </Button>
            </CardFooter>
        </Card>
    );
}
