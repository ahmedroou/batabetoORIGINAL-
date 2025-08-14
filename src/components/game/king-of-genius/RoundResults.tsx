
'use client';

import { useState, useEffect } from 'react';
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
import { Award, Star, ArrowLeft, Plus, RefreshCcw } from 'lucide-react';
import { nextKingOfGenius } from '@/lib/actions/king-of-genius';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { handleTimeout } from '@/lib/actions/king-of-genius';

interface RoundResultsProps {
  game: Game;
  self: Player;
  isHost: boolean;
  challenge: GeniusChallenge;
}

export function RoundResults({
  game,
  self,
  isHost,
  challenge,
}: RoundResultsProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Automatically proceed after a delay
  useEffect(() => {
      if (isHost) {
          const timer = setTimeout(() => {
              handleTimeout(game.id, self.id);
          }, 15000); // 15 seconds to view results
          return () => clearTimeout(timer);
      }
  }, [isHost, game.id, self.id]);
  
   const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await nextKingOfGenius(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }


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
            لنرى من هم العباقرة الحقيقيون!
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
         <CardFooter>
            {isHost ? (
                <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full">
                    {isSubmitting ? '...' : 'المتابعة'}
                </Button>
            ) : (
                <p className="w-full text-center text-muted-foreground animate-pulse">
                في انتظار المضيف لبدء الجولة التالية...
                </p>
            )}
        </CardFooter>
      </Card>
    </div>
  );
}
