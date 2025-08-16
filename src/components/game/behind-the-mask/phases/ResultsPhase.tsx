"use client";

import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy, Shield, VenetianMask, User, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ROLES } from '@/data/mafia-roles';
import { PlayerAvatar } from '../../PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMemo, useState } from 'react';

interface ResultsPhaseProps {
  game: Game;
  self: Player;
}

export function ResultsPhase({ game }: ResultsPhaseProps) {
  const router = useRouter();
  const gameResult = game.gameResult;
  const [isCopying, setIsCopying] = useState(false);

  if (!gameResult) {
    return (
      <div className="w-full h-full flex items-center justify-center text-center text-muted-foreground">
        جاري تحميل النتائج...
      </div>
    );
  }

  const meta = useMemo(() => {
    if (gameResult.winner === 'good') {
      return { label: 'فريق الخير', color: 'text-blue-600', ring: 'ring-blue-200', Icon: Shield };
    }
    if (gameResult.winner === 'mafia') {
      return { label: 'فريق الشر', color: 'text-red-600', ring: 'ring-red-200', Icon: VenetianMask };
    }
    return { label: 'تعادل', color: 'text-yellow-600', ring: 'ring-yellow-200', Icon: User };
  }, [gameResult.winner]);

  const mvpPlayer = useMemo(() => {
    if (!('mvpPlayerId' in gameResult) || !gameResult.mvpPlayerId) return null;
    return game.players.find((p) => p.id === gameResult.mvpPlayerId) || null;
  }, [game.players, gameResult]);

  const playerStats: Record<string, any> | undefined = (gameResult as any).playerStats;

  const handleCopySummary = async () => {
    const lines: string[] = [];
    lines.push(`الفائز: ${meta.label}`);
    if (gameResult.message) lines.push(`الخلاصة: ${gameResult.message}`);
    lines.push('---');
    lines.push('الأدوار النهائية:');
    for (const p of game.players) {
      const roleName = p.role ? ROLES[p.role]?.name || 'غير معروف' : 'غير معروف';
      const status = p.status === 'alive' ? 'حي' : 'خارج اللعبة';
      lines.push(`- ${p.name} — ${roleName} (${status})`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 1600);
    } catch {}
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, type: 'spring' }} className="w-full max-w-2xl">
      <Card className="text-center bg-white/90 dark:bg-slate-900/80 backdrop-blur border border-border shadow-2xl">
        <CardHeader>
          <div className="relative mx-auto w-28 h-28">
            <Trophy className="w-28 h-28 text-yellow-400 mx-auto animate-pulse drop-shadow" />
          </div>
          <CardTitle className="text-4xl font-extrabold">انتهت اللعبة!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-center gap-3">
            <meta.Icon className={cn('w-10 h-10', meta.color)} />
            <h2 className={cn('text-3xl font-bold', meta.color)}>{meta.label}</h2>
          </div>
          {gameResult.message && (
            <p className="text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">{gameResult.message}</p>
          )}

          {mvpPlayer && (
            <div className={cn('rounded-xl border p-3 sm:p-4 text-left shadow-sm', meta.ring)}>
              <p className="font-black text-lg mb-2 text-center">أفضل لاعب (MVP)</p>
              <div className="flex items-center justify-center gap-3">
                <PlayerAvatar avatarId={mvpPlayer.avatarId} className="w-12 h-12" temporaryTitle={mvpPlayer.temporaryTitle} />
                <div>
                  <p className="font-bold text-lg">{mvpPlayer.name}</p>
                  {playerStats?.[mvpPlayer.id] && (
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                      {playerStats[mvpPlayer.id].kills ? <span className="px-2 py-1 rounded bg-muted">قتل: {playerStats[mvpPlayer.id].kills}</span> : null}
                      {playerStats[mvpPlayer.id].heals ? <span className="px-2 py-1 rounded bg-muted">علاج: {playerStats[mvpPlayer.id].heals}</span> : null}
                      {playerStats[mvpPlayer.id].investigations ? (
                        <span className="px-2 py-1 rounded bg-muted">تحقيقات: {playerStats[mvpPlayer.id].investigations}</span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 text-left">
            <h3 className="font-bold text-lg mb-2 text-center">الأدوار النهائية</h3>
            <ScrollArea className="h-72 border bg-muted/40 rounded-lg p-2">
              <div className="space-y-2">
                {game.players.map((player, index) => {
                  const roleDetails = player.role ? ROLES[player.role] : null;
                  const stat = playerStats?.[player.id];
                  const dead = player.status !== 'alive';
                  return (
                    <motion.div
                      key={player.id}
                      className={cn('flex items-center justify-between p-2 rounded-md bg-background/70 border shadow-sm')}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.06 }}
                    >
                      <div className="flex items-center gap-3">
                        <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" temporaryTitle={player.temporaryTitle} />
                        <div>
                          <p className="font-bold leading-tight">{player.name}</p>
                          <p className={cn('text-[11px] font-semibold', dead ? 'text-red-500' : 'text-emerald-600')}>
                            {dead ? 'تم القضاء عليه' : 'حي'}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-primary flex items-center gap-2">
                        <span>{roleDetails ? roleDetails.name : 'دور غير معروف'}</span>
                        {stat && (
                          <div className="hidden sm:flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                            {stat.kills ? <span className="px-1.5 py-0.5 rounded bg-muted">K:{stat.kills}</span> : null}
                            {stat.heals ? <span className="px-1.5 py-0.5 rounded bg-muted">H:{stat.heals}</span> : null}
                            {stat.investigations ? <span className="px-1.5 py-0.5 rounded bg-muted">I:{stat.investigations}</span> : null}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleCopySummary} variant="outline" className="w-full sm:w-1/2">
            {isCopying ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />} نسخ الملخص
          </Button>
          <Button onClick={() => router.push('/')} className="w-full sm:w-1/2" size="lg">
            العب مرة أخرى
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
