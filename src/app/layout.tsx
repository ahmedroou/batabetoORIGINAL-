
"use client"; 

import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Cairo } from 'next/font/google';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Crown, Home, Swords, Briefcase, Newspaper, Users, Menu, MessageSquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-cairo',
});

// This component remains a Client Component and can use hooks.
const NavbarClient = () => {
    const { newArticlesAvailable, newChallengeAvailable } = useAuth();
    
    const navLinks = [
        { href: "/", label: "الرئيسية", icon: Home, notification: false },
        { href: "/news", label: "الجريدة", icon: Newspaper, notification: newArticlesAvailable },
        { href: "/society", label: "المجتمع", icon: Users, notification: false },
        { href: "/challenges", label: "التحديات", icon: Swords, notification: newChallengeAvailable },
        { href: "/kings", label: "قاعة الملوك", icon: Crown, notification: false }
    ];

    return (
        <nav className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Link href="/" passHref>
                            <span className="font-bold text-xl text-primary cursor-pointer">بطابيطو</span>
                        </Link>
                    </div>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-2">
                        {navLinks.map(link => (
                             <Button key={link.href} variant="ghost" asChild>
                                <Link href={link.href} className="relative">
                                    {link.notification && (
                                        <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                        </span>
                                    )}
                                    <link.icon className="ml-2 h-4 w-4" />
                                    {link.label}
                                </Link>
                            </Button>
                        ))}
                    </div>

                    {/* Mobile Navigation */}
                    <div className="md:hidden">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <Menu />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                {navLinks.map(link => (
                                     <DropdownMenuItem key={link.href} asChild>
                                        <Link href={link.href} className="flex items-center justify-between w-full">
                                            <span>{link.label}</span>
                                            {link.notification && <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>}
                                        </Link>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </nav>
    );
};


// This new component wraps the part of the layout that needs client-side context.
function LayoutClient({ children }: { children: React.ReactNode }) {
    const { userProfile } = useAuth();
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
      <body className={`${cairo.variable} font-sans antialiased`}>
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
