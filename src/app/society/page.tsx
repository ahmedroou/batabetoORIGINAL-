"use client";

/**
 * SocietyPage.gpt5.tsx
 * -------------------------------------------------------------
 * صفحة المجتمع بإصدار مُحسّن وجمالي مع مراعاة الأداء وإمكانية الوصول.
 *
 * ✨ أبرز التحسينات:
 * - Skeleton أنيق مع حركات خفيفة (ومراعاة تفضيل تقليل الحركة).
 * - طبقات نجوم اختيارية + تدرجات لطيفة دون إرهاق العين.
 * - تحسين إمكانية الوصول (أدوار ARIA، live regions، أزرار واضحة).
 * - تمهيد مسبق للـ chunk عبر requestIdleCallback لتسريع التحميل الفعلي.
 * - ErrorBoundary مُحسّن مع زر "إعادة المحاولة" و"رجوع" اختياري.
 * - بنية دلالية صحيحة: main/header/section.
 * - توافق كامل مع RTL.
 * -------------------------------------------------------------
 */

import dynamic from "next/dynamic";
import React, { Suspense, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ✅ تحميل كسول للمكوّن العميل لتقليل حجم الحِزم وتفادي SSR
const SocietyClient = dynamic(() => import("./client"), {
  ssr: false,
  suspense: true,
});

/* -------------------------------------------------------------
 * طبقات الخلفية: نجوم + تدرّج (تُعطَّل إن كان المستخدم يفضّل تقليل الحركة)
 * ----------------------------------------------------------- */
function StarfieldLayers() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <>
      <div className="fixed inset-0 stars pointer-events-none" aria-hidden="true" />
      <div className="fixed inset-0 twinkling pointer-events-none" aria-hidden="true" />
    </>
  );
}

/* -------------------------------------------------------------
 * Skeleton أثناء التحميل
 * ----------------------------------------------------------- */
function SocietySkeleton() {
  return (
    <div
      className="min-h-screen w-full bg-gray-950 text-white bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.20),transparent_40%),radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.15),transparent_40%)]"
      role="progressbar"
      aria-busy="true"
      aria-label="جارٍ تحميل صفحة المجتمع"
    >
      <StarfieldLayers />

      <main className="relative z-10 container mx-auto px-4 py-12" dir="rtl">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-8"
        >
          <div className="space-y-3">
            <div className="h-10 w-64 bg-white/10 rounded-xl animate-pulse" />
            <div className="h-5 w-80 bg-white/5 rounded-lg animate-pulse" />
          </div>
        </motion.header>

        <section className="space-y-8" aria-label="عناصر واجهة مؤقتة">
          {/* تبويبات */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-2xl border border-white/10 bg-white/5 animate-pulse"
              />
            ))}
          </motion.div>

          {/* بطاقات */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-44 rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
              >
                <div className="h-full w-full animate-pulse bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
              </div>
            ))}
          </motion.div>
        </section>

        <div
          className="flex items-center justify-center mt-10 gap-3"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-6 w-6 animate-spin opacity-90" />
          <span className="text-sm text-gray-300">جارٍ التحميل…</span>
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------
 * Error Boundary مُحسّن
 * ----------------------------------------------------------- */
class SocietyErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("SocietyPage error:", { error, info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-gray-950 text-white flex flex-col items-center justify-center p-6 text-center" dir="rtl">
          <h2 className="text-2xl font-bold mb-2">حدث خطأ غير متوقع</h2>
          <p className="text-gray-300 mb-6">تعذر تحميل صفحة المجتمع الآن.</p>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => (typeof window !== "undefined" ? window.location.reload() : null)}
              className="rounded-2xl"
            >
              <RefreshCw className="me-2 h-4 w-4" /> إعادة المحاولة
            </Button>
            <Button
              variant="secondary"
              onClick={() => (typeof window !== "undefined" ? window.history.back() : null)}
              className="rounded-2xl"
            >
              <Undo2 className="me-2 h-4 w-4" /> رجوع
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/* -------------------------------------------------------------
 * تمهيد chunk المجتمع عند خمول المتصفح لتسريع إظهار الصفحة الفعلي
 * ----------------------------------------------------------- */
function PrefetchOnIdle() {
  useEffect(() => {
    // @ts-ignore types for requestIdleCallback may not exist in TS target
    const ric = (cb: () => void) => ("requestIdleCallback" in window ? (window as any).requestIdleCallback(cb) : setTimeout(cb, 350));
    ric(() => {
      // warm the dynamic import
      import("./client").catch(() => {});
    });
  }, []);
  return null;
}

/* -------------------------------------------------------------
 * الصفحة الرئيسية
 * ----------------------------------------------------------- */
export default function SocietyPage() {
  return (
    <SocietyErrorBoundary>
      <PrefetchOnIdle />
      <Suspense fallback={<SocietySkeleton />}> 
        <SocietyClient />
      </Suspense>
    </SocietyErrorBoundary>
  );
}
