
'use client';

import React, { useCallback, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { nextRound } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Award, Share2, CheckCircle2, XCircle } from 'lucide-react';
import { PlayerAvatar } from '../../PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface ResultsPhaseProps {
  game: Game;
  self: Player;
}

export default function ResultsPhase({ game, self }: ResultsPhaseProps) {
  const { toast } = useToast();
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const state = game.kingdomOfNamesState;
  const results = state?.results || { scores: {}, answers: [] };
  const roundScores = results.scores || {};
  
  const settings = state?.settings || { rounds: 7 };
  const currentRound = state?.currentRound || 1;
  const isFinalRound = currentRound >= settings.rounds;

  const playersThisRound = useMemo(() => {
    return Object.keys(roundScores)
      .map((id) => {
        const player = game.players.find(p => p.id === id);
        return {
          player,
          scoreData: (roundScores as any)[id] || { points: 0, breakdown: [] },
        };
      })
      .filter(item => item.player) // Filter out any cases where player might not be found
      .sort((a, b) => (b.scoreData.points || 0) - (a.scoreData.points || 0));
  }, [roundScores, game.players]);
  
  const playerAnswerDetails = useMemo(() => {
    const map: Record<string, { category: string; answer: string; points: number; reason: string }[]> = {};
    game.players.forEach(p => { map[p.id] = []; });
    
    // The results.answers array should now contain the playerId for each answer.
    results.answers?.forEach(item => {
        const playerId = (item as any).playerId; // We expect playerId to be here now
        if (playerId && map[playerId]) {
           map[playerId]!.push(item);
        }
    });

    return map;
  }, [results.answers, game.players]);


  const handleNextRound = useCallback(async () => {
    if (!isHost) return;
    setIsSubmitting(true);
    try {
      await nextRound(game.id, self.id);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message || 'فشل الانتقال للجولة التالية', variant: 'destructive' });
      setIsSubmitting(false); // Allow retry
    }
  }, [game.id, self.id, isHost, toast]);

  const handleShare = useCallback(async () => {
    try {
      const summary = playersThisRound.map((p, idx) => `#${idx + 1}: ${p.player!.name} (+${p.scoreData.points} نقطة)`).join('\n');
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
  }, [playersThisRound, currentRound, toast]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <Card className="w-full max-w-4xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-3">
            <Award className="w-8 h-8 text-yellow-500" />
            <CardTitle className="text-3xl">نتائج الجولة {currentRound} / {settings.rounds}</CardTitle>
          </div>
          <CardDescription>هنا تفاصيل نقاط هذه الجولة لكل لاعب.</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playersThisRound.map(({ player, scoreData }, index) => {
              if (!player) return null;
              const playerAnswers = playerAnswerDetails[player.id] || [];
              const rank = index + 1;
              const rankColor =
                rank === 1 ? 'border-yellow-400' :
                rank === 2 ? 'border-slate-400' :
                rank === 3 ? 'border-orange-400' : 'border-slate-300 dark:border-slate-700';

              return (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className={cn("bg-muted/40 rounded-lg p-3 border-t-4", rankColor)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
                        <span className="font-bold">{player.name}</span>
                    </div>
                    <div className="text-lg font-bold text-primary">+{scoreData.points}</div>
                  </div>
                  
                  <ScrollArea className="h-48 pr-2">
                    <div className="space-y-1 text-sm">
                      {playerAnswers.length > 0 ? playerAnswers.map((ans, i) => (
                        <div key={i} className="flex items-center justify-between text-xs p-1 rounded bg-background/50">
                          <div className="flex-1">
                            <span className="text-muted-foreground">{ans.category}:</span>
                            <span className="font-semibold ml-2">{ans.answer}</span>
                          </div>
                          <div className={cn("font-bold text-xs flex items-center gap-1", ans.points > 0 ? "text-green-600" : "text-red-500")}>
                             {ans.points > 0 ? <CheckCircle2 size={12} /> : <XCircle size={12}/>}
                             {ans.points > 0 ? `+${ans.points}` : ans.points}
                          </div>
                        </div>
                      )) : <p className="text-center text-xs text-muted-foreground pt-4">لم يقدم إجابات</p>}
                    </div>
                  </ScrollArea>
                </motion.div>
              );
            })}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-4">
          <div className="flex gap-3 w-full">
            {isHost && (
              <Button onClick={handleNextRound} disabled={isSubmitting} className="flex-1">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2" />}
                {isFinalRound ? 'النتائج النهائية' : 'الجولة التالية'}
              </Button>
            )}
            <Button onClick={handleShare} variant="outline" className="flex-none">
              <Share2 className="mr-2" /> مشاركة ملخص الجولة
            </Button>
             <Button onClick={() => router.push('/')} variant="ghost" className="flex-none">
              الخروج للرئيسية
            </Button>
          </div>
          {!isHost && <div className="text-center text-muted-foreground">في انتظار المضيف لبدء الجولة التالية...</div>}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
