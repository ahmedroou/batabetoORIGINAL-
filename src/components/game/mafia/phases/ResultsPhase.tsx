import React from 'react';
import type { Game, Player, PlayerTeam } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Skull, Users } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { useRouter } from 'next/navigation';
import { ROLES } from '@/data/mafia-roles';


interface ResultsPhaseProps {
    game: Game;
    self: Player;
}

export function ResultsPhase({ game, self }: ResultsPhaseProps) {
    const router = useRouter();
    const gameResult = game.gameResult;

    if (!gameResult) {
        return <p>جاري تحميل النتائج...</p>;
    }
    
    const teamColors: Record<PlayerTeam, string> = {
        mafia: 'text-red-500',
        good: 'text-green-500',
        neutral: 'text-yellow-500'
    };
    
    const teamNames: Record<PlayerTeam, string> = {
        mafia: 'فريق الشر',
        good: 'فريق الخير',
        neutral: 'الفريق المحايد'
    };

    const getTeamName = (teamId: PlayerTeam | 'draw') => {
        if(teamId === 'draw') return 'لا أحد! انتهت اللعبة بالتعادل';
        return teamNames[teamId] || 'فريق غير معروف';
    };

    return (
         <Card className="w-full max-w-2xl text-center">
            <CardHeader>
                <Trophy className="w-24 h-24 mx-auto text-yellow-400"/>
                <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                <CardDescription className={`text-2xl font-bold ${gameResult.winner ? teamColors[gameResult.winner as PlayerTeam] : ''}`}>
                    الفائز هو: {getTeamName(gameResult.winner as PlayerTeam | 'draw')}
                </CardDescription>
                <p className="text-muted-foreground mt-2">{gameResult.message}</p>
            </CardHeader>
            <CardContent>
                <h3 className="font-bold text-lg mb-4">الأدوار النهائية للاعبين</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {game.players.map(player => {
                        const role = player.role ? ROLES[player.role] : null;
                        return (
                            <div key={player.id} className="p-3 rounded-lg bg-muted relative">
                                {player.status !== 'alive' && (
                                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg z-10">
                                        <Skull className="w-8 h-8 text-white"/>
                                    </div>
                                )}
                                <PlayerAvatar avatarId={player.avatarId} className="w-16 h-16 mx-auto mb-2"/>
                                <p className="font-bold truncate">{player.name}</p>
                                <p className={`text-sm font-semibold ${role ? teamColors[role.team] : ''}`}>{role?.name || 'غير معروف'}</p>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
            <CardFooter>
                 <Button onClick={() => router.push('/')} className="w-full">
                    العودة إلى اللوبي الرئيسي
                </Button>
            </CardFooter>
        </Card>
    );
}
