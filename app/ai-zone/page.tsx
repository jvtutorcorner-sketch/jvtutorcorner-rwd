import type { Metadata } from 'next';
import { listPublishedAiZoneItems } from '@/lib/aiZoneContentService';
import { pageOpenGraph } from '@/lib/seo';
import ClientAiZonePage from './ClientAiZonePage';

// 影片由後台 /ai-zone/manage 管理；寫入時會 revalidatePath('/ai-zone')。
export const revalidate = 300;

const META_TITLE = 'AI 專區｜用短片與單元學會一個實用情境';
const META_DESCRIPTION =
  'AI 生成的情境短片與課程單元，用最短的時間學會一件事。想開口說得更自然，就在 JV Tutor Corner 找老師一對一練口說。';

export const metadata: Metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  alternates: { canonical: '/ai-zone' },
  openGraph: pageOpenGraph({ title: META_TITLE, description: META_DESCRIPTION, url: '/ai-zone' }),
};

export default async function AiZonePage() {
  const items = await listPublishedAiZoneItems();
  return <ClientAiZonePage items={items} />;
}
