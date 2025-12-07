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

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // Demo admin credentials (hardcoded for local/demo use only)
    if (String(email).toLowerCase() === 'admin@jvtutorcorner.com' && password === '123456') {
      const publicProfile = { id: 'admin', nickname: 'Administrator', plan: 'elite', role: 'admin' };
      return NextResponse.json({ ok: true, profile: publicProfile });
    }

    // Demo teacher credentials for local testing
    if (String(email).toLowerCase() === 'teacher@test.com' && password === '123456') {
      const publicProfile = { id: 'teacher-demo', nickname: 'Demo Teacher', plan: null, role: 'teacher' };
      return NextResponse.json({ ok: true, profile: publicProfile });
    }

    const profiles = await readProfiles();
    const found = profiles.find((p: any) => p.email === String(email).toLowerCase() && p.password === password);
    if (!found) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Return minimal public profile info
    const publicProfile = { id: found.id, nickname: found.nickname, plan: found.plan, role: found.role };
    return NextResponse.json({ ok: true, profile: publicProfile });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}
