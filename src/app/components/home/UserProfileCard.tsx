
"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { UserProfile, SocialRank } from "@/types";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { CircleDollarSign, Diamond, Edit, Star, Trophy, ShoppingBag } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";

interface UserProfileCardProps {
  userProfile: UserProfile;
  currentRank: SocialRank | null;
  socialRanks: SocialRank[];
}

/**
 * GPT‑5 Enhanced UserProfileCard
 * - Glassy gradient frame with animated aura
 * - Dynamic rank palette (auto picks colors from rank name)
 * - Subtle motion + tooltips + number formatting (ar)
 * - Non‑breaking props & export signature
 */
export default function UserProfileCard({ userProfile, currentRank, socialRanks }: UserProfileCardProps) {
  // Sorted ranks (stable copy)
  const sortedRanks = useMemo(() => [...socialRanks].sort((a, b) => a.threshold - b.threshold), [socialRanks]);

  // Active decree overrides rank name visually
  const activeDecree = useMemo(() => 
      userProfile?.decrees?.find((d) => d.until && new Date(d.until) > new Date()),
    [userProfile?.decrees]
  );

  // Figure out next rank + progress
  const { nextRank, pointsForCurrentRank, pointsForNextRank } = useMemo(() => {
    if (!userProfile) return { nextRank: null as SocialRank | null, pointsForCurrentRank: 0, pointsForNextRank: 0 };
    const currentIdx = currentRank ? sortedRanks.findIndex(r => r.threshold === currentRank.threshold) : -1;
    const next = (currentIdx !== -1 && currentIdx < sortedRanks.length - 1) ? sortedRanks[currentIdx + 1] : null;
    const base = currentRank?.threshold ?? 0;
    const target = next?.threshold ?? (userProfile.leaderboardPoints ?? 0);
    return { nextRank: next, pointsForCurrentRank: base, pointsForNextRank: target };
  }, [currentRank, sortedRanks, userProfile?.leaderboardPoints]);

  const progress = useMemo(() => {
    if (!userProfile) return 0;
    if (!nextRank) return 100;
    const total = Math.max(1, pointsForNextRank - pointsForCurrentRank);
    const got = Math.max(0, (userProfile.leaderboardPoints ?? 0) - pointsForCurrentRank);
    return Math.min(100, Math.max(0, (got / total) * 100));
  }, [userProfile, nextRank, pointsForCurrentRank, pointsForNextRank]);

  // Arabic number formatter
  const nf = useMemo(() => new Intl.NumberFormat("ar-EG"), []);

  // Dynamic gradient palette derived from rank name
  const rankName = (currentRank?.name || "").toLowerCase();
  const palette = useMemo(() => {
    if (/(legend|أسطوري|اسطوري)/.test(rankName)) return { from: "from-fuchsia-500", via: "via-purple-500", to: "to-amber-400" };
    if (/(diamond|ماسي|ألما|الماس)/.test(rankName)) return { from: "from-cyan-400", via: "via-sky-500", to: "to-indigo-500" };
    if (/(platinum|بلاتين)/.test(rankName)) return { from: "from-zinc-300", via: "via-slate-400", to: "to-slate-600" };
    if (/(gold|ذهبي)/.test(rankName)) return { from: "from-amber-400", via: "via-orange-500", to: "to-yellow-500" };
    if (/(silver|فضي)/.test(rankName)) return { from: "from-slate-200", via: "via-zinc-300", to: "to-gray-400" };
    if (/(bronze|برونز)/.test(rankName)) return { from: "from-amber-700", via: "via-amber-600", to: "to-orange-600" };
    return { from: "from-violet-500", via: "via-indigo-500", to: "to-sky-500" };
  }, [rankName]);

  const RankIcon = currentRank?.icon as any;

  return (
    <div className={`relative rounded-3xl p-[1px] bg-gradient-to-br ${palette.from} ${palette.via} ${palette.to} shadow-[0_0_0_1px_rgba(255,255,255,0.05)]`}> 
      {/* Animated border aura */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -inset-20 opacity-20 blur-2xl bg-[conic-gradient(var(--tw-gradient-stops))] animate-[spin_12s_linear_infinite]" />
      </div>

      <Card className="rounded-[22px] overflow-hidden backdrop-blur-xl bg-black/60 border-transparent">
        <div className="absolute -top-24 -left-20 h-64 w-64 rounded-full opacity-20 blur-3xl bg-gradient-to-br from-primary/40 to-purple-500/40" />
        <div className="absolute -bottom-24 -right-20 h-64 w-64 rounded-full opacity-20 blur-3xl bg-gradient-to-br from-amber-400/30 to-fuchsia-500/30" />

        <CardContent className="relative flex flex-col md:flex-row items-center gap-6 p-5">
          {/* Avatar + edit */}
          <div className="relative">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35 }}>
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/50 to-fuchsia-500/40 blur-md" />
                <PlayerAvatar
                  avatarId={userProfile.avatarId}
                  className="w-24 h-24 rounded-full border-4 border-black/80 shadow-xl relative z-10"
                  temporaryTitle={userProfile.temporaryTitle}
                  priority
                />
              </div>
            </motion.div>
            <Button variant="outline" size="icon" className="absolute -bottom-2 -right-2 rounded-full h-9 w-9 bg-background/80 backdrop-blur-md border-border hover:bg-background" asChild>
              <Link href="/profile"><Edit className="w-4 h-4" /></Link>
            </Button>
          </div>

          {/* Main info */}
          <div className="flex-grow text-center md:text-right w-full">
            <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap">
              <p className="text-xl text-slate-300">أهلاً بك يا</p>
              <CardTitle className="text-3xl font-serif font-extrabold tracking-tight text-amber-200">
                {userProfile.name}!
              </CardTitle>
              {currentRank && (
                <motion.span
                  initial={{ y: -6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border bg-gradient-to-r ${palette.from} ${palette.to} text-background shadow-sm`}
                >
                  {RankIcon ? <RankIcon className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                  <span>{activeDecree?.title ?? currentRank.name}</span>
                </motion.span>
              )}
            </div>

            {/* Wallet row */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 md:gap-4 font-semibold mt-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 px-3 py-1.5 bg-black/40 backdrop-blur-sm hover:shadow-md cursor-default">
                      <CircleDollarSign className="w-5 h-5 text-yellow-400" />
                      <span className="text-white">{nf.format(userProfile.coins || 0)} كوينز</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>رصيد الكوينز الخاص بك</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 px-3 py-1.5 bg-black/40 backdrop-blur-sm hover:shadow-md cursor-default">
                      <Diamond className="w-5 h-5 text-blue-400" />
                      <span className="text-white">{nf.format(userProfile.diamonds || 0)} ألماس</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>أحجارك الكريمة</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 px-3 py-1.5 bg-black/40 backdrop-blur-sm hover:shadow-md cursor-default">
                      <Trophy className="w-5 h-5 text-amber-400" />
                      <span className="text-white">{nf.format(userProfile.leaderboardPoints || 0)} نقاط</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>إجمالي نقاط الصدارة</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Progress */}
            {nextRank ? (
              <div className="w-full max-w-md mt-4 mx-auto md:mx-0">
                <div className="flex justify-between text-[11px] font-semibold text-muted-foreground mb-1">
                  <span>
                    اللقب التالي: <span className="text-primary">{nextRank.name}</span>
                  </span>
                  <span>
                    {nf.format(userProfile.leaderboardPoints || 0)} / {nf.format(pointsForNextRank)}
                  </span>
                </div>
                <div className="relative">
                  <Progress value={progress} className="h-2 overflow-hidden bg-muted/60" />
                  {/* Animated shine */}
                  <div
                    className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(90deg,transparent,black,transparent)] bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2.8s_infinite]"
                    aria-hidden
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs font-bold text-green-500 flex items-center gap-1 justify-center md:justify-start">
                <Star className="animate-pulse" /> لقد وصلت إلى أعلى رتبة!
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex md:flex-col gap-2 w-full md:w-auto md:items-stretch justify-center">
            <Button asChild className="rounded-xl">
              <Link href="/society">المجتمع</Link>
            </Button>
            <Button variant="outline" asChild className="rounded-xl">
              <Link href="/clan-wars">حروب الفرق</Link>
            </Button>
            <Button variant="ghost" asChild className="rounded-xl">
              <Link href="/store" className="inline-flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" /> المتجر
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* local keyframes for shimmer (Tailwind arbitrary) */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
