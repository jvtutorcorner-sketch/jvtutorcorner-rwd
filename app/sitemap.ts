import type { MetadataRoute } from 'next';

/** 與 lib/email/verificationService.ts 的 PRODUCTION_BASE_URL 一致的正式網域。 */
const BASE_URL = 'https://www.jvtutorcorner.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/about', '/pricing', '/terms', '/testimony', '/products', '/teachers', '/courses'];

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : 0.7,
  }));
}
