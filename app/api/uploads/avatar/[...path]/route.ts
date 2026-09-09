import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getSignedUrlForKey } from '@/lib/s3';

const getS3Client = () => {
  const awsRegion = process.env.AWS_REGION || process.env.CI_AWS_REGION;
  const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

  return new S3Client({
    region: awsRegion,
    credentials: accessKey && secretKey ? { accessKeyId: accessKey, secretAccessKey: secretKey } : undefined,
  });
};

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

    // 1. Local storage first
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

    // 2. Fallback: S3
    const bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.CI_AWS_S3_BUCKET_NAME;
    const s3Key = `avatar/${filePath}`;

    if (!bucketName) {
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
      const s3Client = getS3Client();
      const res = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3Key }));

      if (!res.Body) throw new Error('S3 response body is empty');

      const byteArray = await res.Body.transformToByteArray();

      try {
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        fs.writeFileSync(fullPath, Buffer.from(byteArray));
      } catch (cacheErr) {
        console.warn('[Avatar Proxy GET] ! Failed to cache S3 object:', cacheErr);
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
      console.warn('[Avatar Proxy GET] ✗ S3 fetch failed:', s3Error.message);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('[Avatar Proxy GET] Critical error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
