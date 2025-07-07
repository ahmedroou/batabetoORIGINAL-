
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Award, Star, ArrowLeft } from 'lucide-react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';

interface RoundResultsProps {
  game: Game;
  self: Player;
  isHost: boolean;
  challenge: GeniusChallenge;
}

export function RoundResults({ game, self, isHost, challenge }: RoundResultsProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNextChallenge = async () => {
    setIsSubmitting(true);
    try {
      const gameRef = doc(db, 'games', game.id);
      await runTransaction(db, async (transaction) => {
          const gameDoc = await transaction.get(gameRef);
          if (!gameDoc.exists()) throw new Error("Game not found.");
          const gameData = gameDoc.data() as Game;

          if (gameData.hostId !== self.id) {
              throw new Error("Only the host can start the next round.");
          }

          const nextIndex = (gameData.currentChallengeIndex || 0) + 1;

          if (nextIndex >= (gameData.challengeOrder?.length || 0)) {
              transaction.update(gameRef, { gameState: 'final_results' });
          } else {
              transaction.update(gameRef, {
                  currentChallengeIndex: nextIndex,
                  gameState: 'challenge_intro',
                  challengeState: null,
              });
          }
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const results = game.challengeState?.results || [];
  const teamAPlayersCount = game.players.filter(p => p.team === 'A').length;
  const teamBPlayersCount = game.players.filter(p => p.team === 'B').length;
  
  const sortedResults = [...results]
        .filter(r => r.isCorrect)
        .sort((a, b) => a.time - b.time);
        
  const getPlayerById = (id: string) => game.players.find(p => p.id === id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl"
    >
      <Card className="text-white bg-gray-900/80 border-gray-700 backdrop-blur-sm">
        <CardHeader className="text-center">
          <Award className="w-20 h-20 text-yellow-400 mx-auto" />
          <CardTitle className="text-4xl">نتائج جولة: {challenge.name}</CardTitle>
          <CardDescription className="text-gray-400">لنرى من هم العباقرة الحقيقيون!</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg">
                <h3 className="text-2xl font-bold text-green-400 border-b-2 border-green-400/50 pb-2 text-center">التصنيف</h3>
                {sortedResults.length > 0 ? (
                    <ol className="space-y-2">
                    {sortedResults.map((res, index) => {
                        const player = getPlayerById(res.playerId);
                        if (!player) return null;
                        
                        const teamSize = player.team === 'A' ? teamAPlayersCount : teamBPlayersCount;
                        const points = Math.max(0, teamSize - index);
                        const playerTeamColor = player.team === 'A' ? 'border-blue-500' : 'border-red-500';

                        return (
                            <motion.li 
                                key={res.playerId} 
                                className="p-3 bg-gray-700/50 rounded-lg flex justify-between items-center border-r-4"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0, transition: { delay: index * 0.1 } }}
                                style={{ borderColor: player.team === 'A' ? '#60a5fa' : '#f87171' }}
                            >
                                <div className="flex items-center gap-3">
                                    <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
                                    <span className="font-bold text-lg">{player.name}</span>
                                </div>
                                <div className="text-center">
                                    <span className="text-sm font-mono text-gray-400">{res.time.toFixed(2)} ثانية</span>
                                </div>
                                <span className="font-bold text-green-400 text-lg">+{points}</span>
                            </motion.li>
                        )
                    })}
                    </ol>
                ) : <p className="text-gray-400 text-center py-8">لم يتمكن أحد من حل التحدي بشكل صحيح!</p>}
            </div>
            
            <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg flex flex-col justify-center">
                <h3 className="text-2xl font-bold text-yellow-400 border-b-2 border-yellow-400/50 pb-2 text-center">مجموع النقاط</h3>
                <div className="flex justify-around items-center text-6xl font-extrabold p-4 rounded-lg">
                    <div className="flex flex-col items-center gap-2 text-blue-400">
                        <Star className="w-12 h-12"/>
                        <span>{game.teamScores?.A || 0}</span>
                        <p className="text-lg font-semibold">الفريق الأزرق</p>
                    </div>
                     <div className="flex flex-col items-center gap-2 text-red-400">
                        <Star className="w-12 h-12"/>
                        <span>{game.teamScores?.B || 0}</span>
                        <p className="text-lg font-semibold">الفريق الأحمر</p>
                    </div>
                </div>
            </div>
          </div>
          <div className="text-center pt-4">
            {isHost ? (
                <Button onClick={handleNextChallenge} disabled={isSubmitting} size="lg" variant="secondary" className="text-lg">
                    {isSubmitting ? 'جاري التحميل...' : 'الجولة التالية'}
                    <ArrowLeft className="mr-2" />
                </Button>
            ) : (
                <p className="text-gray-400 animate-pulse">في انتظار المضيف لبدء الجولة التالية...</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
