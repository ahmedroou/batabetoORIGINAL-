
'use client';

import { useState, useEffect } from 'react';
import type { Game, GeniusChallenge, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { beginChallenge } from '@/lib/actions/king-of-genius';

interface ChallengeIntroProps {
  game: Game;
  challenge: GeniusChallenge;
  self: Player;
  isHost: boolean;
}

export function ChallengeIntro({ game, challenge, self, isHost }: ChallengeIntroProps) {
  const [countdown, setCountdown] = useState(5);
  const [actionCalled, setActionCalled] = useState(false);


  useEffect(() => {
    if (countdown === 0) {
       if (isHost && !actionCalled) {
        setActionCalled(true);
        beginChallenge(game.id, self.id);
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, isHost, actionCalled, game.id, self.id]);

  return (
    <div className="w-full max-w-2xl">
      <Card className="text-center bg-white/90 backdrop-blur-sm border-gray-200">
        <CardHeader>
            <CardDescription>الجولة القادمة</CardDescription>
            <CardTitle className="text-5xl font-extrabold text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-lg text-muted-foreground mb-6">{challenge.description}</p>
            <div className="relative w-32 h-32 mx-auto">
                <motion.div
                    initial={{ pathLength: 1 }}
                    animate={{ pathLength: 0 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0"
                >
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        <circle cx="50" cy="50" r="45" stroke="hsl(var(--muted))" strokeWidth="10" fill="transparent" />
                        <motion.circle cx="50" cy="50" r="45" stroke="hsl(var(--primary))" strokeWidth="10" fill="transparent"
                            strokeDasharray="282.74"
                            initial={{ pathLength: 1 }}
                            animate={{ pathLength: 0 }}
                            transition={{ duration: 5, ease: "linear" }}
                        />
                    </svg>
                </motion.div>
                <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold font-mono text-foreground">
                    {countdown}
                </div>
            </div>
             <p className="mt-4 text-sm text-muted-foreground animate-pulse">استعد...</p>
        </CardContent>
      </Card>
    </div>
  );
}
