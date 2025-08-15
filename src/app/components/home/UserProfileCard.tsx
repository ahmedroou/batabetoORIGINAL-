
"use client";

import { useMemo, useId } from "react";
import Link from "next/link";
import type { UserProfile, SocialRank } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { CircleDollarSign, Gem, Edit, Star, Trophy, History, Users, Shield } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import * as React from "react";

interface UserProfileCardProps {
  userProfile: UserProfile;
  currentRank: SocialRank | null;
  socialRanks: SocialRank[];
}

/**
 * UserProfileCard — Compact Banner (Violet/White/Black)
 * - بطاقة أفقيّة قصيرة الارتفاع (مستطيل/لوح Banner) مع توزيع أفقي للمحتوى.
 * - ألوان: مزيج أبيض + بنفسجي + أسود (داكن) مع تدرّج خفيف، وكونتراست واضح.
 * - تحسين الأيقونات ومحاذاة النصوص في وسط الفراغات + وصولية (RTL + A11y).
 * - إحصاءات مدمجة في سطر واحد لتقليل الارتفاع + شريط تقدّم رفيع أسفل البطاقة.
 * - استخدام نفس الـ props واللوجيك مع إعادة ترتيب بصري شامل.
 * - Enhanced by GPT-5 Thinking.
 */
export default function UserProfileCard({ userProfile, currentRank, socialRanks }: UserProfileCardProps) {
  // ترتيب الرتب حسب العتبة
  const sortedRanks = useMemo(() => [...socialRanks].sort((a, b) => a.threshold - b.threshold), [socialRanks]);

  // مرسوم (Decree) نشط إن وجد
  const activeDecree = useMemo(() => {
    const now = Date.now();
    return userProfile?.decrees?.find((d) => d.until && new Date(d.until).getTime() > now) ?? null;
  }, [userProfile?.decrees]);

  // الرتبة الحالية/التالية + نقاط الأساس
  const { effectiveCurrentRank, nextRank, pointsForCurrentRank, pointsForNextRank } = useMemo(() => {
    const points = userProfile?.leaderboardPoints ?? 0;

    const inferredCurrent =
      currentRank ?? (sortedRanks.filter((r) => r.threshold <= points).slice(-1)[0] ?? null);

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

  // تقدُّم المستخدم للرتبة التالية
  const progress = useMemo(() => {
    const points = userProfile?.leaderboardPoints ?? 0;
    if (!nextRank) return 100;
    const total = Math.max(1, pointsForNextRank - pointsForCurrentRank);
    const got = Math.max(0, points - pointsForCurrentRank);
    return Math.min(100, Math.max(0, (got / total) * 100));
  }, [userProfile?.leaderboardPoints, nextRank, pointsForCurrentRank, pointsForNextRank]);

  const nf = useMemo(() => new Intl.NumberFormat("ar-EG"), []);

  // دعم أيقونة الرتبة المخصّصة إن وُجدت
  const RankIcon =
    (effectiveCurrentRank?.icon as React.ComponentType<{ className?: string }>) ?? Trophy;

  // IDs للوصولية
  const progressId = useId();

  return (
    <TooltipProvider delayDuration={80}>
      <div dir="rtl" className="relative flex justify-center">
        <Card
          className="w-full max-w-[980px] rounded-2xl border border-violet-300/60 dark:border-violet-500/25 shadow-md bg-gradient-to-r from-white via-violet-50 to-black/5 dark:from-black dark:via-violet-950/50 dark:to-black/60"
          aria-label="بطاقة الملف الشخصي"
        >
          {/* محتوى أفقي مضغوط */}
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3 sm:gap-4 min-h-[6.5rem] sm:min-h-[7.25rem]">
              {/* يسار: الصورة + زر تعديل */}
              <div className="relative flex items-center justify-center">
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                  <PlayerAvatar
                    avatarId={userProfile.avatarId}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full ring-2 ring-violet-300/70 dark:ring-violet-700/40 shadow"
                    temporaryTitle={userProfile.temporaryTitle}
                    priority
                  />
                </motion.div>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute -bottom-1 -left-1 h-7 w-7 rounded-full border-violet-300/70 bg-white/80 hover:bg-white/95 dark:bg-white/10 dark:hover:bg-white/15"
                  asChild
                  aria-label="تعديل الملف الشخصي"
                >
                  <Link href="/profile">
                    <Edit className="w-4 h-4 text-violet-700 dark:text-violet-200" />
                  </Link>
                </Button>
              </div>

              {/* وسط: الاسم + الشارة + معلومات مختصرة */}
              <div className="flex flex-col items-center justify-center text-center">
                <h2 className="text-base sm:text-lg md:text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                  {userProfile.name}
                </h2>
                {effectiveCurrentRank && (
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold border border-violet-300/60 bg-white/70 text-violet-900 shadow-sm dark:border-violet-700/40 dark:bg-white/10 dark:text-violet-100">
                    <RankIcon className="w-4 h-4 text-violet-700 dark:text-violet-200" />
                    {activeDecree?.title ?? effectiveCurrentRank?.name}
                  </span>
                )}
                 {/* سطر الإحصاءات المدمج */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] font-semibold">
                  <span className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200">
                    <CircleDollarSign className="w-4 h-4 text-violet-700 dark:text-violet-300" />
                    {nf.format(userProfile.coins || 0)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200">
                    <Trophy className="w-4 h-4 text-violet-700 dark:text-violet-300" />
                    {nf.format(userProfile.leaderboardPoints || 0)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200">
                    <Gem className="w-4 h-4 text-violet-700 dark:text-violet-300" />
                    {nf.format(userProfile.diamonds || 0)}
                  </span>
                  {nextRank ? (
                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      التالي:
                      <span className="text-slate-900 dark:text-slate-100 font-bold">{nextRank.name}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        ({nf.format(userProfile.leaderboardPoints || 0)} / {nf.format(pointsForNextRank)})
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-violet-800 dark:text-violet-200">
                      <Star className="w-4 h-4" /> أعلى رتبة
                    </span>
                  )}
                </div>
              </div>

              {/* يمين: أزرار مختصرة (أيقونات فقط) */}
              <div className="flex items-center justify-end gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="icon" className="h-9 w-9 rounded-xl bg-violet-700 text-white hover:bg-violet-800">
                      <Link href="/society" aria-label="المجتمع">
                        <Users className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>المجتمع</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="icon" variant="outline" className="h-9 w-9 rounded-xl border-violet-300/70 text-slate-900 hover:bg-violet-50 dark:border-violet-700/40 dark:text-violet-100 dark:hover:bg-white/10">
                      <Link href="/clan-wars" aria-label="حروب الفرق">
                        <Shield className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>حروب الفرق</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-slate-900 hover:bg-violet-50 dark:text-violet-100 dark:hover:bg-white/10">
                      <Link href="/profile/history" aria-label="سجل المباريات">
                        <History className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>سجل المباريات</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* شريط تقدّم رفيع مثبت أسفل البطاقة للحفاظ على الارتفاع القصير */}
            <div className="relative mt-2">
              <span id={progressId} className="sr-only">التقدّم نحو الرتبة التالية</span>
              <div className="relative h-1 rounded-full bg-violet-200/60 dark:bg-white/10 overflow-hidden">
                <Progress
                  value={progress}
                  className="absolute inset-0 h-1 [&>div]:h-1"
                  aria-label="التقدّم نحو الرتبة التالية"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={`${Math.round(progress)}%`}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
