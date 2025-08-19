'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { voteToKickArtist } from '@/lib/actions/draw-and-deceive';
import { Loader2, UserX, Shield, Timer as TimerIcon } from 'lucide-react';
import { PlayerAvatar } from '../../PlayerAvatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

interface KickVotePhaseProps {
  game: Game;
  self: Player;
}

export function KickVotePhase({ game, self }: KickVotePhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const kv = state.kickVote;

  // حراسة دفاعية
  if (!kv) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>لا يوجد تصويت نشط</CardTitle>
          <CardDescription>ستنتقل الجولة تلقائيًا عند انتهاء المؤقت.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const artist = useMemo(
    () => game.players.find((p) => p.id === state.artistId) || null,
    [game.players, state.artistId]
  );

  const youVoted = useMemo(() => {
    // نعتمد voterIds لتأخير أقل على الواجهة + نتوافق مع السيرفر
    if (kv?.voterIds?.includes(self.id)) return true;
    // fallback دفاعي
    return !!kv?.votes?.[self.id];
  }, [kv?.voterIds, kv?.votes, self.id]);

  const canVote = artist ? self.id !== artist.id : false;

  const totalTime = Math.max(1, state.settings?.kickVoteTime ?? 30);
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const ends = state.timerEndsAt?.toMillis?.();
    return ends ? Math.max(0, Math.round((ends - Date.now()) / 1000)) : totalTime;
  });

  // إعادة مزامنة العداد عند تغير timerEndsAt (من السنابشوت)
  useEffect(() => {
    const ends = state.timerEndsAt?.toMillis?.();
    if (!ends) return;
    setTimeLeft(Math.max(0, Math.round((ends - Date.now()) / 1000)));
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        const msLeft = ends - Date.now();
        if (msLeft <= 0) return 0;
        // نُحدّث ثانية بثانية (متوافق مع الواجهة)
        return Math.max(0, Math.round(msLeft / 1000));
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.timerEndsAt?.seconds]);

  const [submitting, setSubmitting] = useState<'kick' | 'spare' | null>(null);

  const handleVote = useCallback(
    async (choice: 'kick' | 'spare') => {
      if (!kv.active || !canVote || youVoted || submitting) return;
      try {
        setSubmitting(choice);
        await voteToKickArtist(game.id, self.id, choice);
      } catch (err: any) {
        toast({
          title: 'خطأ',
          description: err?.message ?? 'فشل إرسال التصويت',
          variant: 'destructive',
        });
      } finally {
        setSubmitting(null);
      }
    },
    [kv.active, canVote, youVoted, submitting, game.id, self.id, toast]
  );

  // إحصائيات أصوات
  const { kickCount, spareCount, eligibleVoters } = useMemo(() => {
    const vals = Object.values(kv.votes || {});
    const kickCount = vals.filter((v) => v === 'kick').length;
    const spareCount = vals.filter((v) => v === 'spare').length;
    const eligibleVoters = game.players.filter((p) => p.status !== 'left' && p.id !== state.artistId).length;
    return { kickCount, spareCount, eligibleVoters };
  }, [kv.votes, game.players, state.artistId]);

  const pct = Math.max(0, Math.min(100, Math.round((timeLeft / totalTime) * 100)));
  const barTone =
    timeLeft <= 5 ? '[&>*]:bg-red-500' : timeLeft <= 10 ? '[&>*]:bg-yellow-500' : '[&>*]:bg-primary';

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-2xl">
      <Card className="text-center">
        <CardHeader>
          <div className="flex flex-col items-center gap-3">
            <UserX className="w-14 h-14 text-destructive" />
            <CardTitle className="text-2xl md:text-3xl">التصويت على طرد الرسام</CardTitle>

            <div className="flex items-center gap-3">
              {artist && (
                <div className="flex items-center gap-2">
                  <PlayerAvatar player={artist} className="h-8 w-8" />
                  <span className="font-semibold">{artist.name}</span>
                </div>
              )}
            </div>
          </div>

          <CardDescription className="pt-2">
            لم يقم الفنان بإدخال الوصف في الوقت المحدد. هل تريد طرده من هذا الدور؟
          </CardDescription>

          <div className="flex justify-center items-center gap-2 pt-3">
            <TimerIcon className="w-5 h-5" />
            <span className="font-mono text-lg" aria-live="polite">
              {timeLeft}s
            </span>
          </div>

          <div
            className="mt-2 h-2 w-full rounded bg-muted overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className={cn('h-full transition-[width] duration-500', barTone)} style={{ width: `${pct}%` }} />
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <AnimatePresence mode="wait" initial={false}>
            {kv.active ? (
              <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {canVote && !youVoted ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      aria-label="التصويت للطرد"
                      size="lg"
                      variant="destructive"
                      onClick={() => handleVote('kick')}
                      disabled={!!submitting}
                      className="h-11"
                    >
                      {submitting === 'kick' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UserX className="mr-2 h-4 w-4" />
                      )}
                      طرد ({kickCount})
                    </Button>
                    <Button
                      aria-label="التصويت للمسامحة"
                      size="lg"
                      variant="secondary"
                      onClick={() => handleVote('spare')}
                      disabled={!!submitting}
                      className="h-11"
                    >
                      {submitting === 'spare' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Shield className="mr-2 h-4 w-4" />
                      )}
                      مسامحة ({spareCount})
                    </Button>
                  </div>
                ) : (
                  <motion.p
                    className="p-3 rounded-md text-sm font-semibold bg-muted"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {youVoted
                      ? 'تم تسجيل صوتك. في انتظار بقية اللاعبين…'
                      : 'أنت الفنان، لا يمكنك التصويت.'}
                  </motion.p>
                )}
              </motion.div>
            ) : (
              <motion.p key="inactive" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted-foreground">
                انتهى التصويت — ستستمر الجولة تلقائيًا.
              </motion.p>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-center gap-6 pt-2">
            <div className="text-center">
              <p className="font-bold text-2xl text-destructive">{kickCount}</p>
              <p className="text-xs text-muted-foreground">صوّتوا للطرد</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-2xl text-primary">{spareCount}</p>
              <p className="text-xs text-muted-foreground">صوّتوا للمسامحة</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-2xl">{eligibleVoters}</p>
              <p className="text-xs text-muted-foreground">عدد المسموح لهم بالتصويت</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
