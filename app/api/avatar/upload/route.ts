// app/api/avatar/upload/route.ts
// Avatar image upload for teacher profiles. Mirrors the carousel upload flow:
// object storage (S3 or R2, see lib/s3.ts) when configured, local .uploads/avatar
// otherwise, served back through /api/uploads/avatar/<file>.
import { NextResponse } from 'next/server';
import { uploadToS3, isObjectStorageConfigured } from '@/lib/s3';
import { withAuth, AuthedRequest } from '@/lib/auth/apiGuard';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// 先前每次請求都會重新解析 .env.local 並覆寫 process.env（開發期的權宜之計，卻跟著部署到正式環境）。
// Next.js 啟動時本來就會載入 .env.local，已移除。

const uploadAvatar = async (request: AuthedRequest) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      console.error('[Avatar Upload API] Invalid file type:', file.type);
      return NextResponse.json(
        { ok: false, error: 'File must be a JPG, PNG, WebP or GIF image' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      console.error('[Avatar Upload API] File too large:', file.size);
      return NextResponse.json(
        { ok: false, error: 'File size must be less than 5MB' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Derive the filename from the MIME type so a caller cannot inject a path
    // segment or an unexpected extension through file.name.
    const extension = EXTENSION_BY_TYPE[file.type];
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${extension}`;
    const key = `avatar/${fileName}`;
    const url = `/api/uploads/avatar/${fileName}`;

    const useS3 = isObjectStorageConfigured();

    if (useS3) {
      console.log('[Avatar Upload API] Uploading to object storage:', key);
      await uploadToS3(buffer, key, file.type);
    } else {
      // 沒有物件儲存（本機開發）時才寫到 .uploads/avatar，由 /api/uploads/avatar 代理讀取。
      // 先前是「一律」再寫一份本機副本：serverless 的檔案系統唯讀、各實例也不共享，
      // 那份副本不是寫失敗就是只存在單一實例，沒有任何作用。
      const uploadsDir = path.resolve(process.cwd(), '.uploads', 'avatar');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(path.resolve(uploadsDir, fileName), buffer);
    }

    console.log('[Avatar Upload API] Upload complete:', { key, url, useS3 });

    return NextResponse.json({ ok: true, url, key });
  } catch (error) {
    console.error('[Avatar Upload API] Upload failed:', error);
    return NextResponse.json({ ok: false, error: 'Failed to upload image' }, { status: 500 });
  }
};

export const POST = withAuth(uploadAvatar, { roles: ['teacher', 'admin'] });
