import { NextRequest, NextResponse } from 'next/server';
import resolveDataFile from '@/lib/localData';
import fs from 'fs';
import path from 'path';
import { broadcast } from '@/lib/classroomSSE';

async function dataPathFor(uuid: string) {
  return await resolveDataFile(`classroom_session_${uuid}.json`);
}

async function readSession(uuid: string) {
  const p = await dataPathFor(uuid);
  let fileExists = false;
  try {
    await fs.promises.access(p);
    fileExists = true;
  } catch (e) {
    // File doesn't exist
  }

  if (!fileExists) {
    return {}; // Missing file (ephemeral storage loss) shouldn't be confused with "cleared" session
  }

  try {
    const txt = await fs.promises.readFile(p, 'utf8');
    return JSON.parse(txt) as { endTs?: number | null };
  } catch (e) {
    return {};
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
    return NextResponse.json({ endTs: s.endTs !== undefined ? s.endTs : undefined });
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
      // Broadcast to all SSE listeners that the class has ended
      try { broadcast(uuid, { type: 'class_ended', timestamp: Date.now() }); } catch (e) { }
      return NextResponse.json({ endTs: null });
    }

    if (typeof endTs !== 'number') return NextResponse.json({ error: 'endTs required (number) or use action=clear' }, { status: 400 });

    // Allow resetting expired session: if client sends a new endTs, we just overwrite it.
    // The previous logic allowed this too, but we are making it explicit that overwriting is supported.
    // If the client logic detects expiration, it can POST a new endTs (extended time).

    await writeSession(uuid, { endTs });
    return NextResponse.json({ endTs });
  } catch (err: any) {
    console.error('/api/classroom/session POST error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}
