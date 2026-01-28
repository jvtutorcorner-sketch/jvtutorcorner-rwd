import { NextRequest, NextResponse } from 'next/server';
import { resolveDataFile } from '@/lib/localData';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uuid, pdf } = body;
    
    if (!uuid || !pdf || !pdf.data) {
      return NextResponse.json({ error: 'Missing uuid or pdf data' }, { status: 400 });
    }
    
    // Decode base64
    const buffer = Buffer.from(pdf.data, 'base64');
    
    // Save to local data
    const filePath = await resolveDataFile(`session_${uuid}.pdf`);
    console.log('[PDF POST] uuid:', uuid, 'filePath:', filePath, 'buffer size:', buffer.length);
    await fs.writeFile(filePath, buffer);
    
    // Also save metadata
    const metaPath = await resolveDataFile(`session_${uuid}_meta.json`);
    console.log('[PDF POST] metaPath:', metaPath);
    await fs.writeFile(metaPath, JSON.stringify({ 
      name: pdf.name,
      uploadedAt: Date.now(),
      size: pdf.size,
      type: pdf.type
    }));
    
    return NextResponse.json({ success: true, message: 'PDF uploaded' });
  } catch (error) {
    console.error('PDF upload failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const filePath = await resolveDataFile(`session_${uuid}.pdf`);
    const metaPath = await resolveDataFile(`session_${uuid}_meta.json`);
    
    console.log('[PDF GET] uuid:', uuid, 'check:', check, 'filePath:', filePath, 'metaPath:', metaPath);
    console.log('[PDF GET] process.cwd():', process.cwd());
    
    // Check if file exists
    try {
      await fs.access(filePath);
      console.log('[PDF GET] File exists at:', filePath);
      const stats = await fs.stat(filePath);
      console.log('[PDF GET] File stats:', { size: stats.size, mtime: stats.mtime });
    } catch (e) {
      console.log('[PDF GET] File does not exist at:', filePath, 'error:', e);
      return NextResponse.json({ found: false }, { status: 404 });
    }
    
    if (check) {
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        console.log('[PDF GET] Meta exists:', meta);
        return NextResponse.json({ found: true, meta });
      } catch (e) {
        console.log('[PDF GET] Meta does not exist or invalid:', e);
        // Meta file missing or invalid, treat as not found
        return NextResponse.json({ found: false }, { status: 404 });
      }
    }
    
    // Return file
    console.log('[PDF GET] Reading file');
    const fileBuffer = await fs.readFile(filePath);
    console.log('[PDF GET] File read successfully, size:', fileBuffer.length);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        // 'Content-Disposition': `attachment; filename="session.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF get failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
