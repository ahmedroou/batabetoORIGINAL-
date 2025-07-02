import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Cairo } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  title: 'غوص عميق: لعبة الصداقة',
  description: 'لعبة جماعية من الأسئلة الشخصية لمعرفة مدى معرفتك بأصدقائك.',
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
      <body className={`${cairo.variable} font-body antialiased`}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
