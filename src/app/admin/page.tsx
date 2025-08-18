

"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

import { useAuth } from "@/hooks/useAuth";
import type { Game, Player } from "@/types";
import { Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

// UI
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
  ShoppingCart,
  Eye,
} from "lucide-react";
import { motion } from "framer-motion";

// Data
import { GENIUS_CHALLENGES, type GeniusChallenge } from "@/data/genius-challenges";

// Server Actions
import { generateGeniusChallenge } from "@/ai/flows/generate-genius-challenge";

/**
 * Lazy-loaded admin tabs (improves first paint and reduces bundle size)
 */
const SocietyTab = dynamic(() => import("./components/SocietyTab"), {
  ssr: false,
  loading: () => <TabLoader label="المجتمع" />,
});
const QuestionManagementTab = dynamic(() => import("./components/QuestionManagementTab"), {
  ssr: false,
  loading: () => <TabLoader label="المحتوى" />,
});
const NewsTab = dynamic(() => import("./components/NewsTab"), {
  ssr: false,
  loading: () => <TabLoader label="الأخبار" />,
});
const ChallengesTab = dynamic(() => import("./components/ChallengesTab"), {
  ssr: false,
  loading: () => <TabLoader label="البطولات" />,
});
const ComplaintsTab = dynamic(() => import("./components/ComplaintsTab"), {
  ssr: false,
  loading: () => <TabLoader label="الشكاوى" />,
});
const TestingTab = dynamic(() => import("./components/TestingTab"), {
  ssr: false,
  loading: () => <TabLoader label="الاختبار" />,
});


// Challenge host is heavier; keep it lazy with a nice loader
const ChallengeHost = dynamic(
  () => import("@/components/game/king-of-genius/ChallengeHost").then((m) => m.ChallengeHost),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[40vh] gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">جاري تحميل التحدي...</p>
      </div>
    ),
  }
);

/** Simple loader used by lazy tabs */
function TabLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[40vh] gap-2">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <span className="text-muted-foreground">جاري تحميل {label}...</span>
    </div>
  );
}

/** Lightweight error boundary for the modal */
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    const onError = () => setHasError(true);
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);
  if (hasError) {
    return (
      <div className="p-6 text-center text-red-600">
        حدث خطأ غير متوقع أثناء تحميل العرض التجريبي. أعد المحاولة لاحقًا.
      </div>
    );
  }
  return <>{children}</>;
}

function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading } = useAuth();
  const { toast } = useToast();

  // --- Active Tab (URL + LocalStorage persistence) ---
  const tabMap = useMemo(
    () => [
      { value: "society", label: "المجتمع", icon: Gavel },
      { value: "questions", label: "المحتوى", icon: Puzzle },
      { value: "news", label: "الأخبار", icon: Newspaper },
      { value: "challenges", label: "البطولات", icon: Users },
      { value: "complaints", label: "الشكاوى", icon: MessageSquarePlus },
      { value: "testing", label: "الاختبار", icon: TestTube2 },
    ],
    []
  );

  const initialTab = useMemo(() => {
    const fromQuery = searchParams?.get("tab");
    const fromStorage = typeof window !== "undefined" ? localStorage.getItem("admin_active_tab") : null;
    return (fromQuery || fromStorage || "society") as (typeof tabMap)[number]["value"];
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<(typeof tabMap)[number]["value"]>(initialTab);

  const setTab = useCallback(
    (value: (typeof tabMap)[number]["value"]) => {
      setActiveTab(value);
      if (typeof window !== "undefined") localStorage.setItem("admin_active_tab", value);
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("tab", value);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  // --- Test Modal State ---
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [testGame, setTestGame] = useState<Game | null>(null);
  const [testingChallenge, setTestingChallenge] = useState<GeniusChallenge | null>(null);

  // Guard: redirect if not admin
  useEffect(() => {
    if (!loading && !userProfile?.isAdmin) {
      router.push("/");
    }
  }, [userProfile, loading, router]);

  // Global hotkeys: Alt+1..6 to switch tabs, Esc to close modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Close dialog
      if (e.key === "Escape" && isTestModalOpen) {
        setIsTestModalOpen(false);
        setTestGame(null);
        setTestingChallenge(null);
      }
      // Tabs
      if (e.altKey) {
        const num = Number(e.key);
        if (num >= 1 && num <= tabMap.length) {
          e.preventDefault();
          setTab(tabMap[num - 1].value as any);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTestModalOpen, setTab, tabMap]);

  const handleTestChallenge = useCallback(
    async (challenge: GeniusChallenge) => {
      setIsGeneratingTest(true);
      setTestingChallenge(challenge);
      try {
        const { puzzle } = await generateGeniusChallenge({ challengeId: challenge.id });
        const mockPlayer: Player = {
          id: "admin_test",
          name: "Admin",
          avatarId: "Avatar01.png",
          status: "alive",
          team: "A",
          leaderboardPoints: 0,
          score: 0,
          position: 0,
        };

        // Sensible defaults per challenge
        let durationInSeconds = 90;
        if (challenge.id === "quick_math") durationInSeconds = 60;
        if (challenge.id === "code_breaker") durationInSeconds = 45;
        if (challenge.id === "hidden_maze") durationInSeconds = 40;
        if (challenge.id === "smart_grid_puzzle") durationInSeconds = 120;

        const mockGame: Game = {
          id: "TEST_MODE",
          hostId: "admin_test",
          gameType: "king-of-genius",
          players: [mockPlayer],
          playerUids: ["admin_test"],
          gameState: "challenge_active",
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
          title: "تعذر إنشاء الاختبار",
          description: error?.message || "تعذر إنشاء لغز الاختبار.",
          variant: "destructive",
        });
      } finally {
        setIsGeneratingTest(false);
      }
    },
    [toast]
  );

  if (loading || !userProfile?.isAdmin) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 space-y-6">
        {/* Header */}
        <Card className="backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <CardHeader>
             <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl md:text-3xl">لوحة تحكم الأدمن</CardTitle>
                  <CardDescription>إدارة محتوى اللعبة وإعداداتها.</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Button variant="secondary" asChild>
                      <Link href="/store"><Eye className="ml-2 h-4 w-4" /> عرض متجر اللاعبين</Link>
                  </Button>
                  <Button variant="outline" asChild aria-label="إدارة المتجر والألقاب">
                    <Link href="/admin/store">
                      <Store className="mr-2" /> إدارة المتجر والألقاب
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => router.push("/")} aria-label="عودة للرئيسية">
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
              <span className="hidden sm:inline">آخر دخول: {new Date().toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Tabs value={activeTab} onValueChange={(v) => setTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
              {tabMap.map(({ value, label, icon: Icon }, idx) => (
                <TabsTrigger key={value} value={value} className="group">
                  <Icon className="mr-2 h-4 w-4 group-data-[state=active]:scale-110 transition-transform" />
                  {label}
                  <span className="sr-only">Alt+{idx + 1}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="society" className="mt-4">
              <SocietyTab />
            </TabsContent>

            <TabsContent value="questions" className="mt-4">
              <QuestionManagementTab />
            </TabsContent>

            <TabsContent value="news" className="mt-4">
              <NewsTab />
            </TabsContent>

            <TabsContent value="challenges" className="mt-4">
              <ChallengesTab />
            </TabsContent>

            <TabsContent value="complaints" className="mt-4">
              <ComplaintsTab />
            </TabsContent>

            <TabsContent value="testing" className="mt-4">
              <TestingTab onTestChallenge={handleTestChallenge} isGeneratingTest={isGeneratingTest} testingChallenge={testingChallenge} />
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
              {testGame?.gameType === "king-of-genius" && testingChallenge ? (
                <ChallengeHost game={testGame} player={testGame.players[0]} self={testGame.players[0]} challenge={testingChallenge} />
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
              <Button onClick={() => testingChallenge && handleTestChallenge(testingChallenge)}>
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
        <Suspense fallback={
            <div className="flex min-h-screen w-full items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin" />
            </div>
        }>
            <AdminPageContent />
        </Suspense>
    )
}
