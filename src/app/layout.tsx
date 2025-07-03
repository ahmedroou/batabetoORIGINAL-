import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Cairo } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  title: 'بطابيطو: لعبة تدمير الذات',
  description: 'لعبة جماعية ممتعة لاكتشاف أسرار أصدقائك!',
};

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-cairo',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
