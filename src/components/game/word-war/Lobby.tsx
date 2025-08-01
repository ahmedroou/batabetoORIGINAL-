
"use client";

import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import * as wordWarActions from '@/lib/actions/word-war';
import * as roomActions from '@/lib/actions/room';
import { PlayerAvatar } from '../PlayerAvatar';
import { Shuffle, Swords } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface LobbyProps {
    game: Game;
    self: Player;
}

const TeamDisplay = ({ title, players, guideId, colorClass, onJoin, isMember, isDisabled }: { title: string, players: Player[], guideId?: string, colorClass: string, onJoin: () => void, isMember: boolean, isDisabled: boolean }) => (
    <div className="flex-1 flex flex-col p-4 rounded-lg" style={{ backgroundColor: colorClass }}>
        <h3 className="text-2xl font-bold text-center text-white p-2 rounded-t-lg">{title}</h3>
        <div className="flex flex-col flex-grow justify-between p-2 bg-black/20 rounded-b-lg space-y-2">
            <div className="space-y-2 min-h-[150px]">
                {players.map(p => (
                    <div key={p.id} className="flex items-center text-center w-full bg-white/10 text-white p-2 rounded-md">
                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                        <div className='flex-grow text-right pr-2'>
                            <span className="text-sm font-semibold truncate w-full">{p.name}</span>
                        </div>
                    </div>
                ))}
            </div>
             <Button onClick={onJoin} disabled={isMember || isDisabled}>
                {isMember ? "أنت في هذا الفريق" : "انضم للفريق"}
            </Button>
        </div>
    </div>
);

export function Lobby({ game, self }: LobbyProps) {
    const isHost = game.hostId === self.id;
    const { toast } = useToast();
    const router = useRouter();

    const teamRedPlayers = game.players.filter(p => p.team === 'red');
    const teamBluePlayers = game.players.filter(p => p.team === 'blue');
    const unassignedPlayers = game.players.filter(p => !p.team);

    const handleSelectTeam = async (team: 'red' | 'blue') => {
        if (self.team === team) return;
        try {
            await wordWarActions.selectTeam(game.id, self.id, team);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    };
    
    const handleStartGame = async () => {
        try {
            await wordWarActions.startGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    };

    const handleRandomizeTeams = async () => {
         try {
            await wordWarActions.randomizeTeams(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    }

    const canStart = teamRedPlayers.length > 0 && teamBluePlayers.length > 0 && unassignedPlayers.length === 0;

    return (
        <div className='w-full max-w-5xl mx-auto'>
            <Card>
                <CardHeader className='text-center'>
                    <CardTitle className='text-3xl'>لوبي حرب الكلمات</CardTitle>
                    <CardDescription>اختر فريقك أو انتظر المضيف ليبدأ اللعبة.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TeamDisplay title="الفريق الأحمر" players={teamRedPlayers} colorClass="rgba(239, 68, 68, 0.8)" onJoin={() => handleSelectTeam('red')} isMember={self.team === 'red'} isDisabled={!!self.team} />
                    <TeamDisplay title="الفريق الأزرق" players={teamBluePlayers} colorClass="rgba(59, 130, 246, 0.8)" onJoin={() => handleSelectTeam('blue')} isMember={self.team === 'blue'} isDisabled={!!self.team} />
                </CardContent>
                {unassignedPlayers.length > 0 && (
                    <CardContent>
                        <h3 className='text-center font-bold text-muted-foreground'>لاعبون لم يختاروا فريقًا بعد ({unassignedPlayers.length})</h3>
                        <div className='flex justify-center gap-2 mt-2 flex-wrap'>
                            {unassignedPlayers.map(p => (
                                <div key={p.id} className="flex flex-col items-center text-center">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                                    <span className="text-xs font-semibold truncate">{p.name}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                )}
                <CardFooter className="flex-col gap-2">
                     {isHost && (
                        <div className='flex gap-2 w-full'>
                            <Button onClick={handleStartGame} disabled={!canStart} className="flex-grow">
                                <Swords className="ml-2" />
                                {canStart ? "ابدأ اللعبة" : "يجب أن تكون الفرق مكتملة"}
                            </Button>
                             <Button onClick={handleRandomizeTeams} variant="secondary">
                                <Shuffle className="ml-2" />
                                توزيع عشوائي
                            </Button>
                        </div>
                    )}
                     <Button onClick={() => roomActions.leaveGame(game.id, self.id).then(() => router.push('/'))} variant="outline" className="w-full">مغادرة الغرفة</Button>
                </CardFooter>
            </Card>
        </div>
    );
}
