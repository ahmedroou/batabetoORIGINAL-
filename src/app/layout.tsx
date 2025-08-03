import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Tajawal } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  title: 'بطابيطو: لعبة تدمير الذات',
  description: 'لعبة جماعية ممتعة لاكتشاف أسرار أصدقائك!',
};

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-tajawal',
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${tajawal.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
