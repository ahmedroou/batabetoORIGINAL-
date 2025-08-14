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
 * UserProfileCard — Black & Gold theme
 * - ثيم: أسود / ذهبي / أبيض
 * - RTL + A11y
 * - منطق رتبة محسّن (كما كان)
 */
export default function UserProfileCard({ userProfile, currentRank, socialRanks }: UserProfileCardProps) {
  const sortedRanks = useMemo(() => [...socialRanks].sort((a, b) => a.threshold - b.threshold), [socialRanks]);

  const activeDecree = useMemo(
    () => userProfile?.decrees?.find((d) => d.until && new Date(d.until) > new Date()),
    [userProfile?.decrees]
  );

  const {
    effectiveCurrentRank,
    nextRank,
    pointsForCurrentRank,
    pointsForNextRank,
  } = useMemo(() => {
    const points = userProfile?.leaderboardPoints ?? 0;
    const inferredCurrent =
      currentRank ??
      [...sortedRanks].filter((r) => r.threshold <= points).slice(-1)[0] ??
      null;
    const upcoming = sortedRanks.find((r) => r.threshold > points) ?? null;
    const base = inferredCurrent?.threshold ?? 0;
    const target = upcoming?.threshold ?? points;
    return {
      effectiveCurrentRank: inferredCurrent,
      nextRank: upcoming,
      pointsForCurrentRank: base,
      pointsForNextRank: target,
    };
  }, [currentRank, sortedRanks, userProfile?.leaderboardPoints]);

  const progress = useMemo(() => {
    const points = userProfile?.leaderboardPoints ?? 0;
    if (!nextRank) return 100;
    const total = Math.max(1, pointsForNextRank - pointsForCurrentRank);
    const got = Math.max(0, points - pointsForCurrentRank);
    return Math.min(100, Math.max(0, (got / total) * 100));
  }, [userProfile?.leaderboardPoints, nextRank, pointsForCurrentRank, pointsForNextRank]);

  const nf = useMemo(() => new Intl.NumberFormat("ar-EG"), []);

  // ثيم أسود-ذهبي-أبيض
  const frameGradient = "from-black/80 via-amber-600/40 to-white/5";
  const chipBase = "inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-black/40 backdrop-blur-sm border hover:shadow-md cursor-default";

  const RankIcon = (effectiveCurrentRank?.icon as any) || Trophy;

  return (
    <TooltipProvider delayDuration={80}>
      <div dir="rtl" className={`relative isolate rounded-3xl p-[1px] bg-gradient-to-br ${frameGradient} shadow-[0_6px_30px_rgba(0,0,0,0.7)]`}>
        {/* هالة ذهبية خفيفة */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -inset-24 opacity-18 blur-3xl bg-[conic-gradient(from_180deg_at_50%_50%,_rgba(255,215,0,0.12),_transparent_40%)] animate-[spin_24s_linear_infinite]" />
        </div>

        <Card className="rounded-[20px] overflow-hidden backdrop-blur-lg bg-gradient-to-tr from-stone-900/85 to-stone-950/70 border border-amber-900/20">
          <div aria-hidden className="absolute -top-24 -left-16 h-56 w-56 rounded-full opacity-12 blur-3xl bg-gradient-to-br from-amber-400/20 to-transparent" />
          <div aria-hidden className="absolute -bottom-24 -right-16 h-56 w-56 rounded-full opacity-08 blur-3xl bg-gradient-to-tr from-white/5 to-transparent" />

          <CardContent className="relative p-5 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,auto] items-center gap-6">

              {/* أفاتار + تعديل */}
              <div className="relative place-self-center md:place-self-start">
                <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.36 }} className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-400/12 to-transparent blur-md" />
                  <PlayerAvatar
                    avatarId={userProfile.avatarId}
                    className="w-24 h-24 rounded-full border-4 border-amber-700/30 shadow-[0_8px_30px_rgba(0,0,0,0.7)] relative z-10"
                    temporaryTitle={userProfile.temporaryTitle}
                    priority
                  />
                </motion.div>

                <Button
                  variant="outline"
                  size="icon"
                  className="absolute -bottom-2 -left-2 rounded-full h-9 w-9 bg-white/6 backdrop-blur-md border-amber-500/20 hover:bg-white/8"
                  asChild
                  aria-label="تعديل الملف الشخصي"
                >
                  <Link href="/profile">
                    <Edit className="w-4 h-4 text-amber-300" />
                  </Link>
                </Button>
              </div>

              {/* معلومات المستخدم */}
              <div className="text-center md:text-right">
                <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap">
                  <p className="text-sm text-amber-200/70">مرحباً بك يا</p>
                  <CardTitle className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-stone-200 to-stone-400">
                    {userProfile.name}
                  </CardTitle>

                  {effectiveCurrentRank && (
                    <motion.span initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border border-amber-500/30 bg-black/60 text-amber-100 shadow-sm">
                      {RankIcon ? <RankIcon className="w-4 h-4 text-amber-300" /> : <Star className="w-4 h-4" />}
                      <span>{activeDecree?.title ?? currentRank.name}</span>
                    </motion.span>
                  )}
                </div>

                {/* إحصاءات مصقولة */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 md:gap-4 font-semibold mt-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`${chipBase} border-amber-600/20`}>
                        <CircleDollarSign className="w-5 h-5 text-amber-300" />
                        <span className="text-white">{nf.format(userProfile.coins || 0)} كوينز</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>رصيد الكوينز الخاص بك</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`${chipBase} border-amber-600/18`}>
                        <Diamond className="w-5 h-5 text-white/80" />
                        <span className="text-white">{nf.format(userProfile.diamonds || 0)} ألماس</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>أحجارك الكريمة</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`${chipBase} border-amber-500/25`}>
                        <Trophy className="w-5 h-5 text-amber-300" />
                        <span className="text-white">{nf.format(userProfile.leaderboardPoints || 0)} نقاط</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>إجمالي نقاط الصدارة</TooltipContent>
                  </Tooltip>
                </div>

                {/* شريط التقدم — ذهبي */}
                {nextRank ? (
                  <div className="w-full max-w-md mt-4 mx-auto md:mx-0">
                    <div className="flex justify-between text-[11px] font-semibold text-amber-200/60 mb-1">
                      <span>
                        اللقب التالي: <span className="text-amber-200">{nextRank.name}</span>
                      </span>
                      <span>
                        {nf.format(userProfile.leaderboardPoints || 0)} / {nf.format(pointsForNextRank)}
                      </span>
                    </div>
                    <div className="relative">
                      <Progress
                        value={progress}
                        className="h-2 overflow-hidden bg-white/6"
                        aria-label="التقدّم نحو الرتبة التالية"
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                      <div
                        className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(90deg,transparent,black,transparent)] bg-gradient-to-r from-transparent via-[rgba(255,215,0,0.16)] to-transparent animate-[shine_3s_infinite]"
                        aria-hidden
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs font-bold text-amber-300 flex items-center gap-1 justify-center md:justify-start">
                    <Star className="animate-pulse text-amber-300" /> مبروك! وصلت لأعلى رتبة.
                  </div>
                )}
              </div>

              {/* أزرار */}
              <div className="w-full md:w-auto flex md:flex-col gap-2 justify-center md:items-stretch">
                <Button asChild className="rounded-xl bg-amber-400 text-black hover:bg-amber-500">
                  <Link href="/society">المجتمع</Link>
                </Button>
                <Button variant="outline" asChild className="rounded-xl border-amber-600/25 text-amber-100 hover:bg-amber-900/10">
                  <Link href="/clan-wars">حروب الفرق</Link>
                </Button>
                <Button variant="ghost" asChild className="rounded-xl text-white/90 hover:bg-white/6">
                  <Link href="/store" className="inline-flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-amber-300" /> المتجر
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <style jsx>{`
          @keyframes shine {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    </TooltipProvider>
  );
}