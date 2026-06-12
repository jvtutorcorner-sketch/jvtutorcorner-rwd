import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getPagePermissions, savePagePermissions } from '@/lib/pagePermissionsService';

export const dynamic = 'force-dynamic';

const DEFAULT_SETTINGS = {
  teacherPage: { showContact: true, showIntro: true, showSubjects: true },
  studentPage: { showGoals: true, showPreferredSubjects: true },
  classroom: {
    enableWhiteboard: true,
    enableMedia: true,
    enablePdfUpload: true,
    whiteboardRoles: ['admin', 'teacher'],
    mediaRoles: ['admin', 'teacher', 'student'],
    pdfRoles: ['admin', 'teacher'],
    defaultWhiteboardSystem: 'canvas'
  },
  defaultPlan: 'basic',
  siteUrl: '',
  roles: [
    { id: 'admin', name: 'Admin', description: '管理者', isActive: true },
    { id: 'teacher', name: 'Teacher', description: '老師', isActive: true },
    { id: 'student', name: 'Student', description: '學生', isActive: true }
  ],
};

async function readSettings() {
  // pageConfigs is loaded separately from DynamoDB via getPagePermissions()
  // Return hardcoded defaults for other settings
  return { ...DEFAULT_SETTINGS };
}


export async function GET() {
  try {
    const s = await readSettings();

    // Load page permissions from DynamoDB (with automatic migration and fallback)
    console.log('📖 [Admin Settings API] Loading page permissions...');
    const pageConfigs = await getPagePermissions();
    console.log(`📖 [Admin Settings API] Loaded ${pageConfigs.length} pageConfigs`);
    console.log('📖 [Admin Settings API] pageConfigs order:', pageConfigs.map((pc: any) => ({ path: pc.path, sortOrder: pc.sortOrder })));

    // Merge pageConfigs into settings
    if (pageConfigs.length > 0) {
      s.pageConfigs = pageConfigs;
    }

    return NextResponse.json({ ok: true, settings: s });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message || 'read error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    console.log('\n[Admin Settings API] ════════════════════════════════════════');
    console.log('[Admin Settings API] 🔵 POST 請求開始');
    console.log('[Admin Settings API] ════════════════════════════════════════\n');

    const body = await req.json();
    console.log('[Admin Settings API] 📥 接收到的資料大小:', JSON.stringify(body).length, '字節');
    console.log('[Admin Settings API] 🔍 檢查 pageConfigs:', Array.isArray(body.pageConfigs) ? `✅ 是陣列，${body.pageConfigs.length} 個項目` : '❌ 不是陣列或不存在');

    const current = await readSettings();
    const merged = { ...current, ...body };

    // If caller provided pageConfigs, regenerate the legacy `pageVisibility` map
    // so parts of the app that read pageVisibility (Header, SSR code) reflect the changes.
    if (body.pageConfigs && Array.isArray(body.pageConfigs)) {
      // 🔑 IMPORTANT: Use the order and presence from body.pageConfigs (incoming request) to support deletions and drag-and-drop sorting
      const finalPageConfigs: any[] = [];
      const existingMap = new Map<string, any>();
      (current && current.pageConfigs || []).forEach((pc: any) => existingMap.set(pc.path || pc.id, pc));

      body.pageConfigs.forEach((pc: any) => {
        const pathKey = pc.path || pc.id;
        const existing = existingMap.get(pathKey) || { path: pathKey, id: pathKey, label: pc.label || pathKey, permissions: [] };

        // build a role-indexed map of existing permissions
        const existingPermsMap = new Map<string, any>();
        (existing.permissions || []).forEach((p: any) => existingPermsMap.set(p.roleId, p));

        // incoming permissions may include only flags for some roles; merge per-role
        const incomingPerms = pc.permissions || [];
        const roleIds = new Set<string>([...incomingPerms.map((p: any) => p.roleId), ...Array.from(existingPermsMap.keys())]);
        const mergedPerms: any[] = [];
        roleIds.forEach((roleId) => {
          const inc = incomingPerms.find((p: any) => p.roleId === roleId) || {};
          const ex = existingPermsMap.get(roleId) || {};
          mergedPerms.push({
            roleId: roleId,
            roleName: inc.roleName || ex.roleName || '',
            menuVisible: inc.menuVisible !== undefined ? !!inc.menuVisible : (ex.menuVisible !== undefined ? !!ex.menuVisible : false),
            dropdownVisible: inc.dropdownVisible !== undefined ? !!inc.dropdownVisible : (ex.dropdownVisible !== undefined ? !!ex.dropdownVisible : false),
            pageVisible: inc.pageVisible !== undefined ? !!inc.pageVisible : (ex.pageVisible !== undefined ? !!ex.pageVisible : true)
          });
        });

        finalPageConfigs.push({
          id: existing.id || pathKey,
          path: pathKey,
          label: pc.label || existing.label || pathKey,
          permissions: mergedPerms
        });
      });

      merged.pageConfigs = finalPageConfigs;

      // regenerate legacy pageVisibility from merged.pageConfigs
      const pageVisibility: Record<string, any> = {};
      merged.pageConfigs.forEach((pc: any) => {
        const entry: any = { label: pc.label || pc.path, menu: {}, dropdown: {}, page: {} };
        (pc.permissions || []).forEach((perm: any) => {
          const roleKey = (perm.roleId || '').toLowerCase();
          entry.menu[roleKey] = !!perm.menuVisible;
          entry.dropdown[roleKey] = !!perm.dropdownVisible;
          entry.page[roleKey] = !!perm.pageVisible;
        });
        pageVisibility[pc.path] = entry;
      });
      merged.pageVisibility = pageVisibility;
    }

    // support a refresh action: scan `app/` to regenerate pageConfigs automatically
    if (body.action === 'refresh') {
      // scan app/ directory for pages
      const appRoot = path.resolve(process.cwd(), 'app');
      async function walk(dir: string, out: string[] = []) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            await walk(full, out);
          } else if (e.isFile()) {
            if (/^page\.(t|j)sx?$/.test(e.name)) {
              out.push(full);
            }
          }
        }
        return out;
      }

      const pages = await walk(appRoot).catch(() => [] as string[]);
      const pc: any[] = [];
      const roles = merged.roles || [
        { id: 'admin', name: 'Admin' },
        { id: 'teacher', name: 'Teacher' },
        { id: 'student', name: 'Student' }
      ];

      // preserve existing labels from current settings when possible
      const existingLabelMap = new Map<string, string>();
      (current && current.pageConfigs || []).forEach((p: any) => {
        const key = p.path || p.id;
        if (key) existingLabelMap.set(key, p.label || p.id || key);
      });

      const seen = new Set<string>();
      pages.forEach(p => {
        // make route path from file path
        let rel = path.relative(appRoot, p).replace(/\\/g, '/');
        // remove trailing /page.*
        rel = rel.replace(/\/page\.(t|j)sx?$/, '');
        // if empty -> root
        const routePath = '/' + (rel === '' ? '' : rel);
        // normalize: split by '/', remove empty segments, rejoin
        const parts = routePath.split('/').filter(Boolean);
        const cleanPath = parts.length === 0 ? '/' : '/' + parts.join('/');
        if (seen.has(cleanPath)) return;
        seen.add(cleanPath);
        // prefer existing label from settings; otherwise derive a label
        const labelFromExisting = existingLabelMap.get(cleanPath);
        const label = labelFromExisting || (cleanPath === '/' ? '首頁' : decodeURIComponent(cleanPath.replace(/\//g, ' ').trim()));
        const permissions = roles.map((r: any) => ({
          roleId: r.id,
          roleName: r.name,
          menuVisible: !cleanPath.startsWith('/admin'),
          dropdownVisible: !cleanPath.startsWith('/admin'),
          pageVisible: true
        }));
        pc.push({ id: cleanPath, path: cleanPath, label, permissions });
      });

      merged.pageConfigs = pc;

      // regenerate legacy pageVisibility as well
      const pageVisibility: Record<string, any> = {};
      merged.pageConfigs.forEach((pc: any) => {
        const entry: any = { label: pc.label || pc.path, menu: {}, dropdown: {}, page: {} };
        (pc.permissions || []).forEach((perm: any) => {
          const roleKey = (perm.roleId || '').toLowerCase();
          entry.menu[roleKey] = !!perm.menuVisible;
          entry.dropdown[roleKey] = !!perm.dropdownVisible;
          entry.page[roleKey] = !!perm.pageVisible;
        });
        pageVisibility[pc.path] = entry;
      });
      merged.pageVisibility = pageVisibility;
    }

    // Save pageConfigs to DynamoDB if present
    if (merged.pageConfigs && Array.isArray(merged.pageConfigs)) {
      console.log('\n[Admin Settings API] ═══════════════════════════════════════');
      console.log('[Admin Settings API] 準備儲存 pageConfigs 到 DynamoDB');
      console.log(`[Admin Settings API] 頁面數量: ${merged.pageConfigs.length}`);
      console.log('[Admin Settings API] ═══════════════════════════════════════\n');

      try {
        const saveResult = await savePagePermissions(merged.pageConfigs);

        if (!saveResult) {
          console.error('[Admin Settings API] ❌ DynamoDB 儲存失敗');
          const errorMsg = process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS
            ? 'Failed to save page permissions to DynamoDB. Check server logs for details.'
            : 'DynamoDB table not configured. Environment variable DYNAMODB_TABLE_PAGE_PERMISSIONS is not set.';
          return NextResponse.json({
            ok: false,
            error: errorMsg
          }, { status: 500 });
        }

        console.log('[Admin Settings API] ✅ pageConfigs 儲存到 DynamoDB 成功');
      } catch (e) {
        console.error('[Admin Settings API] ❌ pageConfigs 儲存過程發生異常:', (e as any)?.message || e);
        console.error('[Admin Settings API] 錯誤堆疊:', e);
        console.error('[Admin Settings API] 環境變數 DYNAMODB_TABLE_PAGE_PERMISSIONS:', process.env.DYNAMODB_TABLE_PAGE_PERMISSIONS);
        return NextResponse.json({
          ok: false,
          error: `DynamoDB save error: ${(e as any)?.message || 'Unknown error'}`
        }, { status: 500 });
      }
    }

    console.log('\n[Admin Settings API] ════════════════════════════════════════');
    console.log('[Admin Settings API] ✅ POST 請求完成成功');
    console.log('[Admin Settings API] ════════════════════════════════════════\n');

    return NextResponse.json({ ok: true, settings: merged });
  } catch (err: any) {
    console.error('\n[Admin Settings API] ════════════════════════════════════════');
    console.error('[Admin Settings API] ❌ POST 請求發生錯誤');
    console.error('[Admin Settings API] 錯誤訊息:', err?.message || err);
    console.error('[Admin Settings API] 錯誤堆疊:', err?.stack || err);
    console.error('[Admin Settings API] ════════════════════════════════════════\n');

    return NextResponse.json({
      ok: false,
      error: err?.message || 'write error',
      details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    }, { status: 500 });
  }
}
