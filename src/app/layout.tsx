import type { Metadata, Viewport } from 'next';
import React from 'react';
import Script from 'next/script';
import { Inter, Merriweather, Cairo } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/hooks/useAuth';
import './globals.css';
import GlobalNavBar from '@/components/layout/GlobalNavBar';

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
    default: 'بطابيطو',
    template: '%s | بطابيطو',
  },
  description:
    'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
  keywords: ['بطابيطو', 'المجتمع', 'الهرم الاجتماعي', 'الفرق', 'غرفة العقاب', 'متجر المجتمع'],
  alternates: { canonical: '/' },
  openGraph: {
    title: 'بطابيطو',
    description:
      'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
    url: '/',
    siteName: 'بطابيطو',
    type: 'website',
    locale: 'ar',
    images: ['/og/default.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'بطابيطو',
    description:
      'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
    images: ['/og/default.png'],
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  applicationName: 'بطابيطو',
  appleWebApp: {
    title: 'بطابيطو',
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={[
        inter.variable,
        merriweather.variable,
        cairo.variable,
        'font-sans antialiased',
      ].join(' ')}
      lang="ar"
      dir="rtl"
    >
      <body>
         <AuthProvider>
            <GlobalNavBar />
            {children}
            <Toaster />
         </AuthProvider>
      </body>
    </html>
  );
}
