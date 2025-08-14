"use client";

import dynamic from "next/dynamic";
import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy-load SocietyClient to reduce main bundle size and avoid SSR issues for client-only libs
const SocietyClient = dynamic(() => import("./client"), {
  ssr: false,
  suspense: true,
});

function SocietyLoading() {
  return (
    <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white">
      {/* Optional star layers (match the rest of society pages if globals exist) */}
      <div className="fixed inset-0 stars pointer-events-none" />
      <div className="fixed inset-0 twinkling pointer-events-none" />

      <div className="relative z-10 container mx-auto px-4 py-12">
        <div className="animate-pulse space-y-8">
          {/* Header skeleton */}
          <div className="space-y-3">
            <div className="h-10 w-64 bg-white/10 rounded" />
            <div className="h-5 w-80 bg-white/5 rounded" />
          </div>

          {/* Tabs skeleton */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded border border-white/10 bg-white/5" />
            ))}
          </div>

          {/* Cards skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-44 rounded-lg border border-white/10 bg-white/5"
              />
            ))}
          </div>
        </div>

        <div
          className="flex items-center justify-center mt-10 gap-3"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-7 w-7 animate-spin text-purple-300" />
          <span className="text-sm text-gray-300">جارٍ التحميل…</span>
        </div>
      </div>
    </div>
  );
}

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
        <div className="min-h-screen w-full bg-gray-900 text-white flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-2xl font-bold mb-2">حدث خطأ غير متوقع</h2>
          <p className="text-gray-300 mb-6">تعذر تحميل صفحة المجتمع الآن.</p>
          <button
            onClick={() => (typeof window !== "undefined" ? window.location.reload() : null)}
            className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors shadow-lg"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function SocietyPage() {
  return (
    <SocietyErrorBoundary>
      <Suspense fallback={<SocietyLoading />}> 
        <SocietyClient />
      </Suspense>
    </SocietyErrorBoundary>
  );
}
