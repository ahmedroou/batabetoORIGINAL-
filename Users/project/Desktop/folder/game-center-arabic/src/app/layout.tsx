
"use client"; // Add 'use client' to make the layout a client component wrapper

import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Tajawal } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';
import { MainLayout } from '@/components/layout/MainLayout';


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
      {/* The <head> part can be static, so we don't need a metadata export here anymore */}
       <head>
          <title>بطابيطو: لعبة تدمير الذات</title>
          <meta name="description" content="لعبة جماعية ممتعة لاكتشاف أسرار أصدقائك!"/>
       </head>
      <body className={`${tajawal.variable} font-sans antialiased`}>
        <AuthProvider>
          <MainLayout>
            {children}
          </MainLayout>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
