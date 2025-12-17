import { NextRequest, NextResponse } from 'next/server';
import resolveDataFile from '@/lib/localData';
import fs from 'fs';
import path from 'path';
import { broadcast } from '@/lib/classroomSSE';

async function dataPathFor(uuid: string) {
  return await resolveDataFile(`classroom_ready_${uuid}.json`);
}

async function readList(uuid: string) {
  const p = await dataPathFor(uuid);
  try {
    const txt = await fs.promises.readFile(p, 'utf8');
    return JSON.parse(txt) as Array<{ role: string; email?: string }>;
  } catch (e) {
    return [];
  }
}

async function writeList(uuid: string, arr: Array<{ role: string; email?: string }>) {
  const p = await dataPathFor(uuid);
  try {
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, JSON.stringify(arr || []), 'utf8');
  } catch (e) {
    console.warn('writeList failed', e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const uuid = url.searchParams.get('uuid');
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });
    const arr = await readList(uuid);
    return NextResponse.json({ participants: arr });
  } catch (err: any) {
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { uuid, role, email, ready } = body || {};
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });

    const arr = await readList(uuid);
    const filtered = arr.filter((p) => !(p.role === role && p.email === email));
    if (ready) filtered.push({ role, email });
    await writeList(uuid, filtered);
    // notify SSE subscribers (log for debugging)
    try {
      console.log(`/api/classroom/ready POST broadcast uuid=${uuid} role=${role} email=${email} ready=${!!ready} participants=${filtered.length}`);
      broadcast(uuid, { participants: filtered });
    } catch (e) {
      console.warn('/api/classroom/ready broadcast failed', e);
    }
    return NextResponse.json({ participants: filtered });
  } catch (err: any) {
    console.error('/api/classroom/ready error', err);
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}
