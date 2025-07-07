
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { useToast } from '@/hooks/use-toast';
import { selectTeam, startGeniusGame } from '@/lib/actions/king-of-genius';
import { ArrowRight, Users, Swords } from 'lucide-react';

interface TeamSelectionProps {
  game: Game;
  self: Player;
  isHost: boolean;
}

const TeamColumn = ({ teamId, title, players, self, onSelectTeam, maxTeamSize, disabled }: { teamId: 'A' | 'B', title: string, players: Player[], self: Player, onSelectTeam: (team: 'A' | 'B') => void, maxTeamSize: number, disabled: boolean }) => {
    const isFull = players.length >= maxTeamSize;
    const isInTeam = players.some(p => p.id === self.id);

    return (
        <div className="flex flex-col gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <h3 className={`text-3xl font-bold text-center ${teamId === 'A' ? 'text-blue-400' : 'text-red-400'}`}>{title}</h3>
            <div className="space-y-3 min-h-[160px]">
                <AnimatePresence>
                {players.map(p => (
                    <motion.div 
                        key={p.id}
                        layoutId={`player-${p.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="flex items-center gap-3 p-2 bg-gray-900/70 rounded-md shadow"
                    >
                        <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                        <div>
                            <p className="font-bold text-lg">{p.name}</p>
                            {p.id === self.id && <p className="text-xs text-primary">(أنت)</p>}
                        </div>
                    </motion.div>
                ))}
                </AnimatePresence>
            </div>
            <Button 
                onClick={() => onSelectTeam(teamId)} 
                disabled={disabled || (isFull && !isInTeam)}
                variant={teamId === 'A' ? 'default' : 'destructive'}
                className="bg-opacity-50 hover:bg-opacity-100"
            >
                {isInTeam ? "أنت في هذا الفريق" : isFull ? "الفريق ممتلئ" : "انضم للفريق"}
            </Button>
        </div>
    );
};

export function TeamSelection({ game, self, isHost }: TeamSelectionProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectTeam = async (team: 'A' | 'B') => {
    setIsSubmitting(true);
    try {
      await selectTeam(game.id, self.id, team);
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartGame = async () => {
    setIsSubmitting(true);
    try {
        await startGeniusGame(game.id, self.id);
    } catch (error: any) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  }

  const teamA = game.players.filter(p => p.team === 'A');
  const teamB = game.players.filter(p => p.team === 'B');
  const unassigned = game.players.filter(p => !p.team);
  const totalPlayers = game.players.length;
  const maxTeamSize = Math.floor(totalPlayers / 2);
  const canStart = unassigned.length === 0 && teamA.length > 0 && teamB.length > 0 && totalPlayers % 2 === 0;

  return (
    <Card className="w-full max-w-4xl animate-pop-in bg-gray-900/80 border-gray-700 backdrop-blur-sm">
        <CardHeader className="text-center">
            <Users className="w-16 h-16 mx-auto text-primary"/>
            <CardTitle className="text-3xl">توزيع الفرق</CardTitle>
            <CardDescription className="text-muted-foreground">اختر فريقك. يمكن اللعب 1v1, 2v2, أو 3v3.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TeamColumn teamId="A" title="الفريق الأزرق" players={teamA} self={self} onSelectTeam={handleSelectTeam} maxTeamSize={maxTeamSize} disabled={isSubmitting} />
                <TeamColumn teamId="B" title="الفريق الأحمر" players={teamB} self={self} onSelectTeam={handleSelectTeam} maxTeamSize={maxTeamSize} disabled={isSubmitting} />
            </div>
            <AnimatePresence>
            {unassigned.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 overflow-hidden"
                >
                    <h4 className="text-center font-bold text-muted-foreground">لاعبون في الانتظار</h4>
                    <div className="flex justify-center flex-wrap gap-4 mt-2">
                        {unassigned.map(p => (
                            <motion.div 
                              key={p.id} 
                              layoutId={`player-${p.id}`}
                              className="flex flex-col items-center"
                            >
                                <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                                <p className="text-sm font-medium">{p.name}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}
            </AnimatePresence>
        </CardContent>
        <CardFooter>
            {isHost ? (
                <Button className="w-full" size="lg" disabled={!canStart || isSubmitting} onClick={handleStartGame}>
                    {isSubmitting ? "جاري البدء..." : !canStart ? "في انتظار اكتمال الفرق..." : "بدء المواجهة"}
                    <Swords className="mr-2" />
                </Button>
            ) : (
                <p className="text-center w-full text-muted-foreground">في انتظار صاحب الغرفة لبدء اللعبة بعد اكتمال الفرق</p>
            )}
        </CardFooter>
    </Card>
  );
}
