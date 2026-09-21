import type { Metadata } from 'next';
import { pageOpenGraph } from '@/lib/seo';

// page.tsx 是 client component，metadata 由這個 server layout 提供。
const TITLE = '服務條款';
const DESCRIPTION = 'JV Tutor Corner 服務條款：帳號使用、點數與付款、課程預約與退款等規範。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/terms' },
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: '/terms' }),
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
