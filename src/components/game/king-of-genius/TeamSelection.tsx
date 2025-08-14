
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { useToast } from '@/hooks/use-toast';
import { Users, Swords, Loader2, Shuffle } from 'lucide-react';
import { selectTeam, startKingOfGeniusGame, randomizeTeams } from '@/lib/actions/king-of-genius';

interface TeamSelectionProps {
  game: Game;
  self: Player;
  isHost: boolean;
}

const TeamColumn = ({
  teamId,
  title,
  players,
  self,
  onSelectTeam,
  maxTeamSize,
  disabled,
}: {
  teamId: 'A' | 'B';
  title: string;
  players: Player[];
  self: Player;
  onSelectTeam: (team: 'A' | 'B') => void;
  maxTeamSize: number;
  disabled: boolean;
}) => {
  const isFull = players.length >= maxTeamSize && maxTeamSize > 0;
  const isInTeam = players.some((p) => p.id === self.id);

  return (
    <div className="flex flex-col gap-4 p-4 bg-muted/50 rounded-lg border">
      <h3
        className={`text-3xl font-bold text-center ${
          teamId === 'A' ? 'text-blue-600' : 'text-pink-500'
        }`}
      >
        {title}
      </h3>
      <div className="space-y-3 min-h-[160px] bg-background/70 p-2 rounded-md">
        <AnimatePresence>
          {players.map((p) => (
            <motion.div
              key={p.id}
              layoutId={`player-${p.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-3 p-2 bg-card rounded-md shadow-sm border-l-4"
              style={{
                borderColor:
                  teamId === 'A' ? 'hsl(var(--primary))' : 'rgb(236 72 153)',
              }}
            >
              <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
              <div>
                <p className="font-bold text-lg">{p.name}</p>
                {p.id === self.id && (
                  <p className="text-xs text-primary font-bold">(أنت)</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <Button
        onClick={() => onSelectTeam(teamId)}
        disabled={disabled || (isFull && !isInTeam)}
        variant={isInTeam ? 'secondary' : teamId === 'A' ? 'default' : 'default'}
        className={
          teamId === 'B' && !isInTeam
            ? 'bg-pink-500 hover:bg-pink-600 text-white'
            : ''
        }
      >
        {isInTeam
          ? 'أنت في هذا الفريق'
          : isFull
          ? 'الفريق ممتلئ'
          : 'انضم للفريق'}
      </Button>
    </div>
  );
};

export function TeamSelection({ game, self, isHost }: TeamSelectionProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectTeam = async (team: 'A' | 'B') => {
    if (self.team === team) return;
    setIsSubmitting(true);
    try {
      await selectTeam(game.id, self.id, team);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartGame = async () => {
    setIsSubmitting(true);
    try {
      await startKingOfGeniusGame(game.id, self.id);
    } catch (error: any) {
      toast({
        title: 'خطأ في بدء اللعبة',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRandomizeTeams = async () => {
    setIsSubmitting(true);
    try {
      await randomizeTeams(game.id, self.id);
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const activePlayers = game.players.filter((p) => p.status === 'alive');
  const teamA = activePlayers.filter((p) => p.team === 'A');
  const teamB = activePlayers.filter((p) => p.team === 'B');
  const unassigned = activePlayers.filter((p) => !p.team);
  const totalActivePlayers = activePlayers.length;

  const getButtonState = () => {
    if (isSubmitting) {
      return { text: 'جاري البدء...', disabled: true };
    }
    if (totalActivePlayers < 2) {
      return { text: 'تحتاج إلى لاعبين على الأقل', disabled: true };
    }
    if (unassigned.length > 0) {
      return {
        text: `في انتظار ${unassigned.length} لاعبين لاختيار فرقهم`,
        disabled: true,
      };
    }
    if (teamA.length !== teamB.length) {
      return { text: 'يجب أن تكون الفرق متوازنة', disabled: true };
    }
    if (teamA.length === 0) {
      return { text: 'الفرق فارغة', disabled: true };
    }
    return { text: 'بدء المواجهة', disabled: false };
  };

  const buttonState = getButtonState();

  return (
    <Card className="w-full max-w-4xl animate-pop-in bg-white/80 backdrop-blur-sm border-gray-200">
      <CardHeader className="text-center">
        <Users className="w-16 h-16 mx-auto text-primary" />
        <CardTitle className="text-3xl">توزيع الفرق</CardTitle>
        <CardDescription>
          اختر فريقك. يمكن اللعب 1ضد1، 2ضد2، أو 3ضد3.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TeamColumn
            teamId="A"
            title="الفريق الأزرق"
            players={teamA}
            self={self}
            onSelectTeam={handleSelectTeam}
            maxTeamSize={Math.ceil(totalActivePlayers / 2)}
            disabled={isSubmitting}
          />
          <TeamColumn
            teamId="B"
            title="الفريق الأحمر"
            players={teamB}
            self={self}
            onSelectTeam={handleSelectTeam}
            maxTeamSize={Math.ceil(totalActivePlayers / 2)}
            disabled={isSubmitting}
          />
        </div>
        <AnimatePresence>
          {unassigned.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 overflow-hidden"
            >
              <h4 className="text-center font-bold text-muted-foreground">
                لاعبون في الانتظار
              </h4>
              <div className="flex justify-center flex-wrap gap-4 mt-2">
                {unassigned.map((p) => (
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
          <div className="w-full flex flex-col sm:flex-row gap-2">
            <Button
              className="w-full text-lg flex-grow"
              size="lg"
              disabled={buttonState.disabled}
              onClick={handleStartGame}
            >
              <Swords className="ml-2" />
              {isSubmitting ? <Loader2 className="animate-spin" /> : buttonState.text}
            </Button>
             <Button
              variant="outline"
              size="lg"
              onClick={handleRandomizeTeams}
              disabled={isSubmitting || activePlayers.length === 0}
            >
              <Shuffle className="ml-2" />
              توزيع عشوائي
            </Button>
          </div>
        ) : (
          <p className="text-center w-full text-muted-foreground">
            في انتظار صاحب الغرفة لبدء اللعبة بعد اكتمال الفرق
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
```