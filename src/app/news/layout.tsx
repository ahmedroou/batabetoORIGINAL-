import type { Metadata } from 'next';
import { Inter, Merriweather, Noto_Naskh_Arabic, Amiri } from 'next/font/google';

export const metadata: Metadata = {
  title: 'صحيفة اللعبة | بطابيطو',
  description: 'آخر الأخبار والتحديثات من عالم بطابيطو.',
  themeColor: '#FAF8F1',
  openGraph: {
    title: 'صحيفة اللعبة | بطابيطو',
    description: 'آخر الأخبار والتحديثات من عالم بطابيطو.',
    siteName: 'بطابيطو',
    type: 'website',
    locale: 'ar_SA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'صحيفة اللعبة | بطابيطو',
    description: 'آخر الأخبار والتحديثات من عالم بطابيطو.',
  },
  alternates: {
    canonical: '/news',
  },
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// A classic Arabic font for headlines, giving a distinct "newspaper" feel.
const amiri = Amiri({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  variable: '--font-amiri',
  display: 'swap',
});


// Arabic sans-serif for body text, excellent for readability.
const notoNaskh = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-naskh',
  display: 'swap',
});

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`news-scope ${inter.variable} ${amiri.variable} ${notoNaskh.variable} font-sans newspaper-bg min-h-screen`}
      dir="rtl"
      lang="ar"
    >
      {/* Skip link for accessibility */}
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:right-4 focus:bg-black focus:text-white focus:px-3 focus:py-2 focus:rounded-md z-[100]">
        تخطِ إلى المحتوى
      </a>

      <main id="content" className="min-h-screen">
        {children}
      </main>
    </div>
  );
}
