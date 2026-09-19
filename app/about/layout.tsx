import type { Metadata } from 'next';
import { pageOpenGraph } from '@/lib/seo';

// page.tsx 是 client component，metadata 由這個 server layout 提供。
const TITLE = '關於我們';
const DESCRIPTION = '認識 JV Tutor Corner：結合視訊、互動白板與專業師資的線上一對一家教平台。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: '/about' }),
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
