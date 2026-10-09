import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getPresignedPutUrl, isObjectStorageConfigured } from '@/lib/s3';
import { DAILY_POSTER_MAX_BYTES, DAILY_VIDEO_MAX_BYTES, newDailyMediaKey } from '@/lib/dailyPhraseService';

export const dynamic = 'force-dynamic';

/**
 * 瀏覽器直傳用的預簽網址。回 409 代表「這個環境不走直傳」，前端改打 /api/daily-phrases/upload：
 * 沒有物件儲存時，或開發環境（localhost 對 bucket 的 PUT 過不了 CORS，同 carousel 的分流）。
 */
export const POST = withAdmin(async (request: AuthedRequest) => {
  try {
    const { mimeType, fileSize } = await request.json();
    const key = typeof mimeType === 'string' ? newDailyMediaKey(mimeType) : null;
    if (!key) return NextResponse.json({ ok: false, error: '只接受 mp4 影片與 jpg / png / webp 圖片' }, { status: 400 });

    const maxBytes = mimeType === 'video/mp4' ? DAILY_VIDEO_MAX_BYTES : DAILY_POSTER_MAX_BYTES;
    if (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > maxBytes) {
      return NextResponse.json(
        { ok: false, error: `檔案大小需在 ${Math.round(maxBytes / 1024 / 1024)}MB 以內` },
        { status: 400 }
      );
    }

    if (!isObjectStorageConfigured() || process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ ok: false, fallback: true, error: 'Use server-side upload' }, { status: 409 });
    }

    const { url } = await getPresignedPutUrl(key, mimeType);
    return NextResponse.json({ ok: true, url, key });
  } catch (err) {
    console.error('[daily-phrases/presign] failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
