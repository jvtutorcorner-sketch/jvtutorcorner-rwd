// app/api/carousel/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
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

    // Check if S3 credentials are available
    const hasS3Credentials = !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID);

    if (!hasS3Credentials) {
      console.log('[Carousel Upload API] No S3 credentials found, using local storage for development');

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

    console.log('[Carousel Upload API] Generated S3 key:', key);

    // Upload to S3 with carousel folder
    console.log('[Carousel Upload API] Starting S3 upload...');
    const uploadResult = await uploadToS3(buffer, key, file.type);

    console.log('[Carousel Upload API] S3 upload successful:', uploadResult);

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
          error: 'AWS credentials not configured properly'
        }, { status: 500 });
      }
      if (error.message.includes('bucket') || error.message.includes('S3')) {
        return NextResponse.json({
          error: 'S3 bucket configuration error'
        }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}