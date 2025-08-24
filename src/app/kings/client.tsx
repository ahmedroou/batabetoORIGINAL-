
'use client';

import * as React from 'react';
import { useState, useEffect, useMemo, useRef, useTransition, useCallback } from 'react';
import type { GameKing, UserProfile } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { GAME_TYPE_NAMES, GAME_ICONS } from '@/data/icons';
import { Crown, Star, Trophy, Shield, Handshake, Angry, Timer, RefreshCw, Search, Sparkles, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { getKingsPageData } from '@/lib/actions/user/queries';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { RANK_ICON_MAP } from '@/data/social-ranks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { recalculateGameKings } from '@/lib/actions/admin/users';
import { useToast } from '@/hooks/use-toast';

// =====================
// Utilities
// =====================
const fmt = (n: number | undefined | null) => new Intl.NumberFormat('ar-SA').format(n ?? 0);
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

function getNextThursday10UTC(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(10, 0, 0, 0);
  const day = now.getUTCDay(); // 0..6 (Sun..Sat)
  const delta = (4 - day + 7) % 7; // 4 = Thursday
  if (delta === 0 && now.getUTCHours() >= 10) next.setUTCDate(now.getUTCDate() + 7);
  else next.setUTCDate(now.getUTCDate() + delta);
  return next;
}

function getPrevThursday10UTC(now = new Date()) {
  const prev = new Date(getNextThursday10UTC(now));
  prev.setUTCDate(prev.getUTCDate() - 7);
  return prev;
}

function getAnchors(now = new Date()) {
  const next = getNextThursday10UTC(now);
  const prev = getPrevThursday10UTC(now);
  const total = next.getTime() - prev.getTime();
  const elapsed = now.getTime() - prev.getTime();
  const remaining = next.getTime() - prev.getTime();
  return { prev, next, total, elapsed, remaining };
}

function getCountdown(now = new Date()) {
  const { next, remaining } = getAnchors(now);
  const d = Math.max(0, remaining);
  return {
    days: Math.floor(d / (1000 * 60 * 60 * 24)),
    hours: Math.floor((d / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((d / (1000 * 60)) % 60),
    seconds: Math.floor((d / 1000) % 60),
    total: d,
    target: next,
  };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

// =====================
// Tilt wrapper for cards
// =====================
function Tilt({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height; // 0..1
    const rx = (0.5 - py) * 10; // max tilt 10deg
    const ry = (px - 0.5) * 10;
    setStyle({ transform: `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`, transition: 'transform 120ms ease' });
  };
  const onLeave = () => setStyle({ transform: 'perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0)', transition: 'transform 180ms ease' });

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className="will-change-transform">
      <div style={style}>{children}</div>
    </div>
  );
}

// =====================
// Countdown with Progress Ring
// =====================
const CountdownUnit = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col items-center">
    <span className="text-2xl md:text-3xl font-mono font-bold tracking-tighter">{String(value).padStart(2, '0')}</span>
    <span className="text-[10px] md:text-xs text-gray-400">{label}</span>
  </div>
);

const KingsCountdown = ({ onReachedZero }: { onReachedZero?: () => void }) => {
  const [now, setNow] = useState<Date | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { total, days, hours, minutes, seconds, target } = useMemo(() => {
    return now ? getCountdown(now) : { total: -1, days: 0, hours: 0, minutes: 0, seconds: 0, target: new Date() };
  }, [now]);
  
  useEffect(() => {
    if (total <= 0 && !firedRef.current) {
      firedRef.current = true;
      onReachedZero?.();
    }
  }, [total, onReachedZero]);

  if (!now) return null;

  const { elapsed, total: span } = getAnchors(now);
  const pct = 1 - clamp(elapsed / span, 0, 1);

  if (total <= 0) {
    return <div className="text-lg text-green-400 animate-pulse">جاري تحديث الملوك الآن...</div>;
  }

  const ring = 80;
  const stroke = 6;
  const r = (ring - stroke) / 2;
  const C = 2 * Math.PI * r;
  const dash = C * pct;

  const localRiyadh = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(target);
  const localDevice = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(target);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative grid grid-cols-[auto_1fr] items-center gap-3 bg-gray-900/60 border border-purple-500/30 rounded-2xl p-3 w-full max-w-md mx-auto backdrop-blur-sm"
        role="timer"
        aria-live="polite"
        aria-label={`الوقت المتبقي حتى التحديث التالي: ${days} يوم و ${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية`}
      >
        {/* Ring */}
        <div className="relative" style={{ width: ring, height: ring }} aria-hidden>
          <svg width={ring} height={ring} className="block">
            <circle cx={ring / 2} cy={ring / 2} r={r} strokeWidth={stroke} className="opacity-25" stroke="currentColor" fill="none" />
            <circle
              cx={ring / 2}
              cy={ring / 2}
              r={r}
              strokeWidth={stroke}
              stroke="currentColor"
              fill="none"
              strokeLinecap="round"
              style={{ strokeDasharray: `${dash} ${C - dash}`, transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
              className="text-purple-400"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Timer className="w-5 h-5 text-purple-300" />
          </div>
        </div>

        {/* Units */}
        <div className="flex justify-around items-center gap-3">
          <CountdownUnit value={days} label="أيام" />
          <span className="text-2xl font-bold">:</span>
          <CountdownUnit value={hours} label="ساعات" />
          <span className="text-2xl font-bold">:</span>
          <CountdownUnit value={minutes} label="دقائق" />
          <span className="text-2xl font-bold">:</span>
          <CountdownUnit value={seconds} label="ثواني" />
        </div>
      </div>
      <p className="text-[11px] text-gray-400 text-center">
        التحديث القادم: <span className="mx-1 text-purple-200">{localRiyadh}</span>
        <span className="opacity-70">(حسب جهازك: {localDevice})</span>
      </p>
    </div>
  );
};

// =====================
// Loading UI
// =====================
function LoadingGrid() {
  return (
    <div className="w-full">
      <Card className="mb-8 bg-yellow-900/20 border-yellow-500/30">
        <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">
          <Skeleton className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-slate-700" />
          <div className="text-center md:text-right flex-grow space-y-2">
            <Skeleton className="h-6 w-32 mx-auto md:mx-0 bg-slate-700" />
            <Skeleton className="h-8 w-48 mx-auto md:mx-0 bg-slate-700" />
            <Skeleton className="h-6 w-32 mt-2 mx-auto md:mx-0 bg-slate-700" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="text-center p-4 bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
            <Skeleton className="w-16 h-16 mx-auto mb-2 rounded-full bg-slate-700" />
            <Skeleton className="h-6 w-3/4 mx-auto mb-2 bg-slate-700" />
            <Skeleton className="w-24 h-24 mx-auto rounded-full bg-slate-700" />
            <Skeleton className="h-5 w-1/2 mx-auto mt-2 bg-slate-700" />
            <Skeleton className="h-4 w-1/4 mx-auto mt-1 bg-slate-700" />
          </Card>
        ))}
      </div>
    </div>
  );
}

// =====================
// Game Card
// =====================
function GameCard({
  code,
  name,
  king,
  isOverallKing,
  getSocialRankForUser,
}: {
  code: string;
  name: string;
  king: GameKing | undefined;
  isOverallKing: boolean;
  getSocialRankForUser: (pts: number) => { name: string; icon?: string } | null;
}) {
  const Icon = GAME_ICONS[code as keyof typeof GAME_ICONS] || Star;
  const kingRank = king ? getSocialRankForUser(king.totalLeaderboardPoints || 0) : null;
  const RankIcon = kingRank && kingRank.icon ? (RANK_ICON_MAP[kingRank.icon as string] || Shield) : Shield;

  return (
    <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <Tilt>
        <motion.div whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.99 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
          <Card className={cn(
            'relative overflow-hidden text-center p-4 h-full flex flex-col justify-between',
            'bg-black/35 backdrop-blur-lg border-purple-800/50 text-white',
            'shadow-lg shadow-purple-900/40 hover:shadow-purple-500/50 transition-all duration-300'
          )}>
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-10 bg-gradient-to-br from-purple-400 via-fuchsia-400 to-amber-300" />
            <div className="relative">
              <Icon className="w-16 h-16 text-purple-300 mx-auto mb-2 drop-shadow-[0_0_10px_rgba(192,132,252,0.45)]" />
              <h3 className="font-bold text-2xl text-purple-200">{name}</h3>
            </div>

            {king ? (
              <div className="mt-4 space-y-3 relative">
                <motion.div initial={{ rotate: 2, scale: 0.98 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} className="relative w-fit mx-auto">
                  <span className="absolute -inset-0.5 rounded-full bg-amber-400/30 blur opacity-70" aria-hidden />
                  <PlayerAvatar avatarId={king.avatarId} className="w-24 h-24 mx-auto rounded-full border-4 border-amber-400 shadow-lg relative" />
                </motion.div>
                <p className={cn('font-semibold text-xl', isOverallKing && 'king-of-games-name')}>{king.name}</p>

                {kingRank && (
                  <div className="flex items-center justify-center gap-1.5 text-sm text-gray-300">
                    {React.createElement(RankIcon as any, { className: 'w-4 h-4' })}
                    <span>{kingRank.name}</span>
                  </div>
                )}

                <div className="flex justify-center items-center gap-4 text-sm text-gray-300/90">
                  <span className="flex items-center gap-1.5">
                    <Star className="w-4 h-4" /> {fmt(king.winCount)} انتصارات
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Trophy className="w-4 h-4" /> {fmt(king.totalLeaderboardPoints || 0)} نقطة
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex-grow flex flex-col items-center justify-center">
                <p className="text-gray-300">لا يوجد ملك بعد</p>
                <p className="text-xs text-gray-400">هل ستكون أنت الأول؟</p>
              </div>
            )}
          </Card>
        </motion.div>
      </Tilt>
    </motion.div>
  );
}

// =====================
// Last Updated Badge
// =====================
function LastUpdated({ date }: { date: Date | null }) {
  if (!date) return null;
  const text = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  return (
    <div className="inline-flex items-center gap-2 text-xs rounded-full px-3 py-1 bg-white/5 border border-white/10 text-gray-300">
      <Sparkles className="w-3.5 h-3.5" /> آخر تحديث: {text}
    </div>
  );
}

// =====================
// Main Component
// =====================
export default function KingsClient() {
  const { toast } = useToast();
  const [kings, setKings] = useState<Record<string, GameKing>>({});
  const [kingOfGames, setKingOfGames] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { socialRanks, getSocialRankForUser, kingOfGamesId, userProfile } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // UI controls
  const [theme, setTheme] = useState<'royal' | 'light'>(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'royal'
  );
  const [query, setQuery] = useState('');

  const gameEntries = useMemo(() => Object.entries(GAME_TYPE_NAMES) as Array<[string, string]>, []);
  const filteredEntries = useMemo(() => {
    const q = query.trim();
    if (!q) return gameEntries;
    return gameEntries.filter(([, name]) => name.toLowerCase().includes(q.toLowerCase()));
  }, [gameEntries, query]);

  const fetchKingsData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { kings: fetchedKings, kingOfGames: fetchedKingOfGames } = await getKingsPageData();
      setKings(fetchedKings || {});
      setKingOfGames(fetchedKingOfGames || null);
      setLastUpdated(new Date());
    } catch (e) {
      setErrorMsg('تعذر تحميل قاعة الملوك. حاول مجددًا.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKingsData();
  }, [fetchKingsData]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    const result = await recalculateGameKings();
    if (result.success) {
      toast({ title: 'تم التحديث', description: `تم تحديث ملوك الألعاب بنجاح (${result.updatedCount || 0}).` });
      await fetchKingsData();
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
    setIsRefreshing(false);
  };

  const handleCountdownReachedZero = () => {
    // soft auto-refresh when countdown lapses
    startTransition(() => fetchKingsData());
  };

  const kingOfGamesRank = useMemo(() => {
    if (!kingOfGames || !Array.isArray(socialRanks) || socialRanks.length === 0) return null;
    return getSocialRankForUser(kingOfGames.leaderboardPoints || 0);
  }, [kingOfGames, socialRanks, getSocialRankForUser]);

  // Theme classes
  const isRoyal = theme === 'royal';
  const rootClass = cn(
    'min-h-screen w-full',
    isRoyal ? 'bg-gray-950 text-white' : 'bg-gradient-to-br from-amber-50 to-rose-50 text-gray-900'
  );

  return (
    <div className={rootClass}>
      {/* Background Layers */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        {isRoyal ? (
          <>
            <motion.div
              aria-hidden
              className="absolute -top-24 -left-24 w-[36rem] h-[36rem] rounded-full blur-3xl"
              style={{ background: 'radial-gradient(closest-side, rgba(168,85,247,0.35), transparent)' }}
              animate={{ x: [0, 40, -30, 0], y: [0, 20, -15, 0], opacity: [0.6, 0.9, 0.7, 0.6] }}
              transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              aria-hidden
              className="absolute bottom-[-8rem] right-[-8rem] w-[42rem] h-[42rem] rounded-full blur-3xl"
              style={{ background: 'radial-gradient(closest-side, rgba(34,197,94,0.28), transparent)' }}
              animate={{ x: [0, -30, 20, 0], y: [0, -25, 10, 0], opacity: [0.5, 0.8, 0.6, 0.5] }}
              transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        ) : (
          <>
            <motion.div
              aria-hidden
              className="absolute -top-32 right-[-10rem] w-[40rem] h-[40rem] rounded-full blur-2xl"
              style={{ background: 'radial-gradient(closest-side, rgba(253,230,138,0.5), transparent)' }}
              animate={{ opacity: [0.5, 0.8, 0.6, 0.5] }}
              transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              aria-hidden
              className="absolute bottom-[-10rem] left-[-8rem] w-[36rem] h-[36rem] rounded-full blur-2xl"
              style={{ background: 'radial-gradient(closest-side, rgba(244,114,182,0.35), transparent)' }}
              animate={{ opacity: [0.4, 0.7, 0.5, 0.4] }}
              transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <motion.div initial={{ scale: 0.6, rotate: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1, rotate: [0, -10, 10, -4, 0] }} transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.15 }}>
              <Crown className={cn('w-24 h-24 mx-auto drop-shadow-[0_5px_15px_rgba(250,204,21,0.45)]', isRoyal ? 'text-yellow-400' : 'text-yellow-500')} />
            </motion.div>
            <motion.h1
              className={cn('text-4xl md:text-5xl font-bold mt-1 tracking-wider bg-clip-text text-transparent', isRoyal ? 'bg-gradient-to-r from-purple-300 via-pink-300 to-amber-200' : 'bg-gradient-to-r from-amber-600 via-rose-600 to-pink-600')}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              aria-live="polite"
            >
              قاعة الملوك
            </motion.h1>
            <motion.p className={cn('text-lg mt-1', isRoyal ? 'text-gray-300' : 'text-gray-700')} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}>
              الأبطال الذين يتربعون على عرش كل لعبة. هل يمكنك هزيمتهم؟
            </motion.p>

            {/* Controls: theme toggle + search + last updated */}
            <div className="w-full mt-4 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant={isRoyal ? 'secondary' : 'default'} onClick={() => setTheme(isRoyal ? 'light' : 'royal')}>
                  {isRoyal ? <Sun className="w-4 h-4 ml-2" /> : <Moon className="w-4 h-4 ml-2" />}
                  تبديل المظهر
                </Button>
                <LastUpdated date={lastUpdated} />
              </div>
              <div className="relative w-full md:w-80">
                <Search className={cn('absolute right-3 top-1/2 -translate-y-1/2', isRoyal ? 'text-gray-400' : 'text-gray-500')} />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث عن لعبة..."
                  className={cn('pr-10', isRoyal ? 'bg-black/30 border-white/10 text-white placeholder:text-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-500')}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Countdown + Admin action */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="text-center mb-8 space-y-2">
            <h2 className={cn('text-lg font-semibold flex items-center justify-center gap-2', isRoyal ? 'text-purple-200' : 'text-rose-600')}>
              <Timer className="w-5 h-5" />
              الوقت المتبقي للتحديث التالي
            </h2>
            <KingsCountdown onReachedZero={handleCountdownReachedZero} />
            {userProfile?.isAdmin && (
              <Button onClick={handleManualRefresh} disabled={isRefreshing || isPending} variant={isRoyal ? 'secondary' : 'default'} size="sm" className="mt-2">
                <RefreshCw className={cn('w-4 h-4 ml-2', (isRefreshing || isPending) && 'animate-spin')} />
                {isRefreshing ? 'جاري التحديث...' : 'تحديث الملوك الآن'}
              </Button>
            )}
          </div>
        </motion.div>

        {/* Error banner */}
        {!isLoading && errorMsg && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl mb-8">
            <Card className={cn(isRoyal ? 'bg-red-900/30 border-red-500/40' : 'bg-rose-100 border-rose-300 text-rose-800')}>
              <CardContent className="p-6 text-center space-y-4">
                <p className={cn(isRoyal ? 'text-red-200' : 'text-rose-800')}>{errorMsg}</p>
                <div>
                  <button onClick={() => location.reload()} className={cn('px-4 py-2 rounded-md font-semibold transition-colors', isRoyal ? 'bg-red-600/80 hover:bg-red-600 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white')}>
                    إعادة المحاولة
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Content */}
        {isLoading ? (
          <LoadingGrid />
        ) : (
          <div className="w-full">
            {/* Overall king — extra shiny */}
            {kingOfGames && (
              <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
                <div className="relative mb-12">
                  {/* Glow border */}
                  <motion.div
                    aria-hidden
                    className="absolute -inset-1 rounded-3xl opacity-70 blur-xl"
                    style={{
                      background: 'conic-gradient(from 180deg at 50% 50%, rgba(255,255,255,0.45), rgba(253,224,71,0.9), rgba(245,158,11,0.9), rgba(255,255,255,0.45))',
                    }}
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                  />

                  <Card className={cn(
                    'relative overflow-hidden border-2 text-black rounded-3xl',
                    isRoyal ? 'bg-gradient-to-br from-amber-400/85 via-yellow-500/85 to-amber-600/85 border-yellow-300/80' : 'bg-gradient-to-br from-yellow-200 via-amber-200 to-orange-200 border-yellow-400'
                  )}>
                    <CardContent className="relative p-4 md:p-6 flex flex-col md:flex-row items-center gap-6">
                      {/* Sheen sweep */}
                      <motion.div
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)' }}
                        animate={{ x: ['-150%', '150%'] }}
                        transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
                      />

                      {/* Sparkles */}
                      <Sparkles aria-hidden className="absolute top-4 right-6 text-yellow-200/90 w-5 h-5" />
                      <Sparkles aria-hidden className="absolute bottom-6 left-8 text-yellow-100/90 w-4 h-4" />

                      <motion.div initial={{ rotate: -6, scale: 0.92 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} className="relative">
                        <span className="absolute -inset-1 rounded-full blur-lg bg-yellow-200/50" aria-hidden />
                        <PlayerAvatar avatarId={kingOfGames.avatarId} className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-yellow-200 shadow-xl relative" />
                      </motion.div>

                      <div className={cn('text-center md:text-right flex-grow', isRoyal ? 'text-yellow-900' : 'text-yellow-900') }>
                        <div className="flex items-center justify-center md:justify-start gap-2">
                          <Crown className="w-8 h-8 drop-shadow-lg" />
                          <h2 className="text-2xl font-extrabold">ملك بطابيطو</h2>
                        </div>
                        <h3 className={cn('text-4xl md:text-5xl font-extrabold mt-1 tracking-tight', kingOfGames.uid === kingOfGamesId && 'king-of-games-name')}>{kingOfGames.name}</h3>
                        <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-x-4 gap-y-1 mt-2 text-xl font-semibold text-yellow-900/90" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.15)' }}>
                          <div className="flex items-center gap-2">
                            <Trophy className="w-5 h-5" />
                            {fmt(kingOfGames.leaderboardPoints || 0)} نقطة صدارة
                          </div>
                          {(() => {
                            const r = kingOfGamesRank;
                            if (!r) return null;
                            const IconComp = (r.icon && RANK_ICON_MAP[r.icon as string]) || Star;
                            return (
                              <div className="flex items-center gap-2">
                                {React.createElement(IconComp as any, { className: 'w-5 h-5' })}
                                <span>{r.name}</span>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex justify-center md:justify-start gap-x-3 gap-y-1 mt-2 text-sm font-semibold text-yellow-900/90">
                          <span className="flex items-center gap-1.5"><Shield className="w-4 h-4" />{fmt(kingOfGames.honorPoints || 0)} شرف</span>
                          <span className="flex items-center gap-1.5"><Handshake className="w-4 h-4" />{fmt(kingOfGames.loyaltyPoints || 0)} ولاء</span>
                          <span className="flex items-center gap-1.5"><Angry className="w-4 h-4" />{fmt(kingOfGames.rebellionPoints || 0)} تمرد</span>
                        </div>
                      </div>

                      <div aria-hidden className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-200/70 via-white/90 to-amber-200/70" />
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}

            {/* Games grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEntries.map(([gameType, name], index) => (
                <GameCard
                  key={gameType}
                  code={gameType}
                  name={name as string}
                  king={kings[gameType as keyof typeof kings]}
                  isOverallKing={kings[gameType as keyof typeof kings]?.kingId === kingOfGamesId}
                  getSocialRankForUser={(pts) => getSocialRankForUser(pts)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Local styles for shine animations */}
      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
