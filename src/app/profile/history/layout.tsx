import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'سجل المباريات',
  description: 'اطلع على تاريخ مبارياتك ونتائجها.',
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
