import { NextRequest, NextResponse } from 'next/server';
import resolveDataFile from '@/lib/localData';
import fs from 'fs';
import path from 'path';
import { broadcast } from '@/lib/classroomSSE';

// In-memory lock to prevent race conditions during concurrent writes (common in e2e tests)
const fileLocks = new Map<string, Promise<void>>();

async function dataPathFor(uuid: string) {
  return await resolveDataFile(`classroom_ready_${uuid}.json`);
}

async function updateList(uuid: string, updater: (arr: Array<any>) => Array<any>) {
  // Wait for existing lock if any
  while (fileLocks.get(uuid)) {
    await fileLocks.get(uuid);
  }
  
  // Create lock
  let resolveLock!: () => void;
  fileLocks.set(uuid, new Promise(r => resolveLock = r));

  try {
    const arr = await readList(uuid);
    const updated = updater(arr);
    await writeList(uuid, updated);
    return updated;
  } finally {
    resolveLock();
    fileLocks.delete(uuid);
  }
}

async function readList(uuid: string): Promise<Array<{ role: string; userId: string; present?: boolean }>> {
  const p = await dataPathFor(uuid);
  // Retry a few times if the file is busy or empty/incomplete
  for (let i = 0; i < 5; i++) {
    try {
      const txt = await fs.promises.readFile(p, 'utf8');
      if (!txt || txt.trim() === '') return [];
      return JSON.parse(txt);
    } catch (e: any) {
      if (e.code === 'ENOENT') return [];
      // If busy or parse error, wait slightly and retry
      await new Promise(r => setTimeout(r, 20 * i));
    }
  }
  return [];
}

async function writeList(uuid: string, arr: Array<{ role: string; userId: string; present?: boolean }>) {
  const p = await dataPathFor(uuid);
  const data = JSON.stringify(arr || []);
  const tmp = p + '.tmp' + Math.random().toString(36).slice(2);
  try {
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    // Write to a temporary file first, then rename for atomicity
    await fs.promises.writeFile(tmp, data, 'utf8');
    try {
      await fs.promises.rename(tmp, p);
    } catch (e) {
      // Fallback if rename fails (common on Windows if file is locked)
      await fs.promises.writeFile(p, data, 'utf8');
      try { await fs.promises.unlink(tmp); } catch (e2) { }
    }
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
    const { uuid, role, userId, action, present } = body || {};
    if (!uuid) return NextResponse.json({ error: 'uuid required' }, { status: 400 });

    // Handle clear-all action (no role/userId required)
    if (action === 'clear-all') {
      await writeList(uuid, []);
      try {
        console.log(`/api/classroom/ready POST broadcast uuid=${uuid} action=clear-all`);
        broadcast(uuid, { participants: [] });
      } catch (e) {
        console.warn('/api/classroom/ready broadcast failed', e);
      }
      return NextResponse.json({ participants: [] });
    }

    if (!role) return NextResponse.json({ error: 'role required' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    if (!['ready', 'unready'].includes(action)) return NextResponse.json({ error: 'action must be ready, unready, or clear-all' }, { status: 400 });

    // Normalize userId to avoid case/whitespace mismatches between clients
    const userIdNorm = String(userId).toLowerCase().trim();

    const filtered = await updateList(uuid, (arr) => {
      // Normalize existing participant entries
      const normalized = (arr || []).map((p) => ({
        role: p.role,
        userId: String(p.userId).toLowerCase().trim(),
        present: !!p.present,
      }));

      // Remove any existing entry for this role+userId
      const updated = normalized.filter((p) => !(p.role === role && p.userId === userIdNorm));
      if (action === 'ready') {
        updated.push({ role, userId: userIdNorm, present: !!present });
      }

      // Deduplicate by role:userId (keep last occurrence)
      const dedupe = new Map<string, { role: string; userId: string; present?: boolean }>();
      for (const p of updated) {
        dedupe.set(`${p.role}:${p.userId}`, p);
      }
      return Array.from(dedupe.values());
    });

    // notify SSE subscribers (log for debugging)
    try {
      console.log(`/api/classroom/ready POST broadcast uuid=${uuid} role=${role} userId=${userId} action=${action} present=${!!present} participants=${filtered.length}`);
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
