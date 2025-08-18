'use client';

import React, { useMemo, useRef, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy, Crown, Medal, Share2, Copy, Download, RotateCcw } from 'lucide-react';
import { PlayerAvatar } from '../../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FinalResultsPhaseProps {
  game: Game;
  self: Player;
}

/**
 * FinalResultsPhase — Polished & compact results screen
 *
 * Highlights:
 * - Compact winner header with subtle gradient ring & crown overlay
 * - Smooth list animations and responsive, scrollable scoreboard
 * - Tie-aware ranking and clear medal colors for top 3
 * - "You" highlighting, accessible labels, and arabic number formatting
 * - Quick actions: Play again, Share, Copy link, Save as image (optional)
 *
 * Drop-in: preserves props and overall structure of the original component.
 */
export function FinalResultsPhase({ game, self }: FinalResultsPhaseProps) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fmt = new Intl.NumberFormat('ar-EG');

  const playersWithScores = useMemo(() => {
    const entries = Object.entries(game.playerScores || {});
    const byId = new Map((game.players || []).map(p => [p.id, p]));

    const list = entries
      .map(([playerId, rawScore]) => {
        const base = byId.get(playerId);
        if (!base) return null;
        const score = typeof rawScore === 'number' ? rawScore : Number(rawScore ?? 0);
        return { ...base, score } as Player & { score: number };
      })
      .filter(Boolean) as Array<Player & { score: number }>;

    // Sort by score desc, then by name to keep it stable for ties
    list.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name, 'ar'));

    return list;
  }, [game.playerScores, game.players]);

  const winner = playersWithScores[0];

  // Compute ranks that are tie-aware: players with same score share the same rank
  const ranks = useMemo(() => {
    const map = new Map<string, number>();
    let currentRank = 0;
    let lastScore: number | null = null;
    playersWithScores.forEach((p, idx) => {
      if (lastScore === null || p.score !== lastScore) {
        currentRank = idx + 1;
        lastScore = p.score;
      }
      map.set(p.id, currentRank);
    });
    return map; // playerId -> rank
  }, [playersWithScores]);

  async function handleExportPNG() {
    setExportError(null);
    if (!boardRef.current) return;
    try {
      setExporting(true);
      const htmlToImage = await import('html-to-image');
      const dataUrl = await htmlToImage.toPng(boardRef.current, {
        pixelRatio: window.devicePixelRatio || 2,
        cacheBust: true,
        backgroundColor: '#0b0b0b00',
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `نتائج-اللعبة-${game.id ?? ''}.png`;
      a.click();
    } catch (err) {
      console.error(err);
      setExportError('تعذر حفظ الصورة. تأكد من تثبيت html-to-image أو حاول مجددًا.');
    } finally {
      setExporting(false);
    }
  }

  function handleShare() {
    const title = 'نتائج اللعبة';
    const text = winner ? `الفائز: ${winner.name} — ${fmt.format(winner.score)} نقطة` : 'استعرض النتائج';
    const url = typeof window !== 'undefined' ? window.location.href : '';

    if (navigator.share) {
      navigator.share({ title, text, url }).catch(() => {/* ignore */});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {/* ignore */});
    }
  }

  function handleCopyLink() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {/* ignore */});
  }

  const hasScores = playersWithScores.length > 0;

  return (
    <motion.section
      dir="rtl"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'w-full flex items-center justify-center px-3 sm:px-6 py-6',
        'bg-gradient-to-br from-background via-background to-background'
      )}
    >
      <div className="w-full max-w-3xl">
        {/* Wrapper gradient ring */}
        <div className="p-[2px] rounded-3xl bg-gradient-to-tr from-amber-400/60 via-rose-400/50 to-indigo-400/60">
          <Card className="rounded-[22px] shadow-xl border-muted/50 bg-background/80 backdrop-blur">
            {/* Winner header */}
            <CardHeader className="relative overflow-hidden rounded-t-[22px] text-center">
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.15),transparent_60%),
                                                   radial-gradient(ellipse_at_bottom_right,rgba(244,63,94,0.12),transparent_60%)]"/>
              <div className="flex flex-col items-center gap-2">
                <motion.div
                  initial={{ rotate: -10, scale: 0.9, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 240, damping: 16 }}
                  className="relative"
                  aria-hidden
                >
                  <Trophy className="w-20 h-20 md:w-24 md:h-24 text-yellow-400 drop-shadow" />
                  {winner && (
                    <Crown className="w-8 h-8 text-yellow-500 absolute -top-2 -left-2 rotate-12" />
                  )}
                </motion.div>

                <CardTitle className="text-2xl md:text-3xl tracking-tight">انتهت اللعبة!</CardTitle>
                <CardDescription className="text-lg md:text-xl">
                  {hasScores ? (
                    <span>الفائز هو <span className="font-semibold">{winner?.name}</span></span>
                  ) : (
                    <span>لا توجد نتائج متاحة بعد</span>
                  )}
                </CardDescription>

                {winner && (
                  <div className="mt-1 flex items-center gap-2 rounded-full border px-3 py-1 text-sm bg-muted/40">
                    <span className="opacity-70">مجموع نقاطه</span>
                    <strong className="tabular-nums">{fmt.format(winner.score)}</strong>
                  </div>
                )}
              </div>
            </CardHeader>

            {/* Scoreboard */}
            <CardContent>
              <div ref={boardRef} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base md:text-lg font-semibold">لوحة النتائج</h3>
                  <div className="text-xs opacity-70">{fmt.format(playersWithScores.length)} لاعب</div>
                </div>

                <div className="max-h-[50vh] overflow-auto rounded-xl border bg-muted/30">
                  <ul className="divide-y">
                    <AnimatePresence initial={false}>
                      {playersWithScores.map((p) => {
                        const rank = ranks.get(p.id) ?? 0;
                        const isYou = p.id === self?.id;
                        const isWinner = rank === 1;
                        return (
                          <motion.li
                            key={p.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                            className={cn(
                              'flex items-center justify-between gap-3 px-3 py-2.5',
                              isWinner && 'bg-amber-50/40 dark:bg-amber-950/10',
                              isYou && !isWinner && 'bg-primary/5'
                            )}
                            aria-label={`المرتبة ${rank}: ${p.name} — ${fmt.format(p.score)} نقطة`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <RankBadge rank={rank} />
                              <PlayerAvatar avatarId={(p as any).avatarId} className="w-9 h-9" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate max-w-[40vw] md:max-w-[24rem]">{p.name}</span>
                                  {isYou && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">أنت</span>
                                  )}
                                </div>
                                <div className="text-xs opacity-60">المرتبة {fmt.format(rank)}</div>
                              </div>
                            </div>
                            <div className="font-semibold tabular-nums whitespace-nowrap">{fmt.format(p.score)} نقطة</div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>

                    {/* Empty state if no scores */}
                    {!hasScores && (
                      <li className="px-4 py-6 text-center text-sm opacity-80">لا توجد نتائج لعرضها.</li>
                    )}
                  </ul>
                </div>
              </div>

              {exportError && (
                <p className="mt-3 text-sm text-destructive">{exportError}</p>
              )}
            </CardContent>

            {/* Actions */}
            <CardFooter className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => router.push('/')} className="flex-1 h-11 text-base font-bold">
                <RotateCcw className="w-4 h-4 ml-1" />
                العب مرة أخرى
              </Button>

              <Button variant="secondary" onClick={handleShare} className="flex-1 h-11">
                <Share2 className="w-4 h-4 ml-1" />
                مشاركة
              </Button>

              <Button variant="outline" onClick={handleCopyLink} className="flex-1 h-11">
                <Copy className="w-4 h-4 ml-1" />
                نسخ الرابط
              </Button>

              <Button variant="outline" onClick={handleExportPNG} disabled={exporting} className="flex-1 h-11">
                <Download className="w-4 h-4 ml-1" />
                {exporting ? 'جارٍ الحفظ…' : 'حفظ كصورة'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </motion.section>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const base = 'inline-flex items-center justify-center w-8 h-8 rounded-full border text-sm font-semibold tabular-nums';
  if (rank === 1) {
    return (
      <span className={cn(base, 'bg-yellow-100/70 dark:bg-yellow-900/20 border-yellow-300/60 text-yellow-700')} title="المركز الأول">
        <Medal className="w-4 h-4" />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className={cn(base, 'bg-slate-100/70 dark:bg-slate-900/20 border-slate-300/60 text-slate-700')} title="المركز الثاني">
        <Medal className="w-4 h-4" />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className={cn(base, 'bg-amber-200/60 dark:bg-amber-900/20 border-amber-300/70 text-amber-800')} title="المركز الثالث">
        <Medal className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span className={cn(base, 'bg-muted/40 text-foreground/80')} title={`المرتبة ${rank}`}>
      {rank}
    </span>
  );
}
