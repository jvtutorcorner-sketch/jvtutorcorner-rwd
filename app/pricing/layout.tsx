import type { Metadata } from 'next';
import { pageOpenGraph } from '@/lib/seo';

// page.tsx 是 client component，metadata 由這個 server layout 提供。
const TITLE = '方案與點數價格';
const DESCRIPTION = '查看 JV Tutor Corner 的訂閱方案、點數購買與優惠組合，選擇最適合你的線上家教學習方案。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/pricing' },
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: '/pricing' }),
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
