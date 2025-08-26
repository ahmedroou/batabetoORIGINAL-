'use client';

import React, { useMemo } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy, Share2, Repeat } from 'lucide-react';
import { motion } from 'framer-motion';

interface FinalResultsPhaseProps {
  game: Game;
  self: Player;
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
}

function Confetti() {
  // simple decorative confetti using small animated divs
  const pieces = new Array(18).fill(0).map((_, i) => ({
    left: `${Math.round((i / 18) * 100)}%`,
    delay: (i % 5) * 0.08,
    size: 6 + (i % 4) * 3,
    rotate: (i % 360),
  }));

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <motion.div
          key={i}
          initial={{ y: -20, opacity: 0, rotate: p.rotate }}
          animate={{ y: [ -20, 120, 240 ], opacity: [1, 1, 0], rotate: p.rotate + 45 }}
          transition={{ duration: 2.2 + (i % 4) * 0.15, delay: p.delay }}
          className="absolute"
          style={{ left: p.left, top: 0 }}
        >
          <div
            className="rounded-sm"
            style={{ width: p.size, height: p.size, background: `hsl(${(i * 47) % 360}deg 85% 60%)` }}
          />
        </motion.div>
      ))}
    </div>
  );
}

export default function FinalResultsPhase({ game, self }: FinalResultsPhaseProps) {
  const router = useRouter();

  const sortedPlayers = useMemo(() => (
    [...(game.players || [])]
      .map((p) => ({ ...p, score: game.playerScores?.[p.id] || 0 }))
      .sort((a, b) => b.score - a.score)
  ), [game.players, game.playerScores]);

  const maxScore = Math.max(1, ...(sortedPlayers.map(p => p.score)));

  const top3 = sortedPlayers.slice(0, 3);

  const winner = sortedPlayers[0];

  async function handleShare() {
    const text = `نتائج لعبة مملكة الأسماء — الفائز: ${winner?.name || '—'} (${winner?.score || 0} نقطة)`;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: 'مملكة الأسماء — نتائج', text, url });
      } else {
        await navigator.clipboard.writeText(text + '\n' + url);
        alert('تم نسخ رابط وملخص النتائج إلى الحافظة');
      }
    } catch (err) {
      // fallback
      try { await navigator.clipboard.writeText(text + '\n' + url); alert('تم نسخ نتائج المباراة'); } catch { /* ignore */ }
    }
  }

  return (
    <div className="w-full max-w-3xl relative">
      <Confetti />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Card className="overflow-visible">
          <CardHeader className="relative overflow-hidden text-center bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-t-lg">
            <div className="py-6">
              <Trophy className="mx-auto w-20 h-20 drop-shadow-lg" />
              <CardTitle className="text-3xl font-extrabold">انتهت اللعبة!</CardTitle>
              <CardDescription className="mt-1 text-lg opacity-90">الفائز: <span className="font-semibold">{winner?.name || '—'}</span> — مجموع النقاط: <span className="font-medium">{winner?.score || 0}</span></CardDescription>
            </div>
            {/* decorative wave */}
            <svg viewBox="0 0 1440 60" className="w-full -mb-1" preserveAspectRatio="none">
              <path d="M0,40 C240,80 480,0 720,30 C960,60 1200,10 1440,40 L1440 60 L0 60 Z" fill="rgba(255,255,255,0.06)" />
            </svg>
          </CardHeader>

          <CardContent className="p-4 -mt-4">
            {/* Podium */}
            <div className="flex items-end justify-center gap-4 mb-6">
              {/* 2nd */}
              <motion.div initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shadow-md">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-b from-white to-slate-100 flex items-center justify-center text-lg font-semibold">{initials(top3[1]?.name)}</div>
                </div>
                <div className="mt-2 text-sm opacity-80">{top3[1]?.name}</div>
                <div className="mt-2 text-xs text-zinc-600">{top3[1]?.score ?? 0} نقطة</div>
                <div className="mt-2 w-20 h-10 bg-zinc-100 rounded-t-md flex items-center justify-center font-semibold text-sm">2</div>
              </motion.div>

              {/* 1st */}
              <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1.02, y: 0 }} transition={{ delay: 0.15 }} className="flex flex-col items-center">
                <div className="w-28 h-28 rounded-xl bg-white flex items-center justify-center shadow-2xl ring-4 ring-yellow-300">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-100 to-yellow-200 flex items-center justify-center text-2xl font-extrabold">{initials(top3[0]?.name)}</div>
                </div>
                <div className="mt-3 text-lg font-semibold">{top3[0]?.name}</div>
                <div className="mt-1 text-sm text-zinc-700">{top3[0]?.score ?? 0} نقطة</div>
                <div className="mt-2 w-24 h-12 bg-yellow-200 rounded-t-md flex items-center justify-center font-bold text-sm">1</div>
              </motion.div>

              {/* 3rd */}
              <motion.div initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center shadow-md">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-b from-white to-orange-100 flex items-center justify-center text-lg font-semibold">{initials(top3[2]?.name)}</div>
                </div>
                <div className="mt-2 text-sm opacity-80">{top3[2]?.name}</div>
                <div className="mt-2 text-xs text-zinc-600">{top3[2]?.score ?? 0} نقطة</div>
                <div className="mt-2 w-20 h-10 bg-zinc-100 rounded-t-md flex items-center justify-center font-semibold text-sm">3</div>
              </motion.div>
            </div>

            {/* Full leaderboard */}
            <div className="space-y-3">
              {sortedPlayers.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-white to-slate-50 flex items-center justify-center shadow">
                    <span className="font-semibold">{initials(p.name)}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <div className="font-medium">{p.name}</div>
                      <div className="font-semibold">{p.score} <span className="text-xs text-zinc-500">نقطة</span></div>
                    </div>
                    <div className="mt-2 h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-2 rounded-full" style={{ width: `${Math.round((p.score / maxScore) * 100)}%`, background: `linear-gradient(90deg, hsl(${(idx*70)%360} 80% 55%), hsl(${(idx*70+60)%360} 80% 45%))` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <div className="flex gap-3 w-full">
              <Button className="flex-1" variant="default" onClick={() => router.push('/')}><Repeat className="mr-2" /> العب مرة أخرى</Button>
              <Button className="flex-none" onClick={handleShare}><Share2 className="mr-2" /> مشاركة</Button>
            </div>
            <div className="text-xs text-zinc-500 text-center">يمكنك الرجوع إلى المنصة الرئيسية لبدء مباراة جديدة أو مشاركة نتائجك مع الأصدقاء.</div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
