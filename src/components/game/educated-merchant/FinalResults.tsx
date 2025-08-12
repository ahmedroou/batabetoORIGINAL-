
'use client';

import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion } from 'framer-motion';

interface FinalResultsProps {
  game: Game;
  self: Player;
}

export function FinalResults({ game, self }: FinalResultsProps) {
  const router = useRouter();
  
  const sortedPlayers = [...game.players].sort((a,b) => {
    if (a.status === 'bankrupt' && b.status !== 'bankrupt') return 1;
    if (b.status === 'bankrupt' && a.status !== 'bankrupt') return -1;
    if (a.status === 'bankrupt' && b.status === 'bankrupt') {
        return (b.bankruptAt?.toMillis() || 0) - (a.bankruptAt?.toMillis() || 0);
    }
    return (b.money || 0) - (a.money || 0);
  });
  
  const winner = game.players.find(p => p.id === game.gameResult?.winner);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, type: 'spring' }}
      className="w-full max-w-lg"
    >
      <Card className="text-center bg-white/90 backdrop-blur-sm border-gray-200 shadow-2xl">
        <CardHeader>
          <Trophy className="w-24 h-24 text-yellow-400 mx-auto animate-pulse" />
          <CardTitle className="text-5xl font-extrabold">انتهت اللعبة!</CardTitle>
          <CardDescription className="text-2xl font-bold text-primary mt-2">
            الفائز هو {winner?.name || 'غير محدد'}!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4">
            <h3 className="font-bold text-lg mb-2 text-center">الترتيب النهائي</h3>
            <div className="space-y-2">
                {sortedPlayers.map((p, index) => (
                     <motion.div
                        key={p.id}
                        className="flex justify-between items-center p-3 rounded-lg text-lg bg-muted"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0, transition: { delay: 0.5 + index * 0.1 } }}
                    >
                        <div className="flex items-center gap-3 font-bold">
                            <span className="w-6 text-center">{index + 1}.</span>
                            <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10"/>
                            <span>{p.name}</span>
                        </div>
                        <span className="font-bold">{p.money} دينار</span>
                    </motion.div>
                ))}
            </div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => router.push('/')} className="w-full" size="lg">
            العب مرة أخرى
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
