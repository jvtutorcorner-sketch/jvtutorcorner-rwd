import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { DAILY_POSTER_MAX_BYTES, DAILY_VIDEO_MAX_BYTES, newDailyMediaKey } from '@/lib/dailyPhraseService';
import { saveDailyMedia } from '@/lib/dailyPhraseMedia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 伺服端上傳：本機開發，以及直傳不可用時的後備。正式環境的 request body 上限約 6MB，
// 大檔要走 /api/daily-phrases/presign 直傳。
export const POST = withAdmin(async (request: AuthedRequest) => {
  try {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

    const key = newDailyMediaKey(file.type);
    if (!key) return NextResponse.json({ ok: false, error: '只接受 mp4 影片與 jpg / png / webp 圖片' }, { status: 400 });

    const maxBytes = file.type === 'video/mp4' ? DAILY_VIDEO_MAX_BYTES : DAILY_POSTER_MAX_BYTES;
    if (file.size <= 0 || file.size > maxBytes) {
      return NextResponse.json(
        { ok: false, error: `檔案大小需在 ${Math.round(maxBytes / 1024 / 1024)}MB 以內` },
        { status: 400 }
      );
    }

    await saveDailyMedia(key, Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json({ ok: true, key });
  } catch (err) {
    console.error('[daily-phrases/upload] failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
