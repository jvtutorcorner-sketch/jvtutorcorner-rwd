import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getSignedUrlForKey } from '@/lib/s3';

// Reuse S3 config logic or just direct client for simplicity here
const getS3Client = () => {
  const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION;
  const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

  return new S3Client({
    region: awsRegion,
    credentials: accessKey && secretKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
  });
};

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

    console.log('[Carousel Proxy GET] Requested path:', filePath);
    console.log('[Carousel Proxy GET] Full absolute path:', fullPath);

    // Determine content type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';

    // 1. Try local storage first
    if (fs.existsSync(fullPath)) {
      if (fullPath.startsWith(uploadsDir)) {
        console.log('[Carousel Proxy GET] ✓ Local HIT:', filePath);
        const stats = fs.statSync(fullPath);
        const nodeStream = fs.createReadStream(fullPath);
        // Convert Node stream to Web Stream for Next.js 13+ response
        const webStream = Readable.toWeb(nodeStream);

        return new Response(webStream as any, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': stats.size.toString(),
            'Cache-Control': 'public, max-age=31536000',
            'X-Proxy-Cache': 'HIT',
          },
        });
      }
    }

    // 2. Fallback: Try S3
    const bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.CI_AWS_S3_BUCKET_NAME;
    const s3Key = `carousel/${filePath}`;
    console.log('[Carousel Proxy GET] ⚠ Local MISS, trying S3:', s3Key);

    if (!bucketName) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 500 });
    }

    // PRODUCTION OPTIMIZATION: Redirect to S3 to bypass 6MB payload limits on Lambda
    // This is the most robust way to serve large images (>5MB) in Amplify/Vercel
    if (process.env.NODE_ENV === 'production' || process.env.USE_S3_REDIRECT === 'true') {
      try {
        console.log('[Carousel Proxy GET] ➔ Production Redirect to S3:', s3Key);
        const signedUrl = await getSignedUrlForKey(s3Key, 3600);
        return NextResponse.redirect(signedUrl);
      } catch (redirectErr) {
        console.warn('[Carousel Proxy GET] ! Redirect failed, falling back to proxy:', redirectErr);
        // Fall through to proxying if redirect generation fails for some reason
      }
    }

    try {
      const s3Client = getS3Client();
      const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key });
      const res = await s3Client.send(cmd);

      if (!res.Body) {
        throw new Error('S3 response body is empty');
      }

      console.log('[Carousel Proxy GET] ✓ S3 success, streaming to client:', s3Key);

      // We should also cache it locally in the background so next time it's a HIT
      // (Non-blocking but we need the data)
      // For large files, transformToByteArray is safer than full buffer if we have to read it all for caching
      const byteArray = await res.Body.transformToByteArray();

      try {
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        fs.writeFileSync(fullPath, Buffer.from(byteArray));
        console.log('[Carousel Proxy GET] ✓ S3 object cached locally for next time');
      } catch (cacheErr) {
        console.warn('[Carousel Proxy GET] ! Failed to cache S3 object:', cacheErr);
      }

      return new Response(new Uint8Array(byteArray), {
        headers: {
          'Content-Type': contentType,
          'Content-Length': res.ContentLength?.toString() || byteArray.length.toString(),
          'Cache-Control': 'public, max-age=31536000',
          'X-Proxy-Cache': 'MISS-CACHED',
        },
      });
    } catch (s3Error: any) {
      console.warn('[Carousel Proxy GET] ✗ S3 fetch failed:', s3Error.message);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('[Carousel Proxy GET] Critical error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}