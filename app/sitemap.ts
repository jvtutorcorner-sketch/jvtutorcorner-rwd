import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { listPublicCourseIds } from '@/app/courses/_data';
import { listPublicTeacherIds } from '@/app/teachers/_data';

// 每小時重新產生一次，避免每個爬蟲請求都 Scan DynamoDB
export const revalidate = 3600;

const STATIC_ROUTES = ['', '/about', '/pricing', '/terms', '/testimony', '/products', '/teachers', '/courses'];

function toLastModified(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : 0.7,
  }));

  // 動態詳情頁：資料來源與 /courses、/teachers 相同；任何一邊失敗都只退回靜態清單
  const [courses, teachers] = await Promise.all([
    listPublicCourseIds().catch((e) => {
      console.error('[sitemap] course list failed, static routes only:', e?.message || e);
      return [];
    }),
    listPublicTeacherIds().catch((e) => {
      console.error('[sitemap] teacher list failed, static routes only:', e?.message || e);
      return [];
    }),
  ]);

  for (const c of courses) {
    entries.push({
      url: `${SITE_URL}/courses/${encodeURIComponent(c.id)}`,
      lastModified: toLastModified(c.updatedAt) ?? now,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }
  for (const t of teachers) {
    entries.push({
      url: `${SITE_URL}/teachers/${encodeURIComponent(t.id)}`,
      lastModified: toLastModified(t.updatedAt) ?? now,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  return entries;
}
