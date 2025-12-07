import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), '.local_data', 'admin_settings.json');

async function readSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {
      teacherPage: { showContact: true, showIntro: true, showSubjects: true },
      studentPage: { showGoals: true, showPreferredSubjects: true },
      defaultPlan: 'basic',
    };
  }
}

async function writeSettings(obj: any) {
  await fs.mkdir(path.join(process.cwd(), '.local_data'), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

export async function GET() {
  try {
    const s = await readSettings();
    return NextResponse.json({ ok: true, settings: s });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message || 'read error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const current = await readSettings();
    const merged = { ...current, ...body };
    await writeSettings(merged);
    return NextResponse.json({ ok: true, settings: merged });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message || 'write error' }, { status: 500 });
  }
}
