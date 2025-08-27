'use client';

import { useState, useEffect, useMemo, useCallback, useRef, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Megaphone, Swords, X, Trophy, Gamepad2, Rocket, Sparkles } from 'lucide-react';
import { doc, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { useAuth } from '@/hooks/useAuth';
import HomeHeader from './components/home/HomeHeader';
import UserProfileCard from './components/home/UserProfileCard';
import HomeDialogs from './components/home/Dialogs';
import WelcomeGuest from './components/home/WelcomeGuest';
import MainLoadingSkeleton from './components/home/MainLoadingSkeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CompactChallengeList } from './components/home/CompactChallengeList';
import ComplaintBubble from './components/home/ComplaintBubble';
import type { Game } from '@/types';

// ✅ Lazy-load blocks that are visually heavy
const GameGrid = dynamic(() => import('./components/home/GameGrid'), { ssr: false });
const LobbySection = dynamic(() => import('./components/home/LobbySection'), { ssr: false });

// =============================
// Utilities & Hooks
// =============================
function useRealtimeDoc<T = DocumentData>(path: [string, ...string[]], onError?: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const unsubRef = useRef<() => void>();

  useEffect(() => {
    const ref = doc(db, ...path);
    const unsub = onSnapshot(
      ref,
      (snap) => setData((snap.exists() ? (snap.data() as T) : null)),
      (err) => onError?.(err)
    );
    unsubRef.current = unsub;
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, path);

  return data;
}

function usePopularity() {
  // وثيقة مقترحة: game_settings/popularity
  const raw = useRealtimeDoc<Record<string, unknown>>(['game_settings', 'popularity']);
  const popularityStats = useMemo(() => {
    if (!raw) return {} as Record<string, number>;
    const stats = (typeof raw.stats === 'object' && raw.stats) ? (raw.stats as Record<string, unknown>) : raw;
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(stats)) cleaned[k] = Number(v ?? 0) || 0;
    return cleaned;
  }, [raw]);
  return popularityStats;
}

function useAnnouncement() {
  const data = useRealtimeDoc<{ text?: string }>(['game_settings', 'announcement']);
  return data?.text?.trim() || null;
}

export default function Home() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    user,
    userProfile,
    loading,
    socialRanks,
    getSocialRankForUser,
    activeChallenges = [],
    newChallengeAvailable,
    markChallengeAsSeen,
  } = useAuth();

  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [activeLobbies, setActiveLobbies] = useState<Game[]>([]);

  const popularityStats = usePopularity();
  const announcement = useAnnouncement();

  useEffect(() => {
    if (announcement) setShowAnnouncement(true);
  }, [announcement]);

  const handleLobbiesUpdate = useCallback((lobbies: Game[]) => setActiveLobbies(lobbies), []);

  const { favoriteGame, popularGame } = useMemo(() => {
    const winCounts = (userProfile?.winCounts ?? {}) as Record<string, number>;

    let favGame: string | null = null;
    let maxWins = -1;
    for (const [gameType, wins] of Object.entries(winCounts)) {
      const n = Number(wins ?? 0) || 0;
      if (n > maxWins) { maxWins = n; favGame = gameType; }
    }

    let popGame: string | null = null;
    let maxCount = -1;
    for (const [gameType, count] of Object.entries(popularityStats)) {
      const n = Number(count ?? 0) || 0;
      if (n > maxCount) { maxCount = n; popGame = gameType; }
    }

    return { favoriteGame: favGame, popularGame: popGame };
  }, [userProfile?.winCounts, popularityStats]);

  const currentRank = useMemo(() => {
    if (!userProfile) return null;
    return getSocialRankForUser(userProfile.leaderboardPoints);
  }, [userProfile, getSocialRankForUser]);

  // =============================
  // Auth Guard
  // =============================
  if (loading || (user && !userProfile)) return <MainLoadingSkeleton />;
  if (!user) return <WelcomeGuest />;

  // =============================
  // Render
  // =============================
  return (
    <div className="relative min-h-screen overflow-hidden bg-background" dir="rtl" lang="ar">
      <AmbientBackground />

      <HomeHeader userProfile={userProfile!} />

      <main className="flex flex-col items-center justify-center p-4 md:p-8 pt-2 w-full">
        <motion.div
          className="w-full max-w-7xl space-y-6"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <AnimatePresence>
            {announcement && showAnnouncement && (
              <motion.div
                key="announcement"
                initial={prefersReducedMotion ? false : { opacity: 0, y: -20 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -10 }}
                className="relative w-full max-w-5xl mx-auto"
                aria-live="polite"
              >
                <div className="group rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 backdrop-blur-md text-primary shadow-[0_0_0_1px_hsl(var(--primary)/.15)_inset,0_10px_30px_-10px_hsl(var(--primary)/.25)]">
                  <div className="flex items-center justify-center gap-3 text-center">
                    <Megaphone className="h-5 w-5 shrink-0" aria-hidden />
                    <p className="font-semibold leading-relaxed">{announcement}</p>
                  </div>
                  <button
                    onClick={() => setShowAnnouncement(false)}
                    className="absolute top-2.5 start-2.5 rounded-full p-1.5 hover:bg-primary/10 transition"
                    aria-label="إغلاق الإعلان"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}>
                <UserProfileCard userProfile={userProfile!} currentRank={currentRank} socialRanks={socialRanks} />
              </motion.div>

              <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}>
                <Card className="relative overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" aria-hidden />
                      إجراءات سريعة
                    </CardTitle>
                    <CardDescription>ابدأ مغامرتك فورًا ✨</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button
                      variant="default"
                      className="rounded-2xl shadow-sm"
                      onClick={() => startTransition(() => router.push('/games'))}
                      aria-label="اذهب إلى صفحة الألعاب"
                      disabled={isPending}
                    >
                      <Gamepad2 className="ms-1 h-4 w-4" aria-hidden /> العب الآن
                    </Button>
                    <Button
                      variant="secondary"
                      className="rounded-2xl"
                      onClick={() => startTransition(() => router.push('/leaderboard'))}
                      aria-label="اذهب إلى لوحة الصدارة"
                      disabled={isPending}
                    >
                      <Trophy className="ms-1 h-4 w-4" aria-hidden /> لوحة الصدارة
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-2xl"
                      onClick={() => startTransition(() => router.push('/challenges'))}
                      aria-label="اذهب إلى التحديات"
                      disabled={isPending}
                    >
                      <Swords className="ms-1 h-4 w-4" aria-hidden /> التحديات
                    </Button>
                  </CardContent>
                  <AuroraShine />
                </Card>
              </motion.div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <AnimatePresence>
                {(activeChallenges?.length ?? 0) > 0 && (
                  <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }} exit={prefersReducedMotion ? undefined : { opacity: 0 }}>
                    <Card className="relative overflow-hidden border-0 shadow-md shadow-primary/10 ring-1 ring-primary/20">
                      <GradientBorder />
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2">
                          <Swords className="h-5 w-5" aria-hidden />
                          التحديات النشطة
                          {newChallengeAvailable && (
                            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse mt-1" aria-label="تحدٍ جديد" />
                          )}
                        </CardTitle>
                        <CardDescription>انضم الآن واربح جوائز قيمة!</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <CompactChallengeList challenges={activeChallenges} />
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}>
                <SectionHeader title="اكتشف الألعاب" icon={<Rocket className="h-5 w-5" aria-hidden />} subtitle="مجموعة مختارة بعناية لتناسب كل الأذواق" />
                <div className="mt-3 rounded-2xl border border-border/60 bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40">
                  <GameGrid favoriteGame={favoriteGame} popularGame={popularGame} />
                </div>
              </motion.div>

              <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}>
                <SectionHeader title="اللوبي" icon={<Gamepad2 className="h-5 w-5" aria-hidden />} subtitle="تواصل بسرعة مع اللاعبين والغرف المفتوحة" />
                <div className="mt-3 rounded-2xl border border-border/60 bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40">
                  <LobbySection onLobbiesUpdate={handleLobbiesUpdate} />
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </main>

      <HomeDialogs
        user={user}
        userProfile={userProfile!}
        activeChallenges={activeChallenges}
        newChallengeAvailable={newChallengeAvailable}
        markChallengeAsSeen={markChallengeAsSeen}
      />
      <ComplaintBubble userProfile={userProfile!} />
    </div>
  );
}

function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -bottom-40 -end-40 h-[32rem] w-[32rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="absolute top-1/2 -translate-y-1/2 start-1/2 -translate-x-1/2 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]">
        <div className="h-full w-full bg-[linear-gradient(to_right,hsl(var(--muted-foreground)/.08)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--muted-foreground)/.08)_1px,transparent_1px)] bg-[size:36px_36px]" />
      </div>
    </div>
  );
}

function GradientBorder() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-2xl"
      style={{
        padding: 1,
        background:
          'linear-gradient(135deg, hsl(var(--primary)/.6), hsl(var(--secondary)/.4), hsl(var(--muted-foreground)/.3))',
        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        WebkitMaskComposite: 'xor' as const,
        maskComposite: 'exclude' as const,
      }}
    />
  );
}

function AuroraShine() {
  return (
    <div aria-hidden className="absolute -inset-px rounded-2xl opacity-60">
      <div className="absolute inset-0 rounded-2xl blur-xl bg-[conic-gradient(from_180deg_at_50%_50%,hsl(var(--primary)/.15),hsl(var(--secondary)/.15),hsl(var(--primary)/.15))]" />
    </div>
  );
}

function SectionHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xl font-bold">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          {icon}
        </span>
        <span className="bg-clip-text text-transparent bg-gradient-to-l from-foreground via-foreground to-primary">{title}</span>
      </div>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
