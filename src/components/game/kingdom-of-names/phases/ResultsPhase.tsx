'use client';

import React, { useCallback, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { nextRound } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Award, Share2 } from 'lucide-react';
import { PlayerAvatar } from '../../PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';

interface ResultsPhaseProps {
  game: Game;
  self: Player;
}

export default function ResultsPhase({ game, self }: ResultsPhaseProps) {
  const { toast } = useToast();
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const state = game.kingdomOfNamesState;
  const results = state?.results || { scores: {}, answers: [] };
  const roundScores = results.scores || {};
  const answersBreakdown = results.answers || [];

  const settings = state?.settings || { rounds: 7 };
  const currentRound = state?.currentRound || 1;

  // sorted players by this round points desc
  const playersThisRound = useMemo(() => {
    return Object.keys(roundScores)
      .map((id) => ({ id, ...(roundScores as any)[id] }))
      .sort((a, b) => (b.points || 0) - (a.points || 0));
  }, [roundScores]);

  // sorted players by cumulative score (game.playerScores)
  const playersOverall = useMemo(() => {
    return [...(game.players || [])]
      .map((p) => ({ ...p, total: game.playerScores?.[p.id] ?? 0 }))
      .sort((a, b) => b.total - a.total);
  }, [game.players, game.playerScores]);

  const groupedByCategory = useMemo(() => {
    const map: Record<string, { answer: string; points: number; reason: string; playerId?: string }[]> = {};
    for (const item of answersBreakdown) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category]!.push({ answer: item.answer, points: item.points, reason: item.reason, playerId: undefined });
    }
    // try to annotate playerId when possible by matching answer text in roundScores breakdowns
    for (const pId in roundScores) {
      const br = (roundScores as any)[pId].breakdown || [];
      for (const b of br) {
        // b.reason & b.points only — cannot reliably map the exact answer text here, so skip strict mapping
      }
    }
    return map;
  }, [answersBreakdown, roundScores]);

  const handleNextRound = useCallback(async () => {
    if (!isHost) return;
    if (!confirm('هل أنت متأكد أنك تريد الانتقال إلى الجولة التالية؟')) return;
    setIsSubmitting(true);
    try {
      await nextRound(game.id, self.id);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message || 'فشل الانتقال للجولة التالية', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, isHost, toast]);

  const handleShare = useCallback(async () => {
    try {
      const summary = playersOverall.map((p) => `${p.name}: ${p.total} نقطة`).join('\n');
      const text = `نتائج الجولة ${currentRound} — مملكة الأسماء\n\n${summary}`;
      if ((navigator as any).share) {
        await (navigator as any).share({ title: 'مملكة الأسماء — نتائج الجولة', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: 'تم نسخ ملخص النتائج إلى الحافظة' });
      }
    } catch {
      toast({ title: 'فشل المشاركة', variant: 'destructive' });
    }
  }, [playersOverall, currentRound, toast]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <Card className="w-full max-w-4xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-3">
            <Award className="w-8 h-8 text-yellow-500" />
            <CardTitle className="text-3xl">نتائج الجولة {currentRound} / {settings.rounds}</CardTitle>
          </div>
          <CardDescription>إليك نقاط هذه الجولة وتفصيل الإجابات. الترتيب العام مذكور أيضاً.</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* This round leaderboard */}
            <div className="md:col-span-1">
              <h4 className="font-bold text-center mb-3">ترتيب هذه الجولة</h4>
              <ScrollArea className="h-80">
                <div className="space-y-3 pr-3">
                  {playersThisRound.length === 0 && <div className="text-center text-zinc-500">لا توجد نقاط في هذه الجولة.</div>}
                  {playersThisRound.map((p, idx) => {
                    const player = game.players.find((pl) => pl.id === p.id);
                    return (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                        <div className="flex items-center gap-3">
                          <PlayerAvatar avatarId={player?.avatarId} className="w-10 h-10" />
                          <div>
                            <div className="font-semibold">{player?.name}</div>
                            <div className="text-xs text-zinc-500"># {idx + 1}</div>
                          </div>
                        </div>
                        <div className="font-bold text-primary">+{p.points}</div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Overall leaderboard */}
            <div className="md:col-span-1">
              <h4 className="font-bold text-center mb-3">الترتيب العام</h4>
              <ScrollArea className="h-80">
                <div className="space-y-3 pr-3">
                  {playersOverall.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-xs text-zinc-500">{p.total} نقطة</div>
                        </div>
                      </div>
                      <div className="text-sm text-zinc-600">#{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Answers breakdown */}
            <div className="md:col-span-1">
              <h4 className="font-bold text-center mb-3">تفصيل الإجابات</h4>
              <ScrollArea className="h-80">
                <div className="space-y-3 pr-3">
                  {answersBreakdown.length === 0 && <div className="text-center text-zinc-500">لا توجد إجابات مفصّلة.</div>}

                  {answersBreakdown.map((item, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{item.category}</div>
                        <div className={item.points > 0 ? 'text-green-600 font-bold' : 'text-red-500 font-semibold'}>{item.points > 0 ? `+${item.points}` : item.points}</div>
                      </div>
                      <div className="mt-1 font-mono truncate">{item.answer || '(فارغ)'}</div>
                      <div className="mt-1 text-xs text-zinc-500">{item.reason}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <div className="flex gap-3 w-full">
            {isHost && (
              <Button onClick={handleNextRound} disabled={isSubmitting} className="flex-1">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2" />} الجولة التالية
              </Button>
            )}

            <Button onClick={handleShare} variant="outline">
              <Share2 className="mr-2" /> مشاركة الملخص
            </Button>
          </div>

          {!isHost && <div className="text-center text-muted-foreground">في انتظار المضيف لبدء الجولة التالية...</div>}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
