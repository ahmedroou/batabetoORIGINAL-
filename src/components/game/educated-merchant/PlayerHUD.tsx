
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PlayerAvatar } from '../PlayerAvatar';
import { HandCoins, Crown, Home, Building } from 'lucide-react';
import type { Player } from '@/types';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface PlayerHUDProps {
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
}

/**
 * دالة مساعدة لتنسيق الأرقام مع فاصل الآلاف.
 */
const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('ar-EG').format(n);
  } catch {
    return new Intl.NumberFormat('en-US').format(n);
  }
};


/* -------------------------------------------------------------------------------------------------
 * صف لاعب منفصل ومُمَيَّز لتقليل إعادة التصيير (Memoized)
 * ------------------------------------------------------------------------------------------------- */
const PlayerRow = React.memo(function PlayerRow({
  player,
  isCurrent,
  isLeader,
  rank,
}: {
  player: Player;
  isCurrent: boolean;
  isLeader: boolean;
  rank?: number;
}) {
  const statusClasses = cn(
    'p-2 rounded-lg transition-all',
    isCurrent ? 'bg-primary/20 border-l-4 border-primary shadow' : 'bg-slate-800/80',
    player.status === 'bankrupt' && 'opacity-60 bg-destructive/20 border-destructive',
    player.status === 'winner' && 'bg-green-700/20 border-green-500'
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={cn('flex items-center justify-between gap-3', statusClasses)}
      role="listitem"
      aria-label={`اللاعب ${player.name}`}
    >
      {/* اليسار: صورة + تفاصيل أساسية */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-10 h-10 flex-shrink-0">
          <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
          {isLeader && (
            <span
              className="absolute -right-2 -top-2 bg-yellow-400 text-black rounded-full p-0.5 shadow"
              title="المتصدر"
              aria-label="المتصدر"
            >
              <Crown className="w-3 h-3" />
            </span>
          )}
        </div>

        <div className="leading-tight min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold truncate" title={player.name}>
              {player.name}
            </div>
            {isCurrent && (
              <div className="text-[11px] px-2 py-0.5 rounded bg-primary text-black" aria-label="الدور الحالي">
                دور
              </div>
            )}
            {player.status === 'bankrupt' && (
              <div className="text-[11px] px-2 py-0.5 rounded bg-red-600 text-white">مفلس</div>
            )}
          </div>

          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Home className="w-3 h-3" />
              <span className="font-mono">{player.position ?? 0}</span>
            </span>
            <span className="flex items-center gap-1">
              <Building className="w-3 h-3" />
              <span className="font-mono">{player.propertiesCount ?? 0}</span>
            </span>
          </div>
        </div>
      </div>

      {/* اليمين: الترتيب + المال */}
      <div className="flex flex-col items-end shrink-0">
          <div className="flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-yellow-400" />
            <div className="tabular-nums font-mono font-bold text-sm" title={`${player.name} - رصيد`}>
              {formatMoney(player.money ?? 0)}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
              {rank ? `الترتيب #${rank}` : '—'}
          </div>
      </div>
    </motion.div>
  );
});

/* -------------------------------------------------------------------------------------------------
 * PlayerHUD
 * ------------------------------------------------------------------------------------------------- */
export function PlayerHUD({ players, turnOrder, currentTurnIndex }: PlayerHUDProps) {
  const currentPlayerId = turnOrder[currentTurnIndex];
  const isMobile = useIsMobile();

  // المتصدر
  const leaderId = useMemo(() => {
    const alive = players.filter((p) => p.status === 'alive');
    if (alive.length === 0) return null;
    return alive.reduce((a, b) => ((a.money ?? 0) > (b.money ?? 0) ? a : b)).id;
  }, [players]);

  // ترتيب اللاعبين (أحياء فقط)
  const ranking = useMemo(() => {
    const sorted = [...players]
      .filter((p) => p.status === 'alive')
      .sort((a, b) => (b.money ?? 0) - (a.money ?? 0));
    const map: Record<string, number> = {};
    sorted.forEach((p, i) => (map[p.id] = i + 1));
    return map;
  }, [players]);

  return (
    <div className="w-full">
      <Card className="bg-gray-900/70 border-gray-700 text-white shadow-lg">
        <CardHeader className="py-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Crown className="w-4 h-4 text-yellow-400" />
            لوحة اللاعبين
          </CardTitle>
        </CardHeader>

        <CardContent className="py-2">
          <ScrollArea className={cn(isMobile ? 'h-[15vh]' : 'h-[30vh]', 'pr-2')} role="list">
            {players.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-4">لا يوجد لاعبون بعد</div>
            ) : (
              <div className="space-y-2">
                {players.map((player) => {
                  const isCurrent = player.id === currentPlayerId;
                  const isLeader = player.id === leaderId;
                  const rank = ranking[player.id];

                  return (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      isCurrent={isCurrent}
                      isLeader={!!isLeader}
                      rank={rank}
                    />
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
