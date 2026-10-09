import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { getObjectBuffer, getSignedUrlForKey, getStorageBucket } from '@/lib/s3';
import { DAILY_MEDIA_PREFIX } from '@/lib/dailyPhraseService';
import { dailyLocalPath } from '@/lib/dailyPhraseMedia';

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** 本機檔案：支援 Range，Safari 沒有 206 不會播放影片，其他瀏覽器也靠它拖曳進度。 */
function serveLocalFile(req: NextRequest, fullPath: string, contentType: string): Response {
  const size = fs.statSync(fullPath).size;
  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    // `bytes=-N` 是最後 N 個位元組
    const start = range[1] ? Number(range[1]) : Math.max(size - Number(range[2]), 0);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(fullPath, { start, end }));
    return new Response(stream as any, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(fullPath));
  return new Response(stream as any, { headers: { ...baseHeaders, 'Content-Length': String(size) } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const key = `${DAILY_MEDIA_PREFIX}${(await params).path.join('/')}`;
    const contentType = CONTENT_TYPES[path.extname(key).toLowerCase()];
    const localPath = dailyLocalPath(key);
    if (!contentType || !localPath) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

    // 1. 本機開發：沒有物件儲存時 daily-phrases/upload 會寫到 .uploads/daily
    if (fs.existsSync(localPath)) return serveLocalFile(req, localPath, contentType);

    // 2. 物件儲存（S3 或 R2）
    if (!getStorageBucket()) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    // 正式環境一律轉址到簽名網址：影片超過 Lambda 的 6MB 回應上限，Range 也交給儲存端處理。
    if (process.env.NODE_ENV === 'production' || process.env.USE_S3_REDIRECT === 'true') {
      return NextResponse.redirect(await getSignedUrlForKey(key, 3600));
    }

    try {
      const buf = await getObjectBuffer(key);
      return new Response(new Uint8Array(buf), {
        headers: { 'Content-Type': contentType, 'Content-Length': String(buf.length) },
      });
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('[uploads/daily] failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
