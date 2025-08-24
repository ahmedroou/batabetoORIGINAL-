
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
 *  Lazy imports (loaded only when tab is active)
 *  -------------------------------------------------- */
const SocietyTab = dynamic(() => import('./components/SocietyTab'), {
  ssr: false,
  loading: () => <TabLoader label="المجتمع" />,
});
const QuestionManagementTab = dynamic(() => import('./components/QuestionManagementTab'), {
  ssr: false,
  loading: () => <TabLoader label="المحتوى" />,
});
const NewsTab = dynamic(() => import('./components/NewsTab'), {
  ssr: false,
  loading: () => <TabLoader label="الأخبار" />,
});
const ChallengesTab = dynamic(() => import('./components/ChallengesTab'), {
  ssr: false,
  loading: () => <TabLoader label="البطولات" />,
});
const ComplaintsTab = dynamic(() => import('./components/ComplaintsTab'), {
  ssr: false,
  loading: () => <TabLoader label="الشكاوى" />,
});
const TestingTab = dynamic(() => import('./components/TestingTab'), {
  ssr: false,
  loading: () => <TabLoader label="الاختبار" />,
});

// Challenge host remains lazy with a nice loader
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
 *  Constants & helpers
 *  -------------------------------------------------- */
const TAB_MAP = [
  { value: 'society', label: 'المجتمع', icon: Gavel },
  { value: 'questions', label: 'المحتوى', icon: Puzzle },
  { value: 'news', label: 'الأخبار', icon: Newspaper },
  { value: 'challenges', label: 'البطولات', icon: Users },
  { value: 'complaints', label: 'الشكاوى', icon: MessageSquarePlus },
  { value: 'testing', label: 'الاختبار', icon: TestTube2 },
] as const;

type TabValue = (typeof TAB_MAP)[number]['value'];

const CHALLENGE_DURATIONS: Record<string, number> = {
  quick_math: 60,
  code_breaker: 45,
  hidden_maze: 40,
  smart_grid_puzzle: 120,
};

/** Skeleton loader for tabs (lightweight, zero data-fetch) */
function TabLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[40vh] gap-2" aria-live="polite" aria-busy>
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <span className="text-muted-foreground">جاري تحميل {label}...</span>
    </div>
  );
}

/** Real error boundary (prevents entire page crash) */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    // Keep it silent for users; log to console for devs
    console.error('[Modal ErrorBoundary]', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center text-red-600">
          حدث خطأ غير متوقع أثناء تحميل العرض التجريبي. أعد المحاولة لاحقًا.
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

/** --------------------------------------------------
 *  Main content
 *  -------------------------------------------------- */
function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading } = useAuth();
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();

  /** Data Saver Mode — يقلل التحميل المسبق والحركة ويؤجل المحتوى الثقيل */
  const [dataSaver, setDataSaver] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('admin_data_saver');
    return saved ? JSON.parse(saved) : false;
  });

  const toggleDataSaver = useCallback(() => {
    setDataSaver((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('admin_data_saver', JSON.stringify(next));
      return next;
    });
  }, []);

  // --- Active Tab (URL + LocalStorage persistence) ---
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    const fromQuery = searchParams?.get('tab');
    const fromStorage = typeof window !== 'undefined' ? localStorage.getItem('admin_active_tab') : null;
    return (fromQuery || fromStorage || 'society') as TabValue;
  });

  const setTab = useCallback(
    (value: TabValue) => {
      setActiveTab(value);
      if (typeof window !== 'undefined') localStorage.setItem('admin_active_tab', value);
      // Non-blocking URL update to keep UI snappy
      startTransition(() => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('tab', value);
        router.replace(`?${params.toString()}`);
      });
    },
    [router, searchParams, startTransition],
  );

  // --- Test Modal State ---
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [testGame, setTestGame] = useState<Game | null>(null);
  const [testingChallenge, setTestingChallenge] = useState<{ id: string; name: string } | null>(null);

  // Guard: redirect if not admin
  useEffect(() => {
    if (!loading && !userProfile?.isAdmin) {
      router.push('/');
    }
  }, [userProfile, loading, router]);

  // Global hotkeys: Alt+1..6 to switch tabs, Esc to close modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTestModalOpen) {
        setIsTestModalOpen(false);
        setTestGame(null);
        setTestingChallenge(null);
      }
      if (e.altKey) {
        const num = Number(e.key);
        if (num >= 1 && num <= TAB_MAP.length) {
          e.preventDefault();
          setTab(TAB_MAP[num - 1].value as TabValue);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTestModalOpen, setTab]);

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
            puzzle: puzzle,
            results: [],
            playerProgress: {},
          },
        };
        setTestGame(mockGame);
        setIsTestModalOpen(true);
      } catch (error: any) {
        toast({
          title: 'تعذر إنشاء الاختبار',
          description: error?.message || 'تعذر إنشاء لغز الاختبار.',
          variant: 'destructive',
        });
      } finally {
        setIsGeneratingTest(false);
      }
    },
    [toast],
  );

  if (loading || !userProfile?.isAdmin) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center" aria-live="polite" aria-busy>
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  const gradientClass = dataSaver
    ? 'from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950'
    : 'from-violet-50 via-fuchsia-50 to-sky-50 dark:from-slate-900 dark:via-violet-950/40 dark:to-slate-950';

  return (
    <main className={`min-h-screen w-full bg-gradient-to-br ${gradientClass}`}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 space-y-6">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="supports-[backdrop-filter]:bg-background/70 backdrop-blur border-violet-200/40 dark:border-violet-900/40">
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-2xl md:text-3xl">لوحة تحكم الأدمن</CardTitle>
                    <Badge variant="secondary" className="rounded-full">
                      {userProfile?.name ?? 'مشرف'}
                    </Badge>
                  </div>
                  <CardDescription>إدارة محتوى اللعبة وإعداداتها.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" asChild>
                    <Link href="/store" prefetch={!dataSaver} aria-label="عرض متجر اللاعبين">
                      <Eye className="ml-2 h-4 w-4" /> عرض متجر اللاعبين
                    </Link>
                  </Button>
                  <Button variant="outline" asChild aria-label="إدارة المتجر والألقاب">
                    <Link href="/admin/store" prefetch={!dataSaver}>
                      <Store className="mr-2" /> إدارة المتجر والألقاب
                    </Link>
                  </Button>
                  <Button
                    variant={dataSaver ? 'default' : 'outline'}
                    onClick={toggleDataSaver}
                    aria-pressed={dataSaver}
                    aria-label="تفعيل وضع توفير البيانات"
                  >
                    {dataSaver ? 'وضع البيانات: مُفعّل' : 'وضع البيانات: مُغلق'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/')}
                    aria-label="عودة للرئيسية"
                  >
                    <ArrowLeft />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Keyboard className="h-3.5 w-3.5" /> Alt + [1-6] للتبديل بين التبويبات بسرعة
                </span>
                <div className="h-3 w-px bg-border hidden md:block" />
                <span className="hidden sm:inline">
                  آخر دخول: {new Date().toLocaleString()}
                </span>
                <div className="h-3 w-px bg-border hidden md:block" />
                <span className="inline-flex items-center gap-1">
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} تحديث الحالة
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabValue)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
              {TAB_MAP.map(({ value, label, icon: Icon }, idx) => (
                <TabsTrigger key={value} value={value} className="group relative">
                  {/* subtle active indicator */}
                  <AnimatePresence>
                    {activeTab === value && !prefersReducedMotion && (
                      <motion.span
                        layoutId="tab-pill"
                        className="absolute inset-0 rounded-md bg-primary/10"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        aria-hidden
                      />
                    )}
                  </AnimatePresence>
                  <Icon className="mr-2 h-4 w-4 group-data-[state=active]:scale-110 transition-transform" />
                  {label}
                  <span className="sr-only">Alt+{idx + 1}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Render heavy tab contents only when active (REAL data-saver) */}
            <TabsContent value="society" className="mt-4">
              {activeTab === 'society' ? <SocietyTab /> : <TabLoader label="المجتمع" />}
            </TabsContent>

            <TabsContent value="questions" className="mt-4">
              {activeTab === 'questions' ? <QuestionManagementTab /> : <TabLoader label="المحتوى" />}
            </TabsContent>

            <TabsContent value="news" className="mt-4">
              {activeTab === 'news' ? <NewsTab /> : <TabLoader label="الأخبار" />}
            </TabsContent>

            <TabsContent value="challenges" className="mt-4">
              {activeTab === 'challenges' ? <ChallengesTab /> : <TabLoader label="البطولات" />}
            </TabsContent>

            <TabsContent value="complaints" className="mt-4">
              {activeTab === 'complaints' ? <ComplaintsTab /> : <TabLoader label="الشكاوى" />}
            </TabsContent>

            <TabsContent value="testing" className="mt-4">
              {activeTab === 'testing' ? (
                <TestingTab
                  onTestChallenge={handleTestChallenge}
                  isGeneratingTest={isGeneratingTest}
                  testingChallenge={testingChallenge as any}
                />
              ) : (
                <TabLoader label="الاختبار" />
              )}
            </TabsContent>
          </Tabs>
        </motion.div>
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
              <Button variant="outline" onClick={() => setIsTestModalOpen(false)}>
                إغلاق
              </Button>
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
