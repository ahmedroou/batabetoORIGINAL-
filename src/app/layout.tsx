
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Tajawal } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Crown, Home, Swords, Briefcase, Newspaper, Users } from 'lucide-react';

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

const Navbar = () => (
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
                        <Link href="/news">
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


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${tajawal.variable} font-sans antialiased`}>
        <AuthProvider>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
