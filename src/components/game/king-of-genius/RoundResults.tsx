
'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Award, Star, ArrowLeft, Plus, RefreshCcw, Loader2 } from 'lucide-react';
import { handleTimeout } from '@/lib/actions/king-of-genius';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { useAuth } from '@/hooks/useAuth';

interface RoundResultsProps {
  game: Game;
  self: Player;
  isHost: boolean;
  challenge: GeniusChallenge;
}

const RESULTS_DISPLAY_DURATION_S = 60; // 1 minute as requested

export function RoundResults({
  game,
  self,
  isHost,
  challenge,
}: RoundResultsProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState(RESULTS_DISPLAY_DURATION_S);
  
  const allPlayersFinished = (game.challengeState?.results?.length ?? 0) >= (game.players?.filter(p => p.status === 'alive').length ?? 0);

  const canHostProceed = isHost && (allPlayersFinished || timeLeft <= 0);

  // Countdown timer effect
  useEffect(() => {
    if (game.challengeState?.timerEndsAt) {
        const endTime = game.challengeState.timerEndsAt.toMillis();
        const updateTimer = () => {
            const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
        };
        updateTimer(); // Initial call
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }
  }, [game.challengeState?.timerEndsAt]);

  const handleProceed = async () => {
      if (!isHost) return;
      setIsSubmitting(true);
      try {
          await handleTimeout(game.id, self.id);
      } catch (e: any) {
          toast({title: "خطأ", description: e.message, variant: "destructive"});
          setIsSubmitting(false); // Allow retry
      }
  };


  const results = game.challengeState?.results || [];

  const sortedResults = [...results]
    .filter((r) => r.isCorrect)
    .sort((a, b) => {
      if ((b.score ?? 0) !== (a.score ?? 0)) {
        return (b.score ?? 0) - (a.score ?? 0);
      }
      return a.time - b.time;
    });

  const getPlayerById = (id: string) => game.players.find((p) => p.id === id);

  const rankPointsMap = [10, 5, 3, 1];

  return (
    <div className="w-full max-w-4xl">
      <Card className="bg-white/90 backdrop-blur-sm border-gray-200">
        <CardHeader className="text-center">
          <Award className="w-20 h-20 text-yellow-400 mx-auto" />
          <CardTitle className="text-4xl">
            نتائج جولة: {challenge.name}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isHost && !canHostProceed && !allPlayersFinished && <span className="animate-pulse">في انتظار انتهاء بقية اللاعبين...</span>}
            {isHost && allPlayersFinished && <span className="text-green-600 font-bold">اكتملت أدوار اللاعبين! يمكنك المتابعة.</span>}
            {isHost && !allPlayersFinished && timeLeft <= 0 && <span className="text-red-600 font-bold">انتهى الوقت! يمكنك المتابعة.</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <h3 className="text-2xl font-bold text-green-600 border-b-2 border-green-500/50 pb-2 text-center">
                التصنيف
              </h3>
              {sortedResults.length > 0 ? (
                <ol className="space-y-2">
                  {sortedResults.map((res, index) => {
                    const player = getPlayerById(res.playerId);
                    if (!player) return null;

                    const rankBonus = rankPointsMap[index] || 0;
                    const performanceScore = res.score || 0;
                    const totalPoints = rankBonus + performanceScore;

                    return (
                      <motion.li
                        key={res.playerId}
                        className="p-3 bg-card rounded-lg flex justify-between items-center border-r-4"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          transition: { delay: index * 0.1 },
                        }}
                        style={{
                          borderColor:
                            player.team === 'A'
                              ? 'hsl(var(--primary))'
                              : 'rgb(236 72 153)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <PlayerAvatar
                            avatarId={player.avatarId}
                            className="w-10 h-10"
                            temporaryTitle={player.temporaryTitle}
                          />
                          <span className="font-bold text-lg">{player.name}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-mono text-muted-foreground">
                            {res.score ? `${res.score} pts / ` : ''}{res.time.toFixed(2)}s
                          </span>
                        </div>
                        <span className="font-bold text-green-500 text-lg flex items-center gap-1">
                          <Plus className="w-4 h-4" />
                          {totalPoints}
                        </span>
                      </motion.li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  لم يتمكن أحد من حل التحدي بشكل صحيح!
                </p>
              )}
            </div>

            <div className="space-y-4 p-4 bg-muted/50 rounded-lg flex flex-col justify-center">
              <h3 className="text-2xl font-bold text-amber-500 border-b-2 border-amber-500/50 pb-2 text-center">
                مجموع النقاط
              </h3>
              <div className="flex justify-around items-center text-6xl font-extrabold p-4 rounded-lg">
                <div className="flex flex-col items-center gap-2 text-blue-600">
                  <Star className="w-12 h-12" />
                  <span>{game.teamScores?.A || 0}</span>
                  <p className="text-lg font-semibold">الفريق الأزرق</p>
                </div>
                <div className="flex flex-col items-center gap-2 text-pink-500">
                  <Star className="w-12 h-12" />
                  <span>{game.teamScores?.B || 0}</span>
                  <p className="text-lg font-semibold">الفريق الأحمر</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
         <CardFooter className="pt-6">
           {isHost ? (
               <Button onClick={handleProceed} disabled={!canHostProceed || isSubmitting} className="w-full">
                   {isSubmitting ? <Loader2 className="animate-spin" /> : 'الجولة التالية'}
               </Button>
           ) : (
                <p className="w-full text-center text-muted-foreground animate-pulse">
                    في انتظار المضيف للانتقال للجولة التالية...
                </p>
           )}
        </CardFooter>
      </Card>
    </div>
  );
}
