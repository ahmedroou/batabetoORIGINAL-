
import type { Metadata } from 'next';
import { Inter, Merriweather } from 'next/font/google';


export const metadata: Metadata = {
  title: 'صحيفة اللعبة | بطابيطو',
  description: 'آخر الأخبار والتحديثات من عالم بطابيطو.',
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-merriweather',
  display: 'swap',
});


export default function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.variable} ${merriweather.variable} font-sans`}>
        {children}
    </div>
  );
}
