"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Gamepad2, Trophy, Shield, Sparkles, LogIn, UserPlus } from "lucide-react";

export default function WelcomeGuest() {
  return (
    <main className="relative min-h-screen flex items-center justify-center p-4">
      {/* --- Ambient gradient background + floating orbs --- */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-10%,theme(colors.violet.500/10),transparent),radial-gradient(1000px_500px_at_0%_110%,theme(colors.emerald.500/10),transparent)]"/>
        <motion.div
          className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
          animate={{ y: [0, 12, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl"
          animate={{ y: [0, -10, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* --- Card with gradient border (glassmorphism) --- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <div className="relative rounded-3xl p-[1px] bg-gradient-to-b from-primary/60 via-primary/20 to-transparent shadow-[0_20px_80px_-20px_rgba(0,0,0,0.45)]">
          <Card className="rounded-3xl backdrop-blur-xl bg-background/70 dark:bg-background/50 border-border/40">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                جاهز للمنافسة؟
              </div>
              <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                <Users className="h-6 w-6 text-primary" /> مرحبًا بك!
              </CardTitle>
              <CardDescription className="text-base">
                ابدأ بتسجيل الدخول أو إنشاء حساب جديد للانضمام إلى اللعب الجماعي والبطولات.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* CTA Buttons */}
              <div className="space-y-3">
                <Button asChild size="lg" className="group relative w-full h-12 overflow-hidden rounded-2xl font-bold">
                  <Link href="/login">
                    <span className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary via-violet-600 to-emerald-500 opacity-90"/>
                    <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.35),transparent)] transition-transform duration-700 group-hover:translate-x-full"/>
                    <span className="inline-flex items-center gap-2">
                      <LogIn className="h-5 w-5" />
                      تسجيل الدخول
                    </span>
                  </Link>
                </Button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background/80 px-2 text-muted-foreground">أو</span>
                  </div>
                </div>

                <Button asChild size="lg" variant="secondary" className="group relative w-full h-12 overflow-hidden rounded-2xl">
                  <Link href="/signup">
                    <span className="absolute inset-0 -z-10 bg-gradient-to-tr from-emerald-500/10 via-primary/10 to-violet-500/10"/>
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <UserPlus className="h-5 w-5" />
                      إنشاء حساب جديد
                    </span>
                  </Link>
                </Button>
              </div>

              {/* Feature highlights */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs md:text-sm">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <Gamepad2 className="mx-auto mb-1 h-5 w-5 text-primary" />
                  ألعاب جماعية
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <Trophy className="mx-auto mb-1 h-5 w-5 text-amber-500" />
                  بطولات وجوائز
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <Shield className="mx-auto mb-1 h-5 w-5 text-emerald-500" />
                  تجربة آمنة
                </div>
              </div>

              {/* Tiny legal / help links */}
              <p className="text-center text-xs text-muted-foreground">
                بالمتابعة، أنت توافق على <Link href="#" className="text-primary underline-offset-4 hover:underline">شروط الخدمة</Link> و
                <Link href="#" className="text-primary underline-offset-4 hover:underline"> سياسة الخصوصية</Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </main>
  );
}
