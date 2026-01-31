import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3, getObjectBuffer } from '@/lib/s3';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uuid, pdf } = body;
    
    if (!uuid || !pdf || !pdf.data) {
      console.error('[PDF POST] Validation failed: Missing uuid or pdf data');
      return NextResponse.json({ error: 'Missing uuid or pdf data' }, { status: 400 });
    }
    
    // Decode base64
    const buffer = Buffer.from(pdf.data, 'base64');
    
    // Upload PDF to S3
    const key = `whiteboard/session_${uuid}.pdf`;
    console.log('[PDF POST] Start upload to S3. Key:', key, 'Size:', buffer.length, 'Type:', pdf.type);
    
    try {
      const uploaded = await uploadToS3(buffer, key, pdf.type || 'application/pdf');
      console.log('[PDF POST] PDF upload success:', uploaded.key);

      // Save metadata as small JSON object in S3
      const meta = { name: pdf.name, uploadedAt: Date.now(), size: pdf.size, type: pdf.type };
      const metaKey = `whiteboard/session_${uuid}_meta.json`;
      await uploadToS3(Buffer.from(JSON.stringify(meta)), metaKey, 'application/json');
      console.log('[PDF POST] Metadata upload success:', metaKey);

      return NextResponse.json({ 
        success: true, 
        message: 'PDF uploaded', 
        key: uploaded.key, 
        url: uploaded.url 
      });
    } catch (s3Error: any) {
      console.error('[PDF POST] S3 Operation FAILED:', {
        message: s3Error.message,
        stack: s3Error.stack,
        code: s3Error.code,
        requestId: s3Error.$metadata?.requestId
      });
      return NextResponse.json({ 
        error: 'S3 storage error', 
        details: s3Error.message 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[PDF POST] Critical error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uuid = searchParams.get('uuid');
  const check = searchParams.get('check'); // if true, just return metadata
  
  if (!uuid) {
    return NextResponse.json({ error: 'Missing uuid' }, { status: 400 });
  }
  
  try {
    const key = `whiteboard/session_${uuid}.pdf`;
    const metaKey = `whiteboard/session_${uuid}_meta.json`;

    console.log('[PDF GET] uuid:', uuid, 'check:', check, 's3Key:', key, 'metaKey:', metaKey);

    // If just checking existence/meta
    if (check) {
      try {
        const metaBuf = await getObjectBuffer(metaKey);
        const meta = JSON.parse(metaBuf.toString('utf8'));
        console.log('[PDF GET] Meta exists in S3:', meta);
        return NextResponse.json({ found: true, meta });
      } catch (e) {
        console.log('[PDF GET] Meta not found in S3:', e);
        return NextResponse.json({ found: false }, { status: 404 });
      }
    }

    // Return the PDF bytes proxied from S3
    try {
      const fileBuf = await getObjectBuffer(key);
      console.log('[PDF GET] Retrieved PDF from S3, size:', fileBuf.length);
      return new NextResponse(new Uint8Array(fileBuf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(fileBuf.length),
          'Cache-Control': 'public, max-age=3600'
        },
      });
    } catch (e: any) {
      if (e.name === 'NoSuchKey' || e.code === 'NoSuchKey') {
        console.log('[PDF GET] PDF not found in S3 (NoSuchKey):', key);
        return NextResponse.json({ found: false, error: 'File not found' }, { status: 404 });
      }
      console.error('[PDF GET] S3 Error during fetch:', e);
      return NextResponse.json({ found: false, error: 'S3 read error', details: e.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error('PDF get critical failure:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
