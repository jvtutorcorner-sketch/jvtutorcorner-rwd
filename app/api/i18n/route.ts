import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = (searchParams.get('locale') || 'zh-TW').replace(/[^a-zA-Z0-9\-_]/g, '');
    const file = path.join(process.cwd(), 'locales', locale, 'common.json');
    const data = await fs.readFile(file, 'utf8');
    const json = JSON.parse(data);
    return NextResponse.json({ ok: true, messages: json });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'failed' }, { status: 500 });
  }
}
