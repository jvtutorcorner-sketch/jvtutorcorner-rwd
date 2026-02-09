import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3, getObjectBuffer } from '@/lib/s3';
import { saveWhiteboardState, getWhiteboardState } from '@/lib/whiteboardService';
import { broadcastToUuid } from '../stream/route';
import path from 'path';
import fs from 'fs';

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
    
    // Check if S3 credentials are available
    let useS3 = !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_S3_BUCKET_NAME);
    
    let uploaded: { url: string; key: string } | null = null;
    
    // Try S3 upload first if credentials available
    if (useS3) {
      try {
        const key = `whiteboard/session_${uuid}.pdf`;
        console.log('[PDF POST] Attempting S3 upload. Key:', key, 'Size:', buffer.length, 'Type:', pdf.type);
        
        uploaded = await uploadToS3(buffer, key, pdf.type || 'application/pdf');
        console.log('[PDF POST] PDF upload to S3 success:', uploaded.key);
      } catch (s3Error: any) {
        console.warn('[PDF POST] S3 upload failed, falling back to local storage:', s3Error.message);
        useS3 = false;
        uploaded = null;
      }
    }
    
    // Fall back to local storage if S3 failed or not configured
    if (!uploaded) {
      console.log('[PDF POST] Using local storage for PDF upload');
      
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const fileExtension = pdf.name.split('.').pop() || 'pdf';
      const key = `whiteboard/session_${uuid}_${timestamp}_${randomId}.${fileExtension}`;
      
      const uploadsDir = path.join(process.cwd(), '.uploads', 'whiteboard');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const localPath = path.join(uploadsDir, `session_${uuid}_${timestamp}_${randomId}.${fileExtension}`);
      fs.writeFileSync(localPath, buffer);
      
      const url = `/api/uploads/whiteboard/session_${uuid}_${timestamp}_${randomId}.${fileExtension}`;
      uploaded = { url, key };
      console.log('[PDF POST] PDF saved locally:', { url, key });
    }
    
    if (!uploaded) {
      throw new Error('Failed to upload PDF to both S3 and local storage');
    }
    
    // Save metadata
    const meta = { name: pdf.name, uploadedAt: Date.now(), size: pdf.size, type: pdf.type };
    
    if (useS3) {
      try {
        const metaKey = `whiteboard/session_${uuid}_meta.json`;
        await uploadToS3(Buffer.from(JSON.stringify(meta)), metaKey, 'application/json');
        console.log('[PDF POST] Metadata upload to S3 success:', metaKey);
      } catch (metaError) {
        console.warn('[PDF POST] Failed to upload metadata to S3:', metaError);
      }
    } else {
      try {
        const uploadsDir = path.join(process.cwd(), '.uploads', 'whiteboard');
        const metaPath = path.join(uploadsDir, `session_${uuid}_meta.json`);
        fs.writeFileSync(metaPath, JSON.stringify(meta));
        console.log('[PDF POST] Metadata saved locally:', metaPath);
      } catch (metaError) {
        console.warn('[PDF POST] Failed to save metadata locally:', metaError);
      }
    }

    // Persist PDF metadata into whiteboard state (DynamoDB)
    try {
      console.log('[PDF POST] Getting existing whiteboard state for uuid:', uuid);
      const existing = await getWhiteboardState(uuid);
      console.log('[PDF POST] Existing whiteboard state:', { 
        hasState: !!existing, 
        hasStrokes: !!existing?.strokes, 
        hasPdf: !!existing?.pdf,
        fullState: existing 
      });
      const strokes = existing?.strokes || [];
      const pdfState = {
        name: pdf.name,
        s3Key: uploaded.key,
        url: uploaded.url,
        size: pdf.size,
        type: pdf.type,
        uploadedAt: Date.now(),
        currentPage: 1
      };
      console.log('[PDF POST] Saving PDF state:', pdfState);
      await saveWhiteboardState(uuid, strokes, pdfState as any);
      console.log('[PDF POST] Saved whiteboard state with PDF metadata for uuid:', uuid);
      
      // Wait a bit to ensure DynamoDB consistency
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify the save worked with retry
      let verifyState = null;
      for (let i = 0; i < 3; i++) {
        verifyState = await getWhiteboardState(uuid);
        if (verifyState?.pdf) {
          console.log('[PDF POST] Verification SUCCESS - PDF found in state');
          break;
        }
        if (i < 2) {
          console.log(`[PDF POST] Verification attempt ${i+1} - PDF not yet visible, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      console.log('[PDF POST] Final verification state:', {
        hasState: !!verifyState,
        hasPdf: !!verifyState?.pdf,
        pdfName: verifyState?.pdf?.name,
        pdfUrl: verifyState?.pdf?.url
      });
      
      try {
        broadcastToUuid(uuid, { type: 'pdf-uploaded', pdf: pdfState, clientId: pdf.uploadedBy || null });
        console.log('[PDF POST] broadcasted pdf-uploaded event for uuid:', uuid);
      } catch (bErr) {
        console.warn('[PDF POST] broadcasting pdf-uploaded failed:', bErr);
      }
    } catch (dbError) {
      console.error('[PDF POST] Failed to save whiteboard state metadata:', dbError);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'PDF uploaded', 
      key: uploaded.key, 
      url: uploaded.url 
    });
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
    // Get PDF info from whiteboard state instead of assuming fixed key
    console.log('[PDF GET] Getting whiteboard state for uuid:', uuid);
    
    // Retry logic for eventual consistency - more aggressive
    let state = null;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (!state?.pdf && attempts < maxAttempts) {
      attempts++;
      state = await getWhiteboardState(uuid);
      
      if (state?.pdf) {
        console.log(`[PDF GET] ✓ PDF found on attempt ${attempts}/${maxAttempts}`);
        break;
      }
      
      if (attempts < maxAttempts) {
        const delay = Math.min(300 * Math.pow(1.5, attempts - 1), 2000);
        console.log(`[PDF GET] PDF not found, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log('[PDF GET] Retrieved whiteboard state after retries:', { 
      attempts,
      hasState: !!state, 
      hasStrokes: !!state?.strokes, 
      hasPdf: !!state?.pdf, 
      pdfName: state?.pdf?.name
    });
    const pdf = state?.pdf;
    
    console.log('[PDF GET] uuid:', uuid, 'check:', check, 'hasPdf:', !!pdf);
    
    if (!pdf) {
      console.log('[PDF GET] No PDF found in whiteboard state for uuid:', uuid, '- returning found: false');
      return NextResponse.json({ found: false }, { status: 200 });
    }
    
    // If just checking existence/meta
    if (check) {
      const meta = {
        name: pdf.name,
        size: pdf.size,
        type: pdf.type,
        uploadedAt: pdf.uploadedAt
      };
      console.log('[PDF GET] Found PDF in whiteboard state for check request:', { uuid, meta });
      return NextResponse.json({ found: true, meta });
    }
    
    // Return the PDF bytes
    const s3Key = pdf.s3Key;
    const url = pdf.url;
    
    // If it's a local file (starts with /api/uploads)
    if (url && url.startsWith('/api/uploads/')) {
      console.log('[PDF GET] Serving local PDF file:', url);
      // The file is served via the uploads API, so redirect or proxy
      const localPath = path.join(process.cwd(), '.uploads', 'whiteboard', s3Key.split('/').pop()!);
      
      if (!fs.existsSync(localPath)) {
        console.log('[PDF GET] Local PDF file not found:', localPath);
        return NextResponse.json({ found: false, error: 'File not found' }, { status: 404 });
      }
      
      const fileBuffer = fs.readFileSync(localPath);
      console.log('[PDF GET] Retrieved local PDF, size:', fileBuffer.length);
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(fileBuffer.length),
          'Cache-Control': 'public, max-age=3600'
        },
      });
    }
    
    // Otherwise, it's S3
    try {
      const fileBuf = await getObjectBuffer(s3Key);
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
        console.log('[PDF GET] PDF not found in S3 (NoSuchKey):', s3Key);
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
