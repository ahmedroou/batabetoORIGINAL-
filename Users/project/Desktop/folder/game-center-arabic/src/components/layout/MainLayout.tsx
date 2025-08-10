"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Crown, Home, Swords, Newspaper, Users, ShieldCheck, Store, Mail as MailIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AnimatePresence, motion } from 'framer-motion';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { usePathname } from 'next/navigation';

const NavbarClient = () => {
    const { userProfile, newArticlesAvailable, newChallengeAvailable } = useAuth();
    const pathname = usePathname();

    const navLinks = [
        { href: "/", icon: Home, label: "الرئيسية" },
        { href: "/news", icon: Newspaper, label: "الجريدة", notification: newArticlesAvailable },
        { href: "/society", icon: Users, label: "المجتمع" },
        { href: "/challenges", icon: Swords, label: "التحديات", notification: newChallengeAvailable },
        { href: "/kings", icon: Crown, label: "قاعة الملوك" },
    ];
    
    return (
        <header className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Link href="/" passHref>
                            <span className="font-bold text-xl text-primary cursor-pointer">بطابيطو</span>
                        </Link>
                    </div>
                     <nav className="hidden md:flex items-center gap-1 bg-muted p-1 rounded-full">
                        {navLinks.map(link => (
                            <Button key={link.href} variant={pathname === link.href ? "secondary" : "ghost"} asChild className="rounded-full">
                                <Link href={link.href} className="relative">
                                    {link.notification && (
                                        <span className="absolute top-1 right-1 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                    )}
                                    <link.icon className="ml-2 h-4 w-4" />
                                    {link.label}
                                </Link>
                            </Button>
                        ))}
                    </nav>

                    <div className="flex items-center gap-2">
                        {userProfile?.isAdmin && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" asChild>
                                            <Link href="/admin">
                                                <ShieldCheck className="h-6 w-6 text-destructive" />
                                            </Link>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>لوحة تحكم الأدمن</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                     <Button variant="ghost" size="icon" asChild>
                                        <Link href="/store">
                                            <Store className="h-6 w-6 text-primary" />
                                        </Link>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>المتجر</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            </div>
        </header>
    );
};


export function MainLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    
    return (
        <div className="relative flex min-h-screen flex-col">
            <NavbarClient />
            <AnimatePresence mode="wait">
                 <motion.main 
                    key={pathname}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="flex-1"
                >
                    {children}
                </motion.main>
            </AnimatePresence>
        </div>
    );
}
