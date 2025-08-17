'use client';

import React, { useMemo, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Trophy, Award, EyeOff, AlertTriangle, Loader2, Crown, Medal, Home, PartyPopper, Sparkles } from 'lucide-react';
import { distributeEndOfGameAwards } from '@/lib/actions/admin/users';
import { motion, AnimatePresence } from 'framer-motion';

const isDefined = <T,>(v: T | undefined | null): v is T => v !== undefined && v !== null;

export function FinalResultsPhase({ game, self }: { game: Game; self: Player }) {
  const router = useRouter();
  const [finalizing, setFinalizing] = React.useState(true);
  const [showConfetti, setShowConfetti] = React.useState(false);

  const isHost = game.hostId === self.id;

  useEffect(() => {
    const finalize = async () => {
      if (isHost && !game.gameResult?.finalAwards) {
        try {
          await distributeEndOfGameAwards(game.id);
          // onSnapshot سيحدّث الحالة تلقائياً
        } catch (e) {
          console.error('Failed to finalize game awards:', e);
        }
      }
      setFinalizing(false);
    };
    finalize();
  }, [game.id, isHost, game.gameResult?.finalAwards]);

  const sortedPlayers = [...(game.players ?? [])]
    .map((p) => ({ ...p, score: game.playerScores?.[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  let rank = 0;
  let lastScore = Infinity;

  const rankedPlayers = sortedPlayers.map((p, index) => {
    if (p.score !== lastScore) {
      rank = index + 1;
    }
    lastScore = p.score;
    return { ...p, rank } as Player & { score: number; rank: number };
  });

  const winner = rankedPlayers[0];
  const finalAwards = game.gameResult?.finalAwards ?? {};
  const { cunningDeceiver, deceivedFool, afkStats } = finalAwards as any;

  const afkPlayers = Object.entries(afkStats ?? {})
    .map(([playerId, count]) => {
      const pl = game.players.find((pp) => pp.id === playerId);
      return pl ? { player: pl, afkCount: count as number } : null;
    })
    .filter(isDefined)
    .sort((a, b) => b.afkCount - a.afkCount)
    .slice(0, 3);

  // 🎉 خيوط الكونفيتي المتحركة
  const CONFETTI_COLORS = ['#FDE047', '#60A5FA', '#34D399', '#F472B6', '#F97316', '#A78BFA'];
  const confetti = useMemo(
    () =>
      Array.from({ length: 80 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 6 + Math.random() * 10,
        delay: Math.random() * 1.2,
        rotate: Math.random() * 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        duration: 3 + Math.random() * 2,
      })),
    []
  );

  useEffect(() => {
    if (!finalizing && winner) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 4500);
      return () => clearTimeout(t);
    }
  }, [finalizing, winner]);

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.98 },
    show: { opacity: 1, scale: 1, transition: { duration: 0.4 } },
  };

  const listVariants = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.04, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  };

  const badgeForRank = (r: number) => {
    switch (r) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 text-black';
      case 2:
        return 'bg-gradient-to-r from-zinc-300 to-slate-400 text-zinc-900';
      case 3:
        return 'bg-gradient-to-r from-amber-700 to-orange-600 text-white';
      default:
        return 'bg-muted text-foreground';
    }
  };

  return (
    <motion.div
      dir="rtl"
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="relative w-full"
    >
      {/* خلفية بصرية خرافية */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_100%_-20%,rgba(234,179,8,0.18),transparent),radial-gradient(1000px_500px_at_0%_0%,rgba(99,102,241,0.18),transparent)]" />

      {/* حواف متوهجة حول البطاقة */}
      <div className="mx-auto max-w-3xl p-[2px] rounded-3xl bg-gradient-to-r from-amber-400/60 via-fuchsia-400/60 to-indigo-400/60 shadow-[0_0_60px_-15px_rgba(251,191,36,0.35)]">
        <Card className="rounded-3xl backdrop-blur bg-white/85 dark:bg-zinc-900/70 border-0 shadow-2xl">
          <CardHeader className="text-center space-y-2 relative overflow-hidden">
            {/* تروفي متحرك */}
            <motion.div initial={{ scale: 0.9, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 10 }} className="mx-auto w-24 h-24 grid place-items-center rounded-full bg-gradient-to-br from-yellow-300 via-amber-300 to-yellow-400 shadow-xl ring-8 ring-yellow-200/50">
              <Trophy className="w-12 h-12 text-yellow-800 drop-shadow" />
            </motion.div>

            <CardTitle className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-500 via-fuchsia-500 to-indigo-500">
              انتهت اللعبة!
            </CardTitle>

            {winner && (
              <CardDescription className="text-xl md:text-2xl font-bold flex items-center justify-center gap-2">
                <Crown className="w-6 h-6" />
                <span>
                  الفائز هو <span className="underline decoration-wavy decoration-amber-400">{winner.name}</span>!
                </span>
              </CardDescription>
            )}

            {/* طبقة انتظار توزيع الجوائز */}
            <AnimatePresence>
              {finalizing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 backdrop-blur-sm bg-background/40 grid place-items-center"
                >
                  <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/80 dark:bg-zinc-800/80 shadow-lg border">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">جاري توزيع الجوائز النهائية...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* منصة التتويج */}
            {winner && (
              <div className="relative overflow-hidden rounded-2xl p-4 md:p-5 bg-gradient-to-br from-amber-100/70 via-white/60 to-indigo-100/60 dark:from-amber-900/20 dark:via-zinc-800/40 dark:to-indigo-900/20 border">
                <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
                  <div className="relative">
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-yellow-400/60 via-fuchsia-400/60 to-indigo-400/60 blur-lg" />
                    <div className="relative rounded-full p-1 bg-gradient-to-tr from-yellow-300 via-amber-300 to-yellow-400">
                      <PlayerAvatar avatarId={winner.avatarId} className="w-24 h-24 md:w-28 md:h-28 rounded-full ring-4 ring-yellow-200 shadow-2xl" temporaryTitle={winner.temporaryTitle} />
                    </div>
                    <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="absolute -top-3 -left-2 rotate-[-12deg]">
                      <PartyPopper className="w-6 h-6 text-amber-500" />
                    </motion.div>
                  </div>

                  <div className="text-center md:text-right">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10">
                      <Medal className="w-4 h-4" />
                      <span className="text-sm font-semibold">المركز الأول</span>
                    </div>
                    <h3 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">{winner.name}</h3>
                    <p className="text-muted-foreground">حقق أعلى مجموع نقاط</p>
                  </div>

                  <div className="ms-auto flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-lg font-bold">{winner.score} نقطة</span>
                  </div>
                </div>
              </div>
            )}

            {/* ألقاب نهاية اللعبة */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
              <div className="group relative overflow-hidden p-4 rounded-2xl border bg-gradient-to-br from-rose-50 to-amber-50 dark:from-rose-900/10 dark:to-amber-900/10">
                <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-rose-300/30 blur-3xl transition-transform group-hover:scale-110" />
                <h3 className="font-bold text-rose-800 dark:text-rose-200 flex items-center justify-center gap-2">
                  <Award /> المخادع المكار
                </h3>
                {cunningDeceiver ? (
                  <>
                    <PlayerAvatar avatarId={cunningDeceiver.avatarId} className="w-16 h-16 mx-auto my-3 rounded-full ring-2 ring-rose-300/60" />
                    <p className="font-bold text-lg">{cunningDeceiver.name}</p>
                    <p className="text-sm text-muted-foreground">أوقع لاعبين في فخه {cunningDeceiver.count} مرة</p>
                  </>
                ) : (
                  <div className="py-8">
                    <p className="text-muted-foreground">لا يوجد فائز بهذا اللقب</p>
                  </div>
                )}
              </div>

              <div className="group relative overflow-hidden p-4 rounded-2xl border bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-900/10 dark:to-indigo-900/10">
                <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-sky-300/30 blur-3xl transition-transform group-hover:scale-110" />
                <h3 className="font-bold text-sky-800 dark:text-sky-200 flex items-center justify-center gap-2">
                  <EyeOff /> الأبله المخدوع
                </h3>
                {deceivedFool ? (
                  <>
                    <PlayerAvatar avatarId={deceivedFool.avatarId} className="w-16 h-16 mx-auto my-3 rounded-full ring-2 ring-sky-300/60" />
                    <p className="font-bold text-lg">{deceivedFool.name}</p>
                    <p className="text-sm text-muted-foreground">وقع في الفخ {deceivedFool.count} مرات</p>
                  </>
                ) : (
                  <div className="py-8">
                    <p className="text-muted-foreground">لا يوجد فائز بهذا اللقب</p>
                  </div>
                )}
              </div>
            </div>

            {/* غشاشين محتملين */}
            {afkPlayers.length > 0 && (
              <div className="p-4 rounded-2xl border bg-yellow-50 dark:bg-yellow-900/10">
                <h3 className="font-bold text-yellow-800 dark:text-yellow-300 flex items-center justify-center gap-2">
                  <AlertTriangle /> غشاشين محتملين
                </h3>
                <div className="space-y-2 mt-3">
                  {afkPlayers.map(({ player, afkCount }) => (
                    <div key={player.id} className="flex justify-between items-center text-sm p-2 rounded-xl bg-yellow-100/70 dark:bg-yellow-900/20">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar avatarId={player.avatarId!} className="w-7 h-7 rounded-full ring-2 ring-yellow-300/50" />
                        <span className="font-medium">{player.name}</span>
                      </div>
                      <span className="font-bold">{afkCount} مرات</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* الترتيب النهائي */}
            <div className="space-y-3 pt-2">
              <h3 className="font-bold text-center text-xl">الترتيب النهائي</h3>
              {rankedPlayers.length === 0 && (
                <div className="p-3 text-center rounded-xl bg-muted">لا يوجد لاعبون لعرض النتائج.</div>
              )}

              <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-2">
                {rankedPlayers.map((p) => (
                  <motion.div
                    key={p.id}
                    variants={itemVariants}
                    className="flex items-center gap-3 p-3 rounded-2xl border bg-card hover:shadow-lg transition-shadow"
                  >
                    <div className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold ${badgeForRank(p.rank)}`}>
                      #{p.rank}
                    </div>
                    <PlayerAvatar avatarId={p.avatarId} className="w-9 h-9 rounded-full ring-2 ring-foreground/10" temporaryTitle={p.temporaryTitle} />
                    <div className="flex-1 font-bold">{p.name}</div>
                    <div className="text-sm">
                      <span className="font-bold text-primary">{p.score}</span>
                      <span className="ms-1 text-muted-foreground">نقطة</span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => router.push('/')} className="w-full h-11 text-base font-bold">
              <Home className="me-2 h-4 w-4" /> العب مرة أخرى
            </Button>
            {typeof window !== 'undefined' && (
              <Button
                type="button"
                variant="secondary"
                className="w-full h-11 text-base"
                onClick={async () => {
                  try {
                    const url = typeof window !== 'undefined' ? window.location.href : '/';
                    if (navigator.share) {
                      await navigator.share({ title: 'نتائج اللعبة', text: 'شوف نتائجي في اللعبة!', url });
                    } else {
                      await navigator.clipboard.writeText(url);
                      alert('تم نسخ رابط النتائج!');
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }}
              >
                <Sparkles className="me-2 h-4 w-4" /> شارك النتائج
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      {/* 🎊 كونفيتي متحرك */}
      <AnimatePresence>
        {showConfetti && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {confetti.map((c) => (
              <motion.span
                key={c.id}
                initial={{ y: -40, opacity: 0, rotate: 0 }}
                animate={{ y: '115vh', opacity: 1, rotate: c.rotate }}
                exit={{ opacity: 0 }}
                transition={{ duration: c.duration, delay: c.delay, ease: 'easeOut' }}
                className="absolute rounded"
                style={{ left: `${c.left}%`, width: c.size, height: c.size, background: c.color }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
