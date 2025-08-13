'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerAvatar } from '../PlayerAvatar';
import { HandCoins, Crown, AlertTriangle, Home, Building } from 'lucide-react';
import type { Player } from '@/types';
import { cn } from '@/lib/utils';

interface PlayerHUDProps {
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
}

// Hook: smoothly animate displayed money for each player and track deltas for badges
function useAnimatedMoney(players: Player[], opts?: { duration?: number; clearAfterMs?: number }) {
  const duration = opts?.duration ?? 600;
  const clearAfterMs = opts?.clearAfterMs ?? 1600;

  // displayed numbers per player
  const [display, setDisplay] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    players.forEach((p) => (map[p.id] = p.money ?? 0));
    return map;
  });

  // snapshot of last known server values so we can compute deltas
  const lastServer = useRef<Record<string, number>>(() => {
    const m: Record<string, number> = {} as any;
    players.forEach((p) => (m[p.id] = p.money ?? 0));
    return m;
  }) as React.MutableRefObject<Record<string, number>>;

  // transient delta badges { playerId: amount }
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [nonceMap, setNonceMap] = useState<Record<string, number>>({});

  // per-player RAF handlers
  const rafs = useRef<Record<string, number | null>>({});

  useEffect(() => {
    // on players change, kick off animations for any whose money changed
    players.forEach((p) => {
      const id = p.id;
      const serverVal = p.money ?? 0;
      const prevServer = lastServer.current[id] ?? serverVal;
      if (prevServer === serverVal) return;

      // set transient delta badge
      setDeltas((s) => ({ ...s, [id]: serverVal - prevServer }));
      setNonceMap((s) => ({ ...s, [id]: Date.now() }));

      // schedule clearing of delta badge
      setTimeout(() => {
        setDeltas((s) => {
          const copy = { ...s };
          delete copy[id];
          return copy;
        });
      }, clearAfterMs);

      // animate displayed number from current display to serverVal
      const start = display[id] ?? prevServer ?? 0;
      const target = serverVal;
      const startTime = performance.now();

      if (rafs.current[id]) {
        cancelAnimationFrame(rafs.current[id] as number);
      }

      const tick = (t: number) => {
        const p = Math.min(1, (t - startTime) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        const value = Math.round(start + (target - start) * eased);
        setDisplay((s) => ({ ...s, [id]: value }));
        if (p < 1) rafs.current[id] = requestAnimationFrame(tick);
        else rafs.current[id] = null;
      };

      rafs.current[id] = requestAnimationFrame(tick);

      // update lastServer snapshot
      lastServer.current[id] = serverVal;
    });

    return () => {
      Object.values(rafs.current).forEach((r) => r && cancelAnimationFrame(r));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  return { display, deltas, nonceMap };
}

export function PlayerHUD({ players, turnOrder, currentTurnIndex }: PlayerHUDProps) {
  const currentPlayerId = turnOrder[currentTurnIndex];

  const { display, deltas, nonceMap } = useAnimatedMoney(players, { duration: 650, clearAfterMs: 1400 });

  // leader calculation
  const leaderId = useMemo(() => {
    const alive = players.filter((p) => p.status === 'alive');
    if (alive.length === 0) return null;
    return alive.reduce((a, b) => ((a.money ?? 0) > (b.money ?? 0) ? a : b)).id;
  }, [players]);

  const ranking = useMemo(() => {
    const sorted = [...players].filter((p) => p.status === 'alive').sort((a, b) => (b.money ?? 0) - (a.money ?? 0));
    const map: Record<string, number> = {};
    sorted.forEach((p, i) => (map[p.id] = i + 1));
    return map;
  }, [players]);

  const nf = useMemo(() => new Intl.NumberFormat('en-US'), []);

  return (
    // keep HUD inside layout flow and slightly closer to board by using a compact width
    <div className="w-full sticky top-4 z-10">
      <Card className="bg-gray-900/70 border-gray-700 text-white shadow-lg">
        <CardHeader className="py-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Crown className="w-4 h-4 text-yellow-400" />
            لوحة اللاعبين
          </CardTitle>
        </CardHeader>

        <CardContent className="py-2">
          <ScrollArea className="h-[30vh] pr-2">
            <div className="space-y-2">
              {players.map((player) => {
                const isCurrent = player.id === currentPlayerId;
                const isBankrupt = player.status === 'bankrupt';
                const isWinner = player.status === 'winner';
                const isLeader = player.id === leaderId;
                const rank = ranking[player.id];

                // displayed money from hook (smooth)
                const moneyDisplay = display[player.id] ?? player.money ?? 0;
                const delta = deltas[player.id];
                const nonce = nonceMap[player.id];

                return (
                  <motion.div
                    key={player.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, scale: isCurrent ? 1.02 : 1 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                    className={cn(
                      'flex items-center justify-between gap-3 p-2 rounded-lg',
                      isCurrent ? 'bg-primary/20 border-l-4 border-primary shadow' : 'bg-slate-800/80',
                      isBankrupt && 'opacity-60 bg-destructive/20 border-destructive',
                      isWinner && 'bg-green-700/20 border-green-500'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />

                        {/* floating delta badge above avatar */}
                        <AnimatePresence>
                          {typeof delta === 'number' && (
                            <motion.div
                              key={`${player.id}-delta-${nonce}`}
                              initial={{ y: 6, opacity: 0 }}
                              animate={{ y: -12, opacity: 1 }}
                              exit={{ y: -22, opacity: 0 }}
                              transition={{ duration: 0.6 }}
                              className={cn(
                                'absolute left-1/2 -translate-x-1/2 -top-3 px-2 py-0.5 rounded-full text-[11px] font-semibold shadow',
                                delta > 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                              )}
                            >
                              {delta > 0 ? `+${nf.format(delta)}` : `-${nf.format(Math.abs(delta))}`}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {isLeader && (
                          <span className="absolute -right-2 -top-2 bg-yellow-400 text-black rounded-full p-0.5 shadow">
                            <Crown className="w-3 h-3" />
                          </span>
                        )}
                      </div>

                      <div className="leading-tight min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold truncate">{player.name}</div>
                          {isCurrent && <div className="text-[11px] px-2 py-0.5 rounded bg-primary text-black">دور</div>}
                          {isBankrupt && <div className="text-[11px] px-2 py-0.5 rounded bg-red-600 text-white">مفلس</div>}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                          <span className="flex items-center gap-1"><Home className="w-3 h-3" /> <span className="font-mono">{player.position ?? 0}</span></span>
                          <span className="flex items-center gap-1"><Building className="w-3 h-3" /> <span className="font-mono">{player.propertiesCount ?? 0}</span></span>
                        </div>

                        {/* NEW: money shown below the name for clarity (mobile-friendly and avoids overlap) */}
                        <div className="mt-2 flex items-center gap-2">
                          <HandCoins className="w-4 h-4 text-yellow-400" />
                          <motion.div
                            layout
                            initial={false}
                            animate={{ backgroundColor: delta ? (delta > 0 ? 'rgba(16,185,129,0.06)' : 'rgba(244,63,94,0.06)') : 'transparent' }}
                            transition={{ duration: 0.35 }}
                            className="px-3 py-1 rounded-md ring-1 ring-white/6"
                            title={`${player.name} - رصيد`}
                          >
                            <div aria-live="polite" className="tabular-nums font-mono font-extrabold text-sm leading-none">
                              {nf.format(moneyDisplay)}
                            </div>
                            <div className="text-[10px] text-slate-400 text-right">د.ع</div>
                          </motion.div>
                        </div>
                      </div>
                    </div>

                    {/* right-side compact rank indicator (no money here anymore) */}
                    <div className="flex flex-col items-end min-w-[48px]">
                      <div className="text-[10px] text-slate-400">{rank ? `#${rank}` : '—'}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
