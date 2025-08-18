
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { voteToKickArtist } from '@/lib/actions/draw-and-deceive';
import { Loader2, UserX, Shield, Timer } from 'lucide-react';
import { PlayerAvatar } from '../../PlayerAvatar';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface KickVotePhaseProps {
  game: Game;
  self: Player;
}

export function KickVotePhase({ game, self }: KickVotePhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const artist = useMemo(() => game.players.find(p => p.id === state.artistId), [game.players, state.artistId]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!state.timerEndsAt) return 30; // Fallback
    return Math.max(0, Math.round((state.timerEndsAt.toMillis() - Date.now()) / 1000));
  });

  const myVote = state.kickVote?.votes[self.id];
  const canVote = self.id !== artist?.id;

  useEffect(() => {
    if (timeLeft === 0) return;
    const timer = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleVote = async (decision: 'kick' | 'spare') => {
    if (isSubmitting || !canVote || myVote) return;
    setIsSubmitting(true);
    try {
      await voteToKickArtist(game.id, self.id, decision);
      // The state will update via snapshot listener
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'فشل إرسال التصويت', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const kickVotes = Object.values(state.kickVote?.votes ?? {}).filter(v => v === 'kick').length;
  const spareVotes = Object.values(state.kickVote?.votes ?? {}).filter(v => v === 'spare').length;

  if (!artist) {
    return <p>خطأ: الرسام غير موجود.</p>;
  }

  return (
    <Card className="w-full max-w-lg text-center">
      <CardHeader>
        <div className="flex flex-col items-center gap-2">
          <UserX className="w-16 h-16 text-destructive" />
          <CardTitle className="text-3xl">التصويت على طرد الرسام</CardTitle>
        </div>
        <CardDescription className="text-base pt-2">
          لم يقم <strong className="font-bold">{artist.name}</strong> بإدخال وصف لرسمته في الوقت المحدد. هل يجب طرده من دوره؟
        </CardDescription>
        <div className="flex justify-center items-center gap-2 pt-2">
          <Timer className="w-5 h-5"/>
          <span className="font-mono text-lg">{timeLeft}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {canVote && !myVote && (
          <div className="grid grid-cols-2 gap-4">
            <Button size="lg" variant="destructive" onClick={() => handleVote('kick')} disabled={isSubmitting}>
              <UserX className="mr-2" /> طرد
            </Button>
            <Button size="lg" variant="secondary" onClick={() => handleVote('spare')} disabled={isSubmitting}>
              <Shield className="mr-2" /> منحه فرصة
            </Button>
          </div>
        )}
        {myVote && (
          <p className="p-3 bg-green-100 dark:bg-green-900/30 rounded-md text-green-700 dark:text-green-300 font-semibold">
            تم تسجيل صوتك. في انتظار بقية اللاعبين...
          </p>
        )}
        {!canVote && (
          <p className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-md text-blue-700 dark:text-blue-300 font-semibold">
            أنت الرسام، لا يمكنك التصويت.
          </p>
        )}
        <div className="flex justify-around items-center pt-4">
          <div className="text-center">
            <p className="font-bold text-2xl text-destructive">{kickVotes}</p>
            <p className="text-sm text-muted-foreground">صوتوا للطرد</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-2xl text-primary">{spareVotes}</p>
            <p className="text-sm text-muted-foreground">صوتوا للمسامحة</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
