// app/api/carousel/upload/route.ts
import { NextResponse } from 'next/server';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import { uploadToS3, isObjectStorageConfigured } from '@/lib/s3';
import fs from 'fs';
import path from 'path';

// Increase body size limit for image uploads
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 先前每次請求都會重新解析 .env.local 並覆寫 process.env（開發期的權宜之計，卻跟著部署到正式環境）。
// Next.js 啟動時本來就會載入 .env.local，已移除。

// 先前完全沒有 auth：任何人都能上傳檔案到輪播用的 S3 bucket。
async function handleUpload(request: AuthedRequest) {
  console.log('[Carousel Upload API] Request received');

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const alt = formData.get('alt') as string || '';

    console.log('[Carousel Upload API] Form data received:', {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      alt: alt
    });

    if (!file) {
      console.error('[Carousel Upload API] No file provided');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('[Carousel Upload API] Invalid file type:', file.type);
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (20MB limit)
    if (file.size > 20 * 1024 * 1024) {
      console.error('[Carousel Upload API] File too large:', {
        size: file.size,
        maxSize: 20 * 1024 * 1024
      });
      return NextResponse.json({ error: 'File size must be less than 20MB' }, { status: 400 });
    }

    console.log('[Carousel Upload API] File validation passed, converting to buffer...');

    // Convert file to buffer for processing
    const buffer = Buffer.from(await file.arrayBuffer());

    console.log('[Carousel Upload API] Buffer created, size:', buffer.length);

    // 物件儲存（S3 或 R2）是否可用，統一由 lib/s3.ts 判斷。
    const useS3 = isObjectStorageConfigured();

    if (!useS3) {
      console.log('[Carousel Upload API] Object storage not configured, using local storage');

      // Generate unique key for local storage
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const key = `carousel/${timestamp}-${randomId}.${fileExtension}`;

      // Save to local .uploads directory
      const uploadsDir = path.join(process.cwd(), '.uploads', 'carousel');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const localPath = path.join(uploadsDir, `${timestamp}-${randomId}.${fileExtension}`);
      fs.writeFileSync(localPath, buffer);

      // Generate local URL
      const url = `/api/uploads/carousel/${timestamp}-${randomId}.${fileExtension}`;

      console.log('[Carousel Upload API] File saved locally:', { localPath, url, key });

      const response = {
        url: url,
        key: key,
        alt: alt || file.name,
      };

      console.log('[Carousel Upload API] Returning local storage response:', response);

      return NextResponse.json(response);
    }

    // Generate unique key for carousel images in carousel/ folder
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const key = `carousel/${timestamp}-${randomId}.${fileExtension}`;

    console.log('[Carousel Upload API] Generated storage key:', key);

    // Upload to object storage with carousel folder
    console.log('[Carousel Upload API] Starting upload...');
    const uploadResult = await uploadToS3(buffer, key, file.type);

    console.log('[Carousel Upload API] Upload successful:', uploadResult);

    // 先前上傳成功後還會再寫一份到 .uploads/carousel「讓代理路由更快」。但回傳給前端、
    // 存進資料庫的是物件儲存的公開網址，根本不經過代理路由；在 serverless 上那份副本也寫不進
    // 唯讀的檔案系統。已移除。

    const response = {
      url: uploadResult.url,
      key: uploadResult.key,
      alt: alt || file.name,
    };

    console.log('[Carousel Upload API] Returning response:', response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Carousel Upload API] Upload failed:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });

    // Return appropriate error response
    if (error instanceof Error) {
      if (error.message.includes('credentials') || error.message.includes('access')) {
        return NextResponse.json({
          error: 'Storage credentials not configured properly'
        }, { status: 500 });
      }
      if (error.message.includes('bucket') || error.message.includes('S3') || error.message.includes('STORAGE_')) {
        return NextResponse.json({
          error: 'Storage bucket configuration error'
        }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

export const POST = withAdmin(handleUpload);
