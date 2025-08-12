
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { HandCoins, Crown, Home, Building } from 'lucide-react';
import type { Player } from '@/types';
import { cn } from '@/lib/utils';

interface PlayerHUDProps {
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
}

// Small animated number helper: animates from prev to next using requestAnimationFrame
function useAnimatedMoney(players: Player[]) {
  const [display, setDisplay] = useState<Record<string, number>>(() => {
    const r: Record<string, number> = {};
    players.forEach((p) => (r[p.id] = p.money || 0));
    return r;
  });

  // refs to cancel animations per player
  const rafs = useRef<Record<string, number | null>>({});
  const prevValues = useRef<Record<string, number>>({});

  useEffect(() => {
    // initialize prevValues for new players
    players.forEach((p) => {
      if (prevValues.current[p.id] === undefined) prevValues.current[p.id] = p.money || 0;
    });

    players.forEach((p) => {
      const id = p.id;
      const target = p.money || 0;
      const start = display[id] ?? prevValues.current[id] ?? 0;
      if (start === target) return; // no animation

      // cancel any existing
      if (rafs.current[id]) {
        window.cancelAnimationFrame(rafs.current[id] as number);
        rafs.current[id] = null;
      }

      const duration = 420; // ms
      const startTime = performance.now();

      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - t, 3);
        const value = Math.round(start + (target - start) * eased);
        setDisplay((d) => ({ ...d, [id]: value }));
        if (t < 1) {
          rafs.current[id] = window.requestAnimationFrame(step);
        } else {
          rafs.current[id] = null;
          prevValues.current[id] = target;
        }
      };

      rafs.current[id] = window.requestAnimationFrame(step);
    });

    return () => {
      // cancel on unmount
      Object.values(rafs.current).forEach((r) => r && window.cancelAnimationFrame(r));
    };
  }, [players]);

  return display;
}

export function PlayerHUD({ players, turnOrder, currentTurnIndex }: PlayerHUDProps) {
  const currentPlayerId = turnOrder[currentTurnIndex];

  // compute leader (alive player with max money)
  const leaderId = useMemo(() => {
    const alive = players.filter((p) => p.status === 'alive');
    if (alive.length === 0) return null;
    const top = alive.reduce((a, b) => ((a.money || 0) > (b.money || 0) ? a : b));
    return top.id;
  }, [players]);

  // animated money values
  const displayMoney = useAnimatedMoney(players);

  // compute lightweight ranking for badges (1,2,3) by money among alive players
  const ranking = useMemo(() => {
    const sorted = [...players].slice().filter((p) => p.status === 'alive').sort((a, b) => (b.money || 0) - (a.money || 0));
    const map: Record<string, number> = {};
    sorted.forEach((p, i) => (map[p.id] = i + 1));
    return map;
  }, [players]);

  // readable formatting for money
  const nf = useMemo(() => new Intl.NumberFormat('ar-EG'), []);

  return (
    <Card className="h-full bg-gray-900/50 border-gray-700 text-white">
      <CardHeader>
        <CardTitle>اللاعبون</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[30vh]">
          <div className="space-y-3 pr-4">
            {players.map((player) => {
              const isCurrent = player.id === currentPlayerId;
              const isLeader = player.id === leaderId;
              const rank = ranking[player.id];

              return (
                <AnimatePresence mode="popLayout" key={player.id}>
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-lg transition-all border-l-4',
                      isCurrent ? 'bg-primary/20 border-primary shadow-lg' : 'bg-slate-800 border-transparent',
                      player.status === 'bankrupt' && 'opacity-60 bg-destructive/20 border-destructive'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('relative')}> 
                        <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10 ring-2 ring-offset-1 rounded-full" />
                        {isLeader && (
                          <div className="absolute -right-2 -top-2 bg-yellow-400 text-black rounded-full p-0.5 shadow text-[10px]" title="الأفضل الآن">
                            <Crown className="w-3 h-3" />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-sm leading-none">{player.name}</div>
                          {isCurrent && <div className="text-[11px] px-2 py-0.5 rounded bg-primary text-black">دور</div>}
                          {player.status === 'bankrupt' && <div className="text-[11px] px-2 py-0.5 rounded bg-red-600 text-white">مفلس</div>}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <div className="flex items-center gap-1"><Home className="w-3 h-3" /> موقع: <span className="font-mono">{player.position ?? 0}</span></div>
                          <div className="flex items-center gap-1"><Building className="w-3 h-3" /> ممتلكات: <span className="font-mono">{player.propertiesCount ?? '-'}</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <HandCoins className="w-4 h-4 text-yellow-400" />
                        <div aria-live="polite" className="font-bold text-sm">{nf.format(displayMoney[player.id] ?? (player.money || 0))} د.ع</div>
                      </div>

                      <div className="text-xs text-slate-400">
                        {rank ? <span>التصنيف: #{rank}</span> : <span>—</span>}
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
