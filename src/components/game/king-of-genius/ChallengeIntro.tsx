
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Game, GeniusChallenge, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { handleTimeout } from '@/lib/actions/king-of-genius';
import { useAuth } from '@/hooks/useAuth';

interface ChallengeIntroProps {
  game: Game;
  challenge: GeniusChallenge;
  self: Player;
  isHost: boolean;
}

const INTRO_COUNTDOWN_SECONDS = 5;

export function ChallengeIntro({ game, challenge, self, isHost }: ChallengeIntroProps) {
  const { user } = useAuth();
  
  const [countdown, setCountdown] = useState(INTRO_COUNTDOWN_SECONDS);

  const timeoutCalledRef = useRef(false);

  const handleStartNextPhase = useCallback(async () => {
      if (isHost && user && !timeoutCalledRef.current) {
        timeoutCalledRef.current = true;
        try {
            await handleTimeout(game.id, user.uid);
        } catch (e) {
            console.error("Error in timeout handler:", e);
        }
      }
  }, [isHost, user, game.id]);

  useEffect(() => {
    const introEndTime = game.challengeState?.timerEndsAt?.toMillis();
    if (!introEndTime) {
      handleStartNextPhase(); // If no end time, host should advance immediately
      return;
    };
    
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((introEndTime - Date.now()) / 1000));
      setCountdown(remaining);
      
      if (remaining <= 0) {
        handleStartNextPhase();
      }
    };
    
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [game.challengeState?.timerEndsAt, handleStartNextPhase]);

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
                            transition={{ duration: INTRO_COUNTDOWN_SECONDS, ease: "linear" }}
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
