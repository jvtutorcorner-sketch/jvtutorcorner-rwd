import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { getSignedUrlForKey, getObjectBuffer, getStorageBucket } from '@/lib/s3';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const filePath = resolvedParams.path.join('/');
    const uploadsDir = path.resolve(process.cwd(), '.uploads', 'avatar');
    const fullPath = path.resolve(uploadsDir, filePath);

    // Reject anything that escapes the uploads directory via ../ segments.
    if (fullPath !== uploadsDir && !fullPath.startsWith(uploadsDir + path.sep)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';

    // 1. 本機開發：沒有物件儲存時 avatar/upload 會寫到 .uploads/avatar
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      const webStream = Readable.toWeb(fs.createReadStream(fullPath));

      return new Response(webStream as any, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'public, max-age=31536000',
          'X-Proxy-Cache': 'HIT',
        },
      });
    }

    // 2. 物件儲存（S3 或 R2，由 lib/s3.ts 依環境變數決定）。
    //    先前這裡自己 new S3Client，切換到 R2 時會繼續打 AWS。
    const s3Key = `avatar/${filePath}`;

    if (!getStorageBucket()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Redirect in production to bypass Lambda payload limits.
    if (process.env.NODE_ENV === 'production' || process.env.USE_S3_REDIRECT === 'true') {
      try {
        const signedUrl = await getSignedUrlForKey(s3Key, 3600);
        return NextResponse.redirect(signedUrl);
      } catch (redirectErr) {
        console.warn('[Avatar Proxy GET] ! Redirect failed, falling back to proxy:', redirectErr);
      }
    }

    try {
      // 先前這裡還會把物件寫回 .uploads 當快取。serverless 的檔案系統是唯讀、各實例也不共享，
      // 那份快取不是寫失敗就是只存在單一實例；在本機則會無上限地累積。直接回傳即可。
      const fileBuf = await getObjectBuffer(s3Key);

      return new Response(new Uint8Array(fileBuf), {
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileBuf.length.toString(),
          'Cache-Control': 'public, max-age=31536000',
          'X-Proxy-Cache': 'MISS',
        },
      });
    } catch (s3Error: any) {
      console.warn('[Avatar Proxy GET] ✗ Storage fetch failed:', s3Error.message);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('[Avatar Proxy GET] Critical error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
