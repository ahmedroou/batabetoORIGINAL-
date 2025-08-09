
"use client"; // Add 'use client' to make the layout a client component wrapper

import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Tajawal } from 'next/font/google';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Crown, Home, Swords, Briefcase, Newspaper, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';


const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-tajawal',
});

// This component remains a Client Component and can use hooks.
const NavbarClient = () => {
    const { newArticlesAvailable, newChallengeAvailable } = useAuth();
    return (
        <nav className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Link href="/" passHref>
                            <span className="font-bold text-xl text-primary cursor-pointer">بطابيطو</span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-2">
                         <Button variant="ghost" asChild>
                            <Link href="/">
                                <Home className="ml-2 h-4 w-4" />
                                الرئيسية
                            </Link>
                        </Button>
                         <Button variant="ghost" asChild>
                            <Link href="/news" className="relative">
                                {newArticlesAvailable && (
                                    <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </span>
                                )}
                                <Newspaper className="ml-2 h-4 w-4" />
                                الجريدة
                            </Link>
                        </Button>
                         <Button variant="ghost" asChild>
                            <Link href="/society">
                                <Users className="ml-2 h-4 w-4" />
                                المجتمع
                            </Link>
                        </Button>
                          <Button variant="ghost" asChild>
                            <Link href="/challenges" className="relative">
                                 {newChallengeAvailable && (
                                    <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </span>
                                )}
                                <Swords className="ml-2 h-4 w-4" />
                                التحديات
                            </Link>
                        </Button>
                         <Button variant="ghost" asChild>
                            <Link href="/kings">
                                <Crown className="ml-2 h-4 w-4" />
                                قاعة الملوك
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </nav>
    );
};


// This new component wraps the part of the layout that needs client-side context.
function LayoutClient({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative flex min-h-screen flex-col">
            <NavbarClient />
            <main className="flex-1">{children}</main>
        </div>
    );
}


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
          <LayoutClient>
            {children}
          </LayoutClient>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
