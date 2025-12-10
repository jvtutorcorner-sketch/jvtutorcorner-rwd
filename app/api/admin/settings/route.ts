import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';

async function readSettings() {
  try {
    const SETTINGS_FILE = await resolveDataFile('admin_settings.json');
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {
      teacherPage: { showContact: true, showIntro: true, showSubjects: true },
      studentPage: { showGoals: true, showPreferredSubjects: true },
      defaultPlan: 'basic',
      // siteUrl can be edited by admins to indicate the canonical site URL
      siteUrl: '',
      // pageVisibility maps route -> metadata + separate visibility for menu and dropdown-menu
      pageVisibility: {
        '/': { label: '首頁', menu: { admin: true, teacher: true, user: true }, dropdown: { admin: true, teacher: true, user: true } },
        '/teachers': { label: '師資', menu: { admin: true, teacher: true, user: true }, dropdown: { admin: true, teacher: true, user: true } },
        '/pricing': { label: '方案與價格', menu: { admin: true, teacher: true, user: true }, dropdown: { admin: true, teacher: true, user: true } },
        '/courses': { label: '課程總覽', menu: { admin: true, teacher: true, user: true }, dropdown: { admin: true, teacher: true, user: true } },
        '/testimony': { label: '學員見證', menu: { admin: true, teacher: true, user: true }, dropdown: { admin: true, teacher: true, user: true } },
        '/about': { label: '關於我們', menu: { admin: true, teacher: true, user: true }, dropdown: { admin: true, teacher: true, user: true } },
        '/orders': { label: '我的訂單', menu: { admin: true, teacher: false, user: true }, dropdown: { admin: true, teacher: false, user: true } },
        '/admin/orders': { label: '後台：訂單管理', menu: { admin: true, teacher: false, user: false }, dropdown: { admin: true, teacher: false, user: false } },
        '/admin/settings': { label: '後台：網站設定', menu: { admin: true, teacher: false, user: false }, dropdown: { admin: true, teacher: false, user: false } },
        '/my-courses': { label: '我的課程 (老師)', menu: { admin: true, teacher: true, user: false }, dropdown: { admin: true, teacher: true, user: false } },
        '/settings': { label: '個人設定', menu: { admin: true, teacher: true, user: true }, dropdown: { admin: true, teacher: true, user: true } },
      },
    };
  }
}

async function writeSettings(obj: any) {
  const SETTINGS_FILE = await resolveDataFile('admin_settings.json');
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
