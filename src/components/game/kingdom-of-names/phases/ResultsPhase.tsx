'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { Game, Player } from '@/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { Loader2, ArrowRight, Trophy, Medal, Info, Sparkles, Crown, Copy, Share2 } from 'lucide-react';
import { nextRound } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { PlayerAvatar } from '../../PlayerAvatar';

// Optional confetti for round winner
import dynamic from 'next/dynamic';
const Confetti = dynamic(() => import('react-confetti'), { ssr: false, loading: () => null });

interface ResultsPhaseProps {
  game: Game;
  self: Player;
}

// -------- Types inferred from existing data shape -------- //
// You can refine these to your exact backend contracts.
interface RoundScoreData {
  points: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

interface AnswerItem {
  category: string;
  answer: string;
  points: number;
  reason?: string;
  // Optional: if backend attaches owner of the answer
  playerId?: string;
}

export default function ResultsPhase({ game, self }: ResultsPhaseProps) {
  const { toast } = useToast();
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const results = game.kingdomOfNamesState?.results || {};
  const roundScores = (results.scores || {}) as Record<string, RoundScoreData>;
  const answersBreakdown = (results.answers || []) as AnswerItem[];
  const currentRound = game.kingdomOfNamesState?.currentRound ?? 1;

  // ---------- Derived data ---------- //
  const playersById = useMemo(() => Object.fromEntries(game.players.map(p => [p.id, p])), [game.players]);

  const sortedScores = useMemo(() => {
    const items = Object.entries(roundScores).map(([playerId, scoreData]) => ({
      playerId,
      points: Number(scoreData?.points ?? 0),
      player: playersById[playerId],
    }));
    return items.sort((a, b) => b.points - a.points);
  }, [roundScores, playersById]);

  const winner = sortedScores[0];
  const selfScore = sortedScores.find(s => s.playerId === self.id)?.points ?? 0;
  const totalPoints = useMemo(() => sortedScores.reduce((acc, s) => acc + (s.points || 0), 0), [sortedScores]);
  const positiveAnswers = answersBreakdown.filter(a => a.points > 0).length;

  const hasData = sortedScores.length > 0 || answersBreakdown.length > 0;

  // ---------- Effects ---------- //
  useEffect(() => {
    if (!winner || winner.points <= 0) return;
    // Subtle celebratory toast for winner and for anyone scoring > 0
    if (self.id === winner.playerId) {
      toast({
        title: '🎉 أحسنت! الفائز بهذه الجولة',
        description: `حققت ${winner.points} نقطة في الجولة ${currentRound}.`,
      });
    } else if (selfScore > 0) {
      toast({ title: '👏 جولة موفقة', description: `أضفت ${selfScore} نقطة إلى رصيدك.` });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confetti viewport size
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---------- Actions ---------- //
  const handleNextRound = useCallback(async () => {
    if (!isHost) return;
    setIsSubmitting(true);
    try {
      await nextRound(game.id, self.id);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'تعذر بدء الجولة التالية', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [isHost, game.id, self.id, toast]);

  const copySummary = useCallback(async () => {
    const lines: string[] = [];
    lines.push(`نتائج الجولة ${currentRound}`);
    sortedScores.forEach((s, idx) => {
      const name = s.player?.name ?? `لاعب ${idx + 1}`;
      const sign = s.points > 0 ? '+' : '';
      lines.push(`${idx + 1}. ${name} — ${sign}${s.points}`);
    });
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast({ title: 'تعذر النسخ', description: 'حاول مجددًا أو اعطِ صلاحية للمتصفح.', variant: 'destructive' });
    }
  }, [sortedScores, currentRound, toast]);

  const shareSummary = useCallback(async () => {
    const text = `نتائج الجولة ${currentRound}: ` + sortedScores.map(s => `${s.player?.name ?? 'لاعب'} (${s.points})`).join('، ');
    if (navigator.share) {
      try {
        await navigator.share({ title: `نتائج الجولة ${currentRound}`, text });
      } catch {
        /* ignored */
      }
    } else {
      copySummary();
    }
  }, [sortedScores, currentRound, copySummary]);

  // ---------- UI helpers ---------- //
  const rankBadge = (idx: number) => {
    if (idx === 0) return (
      <Badge className="bg-yellow-500/90 text-black hover:bg-yellow-500">
        <Crown className="w-3.5 h-3.5 ms-1" /> بطل الجولة
      </Badge>
    );
    if (idx === 1) return (
      <Badge variant="secondary" className="bg-neutral-300 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-200">
        <Medal className="w-3.5 h-3.5 ms-1" /> المركز الثاني
      </Badge>
    );
    if (idx === 2) return (
      <Badge variant="outline">
        <Medal className="w-3.5 h-3.5 ms-1" /> المركز الثالث
      </Badge>
    );
    return null;
  };

  const scoreColor = (points: number) => (points > 0 ? 'text-emerald-600 dark:text-emerald-400' : points < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground');

  return (
    <div className="relative">
      {/* Confetti for round winner (only visible to the winner locally) */}
      {winner && self.id === winner.playerId && winner.points > 0 && (
        <Confetti numberOfPieces={180} recycle={false} width={viewport.width} height={viewport.height} gravity={0.15} />
      )}

      <Card
        className="w-full max-w-5xl mx-auto overflow-hidden relative border-muted/60 bg-gradient-to-b from-background to-background/60 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/70"
      >
        {/* Decorative top bar */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-fuchsia-500 via-amber-400 to-sky-500" />

        <CardHeader className="text-center space-y-3 py-6">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5" />
            <span>نمط: مملكة الأسماء</span>
          </div>
          <CardTitle className="text-3xl sm:text-4xl tracking-tight">نتائج الجولة {currentRound}</CardTitle>
          <CardDescription className="text-base">ملخص النقاط والتفاصيل لكل لاعب في هذه الجولة.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Top KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border p-4 bg-muted/40">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">أعلى نتيجة</span>
                <Trophy className="w-4 h-4" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-bold">{winner ? winner.points : 0}</p>
                <span className="text-sm text-muted-foreground">{winner?.player?.name ?? '—'}</span>
              </div>
            </div>
            <div className="rounded-2xl border p-4 bg-muted/40">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">إجمالي نقاط الجولة</span>
                <Info className="w-4 h-4" />
              </div>
              <p className="mt-2 text-2xl font-bold">{totalPoints}</p>
            </div>
            <div className="rounded-2xl border p-4 bg-muted/40">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">إجابات صحيحة</span>
                <Sparkles className="w-4 h-4" />
              </div>
              <p className="mt-2 text-2xl font-bold">{positiveAnswers}</p>
            </div>
          </div>

          <Separator />

          {/* Tabs: Scores / Answers */}
          <Tabs defaultValue="scores" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="scores">نقاط اللاعبين</TabsTrigger>
              <TabsTrigger value="answers">تفاصيل الإجابات</TabsTrigger>
            </TabsList>

            {/* Scores */}
            <TabsContent value="scores" className="mt-4">
              {hasData ? (
                <div className="space-y-4">
                  <ScrollArea className="h-96">
                    <div className="space-y-3 pe-4">
                      {sortedScores.map((row, idx) => {
                        const player = row.player;
                        if (!player) return null;
                        const percent = winner && winner.points > 0 ? Math.max(0, Math.min(100, (row.points / winner.points) * 100)) : 0;
                        return (
                          <div
                            key={player.id}
                            className="p-3 rounded-xl border bg-card/60 hover:bg-card transition-colors"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative">
                                  <PlayerAvatar avatarId={player.avatarId} className="w-9 h-9" />
                                  {idx === 0 && <Crown className="w-4 h-4 text-yellow-500 absolute -top-1 -left-1" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold truncate max-w-[12rem]">{player.name}</p>
                                    {rankBadge(idx)}
                                  </div>
                                  <div className="mt-2">
                                    <Progress value={percent} aria-label={`تقدّم ${player.name}`} />
                                  </div>
                                </div>
                              </div>
                              <div className={`shrink-0 text-lg font-bold tabular-nums ${scoreColor(row.points)}`}>
                                {row.points > 0 ? '+' : ''}{row.points}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>لا توجد بيانات بعد</AlertTitle>
                  <AlertDescription>سيظهر الملخص هنا بعد احتساب النقاط.</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* Answers */}
            <TabsContent value="answers" className="mt-4">
              {answersBreakdown.length ? (
                <ScrollArea className="h-96">
                  <div className="space-y-3 pe-4">
                    {answersBreakdown.map((item, index) => (
                      <div key={`${item.category}-${index}`} className="p-3 rounded-xl border bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm"><strong>{item.category}:</strong> <span className="font-mono break-words">{item.answer}</span></p>
                            {item.reason && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.reason}</p>
                            )}
                          </div>
                          <div className={`text-sm sm:text-base font-semibold shrink-0 ${scoreColor(item.points)}`}>
                            {item.points > 0 ? '+' : ''}{item.points} نقطة
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>لا توجد تفاصيل</AlertTitle>
                  <AlertDescription>سيتم عرض مبررات التقييم هنا حال توفرها.</AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1 flex flex-wrap gap-2">
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button variant="secondary" onClick={copySummary} disabled={!hasData}>
                    <Copy className="w-4 h-4 ms-1" /> {copied ? 'تم النسخ!' : 'نسخ الملخص'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>انسخ ملخص الجولة لمشاركته مع الآخرين</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button variant="outline" onClick={shareSummary} disabled={!hasData}>
              <Share2 className="w-4 h-4 ms-1" /> مشاركة
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost">عرض المتصدرين</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>لوحة الشرف — الجولة {currentRound}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 mt-2">
                  {sortedScores.slice(0, 10).map((s, idx) => (
                    <div key={s.playerId} className="flex items-center justify-between p-2 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold">
                          {idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <PlayerAvatar avatarId={s.player?.avatarId} className="w-7 h-7" />
                          <span className="font-medium">{s.player?.name ?? '—'}</span>
                          {rankBadge(idx)}
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${scoreColor(s.points)}`}>{s.points > 0 ? '+' : ''}{s.points}</span>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isHost ? (
            <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? <Loader2 className="animate-spin" /> : <ArrowRight className="ms-2" />}
              الجولة التالية
            </Button>
          ) : (
            <p className="w-full sm:w-auto text-center text-muted-foreground animate-pulse" aria-live="polite">
              في انتظار المضيف لبدء الجولة التالية...
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
