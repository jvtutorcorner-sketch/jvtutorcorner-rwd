import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { getSignedUrlForKey, getObjectBuffer, getStorageBucket } from '@/lib/s3';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const filePath = resolvedParams.path.join('/');
    // Use absolute path to avoid CWD ambiguity
    const uploadsDir = path.resolve(process.cwd(), '.uploads', 'carousel');
    const fullPath = path.resolve(uploadsDir, filePath);

    // 先前只在「讀本機檔」時做了不含路徑分隔字元的 startsWith 檢查，而 S3 回源後的
    // 寫入快取（已移除）完全沒檢查——`../` 可以寫到 .uploads/carousel 之外。
    if (fullPath !== uploadsDir && !fullPath.startsWith(uploadsDir + path.sep)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Determine content type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';

    // 1. 本機開發：沒有物件儲存時 carousel/upload 會寫到 .uploads/carousel
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      // Convert Node stream to Web Stream for Next.js 13+ response
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
    const s3Key = `carousel/${filePath}`;

    if (!getStorageBucket()) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 500 });
    }

    // PRODUCTION OPTIMIZATION: Redirect to S3 to bypass 6MB payload limits on Lambda
    // This is the most robust way to serve large images (>5MB) in Amplify/Vercel
    if (process.env.NODE_ENV === 'production' || process.env.USE_S3_REDIRECT === 'true') {
      try {
        const signedUrl = await getSignedUrlForKey(s3Key, 3600);
        return NextResponse.redirect(signedUrl);
      } catch (redirectErr) {
        console.warn('[Carousel Proxy GET] ! Redirect failed, falling back to proxy:', redirectErr);
        // Fall through to proxying if redirect generation fails for some reason
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
      console.warn('[Carousel Proxy GET] ✗ Storage fetch failed:', s3Error.message);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('[Carousel Proxy GET] Critical error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
