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
        { id: '/my-courses', path: '/my-courses', label: '我的課程', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/orders', path: '/orders', label: '訂單', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: true, dropdownVisible: true, pageVisible: true }
        ]},
        { id: '/students', path: '/students', label: '學生列表', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
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
        { id: '/test-video', path: '/test-video', label: '視訊測試', permissions: [
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
        { id: '/admin/students', path: '/admin/students', label: '後台：學生管理', permissions: [
          { roleId: 'admin', roleName: 'Admin', menuVisible: true, dropdownVisible: true, pageVisible: true },
          { roleId: 'teacher', roleName: 'Teacher', menuVisible: false, dropdownVisible: false, pageVisible: false },
          { roleId: 'student', roleName: 'Student', menuVisible: false, dropdownVisible: false, pageVisible: false }
        ]},
        { id: '/admin/teachers', path: '/admin/teachers', label: '後台：教師管理', permissions: [
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
    pageConfigs
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
      const pageVisibility: Record<string, any> = merged.pageVisibility || {};
      // build from pageConfigs
      body.pageConfigs.forEach((pc: any) => {
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
