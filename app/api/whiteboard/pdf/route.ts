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
    await fs.writeFile(filePath, buffer);
    
    // Also save metadata
    const metaPath = await resolveDataFile(`session_${uuid}_meta.json`);
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
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (e) {
      return NextResponse.json({ found: false }, { status: 404 });
    }
    
    if (check) {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      return NextResponse.json({ found: true, meta });
    }
    
    // Return file
    const fileBuffer = await fs.readFile(filePath);
    
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
