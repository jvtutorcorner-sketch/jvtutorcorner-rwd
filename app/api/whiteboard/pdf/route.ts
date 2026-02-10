import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3, getObjectBuffer } from '@/lib/s3';
import { saveWhiteboardState, getWhiteboardState, normalizeUuid } from '@/lib/whiteboardService';
import { broadcastToUuid } from '../stream/route';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uuid: rawUuid, pdf } = body;
    const uuid = normalizeUuid(rawUuid);
    
    console.log('[PDF POST] ===== PDF UPLOAD REQUEST =====');
    console.log('[PDF POST] Raw UUID received:', rawUuid);
    console.log('[PDF POST] Normalized UUID:', uuid);
    console.log('[PDF POST] PDF name:', pdf?.name);
    
    if (!uuid || !pdf) {
      console.error('[PDF POST] Validation failed: Missing uuid or pdf object');
      return NextResponse.json({ error: 'Missing uuid or pdf metadata' }, { status: 400 });
    }
    
    let uploaded: { url: string; key: string } | null = null;
    let useS3 = !!(process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_S3_BUCKET_NAME);
    
    console.log('[PDF POST] S3 Configuration check:', {
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasCiAccessKey: !!process.env.CI_AWS_ACCESS_KEY_ID,
      hasBucket: !!process.env.AWS_S3_BUCKET_NAME,
      useS3: useS3,
      bucket: process.env.AWS_S3_BUCKET_NAME || process.env.CI_AWS_S3_BUCKET_NAME
    });

    // Case 1: PDF already uploaded (e.g., via presigned URL)
    if (pdf.s3Key) {
       console.log('[PDF POST] PDF already uploaded to storage. Key:', pdf.s3Key);
       uploaded = { 
         url: pdf.url || `/api/whiteboard/pdf?uuid=${encodeURIComponent(rawUuid || 'default')}`, 
         key: pdf.s3Key 
       };
    } 
    // Case 2: PDF provided as base64 data to be uploaded by the server
    else if (pdf.data) {
      // Decode base64
      const buffer = Buffer.from(pdf.data, 'base64');
      
      // Try S3 upload first if credentials available
      if (useS3) {
        try {
          const key = `whiteboard/session_${uuid}.pdf`;
          console.log('[PDF POST] Attempting S3 upload. Key:', key, 'Size:', buffer.length, 'Type:', pdf.type);
          
          uploaded = await uploadToS3(buffer, key, pdf.type || 'application/pdf');
          console.log('[PDF POST] ✓ PDF upload to S3 success:', { key: uploaded.key, url: uploaded.url });
        } catch (s3Error: any) {
          console.error('[PDF POST] ✗ S3 upload failed:', { error: s3Error.message, code: (s3Error as any).code, details: (s3Error as any).$metadata });
          console.warn('[PDF POST] Falling back to local storage');
          useS3 = false;
          uploaded = null;
        }
      }
      
      // Fall back to local storage if S3 failed or not configured
      if (!uploaded) {
        if (useS3) {
          console.log('[PDF POST] S3 was enabled but upload failed, using local storage');
        } else {
          console.log('[PDF POST] S3 not configured, using local storage');
        }
        
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substr(2, 9);
        const fileExtension = pdf.name.split('.').pop() || 'pdf';
        const key = `whiteboard/session_${uuid}_${timestamp}_${randomId}.${fileExtension}`;
        
        const uploadsDir = path.join(process.cwd(), '.uploads', 'whiteboard');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const localPath = path.join(uploadsDir, `session_${uuid}_${timestamp}_${randomId}.${fileExtension}`);
        
        try {
          // Write file to local storage (instead of using bypass)
          fs.writeFileSync(localPath, buffer);
          console.log('[PDF POST] ✓ PDF written to local storage:', { localPath, size: buffer.length });
          
          const url = `/api/uploads/whiteboard/session_${uuid}_${timestamp}_${randomId}.${fileExtension}`;
          uploaded = { url, key };
          console.log('[PDF POST] ✓ PDF record prepared (local storage):', { url, key });
        } catch (writeError: any) {
          console.error('[PDF POST] ✗ Failed to write PDF to local storage:', { error: writeError.message, path: localPath });
          throw new Error(`Failed to write PDF file: ${writeError.message}`);
        }
      }
    } else {
      console.error('[PDF POST] Validation failed: Missing pdf data or s3Key');
      return NextResponse.json({ error: 'Missing pdf data or s3Key' }, { status: 400 });
    }
    
    if (!uploaded) {
      throw new Error('Failed to prepare PDF upload');
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
        // const uploadsDir = path.join(process.cwd(), '.uploads', 'whiteboard');
        // const metaPath = path.join(uploadsDir, `session_${uuid}_meta.json`);
        // fs.writeFileSync(metaPath, JSON.stringify(meta));
        console.log('[PDF POST] Metadata local save bypassed to prevent server refresh');
      } catch (metaError) {
        console.warn('[PDF POST] Failed to save metadata logic:', metaError);
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
  const rawUuid = searchParams.get('uuid');
  const uuid = normalizeUuid(rawUuid);
  const check = searchParams.get('check'); // if true, just return metadata
  
  console.log('[PDF GET] ===== PDF RETRIEVAL REQUEST =====');
  console.log('[PDF GET] Raw UUID received:', rawUuid);
  console.log('[PDF GET] Normalized UUID:', uuid);
  console.log('[PDF GET] Check mode:', !!check);
  
  if (!uuid || uuid === 'default') {
    return NextResponse.json({ error: 'Missing uuid' }, { status: 400 });
  }
  
  try {
    // Get PDF info from whiteboard state instead of assuming fixed key
    console.log('[PDF GET] Querying DynamoDB for uuid:', uuid);
    
    // Retry logic for eventual consistency - more aggressive
    let state = null;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (!state?.pdf && attempts < maxAttempts) {
      attempts++;
      state = await getWhiteboardState(uuid);
      
      // Fallback: Try prefixed version if not found (legacy data fallback)
      if (!state?.pdf && !uuid.startsWith('course_')) {
        const fallbackUuid = `course_${uuid}`;
        console.log(`[PDF GET] PDF not found for ${uuid}, trying fallback ${fallbackUuid}...`);
        state = await getWhiteboardState(fallbackUuid);
      }
      
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
    
    console.log('[PDF GET] Attempting to serve PDF bytes:', {
      hasS3Key: !!s3Key,
      s3Key: s3Key,
      hasUrl: !!url,
      url: url,
      isLocalFile: url?.startsWith('/api/uploads/'),
      isS3: !url?.startsWith('/api/uploads/')
    });
    
    // PRIORITY: If s3Key is present (even if url starts with /api/uploads), try S3 first
    if (s3Key) {
      try {
        console.log('[PDF GET] PRIORITY: Attempting to retrieve from S3 first (since s3Key is present):', { s3Key, bucket: process.env.AWS_S3_BUCKET_NAME });
        const fileBuf = await getObjectBuffer(s3Key);
        console.log('[PDF GET] ✓ Success: Retrieved PDF from S3, size:', fileBuf.length);
        return new NextResponse(new Uint8Array(fileBuf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(fileBuf.length),
            'Cache-Control': 'public, max-age=3600'
          },
        });
      } catch (e: any) {
        console.warn(`[PDF GET] S3 retrieval failed, checking fallback options. Error: ${e.message}`);
        // If S3 fail, fall through to check local storage
      }
    }
    
    // FALLBACK 1: If it's a local file (starts with /api/uploads)
    if (url && url.startsWith('/api/uploads/')) {
      console.log('[PDF GET] ⚠️ Serving local PDF file:', url);
      // The file is served via the uploads API, so redirect or proxy
      const localPath = path.join(process.cwd(), '.uploads', 'whiteboard', s3Key?.split('/').pop() || 'file.pdf');
      
      if (!fs.existsSync(localPath)) {
        console.log('[PDF GET] ✗ Local PDF file not found:', { path: localPath, expectedFile: s3Key?.split('/').pop() });
        // Instead of returning 404 immediately, we'll try S3 in the next block if not already tried
      } else {
        try {
          const fileBuffer = fs.readFileSync(localPath);
          console.log('[PDF GET] ✓ Retrieved local PDF, size:', fileBuffer.length);
          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Length': String(fileBuffer.length),
              'Cache-Control': 'public, max-age=3600'
            },
          });
        } catch (e) {
          console.error('[PDF GET] Error reading local file:', e);
        }
      }
    }
    
    // Otherwise, try S3 (if not already tried or if local failed)
    try {
      console.log('[PDF GET] Final attempt: Retrieving from S3:', { s3Key, bucket: process.env.AWS_S3_BUCKET_NAME });
      const fileBuf = await getObjectBuffer(s3Key);
      console.log('[PDF GET] ✓ Retrieved PDF from S3, size:', fileBuf.length);
      return new NextResponse(new Uint8Array(fileBuf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(fileBuf.length),
          'Cache-Control': 'public, max-age=3600'
        },
      });
    } catch (e: any) {
      if (e.name === 'NoSuchKey' || e.code === 'NoSuchKey') {
        console.log('[PDF GET] ✗ PDF not found in S3 (NoSuchKey):', { s3Key, error: e.message });
        return NextResponse.json({ found: false, error: 'File not found' }, { status: 404 });
      }
      console.error('[PDF GET] ✗ S3 Error during fetch:', { error: e.message, code: (e as any).code, s3Key });
      return NextResponse.json({ found: false, error: 'S3 read error', details: e.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error('PDF get critical failure:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
