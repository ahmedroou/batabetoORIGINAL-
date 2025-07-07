
'use client';

import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { nextChallenge } from '@/lib/actions/king-of-genius';
import { Award, Star } from 'lucide-react';

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
      await nextChallenge(game.id, self.id);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const results = game.challengeState?.results || [];
  const teamAPlayers = game.players.filter(p => p.team === 'A').length;
  const teamBPlayers = game.players.filter(p => p.team === 'B').length;
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
      <Card className="text-center bg-gray-800/50 border-primary/30">
        <CardHeader>
          <Award className="w-20 h-20 text-yellow-400 mx-auto" />
          <CardTitle className="text-4xl">نتائج جولة: {challenge.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right">
            {/* Winners */}
            <div className="space-y-3">
                <h3 className="text-2xl font-bold text-green-400 border-b-2 border-green-400/50 pb-2">التصنيف</h3>
                {sortedResults.length > 0 ? (
                    <ol className="list-decimal list-inside space-y-2">
                    {sortedResults.map((res, index) => {
                        const player = getPlayerById(res.playerId);
                        const points = (player?.team === 'A' ? teamAPlayers : teamBPlayers) - index;
                        return (
                            <li key={res.playerId} className="p-2 bg-gray-700/50 rounded-md flex justify-between items-center">
                                <span className="font-bold">{player?.name || 'Unknown'}</span>
                                <span className="text-sm font-mono text-gray-400">{res.time.toFixed(2)}s</span>
                                <span className="font-bold text-green-400">+{points > 0 ? points : 0} pts</span>
                            </li>
                        )
                    })}
                    </ol>
                ) : <p className="text-muted-foreground">لم يجب أحد بشكل صحيح!</p>}
            </div>
            {/* Scores */}
            <div className="space-y-4">
                <h3 className="text-2xl font-bold text-yellow-400 border-b-2 border-yellow-400/50 pb-2">مجموع النقاط</h3>
                <div className="flex justify-around items-center text-4xl font-extrabold p-4 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center gap-4 text-blue-400">
                        <Star className="w-10 h-10"/>
                        <span>{game.teamScores?.A || 0}</span>
                    </div>
                     <div className="flex items-center gap-4 text-red-400">
                        <Star className="w-10 h-10"/>
                        <span>{game.teamScores?.B || 0}</span>
                    </div>
                </div>
            </div>
          </div>
          {isHost && (
            <Button onClick={handleNextChallenge} disabled={isSubmitting} size="lg" className="mt-6">
              {isSubmitting ? 'جاري التحميل...' : 'الجولة التالية'}
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
