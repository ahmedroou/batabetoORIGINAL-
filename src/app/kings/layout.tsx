import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'قاعة الملوك | بطابيطو',
  description: 'تعرف على اللاعبين الذين يتربعون على عرش كل لعبة!',
};

export default function KingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
        {children}
    </div>
  );
}
