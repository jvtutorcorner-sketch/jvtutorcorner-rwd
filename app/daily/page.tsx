import type { Metadata } from 'next';
import { listPublishedDailyPhrases } from '@/lib/dailyPhraseService';
import { pageOpenGraph } from '@/lib/seo';
import ClientDailyPage from './ClientDailyPage';

// 影片由後台 /admin/daily-phrases 管理；寫入時會 revalidatePath('/daily')。
export const revalidate = 300;

const DAILY_META_TITLE = 'AI 每日一句｜每天 10 秒學一句實用英文';
const DAILY_META_DESCRIPTION =
  '生活情境短片，一次學一個馬上用得到的英文句型。想開口說得更自然，就在 JV Tutor Corner 找老師一對一練口說。';

export const metadata: Metadata = {
  title: DAILY_META_TITLE,
  description: DAILY_META_DESCRIPTION,
  alternates: { canonical: '/daily' },
  openGraph: pageOpenGraph({ title: DAILY_META_TITLE, description: DAILY_META_DESCRIPTION, url: '/daily' }),
};

export default async function DailyPage() {
  const items = await listPublishedDailyPhrases();
  return <ClientDailyPage items={items} />;
}
