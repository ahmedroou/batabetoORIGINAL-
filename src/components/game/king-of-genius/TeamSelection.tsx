
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { useToast } from '@/hooks/use-toast';
import { Users, Swords } from 'lucide-react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';


interface TeamSelectionProps {
  game: Game;
  self: Player;
  isHost: boolean;
}

const TeamColumn = ({ teamId, title, players, self, onSelectTeam, maxTeamSize, disabled }: { teamId: 'A' | 'B', title: string, players: Player[], self: Player, onSelectTeam: (team: 'A' | 'B') => void, maxTeamSize: number, disabled: boolean }) => {
    const isFull = players.length >= maxTeamSize && maxTeamSize > 0;
    const isInTeam = players.some(p => p.id === self.id);
    const teamColor = teamId === 'A' ? 'blue' : 'red';

    return (
        <div className={`flex flex-col gap-4 p-4 bg-gray-800/50 rounded-lg border border-${teamColor}-500/50`}>
            <h3 className={`text-3xl font-bold text-center text-${teamColor}-400`}>{title}</h3>
            <div className="space-y-3 min-h-[160px] bg-black/20 p-2 rounded-md">
                <AnimatePresence>
                {players.map(p => (
                    <motion.div 
                        key={p.id}
                        layoutId={`player-${p.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="flex items-center gap-3 p-2 bg-gray-900/70 rounded-md shadow-lg border-l-4"
                        style={{ borderColor: teamId === 'A' ? '#60a5fa' : '#f87171' }}
                    >
                        <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                        <div>
                            <p className="font-bold text-lg text-gray-100">{p.name}</p>
                            {p.id === self.id && <p className="text-xs text-primary">(أنت)</p>}
                        </div>
                    </motion.div>
                ))}
                </AnimatePresence>
            </div>
            <Button 
                onClick={() => onSelectTeam(teamId)} 
                disabled={disabled || (isFull && !isInTeam)}
                variant={isInTeam ? "secondary" : (teamId === 'A' ? 'default' : 'destructive')}
            >
                {isInTeam ? "أنت في هذا الفريق" : isFull ? "الفريق ممتلئ" : "انضم للفريق"}
            </Button>
        </div>
    );
};

function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length, randomIndex;
  while (currentIndex > 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}


export function TeamSelection({ game, self, isHost }: TeamSelectionProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectTeam = async (team: 'A' | 'B') => {
    setIsSubmitting(true);
    try {
      const gameRef = doc(db, 'games', game.id);
      await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const gameData = gameDoc.data() as Game;

        const playerIndex = gameData.players.findIndex(p => p.id === self.id);
        if (playerIndex === -1) throw new Error("Player not found.");
        
        const updatedPlayers = [...gameData.players];
        const playerToUpdate = updatedPlayers[playerIndex];

        const activePlayers = updatedPlayers.filter(p => p.status === 'alive');
        const targetTeamPlayers = activePlayers.filter(p => p.team === team && p.id !== self.id);
        const maxTeamSize = activePlayers.length > 0 ? Math.ceil(activePlayers.length / 2) : 0;


        if (maxTeamSize > 0 && targetTeamPlayers.length >= maxTeamSize) {
          throw new Error("This team is full for the current number of players.");
        }
        
        playerToUpdate.team = team;
        
        transaction.update(gameRef, { players: updatedPlayers });
      });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartGame = async () => {
    setIsSubmitting(true);
    try {
       const gameRef = doc(db, 'games', game.id);
        await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists()) throw new Error("Game not found.");
            const gameData = gameDoc.data() as Game;

            if (gameData.hostId !== self.id) {
                throw new Error("Only the host can start the game.");
            }
            
            const activePlayers = gameData.players.filter(p => p.status === 'alive');
            const teamA = activePlayers.filter(p => p.team === 'A');
            const teamB = activePlayers.filter(p => p.team === 'B');
            const unassigned = activePlayers.filter(p => !p.team);

            if (unassigned.length > 0) {
                throw new Error(`لا يزال هناك ${unassigned.length} لاعبين لم يختاروا فرقهم.`);
            }
            if (teamA.length !== teamB.length) {
                throw new Error("يجب أن تكون الفرق متوازنة في عدد اللاعبين.");
            }
            if (teamA.length === 0) {
                 throw new Error("يجب أن يكون هناك لاعبون في الفرق لبدء اللعبة.");
            }


            const shuffledChallenges = shuffle(GENIUS_CHALLENGES.map(c => c.id));
            
            transaction.update(gameRef, { 
                gameState: 'challenge_intro',
                teamScores: { A: 0, B: 0 },
                challengeOrder: shuffledChallenges,
                currentChallengeIndex: 0,
                challengeState: null,
            });
        });
    } catch (error: any)_of_genius {
        toast({ title: "خطأ في بدء اللعبة", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  }

  const activePlayers = game.players.filter(p => p.status === 'alive');
  const teamA = activePlayers.filter(p => p.team === 'A');
  const teamB = activePlayers.filter(p => p.team === 'B');
  const unassigned = activePlayers.filter(p => !p.team);
  const totalActivePlayers = activePlayers.length;
  const maxTeamSize = totalActivePlayers > 0 ? Math.ceil(totalActivePlayers / 2) : 0;

  const getButtonState = () => {
    if (isSubmitting) {
      return { text: "جاري البدء...", disabled: true };
    }
    if (totalActivePlayers < 2) {
      return { text: "تحتاج إلى لاعبين على الأقل", disabled: true };
    }
    if (unassigned.length > 0) {
      return { text: `في انتظار ${unassigned.length} لاعبين`, disabled: true };
    }
    if (teamA.length !== teamB.length) {
      return { text: "يجب أن تكون الفرق متوازنة", disabled: true };
    }
    if (teamA.length === 0) {
      return { text: "الفرق فارغة", disabled: true };
    }
    return { text: "بدء المواجهة", disabled: false };
  };

  const buttonState = getButtonState();

  return (
    <Card className="w-full max-w-4xl animate-pop-in bg-gray-900/80 border-gray-700 backdrop-blur-sm text-white">
        <CardHeader className="text-center">
            <Users className="w-16 h-16 mx-auto text-primary"/>
            <CardTitle className="text-3xl">توزيع الفرق</CardTitle>
            <CardDescription className="text-muted-foreground">اختر فريقك. يمكن اللعب 1ضد1، 2ضد2، أو 3ضد3.</CardDescription>
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
                    <h4 className="text-center font-bold text-gray-400">لاعبون في الانتظار</h4>
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
                <Button className="w-full text-lg" size="lg" disabled={buttonState.disabled} onClick={handleStartGame}>
                    <Swords className="ml-2" />
                    {buttonState.text}
                </Button>
            ) : (
                <p className="text-center w-full text-gray-400">في انتظار صاحب الغرفة لبدء اللعبة بعد اكتمال الفرق</p>
            )}
        </CardFooter>
    </Card>
  );
}
