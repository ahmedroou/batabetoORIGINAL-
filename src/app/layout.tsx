import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Noto_Kufi_Arabic, Changa } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  title: 'بطابيطو: لعبة تدمير الذات',
  description: 'لعبة جماعية ممتعة لاكتشاف أسرار أصدقائك!',
};

const noto_kufi = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-noto-kufi',
});

const changa = Changa({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-changa',
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${noto_kufi.variable} ${changa.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
