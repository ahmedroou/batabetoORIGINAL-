
import { Suspense } from 'react';
import dynamicImport from 'next/dynamic';
import type { Metadata, Viewport } from 'next';

/**
 * GPT‑5 Enhanced Store Page
 * - Server component wrapper with dynamic client import
 * - Edge runtime + no-cache for fresh pricing/inventory
 * - Rich metadata & theme color
 * - Polished loading fallback that matches site visuals (stars/twinkling)
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'متجر الشخصيات | بطابيطو',
  description:
    'اشترِ وافتح شخصيات مذهلة لتتباهى بها داخل المجتمع والألعاب—واجهة سلسة ومتجاوبة مع مؤثرات جميلة.',
  alternates: { canonical: '/store' },
  openGraph: {
    title: 'متجر الشخصيات | بطابيطو',
    description:
      'واجهة متجر متقدمة لشراء الشخصيات العادية وشخصيات العقوبات مع فلاتر وبحث وحفظ مفضلة.',
    url: '/store',
    siteName: 'بطابيطو',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'متجر الشخصيات | بطابيطو',
    description: 'تسوّق، فلتر، واقتنِ شخصياتك المفضلة بخبرة.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#6d28d9' },
    { media: '(prefers-color-scheme: dark)', color: '#6d28d9' },
  ],
};

// Client component is heavy/UI-rich—hydrate only on client.
const StoreClient = dynamicImport(() => import('./client'), {
  ssr: false,
  loading: () => <LoadingFallback />,
});

function LoadingFallback() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
      <div className="fixed inset-0 stars z-0" />
      <div className="fixed inset-0 twinkling z-0" />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500/30 border-t-purple-400" />
        <p className="text-sm text-gray-300">جاري تحميل المتجر…</p>
      </div>
    </div>
  );
}

export default function StorePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <StoreClient />
    </Suspense>
  );
}
