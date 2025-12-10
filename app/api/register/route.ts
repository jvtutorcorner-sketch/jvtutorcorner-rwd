import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), '.local_data', 'profiles.json');

async function readProfiles() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

async function writeProfiles(profiles: any[]) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(profiles, null, 2), 'utf8');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.email || !body.password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    const email = String(body.email).toLowerCase();
    if (body.bio && String(body.bio).length > 500) {
      return NextResponse.json({ message: 'bio too long (max 500 chars)' }, { status: 400 });
    }
    const profiles = await readProfiles();
    if (profiles.find((p: any) => p.email === email)) {
      return NextResponse.json({ message: 'Email already registered' }, { status: 409 });
    }

    // Note: For simplicity, password is stored as-is. In production, hash passwords.
    // Ensure teachers do not store a plan (explicitly null)
    const plan = body.role === 'teacher' ? null : (body.plan ?? null);
    // normalize id -> roid_id
    const profile = { ...body, email, plan };
    if (profile.id && !profile.roid_id) {
      profile.roid_id = profile.id;
      delete profile.id;
    }
    profiles.push(profile);
    await writeProfiles(profiles);
    return NextResponse.json({ ok: true, profile }, { status: 201 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}
