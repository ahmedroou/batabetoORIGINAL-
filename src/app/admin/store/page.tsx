
import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import { Suspense } from "react";

/**
 * صفحة لوحة إدارة المتجر (App Router)
 * تحسينات أساسية:
 * - إزالة "use client" من الصفحة لتظل Server Component (الأفضل للأداء)
 * - تحميل مكوّن الواجهة الثقيلة ديناميكياً مع تعطيل SSR لتصفّح أسرع وتقليل JS المبدئي
 * - هيكل Skeleton احترافي أثناء التحميل
 * - إيقاف الفهرسة عبر robots لمنع ظهور لوحة الأدمن في محركات البحث
 * - تعطيل الكاش (revalidate=0 + dynamic force-dynamic) لضمان أحدث بيانات للأدمن
 * - إبقاء إمكانية إضافة Error Boundary و Loading Route لاحقًا بسهولة
 */

export const metadata: Metadata = {
  title: "لوحة إدارة المتجر | الأدمن",
  description: "تحكم كامل في أسعار الشخصيات والألقاب والصلاحيات.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  openGraph: {
    title: "لوحة إدارة المتجر",
    description: "تحكم كامل في أسعار الشخصيات والألقاب والصلاحيات.",
  },
};

// تمنع أي تخزين مؤقت وتضمن جلبًا دائمًا للبيانات (مهم لصفحات الأدمن)
export const revalidate = 0;
export const dynamic = "force-dynamic";

// تحميل الواجهة العميلية الضخمة بشكل ديناميكي لخفض الـ TTFB وتقليل JS على الصفحة
const AdminStoreClient = dynamicImport(() => import("./client"), {
  ssr: false,
  // هيكل تحميل بسيط وعملي مع دعم RTL
  loading: () => (
    <div dir="rtl" className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-4xl space-y-4">
        <div className="h-10 rounded-2xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-[50vh] rounded-xl bg-muted/60 animate-pulse" />
      </div>
    </div>
  ),
});

export default function AdminStorePage() {
  return (
    <Suspense fallback={null}>
      <AdminStoreClient />
    </Suspense>
  );
}
