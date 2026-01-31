import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';

async function readSettings() {
  try {
    const SETTINGS_FILE = await resolveDataFile('admin_settings.json');
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const data = JSON.parse(raw);

    // 如果是旧格式，转换到新格式
    if (data.pageVisibility && !data.roles) {
      return convertOldSettingsToNew(data);
    }

    return data;
  } catch (err) {
    // 返回默认设置（新格式）
    return {
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
        { id: 'admin', name: 'Admin', description: '管理员', isActive: true },
        { id: 'teacher', name: 'Teacher', description: '教师', isActive: true },
        { id: 'student', name: 'Student', description: '学生', isActive: true }
      ],
      pageConfigs: [
        { id: '/', path: '/', label: '首頁', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/about', path: '/about', label: '關於我們', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/teachers', path: '/teachers', label: '師資', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/courses', path: '/courses', label: '課程總覽', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/calendar', path: '/calendar', label: '課程行事曆', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/pricing', path: '/pricing', label: '方案與價格', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/login', path: '/login', label: '登入', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: false, dropdownVisible: false, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: true }
        ]},
        { id: '/register', path: '/register', label: '註冊', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: false, dropdownVisible: false, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: true }
        ]},
        { id: '/profile', path: '/profile', label: '個人資料', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/settings', path: '/settings', label: '個人設定', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/teacher_courses', path: '/teacher_courses', label: '老師的課程訂單', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/student_courses', path: '/student_courses', label: '學生的課程訂單', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/enrollments', path: '/enrollments', label: '報名記錄', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/dashboard/teacher', path: '/dashboard/teacher', label: '教師儀表板', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]},
        { id: '/classroom', path: '/classroom', label: '教室', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/whiteboard', path: '/whiteboard', label: '白板', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/admin/dashboard', path: '/admin/dashboard', label: '後台：儀表板', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: false },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]},
        { id: '/admin/orders', path: '/admin/orders', label: '後台：訂單管理', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: false },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]},
        { id: '/admin/whiteboard_canvas', path: '/admin/whiteboard_canvas', label: '後台：原生白板', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: false },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]},
        { id: '/admin/whiteboard_agora', path: '/admin/whiteboard_agora', label: '後台：Agora 設定', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: false },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]},
        { id: '/admin/roles', path: '/admin/roles', label: '後台：角色管理', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: false },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]},
        { id: '/admin/settings', path: '/admin/settings', label: '後台：網站設定', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: false },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]},
        { id: '/admin/carousel', path: '/admin/carousel', label: '後台：輪播圖管理', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: false },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]}
      ]
    };
  }
}

// 转换旧格式到新格式的辅助函数
function convertOldSettingsToNew(oldSettings: any) {
  const roles = [
    { id: 'admin', name: 'Admin', description: '管理员', isActive: true },
    { id: 'teacher', name: 'Teacher', description: '教师', isActive: true },
    { id: 'student', name: 'Student', description: '学生', isActive: true }
  ];

  const pageConfigs = Object.entries(oldSettings.pageVisibility || {}).map(([path, config]: [string, any]) => ({
    id: path,
    path,
    label: config.label,
    permissions: roles.map(role => ({
      roleId: role.id,
      roleName: role.name,
      menuVisible: config.menu?.[role.id.toLowerCase()] || false,
      dropdownVisible: config.dropdown?.[role.id.toLowerCase()] || false,
      pageVisible: config.page?.[role.id.toLowerCase()] || false
    }))
  }));

  return {
    ...oldSettings,
    roles,
    pageConfigs,
    classroom: oldSettings.classroom || {
      enableWhiteboard: true,
      enableMedia: true,
      whiteboardRoles: ['admin', 'teacher'],
      mediaRoles: ['admin', 'teacher', 'student'],
      defaultWhiteboardSystem: 'canvas'
    }
  };
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

    // If caller provided pageConfigs, regenerate the legacy `pageVisibility` map
    // so parts of the app that read pageVisibility (Header, SSR code) reflect the changes.
    if (body.pageConfigs && Array.isArray(body.pageConfigs)) {
      // Merge incoming pageConfigs into existing pageConfigs so that unspecified flags
      // (e.g. dropdownVisible) are preserved instead of being reset.
      const existingMap = new Map<string, any>();
      (current && current.pageConfigs || []).forEach((pc: any) => existingMap.set(pc.path || pc.id, pc));

      // Build merged pageConfigs starting from existing ones
      const mergedPageConfigs: any[] = (current && current.pageConfigs) ? JSON.parse(JSON.stringify(current.pageConfigs)) : [];
      const mergedMap = new Map<string, any>();
      mergedPageConfigs.forEach((pc: any) => mergedMap.set(pc.path || pc.id, pc));

      body.pageConfigs.forEach((pc: any) => {
        const pathKey = pc.path || pc.id;
        const existing = mergedMap.get(pathKey) || existingMap.get(pathKey) || { path: pathKey, id: pathKey, label: pc.label || pathKey, permissions: [] };

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

        const updated = {
          id: existing.id || pathKey,
          path: pathKey,
          label: pc.label || existing.label || pathKey,
          permissions: mergedPerms
        };

        mergedMap.set(pathKey, updated);
      });

      // produce array from mergedMap preserving original order where possible
      const finalPageConfigs: any[] = [];
      // prefer keys in current.pageConfigs order
      (current && current.pageConfigs || []).forEach((pc: any) => {
        const k = pc.path || pc.id;
        if (mergedMap.has(k)) {
          finalPageConfigs.push(mergedMap.get(k));
          mergedMap.delete(k);
        }
      });
      // append any remaining ones (new pages)
      mergedMap.forEach((v) => finalPageConfigs.push(v));

      merged.pageConfigs = finalPageConfigs;

      // regenerate legacy pageVisibility from merged.pageConfigs
      const pageVisibility: Record<string, any> = merged.pageVisibility || {};
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
    await writeSettings(merged);
    return NextResponse.json({ ok: true, settings: merged });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message || 'write error' }, { status: 500 });
  }
}
