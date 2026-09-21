// app/api/carousel/presign/route.ts
import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { getPresignedPutUrl, getStorageBucket, isObjectStorageConfigured } from '@/lib/s3';

// 先前每次請求都會重新解析 .env.local 並覆寫 process.env（開發期的權宜之計，卻跟著部署到正式環境）。
// Next.js 啟動時本來就會載入 .env.local，已移除。

// 先前完全沒有 auth：任何人都能取得 S3 上傳用的預簽網址。
async function handlePresign(request: AuthedRequest) {
  console.log('[Carousel Presign API] Request received');

  try {
    const body = await request.json();
    const { fileName, mimeType, fileSize } = body;

    console.log('[Carousel Presign API] Request body:', {
      fileName,
      mimeType,
      fileSize
    });

    if (!fileName || !mimeType) {
      console.error('[Carousel Presign API] Missing required fields');
      return NextResponse.json({ error: 'Missing fileName or mimeType' }, { status: 400 });
    }

    // Validate file size (20MB limit)
    if (fileSize && fileSize > 20 * 1024 * 1024) {
      console.error('[Carousel Presign API] File too large:', fileSize);
      return NextResponse.json({ error: 'File size must be less than 20MB' }, { status: 400 });
    }

    const isProduction = process.env.NODE_ENV === 'production';

    // 物件儲存（S3 或 R2）是否可用，統一由 lib/s3.ts 判斷。
    if (!isObjectStorageConfigured()) {
      console.log('[Carousel Presign API] Object storage not configured, returning error to trigger fallback');
      return NextResponse.json({
        error: 'S3 not configured, use upload API instead'
      }, { status: 400 });
    }

    // In development, use server-side upload (presign won't work due to CORS)
    if (!isProduction) {
      console.log('[Carousel Presign API] Development mode: returning error to use server-side upload instead');
      return NextResponse.json({
        error: 'Development: use server-side upload instead'
      }, { status: 400 });
    }

    // Generate unique key for carousel images
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const fileExtension = fileName.split('.').pop() || 'jpg';
    const key = `carousel/${timestamp}-${randomId}.${fileExtension}`;

    console.log('[Carousel Presign API] Generated key:', key, {
      bucket: getStorageBucket(),
      customEndpoint: !!process.env.STORAGE_S3_ENDPOINT,
    });

    try {
      const presignedData = await getPresignedPutUrl(key, mimeType);
      console.log('[Carousel Presign API] getPresignedPutUrl returned successfully:', {
        hasUrl: !!presignedData.url,
        hasKey: !!presignedData.key,
        hasPublicUrl: !!presignedData.publicUrl,
        urlLength: presignedData.url?.length,
        publicUrl: presignedData.publicUrl
      });

      return NextResponse.json({
        url: presignedData.url,
        key: presignedData.key,
        publicUrl: presignedData.publicUrl,
        bucket: getStorageBucket()
      });
    } catch (s3Error) {
      console.error('[Carousel Presign API] getPresignedPutUrl failed:', s3Error);
      throw s3Error; // Re-throw to be caught by outer catch
    }

  } catch (error) {
    console.error('[Carousel Presign API] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export const POST = withAdmin(handlePresign);
