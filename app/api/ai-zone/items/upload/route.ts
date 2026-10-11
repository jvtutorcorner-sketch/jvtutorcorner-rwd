import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { AI_ZONE_POSTER_MAX_BYTES, AI_ZONE_VIDEO_MAX_BYTES, newAiZoneMediaKey } from '@/lib/aiZoneContentService';
import { saveAiZoneMedia } from '@/lib/aiZoneMedia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 伺服端上傳：本機開發，以及直傳不可用時的後備。正式環境的 request body 上限約 6MB，
// 大檔要走 /api/ai-zone/items/presign 直傳。
export const POST = withAdmin(async (request: AuthedRequest) => {
  try {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });

    const key = newAiZoneMediaKey(file.type);
    if (!key) return NextResponse.json({ ok: false, error: '只接受 mp4 影片與 jpg / png / webp 圖片' }, { status: 400 });

    const maxBytes = file.type === 'video/mp4' ? AI_ZONE_VIDEO_MAX_BYTES : AI_ZONE_POSTER_MAX_BYTES;
    if (file.size <= 0 || file.size > maxBytes) {
      return NextResponse.json(
        { ok: false, error: `檔案大小需在 ${Math.round(maxBytes / 1024 / 1024)}MB 以內` },
        { status: 400 }
      );
    }

    await saveAiZoneMedia(key, Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json({ ok: true, key });
  } catch (err) {
    console.error('[ai-zone/upload] failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
