'use client';

import React, { useCallback, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { nextRound } from '@/lib/actions/draw-and-deceive';
import { Loader2, ArrowRight, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// ====================================================================================
// Types derived from backend contract (keep in sync with actions)
// ====================================================================================
interface RoundBreakdownItem { reason: string; points: number }
interface RoundBucket { points: number; breakdown: RoundBreakdownItem[] }
interface AnswerResult { answer: string; isCorrect: boolean; authorIds: string[]; guesserIds: string[] }
interface LastRoundResults { scores: Record<string, RoundBucket>; answers: AnswerResult[] }

interface ResultsPhaseProps {
  game: Game;
  self: Player;
}

export function ResultsPhase({ game, self }: ResultsPhaseProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const state = game.drawAndDeceiveState;
  const results = (state?.lastRoundResults ?? null) as LastRoundResults | null;

  // Quick maps to avoid repeated scans
  const playerById = useMemo(() => {
    const m = new Map<string, Player>();
    game.players.forEach((p) => m.set(p.id, p));
    return m;
  }, [game.players]);

  const artist = state?.artistId ? playerById.get(state.artistId) : undefined;
  const isHost = game.hostId === self.id;
  const roundsTotal = state?.settings?.rounds ?? 1;
  const roundNumber = state?.round ?? 1;
  const isFinalRound = roundNumber >= roundsTotal;

  const handleNextRound = useCallback(async () => {
    if (isSubmitting || !isHost) return;
    setIsSubmitting(true);
    try {
      await nextRound(game.id, self.id);
    } catch (error: any) {
      toast({
        title: 'خطأ',
        description: error?.message ?? 'حدث خطأ غير متوقع',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, isHost, isSubmitting, toast]);

  // Defensive UI if data not yet available
  if (!state || !results || !artist) {
    return (
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">نتائج الجولة</CardTitle>
          <CardDescription>يتم تحضير النتائج…</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.25 } }),
  } as const;

  const sortedScores = useMemo(() => {
    const entries = Object.entries(results.scores);
    return entries
      .map(([pid, bucket]) => ({ pid, total: bucket.points || 0, breakdown: bucket.breakdown }))
      .sort((a, b) => b.total - a.total);
  }, [results.scores]);

  const downloadImage = () => {
    const url = state.drawingDataUrl;
    if (!url) return;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `drawing_round_${roundNumber}.png`;
      a.click();
    } catch (e) {
      // Fallback toast only
      toast({ title: 'تعذّر التحميل', description: 'جرّب الضغط المطوّل/حفظ الصورة.', variant: 'destructive' });
    }
  };

  return (
    <Card className="w-full max-w-3xl border-muted shadow-sm">
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-2xl tracking-tight">نتائج الجولة {roundNumber} / {roundsTotal}</CardTitle>
        <CardDescription className="text-base flex flex-wrap items-center justify-center gap-2">
          <span>الوصف الصحيح:</span>
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            <strong className="text-primary font-semibold">{state.correctAnswer}</strong>
          </span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* الرسم */}
        {state.drawingDataUrl ? (
          <div className="relative aspect-video w-full max-w-2xl mx-auto overflow-hidden rounded-xl border bg-background">
            <Image
              src={state.drawingDataUrl}
              alt={`رسم ${artist.name}`}
              fill
              priority
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 768px"
            />
            <div className="absolute bottom-2 right-2 flex gap-2">
              <Button size="sm" variant="secondary" className="gap-2" onClick={downloadImage}>
                <Download className="h-4 w-4" />
                حفظ الرسم
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-2xl mx-auto rounded-xl border p-6 text-center text-sm text-muted-foreground">
            لا يوجد رسم في هذه الجولة.
          </div>
        )}

        {/* الإجابات والاختيارات */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">الإجابات والتصويت</p>
            <p className="text-xs text-muted-foreground">
              الرسّام: <span className="font-medium">{artist.name}</span>
            </p>
          </div>
          <ScrollArea className="h-72 md:h-80 lg:h-96">
            <div className="space-y-3 p-1">
              {(results.answers || []).map((item, idx) => {
                const isCorrect = !!item.isCorrect;
                const authors = (item.authorIds ?? [])
                  .map((id) => playerById.get(id)?.name)
                  .filter(Boolean) as string[];
                const guessers = (item.guesserIds ?? [])
                  .map((id) => playerById.get(id))
                  .filter((p): p is Player => !!p);

                return (
                  <motion.div key={`${item.answer}-${idx}`} custom={idx} variants={itemVariants} initial="hidden" animate="show">
                    <div
                      className={cn(
                        'rounded-lg border p-3 md:p-4 transition-colors',
                        isCorrect && 'bg-emerald-500/5 border-emerald-500/40'
                      )}
                      role="group"
                      aria-label={isCorrect ? 'الإجابة الصحيحة' : 'إجابة فخ'}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-semibold text-base md:text-lg leading-snug break-words">{item.answer}</p>

                        <div className="text-xs sm:text-[11px] text-muted-foreground flex items-center gap-1.5">
                          {isCorrect ? (
                            <>
                              <CheckCircle2 className="h-4 w-4" aria-hidden />
                              <span className="font-medium">الجواب الصحيح</span>
                              <span className="opacity-70">•</span>
                              <span>بواسطة {artist.name}</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="h-4 w-4" aria-hidden />
                              <span className="opacity-80">فخ بواسطة:</span>
                              <span className="font-medium truncate">{authors.length ? authors.join(', ') : '—'}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {guessers.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center gap-2 text-xs font-medium mb-2">المصوّتون:</div>
                          <div className="flex flex-wrap gap-2">
                            {guessers.map((g) => (
                              <div key={g.id} className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1">
                                <PlayerAvatar avatarId={g.avatarId} className="w-4 h-4 shrink-0" />
                                <span className="text-xs leading-none">{g.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* ملخص النقاط */}
        <div className="rounded-xl border">
          <div className="px-4 pt-4">
            <p className="text-sm font-semibold">ملخص النقاط</p>
          </div>
          <div className="p-2 sm:p-3">
            <ul className="divide-y">
              {sortedScores.map(({ pid, total, breakdown }) => {
                const p = playerById.get(pid);
                if (!p) return null;
                return (
                  <li key={pid} className="py-2.5 sm:py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-relaxed">
                            {breakdown.map((bd, i) => (
                              <span
                                key={i}
                                className={cn('rounded-md border px-1.5 py-0.5', bd.points > 0 ? 'border-emerald-500/40' : 'border-red-500/40')}
                              >
                                {bd.points > 0 ? `+${bd.points}` : bd.points} {bd.reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-base sm:text-lg font-bold tabular-nums">{total}</div>
                        <div className="text-[10px] text-muted-foreground">نقاط</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
        {isHost ? (
          <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <ArrowRight className="me-2" />
                {isFinalRound ? 'عرض النتائج النهائية' : 'الجولة التالية'}
              </>
            )}
          </Button>
        ) : (
          <p className="text-center w-full text-muted-foreground animate-pulse" role="status" aria-live="polite">
            في انتظار المضيف…
          </p>
        )}
      </CardFooter>
    </Card>
  );
}

export default ResultsPhase;
