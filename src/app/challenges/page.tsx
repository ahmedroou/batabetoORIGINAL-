"use client";

import React, { useEffect, useMemo, useState } from "react";
import SocietyChallenges from "@/app/society/components/SocietyChallenges";
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Swords, CheckCircle, Trophy, Search } from "lucide-react";
import { Timestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';

export default function ChallengesPage() {
  const { markChallengeAsSeen, activeChallenges } = useAuth();
  const [query, setQuery] = useState<string>("");
  const [sort, setSort] = useState<'newest' | 'reward' | 'popularity'>('newest');
  const [tab, setTab] = useState<'active' | 'ended'>('active');

  // pick the latest challenge (robust to Timestamp or Date/string)
  const latestChallenge = useMemo(() => {
    if (!activeChallenges || activeChallenges.length === 0) return null;
    let best: any = null;
    for (const c of activeChallenges) {
      const ts = c?.createdAt;
      if (!ts) continue;
      const ms = ts instanceof Timestamp ? ts.toMillis() : (ts instanceof Date ? ts.getTime() : new Date(ts).getTime());
      if (!best || ms > best.ms) best = { item: c, ms };
    }
    return best?.item ?? null;
  }, [activeChallenges]);

  useEffect(() => {
    if (!markChallengeAsSeen || !latestChallenge) return;
    const latestChallengeTimestamp = latestChallenge.createdAt;
    const dateToMark = (latestChallengeTimestamp instanceof Timestamp) 
      ? latestChallengeTimestamp.toDate() 
      : (latestChallengeTimestamp instanceof Date ? latestChallengeTimestamp : new Date(latestChallengeTimestamp));
    markChallengeAsSeen(dateToMark);
  }, [markChallengeAsSeen, latestChallenge]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-tr from-[#0b1020] via-[#120826] to-[#2b0440] text-white font-sans leading-relaxed" dir="rtl">

      {/* Decorative layers (assumes global CSS for .stars/.twinkling) */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-black/20" />
        <svg className="absolute -left-32 -top-32 opacity-30" width="520" height="520" viewBox="0 0 520 520" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <defs>
            <linearGradient id="g1" x1="0" x2="1">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <circle cx="260" cy="260" r="240" fill="url(#g1)" filter="url(#f)" />
        </svg>
      </div>

      <main className="relative z-10 container mx-auto px-4 py-12">
        <header className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 }}
            className="inline-block p-1 rounded-2xl bg-gradient-to-br from-white/10 to-white/3 shadow-2xl"
            aria-hidden
          >
            <div className="rounded-xl bg-gradient-to-tr from-purple-700/80 to-pink-600/80 p-6">
              <Trophy className="w-28 h-28 mx-auto text-yellow-300 drop-shadow-[0_20px_40px_rgba(250,204,21,0.08)]" />
            </div>
          </motion.div>

          <motion.h1
            className="mt-6 text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-pink-300"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.12 }}
          >
            ساحة البطولات — تنافس، اربح، وتألّق
          </motion.h1>

          <motion.p
            className="mt-3 text-lg text-gray-300 max-w-2xl mx-auto"
            initial={{ y: 6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.18 }}
          >
            تحديات مُختارة بعناية، واجهة أنيقة، وتجربة مُحفّزة — انضم الآن وسجّل إنجازاتك.
          </motion.p>
        </header>

        {/* Controls */}
        <motion.div
          className="mt-8 flex flex-col lg:flex-row items-stretch gap-4 max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.24 }}
        >
          <div className="flex-1 flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/8 rounded-2xl p-3 shadow-lg">
            <Search className="w-5 h-5 text-gray-300" />
            <input
              aria-label="ابحث عن تحدي"
              placeholder="ابحث عن تحدٍ أو خاصية (اسم، جائزة، فريق...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent outline-none text-sm text-slate-100 placeholder:text-slate-400"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-300">ترتيب</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="bg-transparent text-sm px-2 py-1 rounded-md border border-white/6 text-slate-100"
                aria-label="ترتيب التحديات"
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="reward">الأعلى مكافأة</option>
                <option value="popularity">الأكثر شعبية</option>
              </select>
            </div>
          </div>

          <div className="w-full lg:w-72 flex items-center gap-3 justify-end">
            <div className="w-full">
              <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="w-full">
                <TabsList className="grid grid-cols-2 bg-black/30 backdrop-blur rounded-2xl border border-purple-500/20 text-purple-200">
                  <TabsTrigger value="active" className="py-3 text-sm"> <span className="inline-flex items-center gap-2"><Swords /> البطولات النشطة</span></TabsTrigger>
                  <TabsTrigger value="ended" className="py-3 text-sm"> <span className="inline-flex items-center gap-2"><CheckCircle /> المنتهية</span></TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        <div className="mt-8 max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.32 }}
            className="rounded-2xl bg-gradient-to-b from-white/3 to-transparent border border-white/6 p-6 shadow-2xl"
          >
            {/* Tabs content is passed the query + sort as props so SocietyChallenges can filter locally */}
            <Tabs defaultValue={tab} value={tab} onValueChange={(v: any) => setTab(v)}>
              <TabsContent value="active">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2">
                    <SocietyChallenges filter="active" query={query} sort={sort} className="rounded-xl" />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="ended">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2">
                    <SocietyChallenges filter="ended" query={query} sort={sort} className="rounded-xl" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>

          {/* Floating CTA + footer microcopy */}
          <div className="mt-6 flex items-center justify-between text-sm text-slate-400">
            <div>نصيحة: استخدم شريط البحث لتصفية البطولات بسرعة أو غيّر الترتيب لعرض الأهم أولاً.</div>
          </div>
        </div>
      </main>
    </div>
  );
}
