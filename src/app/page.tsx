// =============================
// باتش شامل: تطبيق كل الاقتراحات التقنية
// Project: تطبيق بطابيطو لألعاب الويب — Home + بنية داعمة
// ملاحظة: هذا الملف يجمع عدة ملفات بصيغة "patchbook". انسخ كل مقطع إلى مساره المشار إليه.
// =============================


/* =====================================================================
   FILE: app/(home)/page.tsx  (Server Component)
   هدف: فصل الـ SSR عن الـ realtime، وتحسين SEO/التصيير الأولي
===================================================================== */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import ClientHome from './ClientHome';

export async function generateMetadata() {
  return {
    title: 'بطابيطو — ألعاب الويب المباشرة',
    description: 'تحديات، لوبي، ولوحة صدارة مباشرة — العب الآن ونافِس أصدقاءك!',
    alternates: { canonical: '/' },
    openGraph: {
      title: 'بطابيطو — ألعاب الويب المباشرة',
      description: 'تحديات، لوبي، ولوحة صدارة مباشرة — العب الآن ونافِس أصدقاءك!',
      type: 'website'
    }
  };
}

export default function Page() {
  return <ClientHome />;
}


/* =====================================================================
   FILE: app/(home)/ClientHome.tsx  (Client Component)
   هدف: تطبيق: Zustand realtime store + Feature flags + Telemetry + فلاتر اللوبي + دعوات + Achievements + Tournaments + Error boundary
===================================================================== */

'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Megaphone, Swords, X, Trophy, Gamepad2, Rocket, Sparkles, Share2 } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import HomeHeader from '@/app/components/home/HomeHeader';
import UserProfileCard from '@/app/components/home/UserProfileCard';
import HomeDialogs from '@/app/components/home/Dialogs';
import WelcomeGuest from '@/app/components/home/WelcomeGuest';
import MainLoadingSkeleton from '@/app/components/home/MainLoadingSkeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CompactChallengeList } from '@/app/components/home/CompactChallengeList';
import ComplaintBubble from '@/app/components/home/ComplaintBubble';
import type { Game } from '@/types';

import { useRealtimeStore } from '@/lib/state/realtimeStore';
import { useFlag } from '@/hooks/useFeatureFlags';
import { track } from '@/lib/telemetry';
import ErrorToastBoundary from '@/components/providers/ErrorToastBoundary';

const GameGrid = dynamic(() => import('@/app/components/home/GameGrid'), { ssr: false });
const LobbySection = dynamic(() => import('@/app/components/home/LobbySection'), { ssr: false });
const LobbyFilters = dynamic(() => import('@/components/home/LobbyFilters'), { ssr: false });
const ShareInvite = dynamic(() => import('@/components/social/ShareInvite'), { ssr: false });
const TournamentCard = dynamic(() => import('@/components/tournaments/TournamentCard'), { ssr: false });
const AchievementBadge = dynamic(() => import('@/components/achievements/AchievementBadge'), { ssr: false });
const { StreakCard } = await (async () => ({ StreakCard: (await import('@/components/achievements/StreakCard')).StreakCard }))();

export default function ClientHome() {
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

  const { start, stop, announcement, popularity } = useRealtimeStore((s) => ({
    start: s.start,
    stop: s.stop,
    announcement: s.announcement,
    popularity: s.popularity,
  }));

  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [activeLobbies, setActiveLobbies] = useState<Game[]>([]);
  const [filters, setFilters] = useState<{ game?: string; skill?: 'any'|'beginner'|'pro'; minPlayers?: number }>({ skill: 'any' });

  const showTournaments = useFlag('tournaments');
  const showAchievements = useFlag('achievements');

  // تشغيل/إيقاف الاشتراكات المركزية + تفعيل الكاش fallback ضمن المتجر
  useEffect(() => { start(); return () => stop(); }, [start, stop]);

  useEffect(() => { if (announcement) setShowAnnouncement(true); }, [announcement]);

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
    for (const [gameType, count] of Object.entries(popularity)) {
      const n = Number(count ?? 0) || 0;
      if (n > maxCount) { maxCount = n; popGame = gameType; }
    }

    return { favoriteGame: favGame, popularGame: popGame };
  }, [userProfile?.winCounts, popularity]);

  const currentRank = useMemo(() => {
    if (!userProfile) return null;
    return getSocialRankForUser(userProfile.leaderboardPoints);
  }, [userProfile, getSocialRankForUser]);

  // Auth Guard
  if (loading || (user && !userProfile)) return <MainLoadingSkeleton />;
  if (!user) return <WelcomeGuest />;

  const uid = (userProfile as any)?.id || (user as any)?.uid || '';

  return (
    <ErrorToastBoundary>
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
                    <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <Button
                        variant="default"
                        className="rounded-2xl shadow-sm"
                        onClick={() => { track('click_quick_action', { action: 'play_now' }); startTransition(() => router.push('/games')); }}
                        aria-label="اذهب إلى صفحة الألعاب"
                        disabled={isPending}
                      >
                        <Gamepad2 className="ms-1 h-4 w-4" aria-hidden /> العب الآن
                      </Button>
                      <Button
                        variant="secondary"
                        className="rounded-2xl"
                        onClick={() => { track('click_quick_action', { action: 'leaderboard' }); startTransition(() => router.push('/leaderboard')); }}
                        aria-label="اذهب إلى لوحة الصدارة"
                        disabled={isPending}
                      >
                        <Trophy className="ms-1 h-4 w-4" aria-hidden /> لوحة الصدارة
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => { track('click_quick_action', { action: 'challenges' }); startTransition(() => router.push('/challenges')); }}
                        aria-label="اذهب إلى التحديات"
                        disabled={isPending}
                      >
                        <Swords className="ms-1 h-4 w-4" aria-hidden /> التحديات
                      </Button>
                      {uid ? (
                        <Button variant="ghost" className="rounded-2xl" onClick={() => track('click_quick_action', { action: 'share_invite' })} aria-label="شارك الدعوة">
                          <Share2 className="ms-1 h-4 w-4" aria-hidden />
                          <ShareInvite userId={uid} />
                        </Button>
                      ) : null}
                    </CardContent>
                    <AuroraShine />
                  </Card>
                </motion.div>

                {showAchievements && (
                  <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}>
                    <Card className="relative overflow-hidden">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2">الإنجازات والسلسلة</CardTitle>
                        <CardDescription>طوّر مهاراتك وحافظ على streak مستمر</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-3">
                        <StreakCard days={(userProfile as any)?.streakDays || 0} />
                        <AchievementBadge label="الفوز الأول" />
                        <AchievementBadge label="10 مباريات" />
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
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
                    <LobbyFilters onChange={setFilters} />
                    <LobbySection onLobbiesUpdate={handleLobbiesUpdate} filters={filters} onQuickJoin={() => track('join_lobby')} />
                  </div>
                </motion.div>

                {showTournaments && (
                  <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}>
                    <TournamentCard name="كأس البطابيطو" startsAt={new Date(Date.now() + 86_400_000).toISOString()} />
                  </motion.div>
                )}
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
    </ErrorToastBoundary>
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
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
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


/* =====================================================================
   FILE: src/lib/state/realtimeStore.ts  (Zustand Store + Cache Fallback)
===================================================================== */

'use client';
import { create } from 'zustand';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { saveCache, readCache } from '@/lib/cache/fallback';

type RealtimeState = {
  announcement: string | null;
  popularity: Record<string, number>;
  flags: Record<string, boolean>;
  _unsubs: Array<() => void>;
  start: () => void;
  stop: () => void;
};

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  announcement: null,
  popularity: {},
  flags: {},
  _unsubs: [],
  start: () => {
    if (get()._unsubs.length) return; // منع مضاعفة الاشتراكات

    // حاول قراءة كاش سريعًا
    const cachedAnn = readCache<string>('announcement');
    const cachedPop = readCache<Record<string, number>>('popularity');
    const cachedFlags = readCache<Record<string, boolean>>('flags');
    if (cachedAnn) set({ announcement: cachedAnn });
    if (cachedPop) set({ popularity: cachedPop });
    if (cachedFlags) set({ flags: cachedFlags });

    const u1 = onSnapshot(doc(db, 'game_settings', 'announcement'), (snap) => {
      const text = (snap.data() as any)?.text ?? null;
      const value = text?.trim() || null;
      set({ announcement: value });
      saveCache('announcement', value);
    });

    const u2 = onSnapshot(doc(db, 'game_settings', 'popularity'), (snap) => {
      const raw = snap.data() || {};
      const stats = typeof raw?.stats === 'object' ? raw.stats : raw;
      const cleaned: Record<string, number> = {};
      Object.entries(stats || {}).forEach(([k, v]) => (cleaned[k] = Number(v ?? 0) || 0));
      set({ popularity: cleaned });
      saveCache('popularity', cleaned);
    });

    const u3 = onSnapshot(doc(db, 'app_settings', 'flags'), (snap) => {
      const data = (snap.data() || {}) as Record<string, boolean>;
      const flags = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Boolean(v)]));
      set({ flags });
      saveCache('flags', flags);
    });

    set({ _unsubs: [u1, u2, u3] });
  },
  stop: () => {
    get()._unsubs.forEach((u) => u());
    set({ _unsubs: [] });
  },
}));


/* =====================================================================
   FILE: src/hooks/useFeatureFlags.ts
===================================================================== */

'use client';
import { useRealtimeStore } from '@/lib/state/realtimeStore';
export function useFlag(key: string, fallback = false) {
  const value = useRealtimeStore((s) => s.flags[key]);
  return value ?? fallback;
}


/* =====================================================================
   FILE: src/components/providers/ErrorToastBoundary.tsx
===================================================================== */

'use client';
import { PropsWithChildren } from 'react';
import { useToast } from '@/components/ui/use-toast';

export default function ErrorToastBoundary({ children }: PropsWithChildren) {
  const { toast } = useToast();
  return (
    <div
      onErrorCapture={(e) => {
        toast({ title: 'حدث خطأ غير متوقع', description: String((e as any)?.message || 'يرجى المحاولة لاحقًا') });
      }}
    >
      {children}
    </div>
  );
}


/* =====================================================================
   FILE: src/lib/cache/fallback.ts
===================================================================== */

'use client';
export function saveCache<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify({ v: value, t: Date.now() })); } catch {}
}
export function readCache<T>(key: string, maxAgeMs = 1000 * 60 * 10): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { v, t } = JSON.parse(raw);
    if (Date.now() - (t || 0) > maxAgeMs) return null;
    return v as T;
  } catch { return null; }
}


/* =====================================================================
   FILE: src/components/home/LobbyFilters.tsx
===================================================================== */

'use client';
import { useState } from 'react';
export type LobbyFilters = { game?: string; skill?: 'any'|'beginner'|'pro'; minPlayers?: number };
export default function LobbyFilters({ onChange }: { onChange: (f: LobbyFilters) => void }) {
  const [f, setF] = useState<LobbyFilters>({ skill: 'any' });
  return (
    <div className="flex flex-wrap gap-2 p-3">
      <select className="rounded-2xl border p-2" onChange={(e)=>{ const v={...f, game:e.target.value||undefined}; setF(v); onChange(v); }}>
        <option value="">كل الألعاب</option>
        <option value="chess">شطرنج</option>
        <option value="cards">أوراق</option>
      </select>
      <select className="rounded-2xl border p-2" value={f.skill} onChange={(e)=>{ const v={...f, skill:e.target.value as any}; setF(v); onChange(v); }}>
        <option value="any">كل المستويات</option>
        <option value="beginner">مبتدئ</option>
        <option value="pro">محترف</option>
      </select>
      <input className="rounded-2xl border p-2 w-32" type="number" placeholder="حد أدنى لاعبين" onChange={(e)=>{ const v={...f, minPlayers:Number(e.target.value)||undefined}; setF(v); onChange(v); }} />
    </div>
  );
}


/* =====================================================================
   FILE: src/components/achievements/AchievementBadge.tsx
===================================================================== */

'use client';
export default function AchievementBadge({ label }: { label: string }) {
  return <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs">🏅 {label}</span>;
}


/* =====================================================================
   FILE: src/components/achievements/StreakCard.tsx
===================================================================== */

'use client';
export function StreakCard({ days }: { days: number }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-muted-foreground">سلسلة أيام اللعب</div>
      <div className="text-3xl font-bold">{days} يوم</div>
    </div>
  );
}


/* =====================================================================
   FILE: src/components/social/ShareInvite.tsx
===================================================================== */

'use client';
export default function ShareInvite({ userId }: { userId: string }) {
  const url = typeof window !== 'undefined' ? `${location.origin}/signup?ref=${userId}` : '';
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'انضم إليّ في بطابيطو', url });
      else await navigator.clipboard.writeText(url);
      alert('تمت مشاركة الرابط!');
    } catch {}
  };
  return <span onClick={share}>شارك</span>;
}


/* =====================================================================
   FILE: src/components/tournaments/TournamentCard.tsx
===================================================================== */

'use client';
export default function TournamentCard({ name, startsAt }: { name: string; startsAt: string }) {
  const date = new Date(startsAt);
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-muted-foreground">بطولة قادمة</div>
      <div className="text-xl font-bold">{name}</div>
      <div className="text-sm">تبدأ: {date.toLocaleString('ar')}</div>
    </div>
  );
}


/* =====================================================================
   FILE: src/lib/telemetry.ts
===================================================================== */

'use client';
export type EventName = 'click_quick_action' | 'join_lobby' | 'open_challenge';
export function track(name: EventName, props?: Record<string, unknown>) {
  try { (window as any).posthog?.capture(name, props); } catch {}
}


/* =====================================================================
   FILE: public/manifest.json  (PWA)
===================================================================== */

// ضع هذا الملف كـ JSON حرفيًا داخل public/manifest.json
{
  "name": "BataBeeto Games",
  "short_name": "BataBeeto",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0b0f",
  "theme_color": "#6d28d9",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}


/* =====================================================================
   FILE: public/sw.js  (Service Worker مبسّط)
===================================================================== */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));


/* =====================================================================
   FILE: app/ClientSWRegister.tsx  (لتسجيل SW من الواجهة)
===================================================================== */

'use client';
import { useEffect } from 'react';
export default function ClientSWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}


/* =====================================================================
   FILE: app/layout.tsx  (ضمّن ClientSWRegister وموفّر i18n لاحقًا)
===================================================================== */

// ملاحظة: إن استخدمت next-intl بهيكل [locale] فسيكون هناك layout مختلف.
import ClientSWRegister from './ClientSWRegister';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <ClientSWRegister />
        {children}
      </body>
    </html>
  );
}


/* =====================================================================
   FILE: middleware.ts  (i18n — next-intl مبسّط)
===================================================================== */

import createMiddleware from 'next-intl/middleware';
export default createMiddleware({ locales: ['ar', 'en'], defaultLocale: 'ar' });
export const config = { matcher: ['/((?!_next|.*\..*).*)'] };


/* =====================================================================
   FILE: src/i18n/request.ts  (i18n server config)
===================================================================== */

import { getRequestConfig } from 'next-intl/server';
export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`./messages/${locale}.json`)).default,
}));


/* =====================================================================
   FILE: firestore.rules  (تحسين الأمن)
===================================================================== */

rules_version = '2';
service cloud.firestore { match /databases/{database}/documents {
  match /game_settings/{doc} {
    allow read: if true; // إعلان/شعبية عامة
    allow write: if false; // فقط عبر CF/Admin
  }
  match /app_settings/flags {
    allow read: if true;
    allow write: if false;
  }
  match /stats/{doc} {
    allow read: if true;
    allow write: if request.auth != null && request.auth.token.admin == true; // عبر Functions
  }
}} 


/* =====================================================================
   FILE: functions/src/index.ts  (Cloud Function للتجميع الدوري)
===================================================================== */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
admin.initializeApp();
const dbf = admin.firestore();

export const aggregatePopularity = functions.pubsub.schedule('every 10 minutes').onRun(async () => {
  const snaps = await dbf.collection('stats_games').get();
  const totals: Record<string, number> = {};
  snaps.forEach((d) => { const { game, count } = d.data() as any; totals[game] = (totals[game] || 0) + Number(count || 0); });
  await dbf.doc('game_settings/popularity').set({ stats: totals }, { merge: true });
});
