"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { Crown } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';

interface FinalResultsProps {
  game: Game;
  onPlayAgain?: () => void; // optional callback hook
}

export function FinalResults({ game, onPlayAgain }: FinalResultsProps) {
  const router = useRouter();
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiCount = 22;

  // Sort players with same rules but stable and defensive
  const sortedPlayers = useMemo(() => {
    const copy = [...(game.players || [])];
    copy.sort((a: Player, b: Player) => {
      const aBank = a.status === 'bankrupt';
      const bBank = b.status === 'bankrupt';
      if (aBank !== bBank) return aBank ? 1 : -1;
      if (aBank && bBank) {
        const aTime = typeof a.bankruptAt?.toMillis === 'function' ? a.bankruptAt.toMillis() : (a.bankruptAt ?? Infinity);
        const bTime = typeof b.bankruptAt?.toMillis === 'function' ? b.bankruptAt.toMillis() : (b.bankruptAt ?? Infinity);
        return aTime - bTime;
      }
      const aScore = game.playerScores?.[a.id] ?? 0;
      const bScore = game.playerScores?.[b.id] ?? 0;
      return bScore - aScore;
    });
    return copy;
  }, [game.players, game.playerScores]);

  const winner = sortedPlayers[0];

  useEffect(() => {
    // small confetti burst on mount
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // helper: format score
  const fmtScore = (p: Player) => (p.status === 'bankrupt' ? 'مفلس' : `${game.playerScores?.[p.id] ?? 0} د.ع`);

  // share results (copy to clipboard or native share)
  const shareResults = async () => {
    const text = `نتيجة اللعبة — الفائز: ${winner?.name ?? '—'}\n${sortedPlayers.map((p, i) => `${i + 1}. ${p.name} — ${fmtScore(p)}`).join('\n')}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'نتائج اللعبة', text });
      } else {
        await navigator.clipboard.writeText(text);
        alert('تم نسخ النتائج إلى الحافظة');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <div className="relative">
        {/* Confetti layer */}
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          <AnimatePresence>
            {showConfetti && (
              <motion.div
                key="confetti"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                {Array.from({ length: confettiCount }).map((_, i) => {
                  const left = Math.random() * 100;
                  const size = 6 + Math.random() * 10;
                  const delay = Math.random() * 0.4;
                  const bg = ['#F87171', '#FB923C', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA'][Math.floor(Math.random() * 6)];
                  return (
                    <motion.span
                      key={`c-${i}`}
                      initial={{ y: 0, opacity: 0, rotate: Math.random() * 180 }}
                      animate={{ y: -220 - Math.random() * 120, opacity: 1, rotate: 720 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.6 + Math.random() * 0.6, delay }}
                      style={{
                        position: 'absolute',
                        left: `${left}%`,
                        bottom: -10,
                        width: size,
                        height: size,
                        background: bg,
                        borderRadius: 2,
                        zIndex: 60,
                      }}
                    />
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Card className="overflow-visible shadow-2xl">
          <CardHeader className="pb-2">
            <div className="flex flex-col items-center gap-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, 20, -12, 0] }}
                transition={{ duration: 0.9, delay: 0.15 }}
                className="p-2 bg-gradient-to-br from-yellow-100 to-yellow-50 rounded-full"
              >
                <Crown className="w-20 h-20 text-yellow-500 drop-shadow-lg" />
              </motion.div>

              <CardTitle className="text-3xl">انتهت اللعبة!</CardTitle>

              {winner ? (
                <CardDescription className="text-xl font-bold">الفائز: <span className="text-primary">{winner.name}</span></CardDescription>
              ) : (
                <CardDescription>لا يوجد فائز</CardDescription>
              )}

              {/* screen-reader friendly announcer */}
              <div aria-live="polite" className="sr-only">{winner ? `الفائز هو ${winner.name}` : 'انتهت اللعبة'}</div>
            </div>
          </CardHeader>

          <CardContent>
            {/* podium for top 3 */}
            <div className="flex items-end justify-center gap-4 mb-4">
              {/** second place */}
              <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-gray-200 bg-white flex items-center justify-center">
                  {sortedPlayers[1] ? <PlayerAvatar avatarId={sortedPlayers[1].avatarId} className="w-full h-full" /> : <div className="text-sm text-gray-400">—</div>}
                </div>
                <div className="mt-2 text-sm font-semibold">{sortedPlayers[1]?.name ?? '—'}</div>
                <div className="mt-2 px-3 py-1 rounded-t-md bg-gray-200 text-sm">2</div>
              </motion.div>

              {/** first place (winner) */}
              <motion.div initial={{ y: 28, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ delay: 0.35 }} className="flex flex-col items-center">
                <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-yellow-300 bg-white flex items-center justify-center shadow-xl">
                  {winner ? <PlayerAvatar avatarId={winner.avatarId} className="w-full h-full" /> : <div className="text-sm text-gray-400">—</div>}
                </div>
                <div className="mt-3 text-lg font-extrabold">{winner?.name ?? '—'}</div>
                <div className="mt-2 px-4 py-1 rounded-t-md bg-yellow-300 font-bold">1</div>
                <div className="mt-1 text-sm text-gray-600">{fmtScore(winner ?? { id: '', name: '', avatarId: '', status: 'alive' } as Player)}</div>
              </motion.div>

              {/** third place */}
              <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-amber-200 bg-white flex items-center justify-center">
                  {sortedPlayers[2] ? <PlayerAvatar avatarId={sortedPlayers[2].avatarId} className="w-full h-full" /> : <div className="text-sm text-gray-400">—</div>}
                </div>
                <div className="mt-2 text-sm font-semibold">{sortedPlayers[2]?.name ?? '—'}</div>
                <div className="mt-2 px-3 py-1 rounded-t-md bg-amber-200 text-sm">3</div>
              </motion.div>
            </div>

            <hr className="my-2" />

            {/* ranked list for remaining players */}
            <div className="space-y-2">
              {sortedPlayers.map((player, index) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 + index * 0.06 }}
                  className="flex items-center justify-between gap-4 p-2 rounded-md bg-muted"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-bold w-6">{index + 1}.</div>
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm">
                      <PlayerAvatar avatarId={player.avatarId} className="w-full h-full" />
                    </div>
                    <div className="flex flex-col">
                      <div className="font-medium">{player.name}</div>
                      <div className="text-xs text-gray-500">{player.status === 'bankrupt' ? 'مفلس' : 'ناجح'}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-lg text-primary">{fmtScore(player)}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button
              onClick={() => {
                if (onPlayAgain) return onPlayAgain();
                router.push('/');
              }}
              className="flex-1"
            >
              العب مرة أخرى
            </Button>

            <Button variant="ghost" onClick={shareResults} className="flex-1">
              مشاركة النتائج
            </Button>
          </CardFooter>
        </Card>
      </div>
    </motion.div>
  );
}
