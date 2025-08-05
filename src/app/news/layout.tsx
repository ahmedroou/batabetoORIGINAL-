
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'جريدة بطابيطو',
  description: 'آخر الأخبار والمقالات من عالم بطابيطو.',
};

export default function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#fdfdf8]">
        {children}
    </div>
  );
}
