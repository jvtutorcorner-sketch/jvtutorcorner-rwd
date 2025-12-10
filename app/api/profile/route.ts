import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), '.local_data', 'profiles.json');

async function readProfiles(): Promise<any[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

async function writeProfiles(arr: any[]) {
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.warn('[profile API] failed to write profiles', (err as any)?.message || err);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const id = url.searchParams.get('id');
    const profiles = await readProfiles();
    if (email) {
      const p = profiles.find((x) => String(x.email).toLowerCase() === String(email).toLowerCase());
      if (!p) return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
      return NextResponse.json({ ok: true, profile: p });
    }
    if (id) {
      const p = profiles.find((x) => x.roid_id === id || x.id === id);
      if (!p) return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
      return NextResponse.json({ ok: true, profile: p });
    }
    return NextResponse.json({ ok: true, profiles });
  } catch (err: any) {
    console.error('[profile GET] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to read profiles' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body || (!body.email && !body.id)) {
      return NextResponse.json({ ok: false, message: 'email or id required' }, { status: 400 });
    }

    const email = body.email ? String(body.email).toLowerCase() : undefined;
    const id = body.id;

    const profiles = await readProfiles();
    const idx = profiles.findIndex((p) => {
      if (email) return String(p.email).toLowerCase() === email;
      return p.roid_id === id || p.id === id;
    });
    if (idx === -1) return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });

    const profile = profiles[idx];
    // apply allowed updates (for demo, we allow adding/updating payment info and names)
    const updates: any = {};
    if (body.firstName !== undefined) updates.firstName = body.firstName;
    if (body.lastName !== undefined) updates.lastName = body.lastName;
    if (body.bio !== undefined) updates.bio = body.bio;
    if (body.backupEmail !== undefined) updates.backupEmail = body.backupEmail;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.card) updates.card = body.card; // caution: demo only

    // server-side validation for bio length
    if (updates.bio && String(updates.bio).length > 500) {
      return NextResponse.json({ ok: false, message: 'bio too long (max 500 chars)' }, { status: 400 });
    }

    const nowUtc = new Date().toISOString();
    const timezone = updates.timezone || profile.timezone || 'UTC';
    let local = nowUtc;
    try {
      const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const parts = fmt.formatToParts(new Date()).reduce((acc: any, part) => { acc[part.type] = (acc[part.type] || '') + part.value; return acc; }, {});
      local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    } catch {}

    const merged = { ...profile, ...updates, updatedAtUtc: nowUtc, updatedAtLocal: local };
    profiles[idx] = merged;
    await writeProfiles(profiles);
    return NextResponse.json({ ok: true, profile: merged });
  } catch (err: any) {
    console.error('[profile PATCH] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
  }
}
