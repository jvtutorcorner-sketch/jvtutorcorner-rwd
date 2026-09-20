// lib/seo.ts
/**
 * 公開頁 SEO 共用設定：正式網域、站名、描述截斷。
 * app/layout.tsx 的 metadataBase、各頁 canonical、app/robots.ts、app/sitemap.ts 皆由此取值。
 */

/** 正式網域（與 lib/email/verificationService.ts 的 PRODUCTION_BASE_URL 一致），可用 NEXT_PUBLIC_BASE_URL 覆寫。 */
export const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.jvtutorcorner.com').replace(/\/+$/, '');

export const SITE_NAME = 'JV Tutor Corner';

export const DEFAULT_TITLE = 'JV Tutor Corner｜線上一對一家教';

export const DEFAULT_DESCRIPTION =
  'JV Tutor Corner 線上一對一家教平台：真人老師視訊授課、互動白板與課程錄影，語言、學科與檢定課程任你挑選。';

/** 將任意文字壓成單行並截斷成 meta description 長度（預設 160 字元）。 */
export function toMetaDescription(text: unknown, maxLength = 160): string | undefined {
  if (typeof text !== 'string') return undefined;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return undefined;
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1).trimEnd()}…` : flat;
}

/**
 * 子頁的 openGraph 會整個覆蓋 root layout 的 openGraph（Next.js 淺層合併），
 * 用這個 helper 保留 siteName / locale / type。
 */
export function pageOpenGraph(opts: { title: string; description?: string; url: string; type?: 'website' | 'article' | 'profile' }) {
  return {
    type: opts.type ?? 'website',
    siteName: SITE_NAME,
    locale: 'zh_TW',
    title: opts.title,
    ...(opts.description ? { description: opts.description } : {}),
    url: opts.url,
  };
}
