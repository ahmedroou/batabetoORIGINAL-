
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'المجتمع | بطابيطو',
  description: 'اكتشف هرم القوة في عالم بطابيطو، حيث تتجلى الطبقات الاجتماعية!',
};

export default function SocietyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
