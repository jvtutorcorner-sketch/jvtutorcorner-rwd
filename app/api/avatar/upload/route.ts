// app/api/avatar/upload/route.ts
// Avatar image upload for teacher profiles. Mirrors the carousel upload flow:
// S3 when configured, local .uploads/avatar otherwise, served back through
// /api/uploads/avatar/<file>.
import { NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3';
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

// If process.env lacks AWS creds (dev server started earlier), try loading from .env.local
function loadAwsEnvFromDotenv() {
  try {
    const envFile = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envFile)) return;
    const content = fs.readFileSync(envFile, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) return;
      const key = m[1];
      let val = m[2] || '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    });
  } catch (e) {
    console.warn('[Avatar Upload API] failed to load .env.local at runtime', (e as any)?.message || e);
  }
}

const uploadAvatar = async (request: AuthedRequest) => {
  loadAwsEnvFromDotenv();

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

    const hasS3Bucket = !!(process.env.AWS_S3_BUCKET_NAME || process.env.CI_AWS_S3_BUCKET_NAME);
    const hasS3Credentials = !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);
    const isProduction = process.env.NODE_ENV === 'production';
    const useS3 = hasS3Bucket && (isProduction || hasS3Credentials);

    if (useS3) {
      console.log('[Avatar Upload API] Uploading to S3:', key);
      await uploadToS3(buffer, key, file.type);
    }

    // Always keep a local copy so the proxy serves instantly without an S3 round trip.
    try {
      const uploadsDir = path.resolve(process.cwd(), '.uploads', 'avatar');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(path.resolve(uploadsDir, fileName), buffer);
    } catch (saveError) {
      // On serverless the filesystem may be read-only; S3 still has the object.
      if (!useS3) throw saveError;
      console.warn('[Avatar Upload API] ! Failed to cache locally:', saveError);
    }

    console.log('[Avatar Upload API] Upload complete:', { key, url, useS3 });

    return NextResponse.json({ ok: true, url, key });
  } catch (error) {
    console.error('[Avatar Upload API] Upload failed:', error);
    return NextResponse.json({ ok: false, error: 'Failed to upload image' }, { status: 500 });
  }
};

export const POST = withAuth(uploadAvatar, { roles: ['teacher', 'admin'] });
