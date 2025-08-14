"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * MainLoadingSkeleton — GPT‑5 Aurora Loader
 * تصميم جمالي مبهر: خلفية أورورا + تأثير زجاجي + وميض ناعم + مؤشّر تقدّم متحرك
 * متوافق مع RTL، وبنفس اسم المكوّن الأصلي لاستبداله مباشرةً.
 */
export default memo(function MainLoadingSkeleton() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* خلفية أورورا متدرّجة */}
      <AuroraBackground />

      {/* شريط تقدّم رفيع في الأعلى */}
      <TopProgressGlow />

      {/* حاوية المحتوى الزجاجية */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-white/10 bg-background/40 shadow-2xl backdrop-blur-xl p-6 md:p-10"
        >
          {/* رأس الصفحة (أفاتار + اسم + إحصاءات) */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 -z-10 rounded-full bg-primary/30 blur-2xl" />
              <div className="rounded-full p-[2px] bg-gradient-to-br from-primary/50 via-fuchsia-500/40 to-cyan-500/40">
                <div className="rounded-full bg-background/60 p-1">
                  <Skeleton className="h-28 w-28 rounded-full" />
                </div>
              </div>
            </div>
            <div className="flex w-full max-w-md flex-col items-center gap-3">
              <Skeleton className="h-6 w-56 rounded-lg" />
              <Skeleton className="h-4 w-40 rounded-lg" />
            </div>
            <div className="grid w-full max-w-2xl grid-cols-3 gap-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>

          {/* فاصل مزخرف */}
          <DecorativeDivider />

          {/* شبكة بطاقات الألعاب (هيكل) */}
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-lg"
              >
                <div className="mb-4 flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-11/12" />
                </div>
                <div className="mt-6">
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              </motion.div>
            ))}
          </div>

          {/* قسم الغرف النشطة (هيكل مختصر) */}
          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-lg">
              <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-xl bg-white/5 p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-24 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-lg">
              <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-xl bg-white/5 p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-24 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* تذييل بسيط */}
          <div className="mt-10 flex items-center justify-center gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        </motion.div>

        {/* للقرّاء الشاشة */}
        <p className="sr-only">جاري تحميل الصفحة…</p>
      </section>
    </main>
  );
});

function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      {/* هالات ضوئية */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 0.9, scale: 1 }}
        transition={{ duration: 0.8 }}
        className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/30 blur-[120px]"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 0.7, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.1 }}
        className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-fuchsia-500/30 blur-[120px]"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 0.6, scale: 1 }}
        transition={{ duration: 1.1, delay: 0.15 }}
        className="absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/25 blur-[120px]"
      />
    </div>
  );
}

function TopProgressGlow() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-20">
      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <motion.div
          aria-hidden
          className="absolute h-1 w-1/3 bg-primary/70 shadow-[0_0_20px_theme(colors.primary.DEFAULT)]"
          initial={{ x: "-30%" }}
          animate={{ x: ["-30%", "120%"] }}
          transition={{ ease: "linear", duration: 1.4, repeat: Infinity }}
        />
      </div>
    </div>
  );
}

function DecorativeDivider() {
  return (
    <div className="relative mx-auto mt-8 h-10 w-full max-w-3xl">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-white/10" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary/30 via-fuchsia-500/30 to-cyan-400/30 px-6 py-2 text-xs font-medium text-transparent">
        <span className="inline-block h-3 w-28 rounded-full bg-white/20" />
      </div>
    </div>
  );
}
