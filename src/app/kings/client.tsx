
'use client';

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import type { GameKing, Game, UserProfile, SocialRank } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { GAME_TYPE_NAMES, GAME_ICONS } from "@/data/icons";
import { Crown, Star, Trophy, Shield, Handshake, Angry, Timer } from "lucide-react";
import { motion } from "framer-motion";
import { getKingsPageData } from "@/lib/actions/user/queries";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { RANK_ICON_MAP } from "@/data/social-ranks";
import { Timestamp } from "firebase/firestore";


// --- Countdown Timer Logic ---

/**
 * Calculates the time remaining until the next Thursday at 10:00 AM UTC.
 * @returns An object with days, hours, minutes, and seconds remaining.
 */
function getNextUpdateCountdown() {
  const now = new Date();
  const nextUpdate = new Date(now);

  // Set to UTC
  nextUpdate.setUTCHours(10, 0, 0, 0);

  // Find next Thursday
  const currentDay = now.getUTCDay(); // Sunday = 0, Thursday = 4
  const daysUntilThursday = (4 - currentDay + 7) % 7;
  
  if (daysUntilThursday === 0 && now.getUTCHours() >= 10) {
      // It's Thursday but past 10 AM UTC, so schedule for next week
      nextUpdate.setUTCDate(now.getUTCDate() + 7);
  } else {
      nextUpdate.setUTCDate(now.getUTCDate() + daysUntilThursday);
  }
  
  const diff = nextUpdate.getTime() - now.getTime();

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / 1000 / 60) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    total: diff,
  };
}


const CountdownUnit = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
        <span className="text-2xl md:text-3xl font-mono font-bold tracking-tighter">{String(value).padStart(2, '0')}</span>
        <span className="text-[10px] md:text-xs text-gray-400">{label}</span>
    </div>
);

const KingsCountdown = () => {
    const [timeLeft, setTimeLeft] = useState(getNextUpdateCountdown());

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(getNextUpdateCountdown());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    if (timeLeft.total <= 0) {
        return <div className="text-lg text-green-400 animate-pulse">جاري تحديث الملوك الآن...</div>;
    }

    return (
        <div className="bg-gray-900/60 border border-purple-500/30 rounded-2xl p-4 w-full max-w-sm mx-auto backdrop-blur-sm">
            <div className="flex justify-around items-center">
                <CountdownUnit value={timeLeft.days} label="أيام" />
                <span className="text-2xl font-bold">:</span>
                <CountdownUnit value={timeLeft.hours} label="ساعات" />
                <span className="text-2xl font-bold">:</span>
                <CountdownUnit value={timeLeft.minutes} label="دقائق" />
                <span className="text-2xl font-bold">:</span>
                <CountdownUnit value={timeLeft.seconds} label="ثواني" />
            </div>
        </div>
    );
};


// --- Main Component ---
export default function KingsClient() {
  const [kings, setKings] = useState<Record<string, GameKing>>({});
  const [kingOfGames, setKingOfGames] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { socialRanks, getSocialRankForUser, kingOfGamesId } = useAuth();

  const gameEntries = useMemo(() => Object.entries(GAME_TYPE_NAMES), []);

  useEffect(() => {
    let alive = true;
    const fetchKingsData = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const { kings: fetchedKings, kingOfGames: fetchedKingOfGames } = await getKingsPageData();
        if (!alive) return;
        setKings(fetchedKings || {});
        setKingOfGames(fetchedKingOfGames || null);
      } catch (e) {
        if (!alive) return;
        setErrorMsg("تعذر تحميل قاعة الملوك. حاول مجددًا.");
      } finally {
        if (alive) setIsLoading(false);
      }
    };
    fetchKingsData();
    return () => {
      alive = false;
    };
  }, []);

  const kingOfGamesRank = useMemo(() => {
    if (!kingOfGames || !Array.isArray(socialRanks) || socialRanks.length === 0) return null;
    return getSocialRankForUser(kingOfGames.leaderboardPoints || 0);
  }, [kingOfGames, socialRanks, getSocialRankForUser]);

  const floatTransition = { type: "spring", stiffness: 120, damping: 14 };
  const cardWhileHover = { y: -6, scale: 1.02 };
  const cardWhileTap = { scale: 0.98 };

  const renderLoadingState = () => (
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
        {[...Array(6)].map((_, i) => (
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

  return (
    <div className="min-h-screen w-full bg-gray-950 text-white">
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 stars"></div>
        <div className="absolute inset-0 twinkling"></div>
        <motion.div
          aria-hidden
          className="absolute -top-24 -left-24 w-[36rem] h-[36rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(168,85,247,0.35), transparent)' }}
          animate={{ x: [0, 40, -30, 0], y: [0, 20, -15, 0], opacity: [0.6, 0.9, 0.7, 0.6] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute bottom-[-8rem] right-[-8rem] w-[42rem] h-[42rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(34,197,94,0.28), transparent)' }}
          animate={{ x: [0, -30, 20, 0], y: [0, -25, 10, 0], opacity: [0.5, 0.8, 0.6, 0.5] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        <header className="text-center mb-6">
          <motion.div
            initial={{ scale: 0.6, rotate: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: [0, -10, 10, -4, 0] }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.15 }}
          >
            <Crown className="w-24 h-24 mx-auto text-yellow-400 drop-shadow-[0_5px_15px_rgba(250,204,21,0.45)]" />
          </motion.div>
          <motion.h1
            className="text-4xl md:text-5xl font-bold mt-4 tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-pink-300 to-amber-200"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            aria-live="polite"
          >
            قاعة الملوك
          </motion.h1>
          <motion.p
            className="text-lg text-gray-300 mt-2"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            الأبطال الذين يتربعون على عرش كل لعبة. هل يمكنك هزيمتهم؟
          </motion.p>
        </header>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            <div className="text-center mb-8 space-y-2">
                <h2 className="text-lg font-semibold text-purple-200 flex items-center justify-center gap-2">
                    <Timer className="w-5 h-5"/>
                    الوقت المتبقي لتحديث الملوك
                </h2>
                <KingsCountdown />
            </div>
        </motion.div>

        {!isLoading && errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-2xl mb-8"
          >
            <Card className="bg-red-900/30 border-red-500/40">
              <CardContent className="p-6 text-center space-y-4">
                <p className="text-red-200">{errorMsg}</p>
                <div>
                  <button
                    onClick={() => { location.reload(); }}
                    className="px-4 py-2 rounded-md bg-red-600/80 hover:bg-red-600 transition-colors text-white font-semibold"
                  >
                    إعادة المحاولة
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {isLoading ? (
          renderLoadingState()
        ) : (
          <div className="w-full">
            {kingOfGames && (
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
              >
                <Card className="mb-12 relative overflow-hidden bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 border-2 border-yellow-300/80 text-black">
                  <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-soft-light" />
                  <CardContent className="relative p-4 md:p-6 flex flex-col md:flex-row items-center gap-6">
                    <motion.div
                      initial={{ rotate: -6, scale: 0.9 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={floatTransition}
                      className="relative"
                    >
                      <span className="absolute -inset-1 rounded-full blur-lg bg-yellow-200/40" aria-hidden />
                      <PlayerAvatar
                        avatarId={kingOfGames.avatarId}
                        className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-yellow-200 shadow-lg relative"
                      />
                    </motion.div>
                    <div className="text-center md:text-right flex-grow">
                      <div className="flex items-center justify-center md:justify-start gap-2 text-yellow-900">
                        <Crown className="w-8 h-8 drop-shadow-lg" />
                        <h2 className="text-2xl font-bold">ملك بطابيطو</h2>
                      </div>
                      <h3 className="text-4xl md:text-5xl font-extrabold mt-1 king-of-games-name">{kingOfGames.name}</h3>
                       <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-x-4 gap-y-1 mt-2 text-xl font-semibold text-yellow-100/90" style={{textShadow: '1px 1px 2px rgba(0,0,0,0.3)'}}>
                        <div className="flex items-center gap-2">
                          <Trophy className="w-5 h-5" />
                          {kingOfGames.leaderboardPoints || 0} نقطة صدارة
                        </div>
                        {kingOfGamesRank && kingOfGamesRank.icon && (
                          <div className="flex items-center gap-2">
                            {React.createElement(RANK_ICON_MAP[kingOfGamesRank.icon as string] || Star, { className: "w-5 h-5" })}
                            <span>{kingOfGamesRank.name}</span>
                          </div>
                        )}
                      </div>
                       <div className="flex justify-center md:justify-start gap-x-3 gap-y-1 mt-2 text-sm font-semibold text-yellow-800/90" style={{textShadow: '1px 1px 2px rgba(0,0,0,0.2)'}}>
                        <span className="flex items-center gap-1.5"><Shield className="w-4 h-4"/>{kingOfGames.honorPoints || 0} شرف</span>
                        <span className="flex items-center gap-1.5"><Handshake className="w-4 h-4"/>{kingOfGames.loyaltyPoints || 0} ولاء</span>
                        <span className="flex items-center gap-1.5"><Angry className="w-4 h-4"/>{kingOfGames.rebellionPoints || 0} تمرد</span>
                      </div>
                    </div>
                    <div
                      aria-hidden
                      className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-200/60 via-white/80 to-amber-200/60"
                    />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {gameEntries.map(([gameType, name], index) => {
                const king = kings[gameType as keyof typeof kings];
                const Icon = GAME_ICONS[gameType as keyof typeof GAME_ICONS] || Star;
                const kingRank = king ? getSocialRankForUser(king.totalLeaderboardPoints || 0) : null;
                const RankIcon = kingRank && kingRank.icon ? RANK_ICON_MAP[kingRank.icon as string] || Shield : Shield;

                return (
                  <motion.div
                    key={gameType}
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15 + index * 0.08 }}
                  >
                    <motion.div whileHover={cardWhileHover} whileTap={cardWhileTap} transition={floatTransition}>
                      <Card className={cn(
                        "relative overflow-hidden text-center p-4 h-full flex flex-col justify-between",
                        "bg-black/35 backdrop-blur-lg border-purple-800/50 text-white",
                        "shadow-lg shadow-purple-900/40 hover:shadow-purple-500/50 transition-all duration-300"
                      )}>
                        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-10 bg-gradient-to-br from-purple-400 via-fuchsia-400 to-amber-300" />
                        <div className="relative">
                          <Icon className="w-16 h-16 text-purple-300 mx-auto mb-2 drop-shadow-[0_0_10px_rgba(192,132,252,0.45)]" />
                          <h3 className="font-bold text-2xl text-purple-200">{name}</h3>
                        </div>

                        {king ? (
                          <div className="mt-4 space-y-3 relative">
                            <motion.div
                              initial={{ rotate: 2, scale: 0.98 }}
                              animate={{ rotate: 0, scale: 1 }}
                              transition={floatTransition}
                              className="relative w-fit mx-auto"
                            >
                              <span className="absolute -inset-0.5 rounded-full bg-amber-400/30 blur opacity-70" aria-hidden />
                              <PlayerAvatar
                                avatarId={king.avatarId}
                                className="w-24 h-24 mx-auto rounded-full border-4 border-amber-400 shadow-lg relative"
                              />
                            </motion.div>

                            <p className={cn("font-semibold text-xl", king.kingId === kingOfGamesId && "king-of-games-name")}>{king.name}</p>

                            {kingRank && (
                              <div className="flex items-center justify-center gap-1.5 text-sm text-gray-300">
                                {React.createElement(RankIcon as any, { className: "w-4 h-4" })}
                                <span>{kingRank.name}</span>
                              </div>
                            )}

                            <div className="flex justify-center items-center gap-4 text-sm text-gray-300/90">
                              <span className="flex items-center gap-1.5">
                                <Star className="w-4 h-4" /> {king.winCount} انتصارات
                              </span>
                                <span className="flex items-center gap-1.5">
                                    <Trophy className="w-4 h-4" /> {king.totalLeaderboardPoints || 0} نقطة
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
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

    