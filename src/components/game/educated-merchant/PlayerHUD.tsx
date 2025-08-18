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

/* -------------------------------------------------------------------------------------------------
 * Hook: تحريك رصيد كل لاعب بسلاسة + شارات الدلتا. يحافظ على الأداء ويمنع التسريبات.
 * يحافظ على نفس الاسم والمنطق العام، مع تصحيح أخطاء التهيئة والتنظيف.
 * ------------------------------------------------------------------------------------------------- */
function useAnimatedMoney(
  players: Player[],
  opts?: { duration?: number; clearAfterMs?: number }
) {
  const duration = opts?.duration ?? 600;
  const clearAfterMs = opts?.clearAfterMs ?? 1600;
  const prefersReducedMotion = useReducedMotion();

  // عرض الرصيد لكل لاعب
  const [display, setDisplay] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    players.forEach((p) => (map[p.id] = p.money ?? 0));
    return map;
  });

  // مرجع لقيم العرض الحالية لتفادي مشاكل إغلاق الحالة (stale state in RAF)
  const displayRef = useRef<Record<string, number>>(display);
  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  // لقطة آخر قيم من السيرفر (تصحيح تهيئة سابقة كانت تُخزّن دالة بدل الكائن)
  const lastServer = useRef<Record<string, number>>({});
  useEffect(() => {
    // تزامن أولي + تنظيف لاعبين خرجوا
    const nextSnapshot: Record<string, number> = {};
    players.forEach((p) => (nextSnapshot[p.id] = p.money ?? 0));
    lastServer.current = { ...lastServer.current, ...nextSnapshot };
    // إزالة أي مفاتيح قديمة
    Object.keys(lastServer.current).forEach((id) => {
      if (!players.find((p) => p.id === id)) delete lastServer.current[id];
    });
  }, [players]);

  // دلتا مؤقتة على شكل شارة
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [nonceMap, setNonceMap] = useState<Record<string, number>>({});

  // RAF per player + timeouts لمسح الشارات
  const rafs = useRef<Record<string, number | null>>({});
  const clearTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    players.forEach((p) => {
      const id = p.id;
      const serverVal = p.money ?? 0;
      const prevServer = lastServer.current[id] ?? serverVal;

      if (prevServer === serverVal) return; // لا تغيير

      // set transient delta badge
      setDeltas((s) => ({ ...s, [id]: serverVal - prevServer }));
      setNonceMap((s) => ({ ...s, [id]: Date.now() }));

      // schedule clearing of delta badge (مع تنظيف سابق)
      if (clearTimers.current[id]) window.clearTimeout(clearTimers.current[id]);
      clearTimers.current[id] = window.setTimeout(() => {
        setDeltas((s) => {
          const copy = { ...s };
          delete copy[id];
          return copy;
        });
        delete clearTimers.current[id];
      }, clearAfterMs);

      // تحريك الرقم المعروض نحو serverVal (احترام تفضيل تقليل الحركة)
      const start = displayRef.current[id] ?? prevServer ?? 0;
      const target = serverVal;

      if (prefersReducedMotion) {
        setDisplay((s) => ({ ...s, [id]: target }));
        lastServer.current[id] = serverVal;
        return;
      }

      if (rafs.current[id]) cancelAnimationFrame(rafs.current[id]!);

      const startTime = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - startTime) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        const value = Math.round(start + (target - start) * eased);
        setDisplay((s) => ({ ...s, [id]: value }));
        if (p < 1) {
          rafs.current[id] = requestAnimationFrame(tick);
        } else {
          rafs.current[id] = null;
        }
      };

      rafs.current[id] = requestAnimationFrame(tick);
      lastServer.current[id] = serverVal;
    });

    // تنظيف عند إلغاء التركيب أو قبل تشغيل تأثير جديد
    return () => {
      Object.values(rafs.current).forEach((r) => r && cancelAnimationFrame(r));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, duration, clearAfterMs, prefersReducedMotion]);

  // تنظيف مؤقتات الشارات عند إلغاء التركيب
  useEffect(() => {
    return () => {
      Object.values(rafs.current).forEach((r) => r && cancelAnimationFrame(r));
      Object.values(clearTimers.current).forEach((t) => t && window.clearTimeout(t));
    };
  }, []);

  return { display, deltas, nonceMap };
}

/* -------------------------------------------------------------------------------------------------
 * أداة تنسيق أرقام (عربية افتراضياً، fallback آمن)
 * ------------------------------------------------------------------------------------------------- */
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
  moneyDisplay,
  delta,
  nonce,
}: {
  player: Player;
  isCurrent: boolean;
  isLeader: boolean;
  rank?: number;
  moneyDisplay: number;
  delta?: number;
  nonce?: number;
}) {
  const statusClasses = cn(
    isCurrent ? 'bg-primary/20 border-l-4 border-primary shadow' : 'bg-slate-800/80',
    player.status === 'bankrupt' && 'opacity-60 bg-destructive/20 border-destructive',
    player.status === 'winner' && 'bg-green-700/20 border-green-500'
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, scale: isCurrent ? 1.02 : 1 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={cn('flex items-center justify-between gap-3 p-2 rounded-lg', statusClasses)}
      role="listitem"
      aria-label={`اللاعب ${player.name}`}
    >
      {/* اليسار: صورة + تفاصيل أساسية */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-10 h-10 flex-shrink-0">
          <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
          <AnimatePresence>
            {typeof delta === 'number' && (
              <motion.div
                key={`${player.id}-delta-${nonce}`}
                initial={{ y: 6, opacity: 0 }}
                animate={{ y: -12, opacity: 1 }}
                exit={{ y: -22, opacity: 0 }}
                transition={{ duration: 0.6 }}
                className={cn(
                  'absolute left-1/2 -translate-x-1/2 -top-3 px-1.5 py-0.5 rounded-full text-[11px] font-semibold shadow',
                  delta > 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                )}
                aria-live="polite"
              >
                {delta > 0 ? `+${formatMoney(delta)}` : `-${formatMoney(Math.abs(delta))}`}
              </motion.div>
            )}
          </AnimatePresence>
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

          <div className="mt-1 flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-yellow-400" />
            <div className="tabular-nums font-mono font-bold text-sm" title={`${player.name} - رصيد`}>
              {formatMoney(moneyDisplay)}
            </div>
          </div>
        </div>
      </div>

      {/* اليمين: الترتيب */}
      <div className="flex flex-col items-end min-w-[48px]">
        <div className="text-lg font-bold">{rank ? `#${rank}` : '—'}</div>
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
  const { display, deltas, nonceMap } = useAnimatedMoney(players, {
    duration: 650,
    clearAfterMs: 1400,
  });

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
                  const moneyDisplay = display[player.id] ?? player.money ?? 0;
                  const delta = deltas[player.id];
                  const nonce = nonceMap[player.id];

                  return (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      isCurrent={isCurrent}
                      isLeader={!!isLeader}
                      rank={rank}
                      moneyDisplay={moneyDisplay}
                      delta={delta}
                      nonce={nonce}
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
