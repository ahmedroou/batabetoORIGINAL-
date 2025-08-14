"use client";

import { ChunkLoadErrorHandler } from "@/components/ChunkLoadErrorHandler";
import GameClient from "./client";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Gamepad2, Sparkles, Loader2 } from "lucide-react";

export default function GamePage() {
  return (
    <ChunkLoadErrorHandler>
      <Suspense fallback={<LoadingState />}> 
        <GameClient />
      </Suspense>
    </ChunkLoadErrorHandler>
  );
}

const LoadingState = () => (
  <main
    aria-busy
    className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6"
  >
    {/* Decorative gradient blobs */}
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-pink-500/10 blur-[90px]" />
      <div className="absolute -bottom-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[120px]" />
    </div>

    {/* Glass card */}
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-background/60 p-6 shadow-2xl backdrop-blur-xl"
    >
      {/* Animated halo */}
      <div className="mx-auto mb-6 flex items-center justify-center">
        <div className="relative h-24 w-24">
          <div
            className="absolute inset-0 rounded-full border-4 border-primary/30 animate-spin"
            style={{ borderTopColor: "transparent" }}
          />
          <div
            className="absolute inset-2 rounded-full border-4 border-purple-500/30 animate-[spin_3s_linear_infinite]"
            style={{ borderBottomColor: "transparent" }}
          />
          <div className="relative flex h-full w-full items-center justify-center rounded-full bg-background/60 backdrop-blur">
            <Loader2 className="h-8 w-8 animate-pulse" />
          </div>
        </div>
      </div>

      <div className="text-center">
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl font-bold tracking-tight"
        >
          جاري تحميل اللعبة
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mt-2 text-sm text-muted-foreground"
        >
          نجهّز لك الموارد والرسومات… لحظات ونبدأ المتعة 🎮
        </motion.p>
      </div>

      {/* Skeleton preview */}
      <div className="mt-6 space-y-3">
        <Skeleton className="mx-auto h-6 w-1/2" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      </div>

      {/* Animated progress bar */}
      <div className="mt-6">
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-primary/40 via-primary to-primary/40"
            animate={{ x: ["-50%", "110%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Gamepad2 className="h-4 w-4" />
          <span>نحسّن الاتصال ونفكّك الحِزم</span>
          <Sparkles className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  </main>
);
