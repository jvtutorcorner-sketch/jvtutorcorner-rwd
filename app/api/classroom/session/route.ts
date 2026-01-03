import { NextRequest, NextResponse } from 'next/server';
import resolveDataFile from '@/lib/localData';
import fs from 'fs';
import path from 'path';

async function dataPathFor(uuid: string) {
  return await resolveDataFile(`classroom_session_${uuid}.json`);
}

async function readSession(uuid: string) {
  const p = await dataPathFor(uuid);
  try {
    const txt = await fs.promises.readFile(p, 'utf8');
    return JSON.parse(txt) as { endTs?: number | null };
  } catch (e) {
    return { endTs: null };
  }
}

async function writeSession(uuid: string, obj: { endTs?: number | null }) {
  const p = await dataPathFor(uuid);
  try {
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, JSON.stringify(obj || { endTs: null }), 'utf8');
  } catch (e) {
    console.warn('writeSession failed', e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get('uuid');
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });
    const s = await readSession(uuid);
    return NextResponse.json({ endTs: s.endTs ?? null });
  } catch (err: any) {
    console.error('/api/classroom/session GET error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { uuid, endTs, action } = body || {};
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });

    if (action === 'clear') {
      await writeSession(uuid, { endTs: null });
      return NextResponse.json({ endTs: null });
    }

    if (typeof endTs !== 'number') return NextResponse.json({ error: 'endTs required (number) or use action=clear' }, { status: 400 });

    await writeSession(uuid, { endTs });
    return NextResponse.json({ endTs });
  } catch (err: any) {
    console.error('/api/classroom/session POST error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}
