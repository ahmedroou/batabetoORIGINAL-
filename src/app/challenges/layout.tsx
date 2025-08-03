
import type { Metadata } from 'next';
import { Inter, Changa } from 'next/font/google';


export const metadata: Metadata = {
  title: 'ساحة التحديات | بطابيطو',
  description: 'شارك في التحديات والبطولات للفوز بجوائز قيمة!',
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const changa = Changa({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-changa',
});


export default function ChallengesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${inter.variable} ${changa.variable} font-sans`}>
        {children}
    </div>
  );
}
