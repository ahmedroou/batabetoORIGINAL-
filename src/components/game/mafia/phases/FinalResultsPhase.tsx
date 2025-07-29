
import React from 'react';
import type { Game } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Users } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { MAFIA_ROLES } from '@/data/mafia-roles';

interface FinalResultsPhaseProps {
    game: Game;
    handleLeaveGame: () => void;
}

export function FinalResultsPhase({ game, handleLeaveGame }: FinalResultsPhaseProps) {
    const { winner, message } = game.gameResult || {};
    const winnerText = winner === 'good' ? "فريق الخير" : "المافيا";
    const allPlayersWithRoles = game.players.map(p => ({
        ...p,
        roleName: MAFIA_ROLES.find(r => r.id === p.role)?.name || 'غير معروف'
    }));

    return (
        <Card className="w-full max-w-xl text-center">
            <CardHeader>
                <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                <CardDescription className="text-2xl font-bold mt-2">الفائز هو: {winnerText}!</CardDescription>
                 <p className="text-lg text-muted-foreground">{message}</p>
            </CardHeader>
            <CardContent>
                <h3 className="font-bold mb-2">الأدوار النهائية</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {allPlayersWithRoles.map(p => (
                         <div key={p.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                            <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                            <div>
                               <p className="font-semibold">{p.name}</p>
                               <p className="text-xs text-muted-foreground">{p.roleName}</p>
                            </div>
                         </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter><Button onClick={handleLeaveGame} className="w-full">العودة إلى اللوبي</Button></CardFooter>
        </Card>
    );
}
