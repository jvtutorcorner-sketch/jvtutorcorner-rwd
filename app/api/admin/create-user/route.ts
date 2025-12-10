import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';

async function readProfiles() {
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

async function writeProfiles(arr: any[]) {
  const DATA_FILE = await resolveDataFile('profiles.json');
  await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, plan } = body;
    if (!email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });
    const profiles = await readProfiles();
    const exists = profiles.find((p: any) => p.email === email);
    if (exists) return NextResponse.json({ ok: false, error: 'email exists' }, { status: 400 });
    const id = `u_${Date.now()}`;
    const record = { id, email, password: '123456', plan: plan || 'basic', nickname: email.split('@')[0], role: 'user' };
    profiles.push(record);
    await writeProfiles(profiles);
    return NextResponse.json({ ok: true, profile: { id: record.id, email: record.email, plan: record.plan } });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message || 'error' }, { status: 500 });
  }
}
