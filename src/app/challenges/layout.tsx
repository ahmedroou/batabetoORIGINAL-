
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ساحة التحديات | بطابيطو',
  description: 'شارك في التحديات والبطولات للفوز بجوائز قيمة!',
};

export default function ChallengesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
