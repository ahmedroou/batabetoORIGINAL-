import type { Metadata, Viewport } from 'next';
import React from 'react';
import Script from 'next/script';
import { Inter, Merriweather, Cairo } from 'next/font/google';

// =============================================================
// Society Layout (Enhanced) – gpt5
// -------------------------------------------------------------
// • Polished, RTL-first layout wrapper for /society section
// • Gentle layered background (GPU-friendly, respects reduced motion)
// • Upgraded SEO/OG metadata + JSON-LD
// • Unified font system via CSS variables
// • Small a11y niceties (skip link, selection colors)
// =============================================================

// --- Fonts (shared across Society) ---
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-merriweather',
  display: 'swap',
});

const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

// --- Metadata ---
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'المجتمع | بطابيطو',
    template: '%s | المجتمع – بطابيطو',
  },
  description:
    'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
  keywords: ['بطابيطو', 'المجتمع', 'الهرم الاجتماعي', 'الفرق', 'غرفة العقاب', 'متجر المجتمع'],
  alternates: { canonical: '/society' },
  openGraph: {
    title: 'المجتمع | بطابيطو',
    description:
      'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
    url: '/society',
    siteName: 'بطابيطو',
    type: 'website',
    locale: 'ar',
    images: ['/og/society.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'المجتمع | بطابيطو',
    description:
      'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
    images: ['/og/society.png'],
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b12' },
  ],
  applicationName: 'بطابيطو',
  appleWebApp: {
    title: 'بطابيطو – المجتمع',
    statusBarStyle: 'black-translucent',
    capable: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b12' },
  ],
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// --- Decorative Background (GPU-friendly) ---
function DecorativeBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-tr from-black via-gray-950 to-purple-950/60" />

      {/* Top spotlight */}
      <div
        className="absolute inset-0 opacity-70 will-change-transform"
        style={{
          backgroundImage: 'radial-gradient(ellipse at top, rgba(124,58,237,0.15), transparent 55%)',
        }}
      />

      {/* Subtle center glow */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(1000px 500px at 50% 0%, rgba(255,255,255,0.06), transparent 60%)',
        }}
      />

      {/* Grid veil (masked) */}
      <div
        className="absolute inset-0 opacity-20 [mask-image:radial-gradient(1000px_400px_at_50%_0%,black,transparent_70%)]"
        style={{
          backgroundImage:
            'linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Noise (very light) */}
      <div
        className="absolute inset-0 opacity-10 mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(1px_1px_at_10%_10%,rgba(255,255,255,0.3),transparent),radial-gradient(1px_1px_at_30%_30%,rgba(255,255,255,0.2),transparent),radial-gradient(1px_1px_at_70%_60%,rgba(255,255,255,0.25),transparent)'
        }}
      />

      {/* Motion-aware constellation shimmer */}
      <div className="absolute inset-0 pointer-events-none motion-reduce:hidden">
        <div className="absolute inset-0 animate-[pulse_8s_ease-in-out_infinite] opacity-30" />
      </div>
    </div>
  );
}

// --- Layout Wrapper ---
export default function SocietyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={[
        inter.variable,
        merriweather.variable,
        cairo.variable,
        'font-sans antialiased',
      ].join(' ')}
      lang="ar"
    >
      <DecorativeBackground />

      {/* Skip link for a11y */}
      <a
        href="#society-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:right-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-purple-700 focus:text-white"
      >
        تخطِّ إلى المحتوى
      </a>

      <main
        id="society-content"
        dir="rtl"
        className="relative min-h-dvh selection:bg-purple-600/20 selection:text-purple-100"
      >
        {children}
      </main>

      {/* JSON-LD: CollectionPage-like for the Society hub */}
      <Script id="society-jsonld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'المجتمع | بطابيطو',
          url: `${SITE_URL}/society`,
          description:
            'هرم القوة والطبقات الاجتماعية في بطابيطو – شارك في الفرق، غرفة العقاب، والمتجر.',
          inLanguage: 'ar',
          isPartOf: {
            '@type': 'WebSite',
            name: 'بطابيطو',
            url: SITE_URL,
          },
        })}
      </Script>
    </div>
  );
}
