import { NextRequest, NextResponse } from 'next/server';
import { getPresignedPutUrl } from '@/lib/s3';
import { normalizeUuid } from '../stream/route';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uuid: rawUuid, fileName, contentType } = body;
    const uuid = normalizeUuid(rawUuid);

    if (!uuid || !fileName) {
      return NextResponse.json({ error: 'Missing uuid or fileName' }, { status: 400 });
    }

    // Generate a unique key for the PDF file
    // Use the normalized uuid in the key for consistency across tracking systems
    const key = `whiteboard/session_${uuid}_${Date.now()}_${fileName}`;

    // Generate presigned PUT URL
    const { url, publicUrl } = await getPresignedPutUrl(key, contentType || 'application/pdf', 900); // 15 minutes expiry

    console.log('[Presign API] Generated presigned URL for:', { uuid, fileName, key });

    return NextResponse.json({
      url,
      key,
      publicUrl
    });
  } catch (error) {
    console.error('[Presign API] Error:', error);
    return NextResponse.json({ error: 'Failed to generate presigned URL' }, { status: 500 });
  }
}