// app/api/carousel/presign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPresignedPutUrl } from '@/lib/s3';
import fs from 'fs';
import path from 'path';

// If the running process didn't pick up .env.local (e.g. started earlier),
// try to load minimal AWS-related vars at runtime so dev can use S3 without restart.
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
      // Overwrite in development to ensure we pick up changes from .env.local
      process.env[key] = val;
    });
  } catch (e) {
    console.warn('[Carousel Presign API] failed to load .env.local at runtime', (e as any)?.message || e);
  }
}

export async function POST(request: NextRequest) {
  console.log('[Carousel Presign API] Request received');

  // Ensure AWS env vars are present when possible (helpful when dev server started earlier)
  loadAwsEnvFromDotenv();

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

    // Check if S3 is configured (favoring Bucket Name for IAM Role support)
    const hasS3Bucket = !!(process.env.AWS_S3_BUCKET_NAME || process.env.CI_AWS_S3_BUCKET_NAME);
    const hasS3Credentials = !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);
    const isProduction = process.env.NODE_ENV === 'production';

    // In production, we assume S3 is available if a bucket is named (IAM Role will handle creds)
    const useS3 = hasS3Bucket && (isProduction || hasS3Credentials);

    if (!useS3) {
      console.log('[Carousel Presign API] S3 not configured or in development without keys, returning error to trigger fallback');
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

    console.log('[Carousel Presign API] Generated key:', key);
    // Generate presigned URL
    console.log('[Carousel Presign API] About to call getPresignedPutUrl with:', { key, mimeType });
    console.log('[Carousel Presign API] Environment check:', {
      hasRegion: !!process.env.AWS_REGION,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasBucket: !!process.env.AWS_S3_BUCKET_NAME,
      region: process.env.AWS_REGION,
      bucket: process.env.AWS_S3_BUCKET_NAME
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
        bucket: process.env.AWS_S3_BUCKET_NAME || process.env.CI_AWS_S3_BUCKET_NAME
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