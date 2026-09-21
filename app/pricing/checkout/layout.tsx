import type { Metadata } from 'next';
import { pageOpenGraph } from '@/lib/seo';

// 避免繼承 app/pricing/layout.tsx 的 canonical / og:url（結帳頁不應被索引）。
export const metadata: Metadata = {
  title: '結帳',
  alternates: { canonical: '/pricing/checkout' },
  openGraph: pageOpenGraph({ title: '結帳', url: '/pricing/checkout' }),
  robots: { index: false, follow: false },
};

export default function PricingCheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
