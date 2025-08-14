"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { Home, Users, Crown, Swords, Newspaper, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/society', label: 'المجتمع', icon: Users },
  { href: '/kings', label: 'الملوك', icon: Crown },
  { href: '/challenges', label: 'البطولات', icon: Swords },
  { href: '/news', label: 'الجريدة', icon: Newspaper },
  { href: '/store', label: 'المتجر', icon: Store },
];

export default function GlobalNavBar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    const previous = scrollY.getPrevious();
    if (latest > previous && latest > 150) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  });

  // Do not render this bar on auth pages or game pages
  if (!user || pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/game/')) {
    return null;
  }

  return (
    <motion.nav
      variants={{
        visible: { y: 0 },
        hidden: { y: '-100%' },
      }}
      animate={hidden ? 'hidden' : 'visible'}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
      className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60"
      dir="rtl"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-4 py-2">
        <div className="flex items-center gap-1 md:gap-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link key={href} href={href} legacyBehavior>
                <a
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-xs md:flex-row md:gap-2 md:px-3 md:py-2 md:text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
                  )}
                >
                  <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="md:inline">{label}</span>
                </a>
              </Link>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
