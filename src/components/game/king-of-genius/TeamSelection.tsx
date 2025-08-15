
'use client';

import { useState, useMemo } from 'react';
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
import { Users, Swords, Loader2, Shuffle, ArrowRight, Copy, Check, LogOut, UserX } from 'lucide-react';
import { selectTeam, startKingOfGeniusGame, randomizeTeams } from '@/lib/actions/king-of-genius';
import { leaveGame, kickPlayerFromLobby } from '@/lib/actions/room';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';


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
    const { getSocialRankForUser } = useAuth(); // <-- Get rank function
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
          {players.map((p) => {
              const rank = getSocialRankForUser(p.leaderboardPoints);
              const RankIcon = rank?.icon;
              return (
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
                    {rank && RankIcon && (
                        <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                            <RankIcon className="w-3 h-3 text-amber-500" />
                            {rank.name}
                        </p>
                    )}
                    {p.id === self.id && (
                      <p className="text-xs text-primary font-bold">(أنت)</p>
                    )}
                  </div>
                </motion.div>
              );
          })}
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
  const [isCopying, setIsCopying] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
  const { getSocialRankForUser } = useAuth(); // <-- Get rank function
  const router = useRouter();


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
      setIsSubmitting(false); // Reset on error
    }
    // On success, the component will unmount, so no need to reset state.
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

  const handleLeaveGame = async () => {
    setIsSubmitting(true);
    const result = await leaveGame(game.id, self.id);
    if(result.success) {
        sessionStorage.removeItem(`player-id-${game.id}`);
        router.push('/');
        toast({title: "لقد غادرت الغرفة."})
    } else {
        toast({title: "خطأ", description: result.error, variant: "destructive"});
        setIsSubmitting(false);
    }
  };

  const handleKickPlayer = async () => {
    if (!playerToKick || !isHost) return;
    setIsSubmitting(true);
    const result = await kickPlayerFromLobby(game.id, self.id, playerToKick.id);
    if(result.error) {
        toast({title: "خطأ في الطرد", description: result.error, variant: "destructive"});
    } else {
        toast({title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.`});
    }
    setPlayerToKick(null);
    setIsSubmitting(false);
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
    <>
    <Card className="w-full max-w-4xl animate-pop-in bg-white/80 backdrop-blur-sm border-gray-200">
      <CardHeader className="text-center">
        <Users className="w-16 h-16 mx-auto text-primary" />
        <CardTitle className="text-3xl">توزيع الفرق</CardTitle>
        <CardDescription>
          اختر فريقك. يمكن اللعب 1ضد1، 2ضد2، أو 3ضد3.
        </CardDescription>
        <div className="flex gap-2 w-full max-w-sm mx-auto pt-2">
            <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
             <TooltipProvider>
                <Tooltip open={isCopying}>
                  <TooltipTrigger asChild>
                    <Button onClick={() => { setIsCopying(true); navigator.clipboard.writeText(game.id); setTimeout(() => setIsCopying(false), 2000); }} size="lg" variant="secondary" className="px-4">
                      {isCopying ? <Check /> : <Copy />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>تم النسخ!</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
        </div>
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
                {unassigned.map((p) => {
                    const rank = getSocialRankForUser(p.leaderboardPoints);
                    const RankIcon = rank?.icon;
                    return (
                        <motion.div
                            key={p.id}
                            layoutId={`player-${p.id}`}
                            className="flex flex-col items-center"
                        >
                            <div className="relative">
                                <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                                 {isHost && p.id !== self.id && (
                                     <Button variant="destructive" size="icon" className="absolute -bottom-1 -right-1 h-6 w-6" onClick={() => setPlayerToKick(p)}>
                                        <UserX className="w-3 h-3" />
                                     </Button>
                                 )}
                            </div>
                            <p className="text-sm font-medium">{p.name}</p>
                            {rank && RankIcon && (
                                <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                                    <RankIcon className="w-3 h-3 text-amber-500" />
                                    {rank.name}
                                </p>
                            )}
                        </motion.div>
                    )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
      <CardFooter className="flex-col gap-2">
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
         <Button onClick={handleLeaveGame} variant="ghost" className="w-full text-destructive" disabled={isSubmitting}>
            <LogOut /> مغادرة الغرفة
        </Button>
      </CardFooter>
    </Card>
     <AlertDialog open={!!playerToKick} onOpenChange={(open) => !open && setPlayerToKick(null)}>
        <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
            هل تريد حقًا طرد اللاعب "{playerToKick?.name}" من الغرفة؟ لن يتمكن من الانضمام مرة أخرى.
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
            {isSubmitting ? "جاري الطرد..." : "نعم، قم بالطرد"}
            </AlertDialogAction>
        </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
