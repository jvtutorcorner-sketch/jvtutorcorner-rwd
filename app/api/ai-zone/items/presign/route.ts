import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getPresignedPutUrl } from '@/lib/s3';
import { aiZoneStorageConfigured } from '@/lib/aiZoneMedia';
import { AI_ZONE_POSTER_MAX_BYTES, AI_ZONE_VIDEO_MAX_BYTES, newAiZoneMediaKey } from '@/lib/aiZoneContentService';

export const dynamic = 'force-dynamic';

/**
 * 瀏覽器直傳用的預簽網址。回 409 代表「這個環境不走直傳」，前端改打 /api/ai-zone/items/upload：
 * 沒有物件儲存時，或開發環境（localhost 對 bucket 的 PUT 過不了 CORS，同 carousel 的分流）。
 */
export const POST = withAdmin(async (request: AuthedRequest) => {
  try {
    const { mimeType, fileSize } = await request.json();
    const key = typeof mimeType === 'string' ? newAiZoneMediaKey(mimeType) : null;
    if (!key) return NextResponse.json({ ok: false, error: '只接受 mp4 影片與 jpg / png / webp 圖片' }, { status: 400 });

    const maxBytes = mimeType === 'video/mp4' ? AI_ZONE_VIDEO_MAX_BYTES : AI_ZONE_POSTER_MAX_BYTES;
    if (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > maxBytes) {
      return NextResponse.json(
        { ok: false, error: `檔案大小需在 ${Math.round(maxBytes / 1024 / 1024)}MB 以內` },
        { status: 400 }
      );
    }

    if (!aiZoneStorageConfigured() || process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ ok: false, fallback: true, error: 'Use server-side upload' }, { status: 409 });
    }

    const { url } = await getPresignedPutUrl(key, mimeType);
    return NextResponse.json({ ok: true, url, key });
  } catch (err) {
    console.error('[ai-zone/presign] failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
