
import type { Metadata } from 'next';
import { Changa } from 'next/font/google';


export const metadata: Metadata = {
  title: 'الفرق | بطابيطو',
  description: 'انضم إلى فريق أو قم بإنشاء فريقك الخاص وتنافس على الصدارة!',
};

const changa = Changa({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-changa',
});


export default function ClansLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${changa.variable} font-sans`}>
        {children}
    </div>
  );
}
