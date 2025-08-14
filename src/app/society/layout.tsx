import type { Metadata } from 'next';
import { Inter, Merriweather, Cairo } from 'next/font/google';
import React from 'react';

// --- Fonts (unified across the Society section) ---
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

// Arabic-friendly primary UI font
const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

// --- Metadata for the entire Society section ---
export const metadata: Metadata = {
  title: {
    default: 'المجتمع | بطابيطو',
    template: '%s | المجتمع – بطابيطو',
  },
  description: 'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
  keywords: ['بطابيطو', 'المجتمع', 'الهرم الاجتماعي', 'الفرق', 'غرفة العقاب', 'متجر المجتمع'],
  alternates: {
    canonical: '/society',
  },
  openGraph: {
    title: 'المجتمع | بطابيطو',
    description:
      'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
    url: '/society',
    siteName: 'بطابيطو',
    type: 'website',
    locale: 'ar',
    images: ['/og/society.png'], // ضع صورة OG إن كانت متوفرة
  },
  twitter: {
    card: 'summary_large_image',
    title: 'المجتمع | بطابيطو',
    description:
      'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية! وشارك في الفرق، غرفة العقاب، والمتجر.',
    images: ['/og/society.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b12' },
  ],
};

// --- Layout Wrapper ---
export default function SocietyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={[
        inter.variable,
        merriweather.variable,
        cairo.variable,
        'font-sans antialiased',
      ].join(' ')}
    >
      {/* Background for all /society pages (subtle, non-intrusive) */}
      <div className="fixed inset-0 -z-10">
        {/* Base dark gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black via-gray-950 to-purple-950/60" />
        {/* Soft spotlight from the top */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at top, rgba(124,58,237,0.15), transparent 55%)',
          }}
        />
        {/* Gentle center glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(1000px 500px at 50% 0%, rgba(255,255,255,0.06), transparent 60%)',
          }}
        />
      </div>

      {/* Use RTL here to enforce right-to-left flow for this section */}
      <main dir="rtl" className="relative min-h-dvh">
        {children}
      </main>
    </div>
  );
}
