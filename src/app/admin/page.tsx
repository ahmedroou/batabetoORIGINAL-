'use client';

import React, { useCallback, useEffect, useMemo, useState, Suspense, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

import { useAuth } from '@/hooks/useAuth';
import type { Game, Player } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

// UI
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import {
  Store,
  ArrowLeft,
  Loader2,
  Users,
  Puzzle,
  Gavel,
  Newspaper,
  TestTube2,
  MessageSquarePlus,
  Rocket,
  Keyboard,
  Eye,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

// Server Actions
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';

/** --------------------------------------------------
 *  Lazy imports (loaded only when active)
 *  -------------------------------------------------- */
const SocietyTab = dynamic(() => import('./components/SocietyTab'), {
  ssr: false,
  loading: () => <SkeletonBlock label="المجتمع" />,
});
const QuestionManagementTab = dynamic(() => import('./components/QuestionManagementTab'), {
  ssr: false,
  loading: () => <SkeletonBlock label="المحتوى" />,
});
const NewsTab = dynamic(() => import('./components/NewsTab'), {
  ssr: false,
  loading: () => <SkeletonBlock label="الأخبار" />,
});
const ChallengesTab = dynamic(() => import('./components/ChallengesTab'), {
  ssr: false,
  loading: () => <SkeletonBlock label="البطولات" />,
});
const ComplaintsTab = dynamic(() => import('./components/ComplaintsTab'), {
  ssr: false,
  loading: () => <SkeletonBlock label="الشكاوى" />,
});
const TestingTab = dynamic(() => import('./components/TestingTab'), {
  ssr: false,
  loading: () => <SkeletonBlock label="الاختبار" />,
});

// Challenge host remains lazy with a pleasant loader
const ChallengeHost = dynamic(
  () => import('@/components/game/king-of-genius/ChallengeHost').then((m) => m.ChallengeHost),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[40vh] gap-2" aria-live="polite" aria-busy>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">جاري تحميل التحدي...</p>
      </div>
    ),
  },
);

/** --------------------------------------------------
 *  Helpers & Constants
 *  -------------------------------------------------- */
const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const TABS = [
  { value: 'society', label: 'المجتمع', icon: Gavel },
  { value: 'questions', label: 'المحتوى', icon: Puzzle },
  { value: 'news', label: 'الأخبار', icon: Newspaper },
  { value: 'challenges', label: 'البطولات', icon: Users },
  { value: 'complaints', label: 'الشكاوى', icon: MessageSquarePlus },
  { value: 'testing', label: 'الاختبار', icon: TestTube2 },
] as const;

type TabValue = (typeof TABS)[number]['value'];

const CHALLENGE_DURATIONS: Record<string, number> = {
  quick_math: 60,
  code_breaker: 45,
  hidden_maze: 40,
  smart_grid_puzzle: 120,
};

/** Skeleton block used while lazy content mounts */
function SkeletonBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[40vh] gap-3" aria-live="polite" aria-busy>
      <Loader2 className="w-6 h-6 animate-spin" />
      <span className="text-muted-foreground">جاري تحميل {label}...</span>
    </div>
  );
}

/** ErrorBoundary to protect the modal area */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[Admin Modal Error]', error);
  }
  render() {
    if (this.state.hasError) {
      return <div className="p-6 text-center text-red-600">حدث خطأ غير متوقع أثناء تحميل العرض التجريبي.</div>;
    }
    return this.props.children as React.ReactElement;
  }
}

/** --------------------------------------------------
 *  New Layout: Sidebar Navigation + Mobile Segmented Bar
 *  -------------------------------------------------- */
function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading } = useAuth();
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();

  // Data-saver & density toggles
  const [dataSaver, setDataSaver] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return JSON.parse(localStorage.getItem('admin_data_saver') || 'false');
  });
  const [compact, setCompact] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return JSON.parse(localStorage.getItem('admin_compact') || 'false');
  });

  const toggleDataSaver = useCallback(() => {
    setDataSaver((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('admin_data_saver', JSON.stringify(next));
      return next;
    });
  }, []);
  const toggleCompact = useCallback(() => {
    setCompact((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('admin_compact', JSON.stringify(next));
      return next;
    });
  }, []);

  // Active Tab (URL + LocalStorage)
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    const fromQuery = searchParams?.get('tab');
    const fromStorage = typeof window !== 'undefined' ? localStorage.getItem('admin_active_tab') : null;
    return (fromQuery || fromStorage || 'society') as TabValue;
  });

  const setTab = useCallback(
    (value: TabValue) => {
      setActiveTab(value);
      if (typeof window !== 'undefined') localStorage.setItem('admin_active_tab', value);
      startTransition(() => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('tab', value);
        router.replace(`?${params.toString()}`);
      });
    },
    [router, searchParams, startTransition],
  );

  // Guard: redirect if not admin
  useEffect(() => {
    if (!loading && !userProfile?.isAdmin) router.push('/');
  }, [userProfile, loading, router]);

  // Hotkeys: Alt+1..6, Esc closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTestModalOpen) {
        setIsTestModalOpen(false);
        setTestGame(null);
        setTestingChallenge(null);
      }
      if (e.altKey) {
        const num = Number(e.key);
        if (num >= 1 && num <= TABS.length) {
          e.preventDefault();
          setTab(TABS[num - 1].value as TabValue);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab]);

  // Test Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [testGame, setTestGame] = useState<Game | null>(null);
  const [testingChallenge, setTestingChallenge] = useState<{ id: string; name: string } | null>(null);

  const handleTestChallenge = useCallback(
    async (challenge: { id: string; name: string }) => {
      setIsGeneratingTest(true);
      setTestingChallenge(challenge);
      try {
        const { puzzle } = await generateGeniusChallenge({ challengeId: challenge.id });
        const mockPlayer: Player = {
          id: 'admin_test',
          name: 'Admin',
          avatarId: 'Avatar01.png',
          status: 'alive',
          team: 'A',
          leaderboardPoints: 0,
          score: 0,
          position: 0,
        };
        const durationInSeconds = CHALLENGE_DURATIONS[challenge.id] ?? 90;
        const mockGame: Game = {
          id: 'TEST_MODE',
          hostId: 'admin_test',
          gameType: 'king-of-genius',
          players: [mockPlayer],
          playerUids: ['admin_test'],
          gameState: 'challenge_active',
          createdAt: Timestamp.now(),
          challengeState: {
            duration: durationInSeconds,
            challengeEndsAt: Timestamp.fromMillis(Date.now() + durationInSeconds * 1000),
            puzzle,
            results: [],
            playerProgress: {},
          },
        };
        setTestGame(mockGame);
        setIsTestModalOpen(true);
      } catch (error: any) {
        toast({ title: 'تعذر إنشاء الاختبار', description: error?.message || 'تعذر إنشاء لغز الاختبار.', variant: 'destructive' });
      } finally {
        setIsGeneratingTest(false);
      }
    },
    [toast],
  );

  // Background gradient (calm when dataSaver is on)
  const bgGradient = dataSaver
    ? 'from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950'
    : 'from-indigo-50 via-fuchsia-50 to-cyan-50 dark:from-slate-950 dark:via-indigo-950/30 dark:to-slate-950';

  return (
    <main className={cn('min-h-screen w-full bg-gradient-to-br', bgGradient, compact && 'text-sm')}>      
      {/* Top Bar */}
      <div className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-xl md:text-2xl">لوحة تحكم الأدمن</CardTitle>
            <Badge variant="secondary" className="rounded-full">{userProfile?.username ?? 'مشرف'}</Badge>
            <Separator orientation="vertical" className="mx-1 hidden sm:block" />
            <span className="hidden sm:inline text-xs text-muted-foreground">
              <Keyboard className="inline-block h-3.5 w-3.5 mr-1" /> Alt + [1–6]
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" size={compact ? 'sm' : 'default'}>
              <Link href="/store" prefetch={!dataSaver} aria-label="عرض متجر اللاعبين">
                <Eye className="ml-2 h-4 w-4" /> متجر اللاعبين
              </Link>
            </Button>
            <Button asChild variant="outline" size={compact ? 'sm' : 'default'} aria-label="إدارة المتجر والألقاب">
              <Link href="/admin/store" prefetch={!dataSaver}>
                <Store className="mr-2 h-4 w-4" /> المتجر والألقاب
              </Link>
            </Button>
            <Button variant={dataSaver ? 'default' : 'outline'} size={compact ? 'sm' : 'default'} onClick={toggleDataSaver}>
              {dataSaver ? 'توفير البيانات: شغّال' : 'توفير البيانات: مقفول'}
            </Button>
            <Button variant={compact ? 'default' : 'outline'} size={compact ? 'sm' : 'default'} onClick={toggleCompact}>
              {compact ? 'وضع مضغوط' : 'وضع مريح'}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => router.push('/')} aria-label="عودة للرئيسية">
              <ArrowLeft />
            </Button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className={cn('mx-auto max-w-6xl px-4 py-6 grid gap-6', 'md:grid-cols-[240px_1fr]')}>
        {/* Sidebar (Desktop) */}
        <aside className="hidden md:block">
          <Card className="border-violet-200/40 dark:border-violet-900/30 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">التنقّل</CardTitle>
              <CardDescription>اختر القسم المرغوب</CardDescription>
            </CardHeader>
            <CardContent className="p-2">
              <nav className="relative">
                <ul className="space-y-1">
                  <AnimatePresence initial={false}>
                    {TABS.map(({ value, label, icon: Icon }, idx) => {
                      const active = activeTab === value;
                      return (
                        <li key={value}>
                          <button
                            type="button"
                            onClick={() => setTab(value)}
                            className={cn(
                              'relative w-full flex items-center gap-3 rounded-xl px-3 py-2 transition',
                              'hover:bg-primary/10',
                              active && 'text-primary'
                            )}
                            data-active={active}
                            aria-current={active ? 'page' : undefined}
                          >
                            {/* Animated active indicator */}
                            {active && !prefersReducedMotion && (
                              <motion.span
                                layoutId="nav-active"
                                className="absolute inset-0 rounded-xl bg-primary/10"
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                aria-hidden
                              />
                            )}
                            <Icon className="relative z-10 h-4 w-4" />
                            <span className="relative z-10">{label}</span>
                            <span className="sr-only">Alt+{idx + 1}</span>
                          </button>
                        </li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </nav>
            </CardContent>
          </Card>

          {/* Quick status */}
          <Card className="mt-4">
            <CardContent className="p-3 text-xs text-muted-foreground flex items-center justify-between">
              <span>آخر دخول</span>
              <span>{new Date().toLocaleString()}</span>
            </CardContent>
          </Card>
        </aside>

        {/* Main panel */}
        <section className="min-h-[60vh]">
          {/* Mobile segmented nav */}
          <div className="md:hidden -mt-2">
            <div className="flex gap-2 overflow-auto no-scrollbar py-1">
              <AnimatePresence initial={false}>
                {TABS.map(({ value, label }) => {
                  const active = activeTab === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      className={cn(
                        'relative flex-shrink-0 rounded-full px-3 py-1.5 border',
                        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      {label}
                    </button>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Active content (render only when active for data-saver) */}
          {activeTab === 'society' && <SocietyTab />}
          {activeTab === 'questions' && <QuestionManagementTab />}
          {activeTab === 'news' && <NewsTab />}
          {activeTab === 'challenges' && <ChallengesTab />}
          {activeTab === 'complaints' && <ComplaintsTab />}
          {activeTab === 'testing' && (
            <TestingTab
              onTestChallenge={handleTestChallenge}
              isGeneratingTest={isGeneratingTest}
              testingChallenge={testingChallenge as any}
            />
          )}
        </section>
      </div>

      {/* Test Modal */}
      <Dialog
        open={isTestModalOpen}
        onOpenChange={(isOpen) => {
          setIsTestModalOpen(isOpen);
          if (!isOpen) {
            setTestGame(null);
            setTestingChallenge(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl bg-slate-50 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>
              اختبار: {testingChallenge?.name}
              {testingChallenge && (
                <span className="ml-2 text-xs text-muted-foreground">#{testingChallenge.id}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <ErrorBoundary>
            <div className="flex items-center justify-center p-4 min-h-[60vh] rounded-md bg-slate-100 dark:bg-slate-950">
              {testGame?.gameType === 'king-of-genius' && testingChallenge ? (
                <ChallengeHost
                  game={testGame}
                  player={testGame.players[0]}
                  self={testGame.players[0]}
                  challenge={testingChallenge as any}
                />
              ) : (
                <div className="text-muted-foreground">لا يوجد اختبار نشط حاليًا.</div>
              )}
            </div>
          </ErrorBoundary>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Rocket className="h-4 w-4" /> وضع الاختبار لا يحفظ النتائج.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsTestModalOpen(false)}>إغلاق</Button>
              <Button onClick={() => testingChallenge && handleTestChallenge(testingChallenge)} disabled={!testingChallenge}>
                إعادة تشغيل الاختبار
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center" aria-live="polite" aria-busy>
          <Loader2 className="h-10 w-10 animate-spin" />
        </div>
      }
    >
      <AdminPageContent />
    </Suspense>
  );
}
