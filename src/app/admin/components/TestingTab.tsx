"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// UI
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Icons
import { TestTube2, Brain, Wand, Loader2, Search, Shuffle } from "lucide-react";

// Data
import { GENIUS_CHALLENGES, type GeniusChallenge } from "@/data/genius-challenges";

interface TestingTabProps {
  onTestChallenge: (challenge: GeniusChallenge) => void;
  isGeneratingTest: boolean;
  testingChallenge: GeniusChallenge | null;
}

/**
 * TestingTab.gpt5 – نسخة مُحسّنة ومتناسقة مع بقية لوحات الإدارة.
 * - بحث فوري + اختيار عشوائي + تلميحات.
 * - رسومية أكثر أناقة، وحركات لطيفة.
 * - قابلية وصول أفضل ووضوح في حالة التحميل.
 */
export default function TestingTab({ onTestChallenge, isGeneratingTest, testingChallenge }: TestingTabProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // تصفية محلية آمنة (لا نفترض وجود حقول إضافية غير id/name)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GENIUS_CHALLENGES;
    return GENIUS_CHALLENGES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  const runChallenge = useCallback(
    (challenge: GeniusChallenge) => {
      if (isGeneratingTest) return;
      onTestChallenge(challenge);
    },
    [isGeneratingTest, onTestChallenge]
  );

  const runRandom = useCallback(() => {
    const pool = filtered.length > 0 ? filtered : GENIUS_CHALLENGES;
    const idx = Math.floor(Math.random() * pool.length);
    runChallenge(pool[idx]);
  }, [filtered, runChallenge]);

  const onEnterToRunFirst = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && filtered[0]) {
        runChallenge(filtered[0]);
      }
    },
    [filtered, runChallenge]
  );

  // تحسين تجربة المستخدم: Ctrl+K لوصول سريع إلى البحث
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <Card aria-busy={isGeneratingTest} className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><TestTube2 /> ساحة الاختبار</CardTitle>
        <CardDescription>قم بتوليد وتجربة الألعاب بشكل فوري لأغراض الاختبار.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg"><Brain /> ساحة العباقرة</CardTitle>
              <Badge variant="secondary" className="rounded-full">{filtered.length} تحدّي</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* شريط الأدوات */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  placeholder="ابحث باسم التحدّي… (Ctrl/⌘+K)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onEnterToRunFirst}
                  className="pr-9"
                  aria-label="بحث"
                />
              </div>
              <div className="flex gap-2">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" onClick={() => setQuery("")}>مسح</Button>
                    </TooltipTrigger>
                    <TooltipContent>مسح خانة البحث</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={runRandom} disabled={isGeneratingTest}>
                        {isGeneratingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shuffle className="mr-2 h-4 w-4" />}
                        عشوائي
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>تشغيل تحدٍّ عشوائي من النتائج الحالية</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* قائمة التحديات */}
            <ScrollArea className="h-[360px] rounded-xl border p-3 bg-muted/30">
              <AnimatePresence mode="popLayout">
                {filtered.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center h-40 text-sm text-muted-foreground"
                  >
                    لا توجد نتائج مطابقة.
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
                  >
                    {filtered.map((challenge) => {
                      const active = testingChallenge?.id === challenge.id;
                      return (
                        <Button
                          key={challenge.id}
                          variant={active ? "default" : "outline"}
                          className="h-auto py-3 justify-start text-sm font-normal"
                          onClick={() => runChallenge(challenge)}
                          disabled={isGeneratingTest}
                          aria-pressed={active}
                        >
                          {active ? (
                            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Wand className="ml-2 h-4 w-4" />
                          )}
                          <span className="truncate" title={challenge.name}>{challenge.name}</span>
                        </Button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </ScrollArea>

            {/* حالة حية لقارئات الشاشة */}
            <div className="sr-only" aria-live="polite">
              {isGeneratingTest ? "جاري توليد التحدّي" : testingChallenge ? `آخر تحدٍّ: ${testingChallenge.name}` : "جاهز"}
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
